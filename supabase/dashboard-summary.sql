-- ============================================================
-- dashboard-summary.sql — Inicio en UNA sola llamada
--
-- RPC public.dashboard_summary(): devuelve TODO lo que la pantalla de Inicio
-- necesita (KPIs, mora, cobros de hoy, próximos pagos y la serie mensual de la
-- gráfica) calculado en la base. Antes el Inicio descargaba TODOS los préstamos,
-- clientes, cuotas y pagos del usuario y calculaba en el navegador: con historial
-- grande (los pagos crecen sin límite) eso se vuelve lento en el móvil.
--
-- Reglas EXACTAS (idénticas a las que tenía el navegador):
--   * capital_prestado   = Σ amount de TODOS los préstamos no archivados.
--   * capital_recuperado = Σ payments.capital_amount (solo status 'paid').
--   * interes_ganado     = Σ payments.interest_amount + late_amount ('paid').
--   * por_cobrar         = Σ GREATEST(0, amount − capital pagado) de los activos.
--   * en_mora            = cuotas vencidas sin pagar (due_date < hoy) + el interés
--                          del período vencido de los préstamos ABIERTOS.
--   * cobro_hoy          = cuotas de préstamos activos que vencen HOY sin pagar.
--   * proximos           = las próximas 6 cuotas (1..7 días) con cliente y monto.
--   * serie mensual      = últimos 6 meses: ingresos (pagos) y prestado (inicio).
--
-- Guarda: solo el dueño (auth.uid()) o el sistema (postgres/service_role).
-- Idempotente (CREATE OR REPLACE). Se aplica con scripts/exec-dashboard-summary.mjs
-- ============================================================

