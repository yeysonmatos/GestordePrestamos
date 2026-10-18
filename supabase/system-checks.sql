-- ============================================================
-- system-checks.sql — Revisor de integridad del sistema
--
-- RPC public.system_checks(p_user_id): corre un conjunto de comprobaciones sobre los
-- datos y devuelve los hallazgos en frases entendibles. Lo llama el cron semanal
-- (/api/cron/reconcile) y AVISA AL ADMIN por correo si encuentra algo.
--
-- Comprobaciones:
--   A1 mora_no_marcada        Préstamo con cuotas vencidas que NO está marcado como
--                             atrasado (si el cron de mora falla, nadie se entera).
--   A2 mora_sin_atraso        Préstamo marcado atrasado pero sin cuotas vencidas.
--   B1 abierto_con_cuotas     Préstamo ABIERTO (solo interés) que tiene cuotas.
--   B2 cerrado_sin_cuotas     Préstamo con cuotas (no abierto) sin ninguna cuota.
--   B3 cronograma_capital     La suma del capital de las cuotas no da el monto prestado.
--   B4 cronograma_cuotas      El nº de cuotas no coincide con el plazo del préstamo.
--   B5 cronograma_total       La suma de las cuotas no coincide con el total del préstamo.
--                             (B3-B5 solo en préstamos CON saldo: en uno ya pagado no
--                              hay dinero en juego y sería ruido histórico.)
--   C1 cuota_pagada_con_saldo Cuota marcada "pagada" pero con saldo pendiente.
--   C2 cuota_sin_marcar       Cuota cobrada por completo pero sin marcar "pagada".
--   C3 pagado_con_pendientes  Préstamo "pagado" con cuotas pendientes.
--   C4 activo_todo_cobrado    Préstamo en curso con TODAS sus cuotas cobradas (atascado).
--   D1 pago_huerfano          Pago sin préstamo (quedó de un borrado antiguo).
--   D2 pago_cuota_ajena       Pago cuya cuota pertenece a OTRO préstamo.
--   D3 pago_duplicado         Dos pagos idénticos el mismo día en la misma cuota.
--   D4 pago_sobrepaga         Se cobró más que la cuota (+ su mora).
--   D5 pago_monto_invalido    Pago con monto <= 0.
--   D6 capital_cobrado_de_mas Se cobr� m�s capital que el monto prestado (imposible).
--   F1 correo_atascado        Correo en "enviando" hace más de 10 minutos.
--   F2 correo_en_cola_viejo   Correo "en cola" hace más de 24 horas.
--   H1 suscripcion_vencida    Suscripción de pago vencida que sigue "activa".
--   H2 usuario_sin_suscripcion Cliente sin fila de suscripción.
--   H3 usuario_sin_config     Cliente sin configuración (negocio, mora, etc.).
--   H4 solicitud_pago_vieja   Solicitud de pago pendiente hace más de 7 días.
--   R1 reportes_vs_inicio     El "vencido" de Reportes y el "Vencido por cobrar" del
--                             Inicio deben dar EXACTAMENTE lo mismo.
--
-- Alcance: si lo llama un usuario, revisa SOLO sus datos; el cron (service_role)
-- revisa toda la base. Las comprobaciones de plataforma (correos y suscripciones)
-- solo corren para el sistema. Idempotente.
-- Se aplica con scripts/exec-system-checks.mjs
-- ============================================================