CREATE OR REPLACE FUNCTION public.dashboard_summary(p_user_id UUID DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_today DATE := public.today_rd();
  v_uid UUID;
  v_capital_prestado   NUMERIC;
  v_loans_total        INTEGER;
  v_mora_acumulada     NUMERIC;
  v_grace              INTEGER;
  v_capital_recuperado NUMERIC;
  v_interes_ganado     NUMERIC;
  v_por_cobrar         NUMERIC;
  v_mora_cuotas        NUMERIC;
  v_mora_abiertos      NUMERIC;
  v_vencidas           INTEGER;
  v_abiertos_vencidos  INTEGER;
  v_clientes_morosos   INTEGER;
  v_cobro_hoy          NUMERIC;
  v_hoy_count          INTEGER;
  v_activos            INTEGER;
  v_clientes_activos   INTEGER;
  v_proximos           JSONB;
  v_meses              JSONB;
BEGIN
  -- Guarda de seguridad: solo el dueño puede leer SUS estadísticas.
  IF auth.uid() IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = current_user AND rolsuper)
       AND current_user NOT IN ('postgres', 'service_role') THEN
      RETURN NULL;
    END IF;
  ELSIF auth.uid() <> p_user_id THEN
    RETURN NULL;
  END IF;

  -- Usuario efectivo: el que llama (p_user_id puede venir NULL desde la app).
  v_uid := COALESCE(p_user_id, auth.uid());
  v_grace := COALESCE((SELECT grace_days FROM public.settings WHERE user_id = v_uid LIMIT 1), 0);

  -- 1. Capital prestado: TODOS los préstamos no archivados (en curso + pagados)
  SELECT COALESCE(SUM(amount), 0), COUNT(*) INTO v_capital_prestado, v_loans_total
  FROM public.loans
  WHERE user_id = v_uid AND deleted_at IS NULL;

  -- 2. Recuperado + interés ganado (histórico completo, solo pagos válidos)
  SELECT COALESCE(SUM(capital_amount), 0),
         COALESCE(SUM(interest_amount + late_amount), 0)
    INTO v_capital_recuperado, v_interes_ganado
  FROM public.payments
  WHERE user_id = v_uid AND status = 'paid';

  -- 3. Préstamos activos y clientes activos
  SELECT COUNT(*), COUNT(DISTINCT client_id)
    INTO v_activos, v_clientes_activos
  FROM public.loans
  WHERE user_id = v_uid
    AND deleted_at IS NULL
    AND status IN ('active', 'late', 'late_1_30', 'late_31_60', 'late_61_90');

  -- 4. Por cobrar: capital pendiente (principal − capital ya pagado) de los activos
  SELECT COALESCE(SUM(GREATEST(0, l.amount - COALESCE(pc.paid, 0))), 0) INTO v_por_cobrar
  FROM public.loans l
  LEFT JOIN (
    SELECT loan_id, SUM(capital_amount) AS paid
    FROM public.payments
    WHERE status = 'paid'
    GROUP BY loan_id
  ) pc ON pc.loan_id = l.id
  WHERE l.user_id = v_uid
    AND l.deleted_at IS NULL
    AND l.status IN ('active', 'late', 'late_1_30', 'late_31_60', 'late_61_90');

  -- 5. Cuotas vencidas de préstamos activos (due_date < hoy, sin pagar)
  SELECT COALESCE(SUM(GREATEST(0, i.amount - COALESCE(i.paid_amount, 0))), 0), COUNT(*)
    INTO v_mora_cuotas, v_vencidas
  FROM public.installments i
  JOIN public.loans l ON l.id = i.loan_id
  WHERE l.user_id = v_uid
    AND l.deleted_at IS NULL
    AND l.status IN ('active', 'late', 'late_1_30', 'late_31_60', 'late_61_90')
    AND i.due_date < v_today
    AND COALESCE(i.status, 'pending') <> 'paid'
    AND (i.amount - COALESCE(i.paid_amount, 0)) > 0.009;

  -- 6. Préstamos ABIERTOS (solo interés) con el período que se debe ya vencido.
  --    El período pendiente = primer pago + nº de pagos de interés hechos.
  SELECT COALESCE(SUM(l.installment_amount), 0), COUNT(*)
    INTO v_mora_abiertos, v_abiertos_vencidos
  FROM public.loans l
  WHERE l.user_id = v_uid
    AND l.deleted_at IS NULL
    AND l.open_ended
    AND l.status IN ('active', 'late', 'late_1_30', 'late_31_60', 'late_61_90')
    AND COALESCE(l.installment_amount, 0) > 0
    AND (
      CASE l.frequency
        WHEN 'daily' THEN l.first_payment_date + (
          (SELECT COUNT(*) FROM public.payments p
            WHERE p.loan_id = l.id AND p.status = 'paid'
              AND p.installment_id IS NULL AND COALESCE(p.capital_amount, 0) = 0) || ' days')::interval
        WHEN 'weekly' THEN l.first_payment_date + (
          (SELECT COUNT(*) FROM public.payments p
            WHERE p.loan_id = l.id AND p.status = 'paid'
              AND p.installment_id IS NULL AND COALESCE(p.capital_amount, 0) = 0) * 7 || ' days')::interval
        WHEN 'biweekly' THEN l.first_payment_date + (
          (SELECT COUNT(*) FROM public.payments p
            WHERE p.loan_id = l.id AND p.status = 'paid'
              AND p.installment_id IS NULL AND COALESCE(p.capital_amount, 0) = 0) * 15 || ' days')::interval
        ELSE l.first_payment_date + (
          (SELECT COUNT(*) FROM public.payments p
            WHERE p.loan_id = l.id AND p.status = 'paid'
              AND p.installment_id IS NULL AND COALESCE(p.capital_amount, 0) = 0) || ' months')::interval
      END
    )::date < v_today;

  -- 6b. MORA ACUMULADA: el RECARGO por pagar tarde (no el atraso).
  --     Regla de la app (finance.ts -> lateFee): pendiente × (tasa diaria / 100) ×
  --     días de atraso DESPUÉS de los días de gracia. Se calcula en vivo sobre las
  --     mismas filas vencidas (cuotas + períodos de préstamos abiertos).
  WITH abiertos AS (
    SELECT
      l.installment_amount AS pendiente,
      COALESCE(l.late_interest_rate, 0) AS tasa,
      (CASE l.frequency
        WHEN 'daily' THEN l.first_payment_date + (
          (SELECT COUNT(*) FROM public.payments p
            WHERE p.loan_id = l.id AND p.status = 'paid'
              AND p.installment_id IS NULL AND COALESCE(p.capital_amount, 0) = 0) || ' days')::interval
        WHEN 'weekly' THEN l.first_payment_date + (
          (SELECT COUNT(*) FROM public.payments p
            WHERE p.loan_id = l.id AND p.status = 'paid'
              AND p.installment_id IS NULL AND COALESCE(p.capital_amount, 0) = 0) * 7 || ' days')::interval
        WHEN 'biweekly' THEN l.first_payment_date + (
          (SELECT COUNT(*) FROM public.payments p
            WHERE p.loan_id = l.id AND p.status = 'paid'
              AND p.installment_id IS NULL AND COALESCE(p.capital_amount, 0) = 0) * 15 || ' days')::interval
        ELSE l.first_payment_date + (
          (SELECT COUNT(*) FROM public.payments p
            WHERE p.loan_id = l.id AND p.status = 'paid'
              AND p.installment_id IS NULL AND COALESCE(p.capital_amount, 0) = 0) || ' months')::interval
      END)::date AS due
    FROM public.loans l
    WHERE l.user_id = v_uid
      AND l.deleted_at IS NULL
      AND l.open_ended
      AND l.status IN ('active', 'late', 'late_1_30', 'late_31_60', 'late_61_90')
      AND COALESCE(l.installment_amount, 0) > 0
  )
  SELECT COALESCE(SUM(m.mora), 0) INTO v_mora_acumulada
  FROM (
    SELECT ROUND(
             GREATEST(i.amount - COALESCE(i.paid_amount, 0), 0)
             * (COALESCE(l.late_interest_rate, 0) / 100)
             * GREATEST(0, (v_today - i.due_date) - v_grace),
             2) AS mora
    FROM public.installments i
    JOIN public.loans l ON l.id = i.loan_id
    WHERE l.user_id = v_uid
      AND l.deleted_at IS NULL
      AND l.status IN ('active', 'late', 'late_1_30', 'late_31_60', 'late_61_90')
      AND i.due_date < v_today
      AND COALESCE(i.status, 'pending') <> 'paid'
      AND (i.amount - COALESCE(i.paid_amount, 0)) > 0.009
    UNION ALL
    SELECT ROUND(
             a.pendiente * (a.tasa / 100) * GREATEST(0, (v_today - a.due) - v_grace),
             2)
    FROM abiertos a
    WHERE a.due < v_today
  ) m;

  -- 7. Clientes morosos (cuotas vencidas + préstamos abiertos vencidos)
  SELECT COUNT(DISTINCT client_id) INTO v_clientes_morosos
  FROM (
    SELECT i.client_id
    FROM public.installments i
    JOIN public.loans l ON l.id = i.loan_id
    WHERE l.user_id = v_uid
      AND l.deleted_at IS NULL
      AND l.status IN ('active', 'late', 'late_1_30', 'late_31_60', 'late_61_90')
      AND i.due_date < v_today
      AND COALESCE(i.status, 'pending') <> 'paid'
      AND (i.amount - COALESCE(i.paid_amount, 0)) > 0.009
    UNION
    SELECT l.client_id
    FROM public.loans l
    WHERE l.user_id = v_uid
      AND l.deleted_at IS NULL
      AND l.open_ended
      AND l.status IN ('active', 'late', 'late_1_30', 'late_31_60', 'late_61_90')
      AND COALESCE(l.installment_amount, 0) > 0
      AND (
        CASE l.frequency
          WHEN 'daily' THEN l.first_payment_date + (
            (SELECT COUNT(*) FROM public.payments p
              WHERE p.loan_id = l.id AND p.status = 'paid'
                AND p.installment_id IS NULL AND COALESCE(p.capital_amount, 0) = 0) || ' days')::interval
          WHEN 'weekly' THEN l.first_payment_date + (
            (SELECT COUNT(*) FROM public.payments p
              WHERE p.loan_id = l.id AND p.status = 'paid'
                AND p.installment_id IS NULL AND COALESCE(p.capital_amount, 0) = 0) * 7 || ' days')::interval
          WHEN 'biweekly' THEN l.first_payment_date + (
            (SELECT COUNT(*) FROM public.payments p
              WHERE p.loan_id = l.id AND p.status = 'paid'
                AND p.installment_id IS NULL AND COALESCE(p.capital_amount, 0) = 0) * 15 || ' days')::interval
          ELSE l.first_payment_date + (
            (SELECT COUNT(*) FROM public.payments p
              WHERE p.loan_id = l.id AND p.status = 'paid'
                AND p.installment_id IS NULL AND COALESCE(p.capital_amount, 0) = 0) || ' months')::interval
        END
      )::date < v_today
  ) t;

  -- 8. Cobros de hoy (cuotas de préstamos activos que vencen hoy y no están pagadas)
  SELECT COALESCE(SUM(GREATEST(0, i.amount - COALESCE(i.paid_amount, 0))), 0), COUNT(*)
    INTO v_cobro_hoy, v_hoy_count
  FROM public.installments i
  JOIN public.loans l ON l.id = i.loan_id
  WHERE l.user_id = v_uid
    AND l.deleted_at IS NULL
    AND l.status IN ('active', 'late', 'late_1_30', 'late_31_60', 'late_61_90')
    AND i.due_date = v_today
    AND COALESCE(i.status, 'pending') <> 'paid'
    AND (i.amount - COALESCE(i.paid_amount, 0)) > 0.009;

  -- 9. Próximos pagos (1..7 días, hasta 6) con cliente y número de cuota
  SELECT COALESCE(jsonb_agg(x ORDER BY x->>'due_date', x->>'loan_id'), '[]'::jsonb)
    INTO v_proximos
  FROM (
    SELECT jsonb_build_object(
             'number', i.number,
             'due_date', i.due_date,
             'pending', GREATEST(0, i.amount - COALESCE(i.paid_amount, 0)),
             'client_name', c.name,
             'loan_display_id', l.loan_id,
             'loan_id', l.id
           ) AS x
    FROM public.installments i
    JOIN public.loans l ON l.id = i.loan_id
    LEFT JOIN public.clients c ON c.id = i.client_id
    WHERE l.user_id = v_uid
      AND l.deleted_at IS NULL
      AND l.status IN ('active', 'late', 'late_1_30', 'late_31_60', 'late_61_90')
      AND i.due_date > v_today
      AND i.due_date <= v_today + 7
      AND COALESCE(i.status, 'pending') <> 'paid'
      AND (i.amount - COALESCE(i.paid_amount, 0)) > 0.009
    ORDER BY i.due_date
    LIMIT 6
  ) t;

  -- 10. Serie mensual (últimos 6 meses): ingresos (pagos) y prestado (inicio del préstamo)
  WITH meses AS (
    SELECT to_char(date_trunc('month', v_today - (k || ' months')::interval), 'YYYY-MM') AS key,
           date_trunc('month', v_today - (k || ' months')::interval)::date AS inicio,
           k
    FROM generate_series(5, 0, -1) AS k
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'key', m.key,
           'ingresos', COALESCE(ing.total, 0),
           'prestado', COALESCE(pre.total, 0)
         ) ORDER BY m.inicio), '[]'::jsonb)
    INTO v_meses
  FROM meses m
  LEFT JOIN (
    SELECT to_char((p.created_at AT TIME ZONE 'America/Santo_Domingo'), 'YYYY-MM') AS key,
           SUM(p.amount) AS total
    FROM public.payments p
    WHERE p.user_id = v_uid AND p.status = 'paid'
    GROUP BY 1
  ) ing ON ing.key = m.key
  LEFT JOIN (
    SELECT to_char(l.start_date, 'YYYY-MM') AS key, SUM(l.amount) AS total
    FROM public.loans l
    WHERE l.user_id = v_uid AND l.deleted_at IS NULL
    GROUP BY 1
  ) pre ON pre.key = m.key;

  RETURN jsonb_build_object(
    'capital_prestado', v_capital_prestado,
    'loans_total', v_loans_total,
    'capital_recuperado', v_capital_recuperado,
    'interes_ganado', v_interes_ganado,
    'por_cobrar', v_por_cobrar,
    'en_mora', v_mora_cuotas + v_mora_abiertos,
    'mora_cuotas', v_mora_cuotas,
    'mora_abiertos', v_mora_abiertos,
    'mora_acumulada', v_mora_acumulada,
    'vencidas', v_vencidas,
    'vencidas_count', v_vencidas + v_abiertos_vencidos,
    'clientes_morosos', v_clientes_morosos,
    'cobro_hoy', v_cobro_hoy,
    'hoy_count', v_hoy_count,
    'proximos', v_proximos,
    'activos', v_activos,
    'clientes_activos', v_clientes_activos,
    'meses', v_meses
  );
END;
$$;

REVOKE ALL ON FUNCTION public.dashboard_summary(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_summary(UUID) TO authenticated, service_role;