CREATE OR REPLACE FUNCTION public.system_checks(p_user_id UUID DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_scope UUID;
  v_today DATE := public.today_rd();
  v_checks JSONB;
BEGIN
  -- Guarda: un usuario solo puede revisar SUS datos; el sistema (postgres/service_role)
  -- revisa todo. Con auth.uid() presente el alcance es SIEMPRE el propio usuario.
  IF auth.uid() IS NOT NULL THEN
    IF p_user_id IS NOT NULL AND auth.uid() <> p_user_id THEN
      RETURN NULL;
    END IF;
    v_scope := auth.uid();
  ELSE
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = current_user AND rolsuper)
       AND current_user NOT IN ('postgres', 'service_role') THEN
      RETURN NULL;
    END IF;
    v_scope := p_user_id;  -- NULL = toda la base
  END IF;

  WITH
  activos AS (
    SELECT l.id, l.user_id, l.loan_id, l.status, l.open_ended, l.amount, l.installments,
           l.total_amount, l.installment_amount, l.first_payment_date, l.frequency,
           l.client_id
    FROM public.loans l
    WHERE l.deleted_at IS NULL
      AND (v_scope IS NULL OR l.user_id = v_scope)
  ),
  -- Cuotas vencidas sin pagar de préstamos en curso
  vencidas AS (
    SELECT i.loan_id AS lid, a.loan_id AS vis, a.status AS loan_status
    FROM public.installments i
    JOIN activos a ON a.id = i.loan_id
    WHERE a.status IN ('active', 'late', 'late_1_30', 'late_31_60', 'late_61_90')
      AND i.due_date < v_today
      AND COALESCE(i.status, 'pending') <> 'paid'
      AND (i.amount - COALESCE(i.paid_amount, 0)) > 0.009
  ),
  c1 AS (
    SELECT DISTINCT v.vis AS v
    FROM vencidas v
    WHERE v.loan_status NOT IN ('late_1_30', 'late_31_60', 'late_61_90')
  ),
  c2 AS (
    SELECT DISTINCT a.loan_id AS v
    FROM activos a
    WHERE a.status IN ('late_1_30', 'late_31_60', 'late_61_90')
      AND NOT EXISTS (SELECT 1 FROM vencidas v WHERE v.lid = a.id)
  ),
  c3 AS (
    SELECT a.loan_id AS v
    FROM activos a
    WHERE a.open_ended
      AND EXISTS (SELECT 1 FROM public.installments i WHERE i.loan_id = a.id)
  ),
  c4 AS (
    SELECT a.loan_id AS v
    FROM activos a
    WHERE NOT a.open_ended
      AND NOT EXISTS (SELECT 1 FROM public.installments i WHERE i.loan_id = a.id)
  ),
  resumen_cuotas AS (
    SELECT i.loan_id AS lid,
           COUNT(*) AS n,
           SUM(i.capital) AS capital,
           SUM(i.amount) AS total
    FROM public.installments i
    GROUP BY i.loan_id
  ),
  -- Cronograma: solo préstamos con saldo (en un pagado no hay dinero en juego)
  c5 AS (
    SELECT a.loan_id AS v
    FROM activos a
    JOIN resumen_cuotas r ON r.lid = a.id
    WHERE NOT a.open_ended
      AND a.status <> 'paid'
      AND ABS(COALESCE(r.capital, 0) - a.amount) > 0.05
  ),
  c6 AS (
    SELECT a.loan_id AS v
    FROM activos a
    JOIN resumen_cuotas r ON r.lid = a.id
    WHERE NOT a.open_ended
      AND a.status <> 'paid'
      AND a.installments IS NOT NULL
      AND r.n <> a.installments
  ),
  c7 AS (
    SELECT a.loan_id AS v
    FROM activos a
    JOIN resumen_cuotas r ON r.lid = a.id
    WHERE NOT a.open_ended
      AND a.status <> 'paid'
      AND ABS(COALESCE(r.total, 0) - a.total_amount) > 0.05
  ),
  c8 AS (
    SELECT a.loan_id AS v
    FROM activos a
    JOIN public.installments i ON i.loan_id = a.id
    WHERE i.status = 'paid'
      AND (i.amount - COALESCE(i.paid_amount, 0)) > 0.009
  ),
  c9 AS (
    SELECT a.loan_id AS v
    FROM activos a
    JOIN public.installments i ON i.loan_id = a.id
    WHERE COALESCE(i.status, 'pending') <> 'paid'
      AND COALESCE(i.paid_amount, 0) > 0
      AND (i.amount - COALESCE(i.paid_amount, 0)) <= 0.009
  ),
  c10 AS (
    SELECT a.loan_id AS v
    FROM activos a
    WHERE a.status = 'paid'
      AND EXISTS (
        SELECT 1 FROM public.installments i
        WHERE i.loan_id = a.id
          AND COALESCE(i.status, 'pending') <> 'paid'
          AND (i.amount - COALESCE(i.paid_amount, 0)) > 0.009
      )
  ),
  c11 AS (
    SELECT a.loan_id AS v
    FROM activos a
    WHERE a.status IN ('active', 'late', 'late_1_30', 'late_31_60', 'late_61_90')
      AND NOT a.open_ended
      AND EXISTS (SELECT 1 FROM public.installments i WHERE i.loan_id = a.id)
      AND NOT EXISTS (
        SELECT 1 FROM public.installments i
        WHERE i.loan_id = a.id
          AND COALESCE(i.status, 'pending') <> 'paid'
          AND (i.amount - COALESCE(i.paid_amount, 0)) > 0.009
      )
  ),
  -- ===== Pagos =====
  pagos AS (
    SELECT p.id, p.loan_id, p.installment_id, p.amount, p.status, p.created_at
    FROM public.payments p
    WHERE v_scope IS NULL OR p.user_id = v_scope
  ),
  d1 AS (
    SELECT pa.id::text AS v
    FROM pagos pa
    WHERE pa.loan_id IS NULL
  ),
  d2 AS (
    SELECT pa.id::text AS v
    FROM pagos pa
    JOIN public.installments i ON i.id = pa.installment_id
    WHERE pa.loan_id IS NOT NULL
      AND i.loan_id <> pa.loan_id
  ),
  d3 AS (
    SELECT pa.loan_id::text AS v
    FROM pagos pa
    WHERE pa.status = 'paid'
    GROUP BY pa.loan_id, pa.installment_id, pa.amount,
             (pa.created_at AT TIME ZONE 'America/Santo_Domingo')::date
    HAVING COUNT(*) > 1
  ),
  d4 AS (
    SELECT a.loan_id AS v
    FROM activos a
    JOIN public.installments i ON i.loan_id = a.id
    JOIN (
      SELECT installment_id, SUM(amount) AS pagado
      FROM public.payments
      WHERE status = 'paid' AND installment_id IS NOT NULL
        AND (v_scope IS NULL OR user_id = v_scope)
      GROUP BY installment_id
    ) t ON t.installment_id = i.id
    WHERE t.pagado > i.amount + COALESCE(i.late_amount, 0) + 0.05
  ),
  d5 AS (
    SELECT COALESCE(pa.loan_id::text, pa.id::text) AS v
    FROM pagos pa
    WHERE pa.status = 'paid' AND COALESCE(pa.amount, 0) <= 0
  ),
  d6 AS (
    SELECT a.loan_id AS v
    FROM activos a
    JOIN (
      SELECT loan_id, SUM(capital_amount) AS cap
      FROM public.payments
      WHERE status = 'paid' AND loan_id IS NOT NULL
        AND (v_scope IS NULL OR user_id = v_scope)
      GROUP BY loan_id
    ) t ON t.loan_id = a.id
    WHERE t.cap > a.amount + 0.05
  ),
  -- ===== Cola de correo (solo plataforma) =====
  f1 AS (
    SELECT em.subject AS v
    FROM public.email_messages em
    WHERE v_scope IS NULL
      AND em.status = 'sending'
      AND em.created_at < now() - interval '10 minutes'
  ),
  f2 AS (
    SELECT em.subject AS v
    FROM public.email_messages em
    WHERE v_scope IS NULL
      AND em.status = 'queued'
      AND em.created_at < now() - interval '24 hours'
  ),
  -- ===== Admin / SaaS (solo plataforma) =====
  h1 AS (
    -- Solo la suscripción VIGENTE (la más reciente, igual que la app): las filas
    -- antiguas quedan 'active' al cambiar de plan y no son un problema.
    SELECT s.user_id::text AS v
    FROM public.subscriptions s
    WHERE v_scope IS NULL
      AND s.status = 'active'
      AND s.ends_at IS NOT NULL
      AND s.ends_at < v_today
      AND s.id = (
        SELECT s2.id
        FROM public.subscriptions s2
        WHERE s2.user_id = s.user_id
        ORDER BY s2.created_at DESC
        LIMIT 1
      )
  ),
  h2 AS (
    SELECT au.id::text AS v
    FROM public.app_users au
    WHERE v_scope IS NULL
      AND au.role = 'client'
      AND NOT EXISTS (SELECT 1 FROM public.subscriptions s WHERE s.user_id = au.id)
  ),
  h3 AS (
    SELECT au.id::text AS v
    FROM public.app_users au
    WHERE v_scope IS NULL
      AND au.role = 'client'
      AND NOT EXISTS (SELECT 1 FROM public.settings st WHERE st.user_id = au.id)
  ),
  h4 AS (
    SELECT sp.user_id::text AS v
    FROM public.subscription_payments sp
    WHERE v_scope IS NULL
      AND sp.status = 'pending'
      AND sp.created_at < now() - interval '7 days'
  ),
  -- Coherencia Reportes <-> Inicio (por usuario con préstamos)
  usuarios AS (
    SELECT DISTINCT user_id AS id
    FROM public.loans
    WHERE deleted_at IS NULL
      AND (v_scope IS NULL OR user_id = v_scope)
  ),
  c12 AS (
    SELECT u.id::text AS v
    FROM usuarios u
    WHERE (public.reports_cartera(u.id, v_today) ->> 'vencido')::numeric
          <> (public.dashboard_summary(u.id) ->> 'en_mora')::numeric
  ),
  checks AS (
    SELECT 'mora_no_marcada' AS code, 'alta' AS severity,
           'Préstamo con cuotas vencidas que no está marcado como atrasado' AS title,
           (SELECT count(*) FROM c1) AS n,
           (SELECT jsonb_agg(v) FROM (SELECT v FROM c1 LIMIT 3) q) AS samples
    UNION ALL SELECT 'mora_sin_atraso', 'media',
           'Préstamo marcado como atrasado pero sin cuotas vencidas',
           (SELECT count(*) FROM c2), (SELECT jsonb_agg(v) FROM (SELECT v FROM c2 LIMIT 3) q)
    UNION ALL SELECT 'abierto_con_cuotas', 'alta',
           'Préstamo abierto (solo interés) que tiene cuotas cargadas',
           (SELECT count(*) FROM c3), (SELECT jsonb_agg(v) FROM (SELECT v FROM c3 LIMIT 3) q)
    UNION ALL SELECT 'cerrado_sin_cuotas', 'alta',
           'Préstamo con cuotas que no tiene ninguna cuota',
           (SELECT count(*) FROM c4), (SELECT jsonb_agg(v) FROM (SELECT v FROM c4 LIMIT 3) q)
    UNION ALL SELECT 'cronograma_capital', 'alta',
           'La suma del capital de las cuotas no da el monto prestado',
           (SELECT count(*) FROM c5), (SELECT jsonb_agg(v) FROM (SELECT v FROM c5 LIMIT 3) q)
    UNION ALL SELECT 'cronograma_cuotas', 'alta',
           'El número de cuotas no coincide con el plazo del préstamo',
           (SELECT count(*) FROM c6), (SELECT jsonb_agg(v) FROM (SELECT v FROM c6 LIMIT 3) q)
    UNION ALL SELECT 'cronograma_total', 'media',
           'La suma de las cuotas no coincide con el total del préstamo',
           (SELECT count(*) FROM c7), (SELECT jsonb_agg(v) FROM (SELECT v FROM c7 LIMIT 3) q)
    UNION ALL SELECT 'cuota_pagada_con_saldo', 'alta',
           'Cuota marcada como pagada pero con saldo pendiente',
           (SELECT count(*) FROM c8), (SELECT jsonb_agg(v) FROM (SELECT v FROM c8 LIMIT 3) q)
    UNION ALL SELECT 'cuota_sin_marcar', 'media',
           'Cuota cobrada por completo pero sin marcar como pagada',
           (SELECT count(*) FROM c9), (SELECT jsonb_agg(v) FROM (SELECT v FROM c9 LIMIT 3) q)
    UNION ALL SELECT 'pagado_con_pendientes', 'alta',
           'Préstamo marcado como pagado con cuotas pendientes',
           (SELECT count(*) FROM c10), (SELECT jsonb_agg(v) FROM (SELECT v FROM c10 LIMIT 3) q)
    UNION ALL SELECT 'activo_todo_cobrado', 'media',
           'Préstamo en curso con todas sus cuotas cobradas (quedó atascado)',
           (SELECT count(*) FROM c11), (SELECT jsonb_agg(v) FROM (SELECT v FROM c11 LIMIT 3) q)
    UNION ALL SELECT 'pago_huerfano', 'media',
           'Pago sin préstamo (quedó de un borrado antiguo)',
           (SELECT count(*) FROM d1), (SELECT jsonb_agg(v) FROM (SELECT v FROM d1 LIMIT 3) q)
    UNION ALL SELECT 'pago_cuota_ajena', 'alta',
           'Pago cuya cuota pertenece a otro préstamo',
           (SELECT count(*) FROM d2), (SELECT jsonb_agg(v) FROM (SELECT v FROM d2 LIMIT 3) q)
    UNION ALL SELECT 'pago_duplicado', 'media',
           'Dos pagos idénticos el mismo día en la misma cuota',
           (SELECT count(*) FROM d3), (SELECT jsonb_agg(v) FROM (SELECT v FROM d3 LIMIT 3) q)
    UNION ALL SELECT 'pago_sobrepaga', 'alta',
           'Se cobró más que la cuota (más su mora)',
           (SELECT count(*) FROM d4), (SELECT jsonb_agg(v) FROM (SELECT v FROM d4 LIMIT 3) q)
    UNION ALL SELECT 'pago_monto_invalido', 'alta',
           'Pago registrado con monto cero o negativo',
           (SELECT count(*) FROM d5), (SELECT jsonb_agg(v) FROM (SELECT v FROM d5 LIMIT 3) q)
    UNION ALL SELECT 'capital_cobrado_de_mas', 'alta',
           'Se cobr� m�s capital que el prestado',
           (SELECT count(*) FROM d6), (SELECT jsonb_agg(v) FROM (SELECT v FROM d6 LIMIT 3) q)
    UNION ALL SELECT 'correo_atascado', 'media',
           'Correo atascado en "enviando" hace más de 10 minutos',
           (SELECT count(*) FROM f1), (SELECT jsonb_agg(v) FROM (SELECT v FROM f1 LIMIT 3) q)
    UNION ALL SELECT 'correo_en_cola_viejo', 'media',
           'Correo en cola hace más de 24 horas (la cola no se está vaciando)',
           (SELECT count(*) FROM f2), (SELECT jsonb_agg(v) FROM (SELECT v FROM f2 LIMIT 3) q)
    UNION ALL SELECT 'suscripcion_vencida', 'alta',
           'Suscripción de pago vencida que sigue marcada como activa',
           (SELECT count(*) FROM h1), (SELECT jsonb_agg(v) FROM (SELECT v FROM h1 LIMIT 3) q)
    UNION ALL SELECT 'usuario_sin_suscripcion', 'alta',
           'Cliente sin fila de suscripción',
           (SELECT count(*) FROM h2), (SELECT jsonb_agg(v) FROM (SELECT v FROM h2 LIMIT 3) q)
    UNION ALL SELECT 'usuario_sin_config', 'media',
           'Cliente sin configuración del negocio',
           (SELECT count(*) FROM h3), (SELECT jsonb_agg(v) FROM (SELECT v FROM h3 LIMIT 3) q)
    UNION ALL SELECT 'solicitud_pago_vieja', 'media',
           'Solicitud de pago pendiente hace más de 7 días',
           (SELECT count(*) FROM h4), (SELECT jsonb_agg(v) FROM (SELECT v FROM h4 LIMIT 3) q)
    UNION ALL SELECT 'reportes_vs_inicio', 'alta',
           'El vencido de Reportes no coincide con el del Inicio',
           (SELECT count(*) FROM c12), (SELECT jsonb_agg(v) FROM (SELECT v FROM c12 LIMIT 3) q)
  )
  SELECT COALESCE(
           jsonb_agg(
             jsonb_build_object(
               'code', code,
               'severity', severity,
               'title', title,
               'count', n,
               'samples', COALESCE(samples, '[]'::jsonb)
             )
             ORDER BY CASE severity WHEN 'alta' THEN 1 ELSE 2 END, code
           ) FILTER (WHERE n > 0),
           '[]'::jsonb
         )
    INTO v_checks
  FROM checks;

  RETURN jsonb_build_object(
    'ran', true,
    'today', v_today,
    'scope', COALESCE(v_scope::text, 'toda la base'),
    'checks_run', 24,
    'issue_count', COALESCE((SELECT SUM((c ->> 'count')::int) FROM jsonb_array_elements(v_checks) c), 0),
    'issues', v_checks
  );
END;
$$;

REVOKE ALL ON FUNCTION public.system_checks(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.system_checks(UUID) TO authenticated, service_role;
