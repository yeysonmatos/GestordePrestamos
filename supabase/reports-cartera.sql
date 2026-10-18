-- ============================================================
-- reports-cartera.sql — Estado de la cartera de Reportes, calculado en la base
--
-- RPC public.reports_cartera(p_user_id, p_as_of): devuelve la fotografía de la
-- cartera al cierre de un rango (p_as_of), con la MISMA REGLA QUE EL INICIO:
-- además de las cuotas vencidas de los préstamos con cuotas, incluye el PERÍODO
-- DE INTERÉS VENCIDO de los préstamos ABIERTOS (solo interés), que no generan
-- cuotas pero sí se cobran.
--
--   * al_dia  = lo que aún no vencía a la fecha de cierre.
--   * vencido = lo vencido y sin pagar a esa fecha.
--   * aging   = el vencido repartido en 1-30 / 31-60 / 61-90 / 90+ días.
--   * tasa    = vencido / total (la "morosidad" que muestra Reportes).
--   * conteos = préstamos en curso / pagados / archivados (con start_date <= as_of,
--               igual que antes; los archivados no llevan filtro de fecha).
--
-- El "día de referencia" para decidir si algo está vencido es el menor entre la
-- fecha de cierre y HOY (no se puede estar "vencido" en el futuro).
--
-- Guarda: solo el dueño (auth.uid()) o el sistema (postgres/service_role).
-- Idempotente (CREATE OR REPLACE). Se aplica con scripts/exec-reports-cartera.mjs
-- ============================================================

CREATE OR REPLACE FUNCTION public.reports_cartera(
  p_user_id UUID DEFAULT NULL,
  p_as_of DATE DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_today DATE := public.today_rd();
  v_uid UUID;
  v_as_of DATE;
  v_late_ref DATE;
  v_al_dia NUMERIC := 0;
  v_vencido NUMERIC := 0;
  v_d1 NUMERIC := 0;
  v_d31 NUMERIC := 0;
  v_d61 NUMERIC := 0;
  v_d90 NUMERIC := 0;
  v_mora NUMERIC := 0;
  v_grace INTEGER := 0;
  v_active INTEGER := 0;
  v_paid INTEGER := 0;
  v_archived INTEGER := 0;
  v_total NUMERIC;
BEGIN
  -- Guarda de seguridad: solo el dueño puede leer SU cartera.
  IF auth.uid() IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = current_user AND rolsuper)
       AND current_user NOT IN ('postgres', 'service_role') THEN
      RETURN NULL;
    END IF;
  ELSIF auth.uid() <> p_user_id THEN
    RETURN NULL;
  END IF;

  v_uid := COALESCE(p_user_id, auth.uid());
  v_as_of := COALESCE(p_as_of, v_today);
  v_late_ref := LEAST(v_as_of, v_today);
  v_grace := COALESCE((SELECT grace_days FROM public.settings WHERE user_id = v_uid LIMIT 1), 0);

  -- Filas de la cartera: cuotas pendientes + períodos de préstamos ABIERTOS.
  WITH abiertos AS (
    SELECT
      (CASE l.frequency
        WHEN 'daily' THEN l.first_payment_date + (
          (SELECT COUNT(*) FROM public.payments p
            WHERE p.loan_id = l.id AND p.status = 'paid'
              AND p.installment_id IS NULL AND COALESCE(p.capital_amount, 0) = 0
              AND (p.created_at AT TIME ZONE 'America/Santo_Domingo')::date <= v_as_of) || ' days')::interval
        WHEN 'weekly' THEN l.first_payment_date + (
          (SELECT COUNT(*) FROM public.payments p
            WHERE p.loan_id = l.id AND p.status = 'paid'
              AND p.installment_id IS NULL AND COALESCE(p.capital_amount, 0) = 0
              AND (p.created_at AT TIME ZONE 'America/Santo_Domingo')::date <= v_as_of) * 7 || ' days')::interval
        WHEN 'biweekly' THEN l.first_payment_date + (
          (SELECT COUNT(*) FROM public.payments p
            WHERE p.loan_id = l.id AND p.status = 'paid'
              AND p.installment_id IS NULL AND COALESCE(p.capital_amount, 0) = 0
              AND (p.created_at AT TIME ZONE 'America/Santo_Domingo')::date <= v_as_of) * 15 || ' days')::interval
        ELSE l.first_payment_date + (
          (SELECT COUNT(*) FROM public.payments p
            WHERE p.loan_id = l.id AND p.status = 'paid'
              AND p.installment_id IS NULL AND COALESCE(p.capital_amount, 0) = 0
              AND (p.created_at AT TIME ZONE 'America/Santo_Domingo')::date <= v_as_of) || ' months')::interval
      END)::date AS due,
      COALESCE(l.installment_amount, 0) AS pendiente,
      COALESCE(l.late_interest_rate, 0) AS tasa
    FROM public.loans l
    WHERE l.user_id = v_uid
      AND l.deleted_at IS NULL
      AND l.open_ended
      AND l.status IN ('active', 'late', 'late_1_30', 'late_31_60', 'late_61_90')
      AND COALESCE(l.installment_amount, 0) > 0.009
  ),
  filas AS (
    SELECT i.due_date AS due,
           GREATEST(i.amount - COALESCE(i.paid_amount, 0), 0) AS pendiente,
           COALESCE(l.late_interest_rate, 0) AS tasa
    FROM public.installments i
    JOIN public.loans l ON l.id = i.loan_id
    WHERE l.user_id = v_uid
      AND l.deleted_at IS NULL
      AND l.status IN ('active', 'late', 'late_1_30', 'late_31_60', 'late_61_90')
      AND i.due_date <= v_as_of
      AND GREATEST(i.amount - COALESCE(i.paid_amount, 0), 0) > 0.009
    UNION ALL
    SELECT a.due, a.pendiente, a.tasa FROM abiertos a WHERE a.due <= v_as_of
  )
  SELECT
    COALESCE(SUM(CASE WHEN due >= v_late_ref THEN pendiente ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN due < v_late_ref THEN pendiente ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN due < v_late_ref AND (v_late_ref - due) <= 30 THEN pendiente ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN due < v_late_ref AND (v_late_ref - due) BETWEEN 31 AND 60 THEN pendiente ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN due < v_late_ref AND (v_late_ref - due) BETWEEN 61 AND 90 THEN pendiente ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN due < v_late_ref AND (v_late_ref - due) > 90 THEN pendiente ELSE 0 END), 0),
    -- Mora acumulada (el recargo por pagar tarde, no el atraso): misma regla que el
    -- Inicio (finance.ts -> lateFee), aplicada a la fecha de cierre y con la gracia.
    COALESCE(SUM(CASE WHEN due < v_late_ref THEN
      ROUND(pendiente * (tasa / 100) * GREATEST(0, (v_late_ref - due) - v_grace), 2)
      ELSE 0 END), 0)
  INTO v_al_dia, v_vencido, v_d1, v_d31, v_d61, v_d90, v_mora
  FROM filas;

  v_total := v_al_dia + v_vencido;

  -- Resumen de préstamos (mismos criterios que la pantalla)
  SELECT
    COUNT(*) FILTER (
      WHERE deleted_at IS NULL
        AND status IN ('active', 'late', 'late_1_30', 'late_31_60', 'late_61_90')
        AND start_date <= v_as_of
    ),
    COUNT(*) FILTER (
      WHERE deleted_at IS NULL AND status = 'paid' AND start_date <= v_as_of
    ),
    COUNT(*) FILTER (
      WHERE deleted_at IS NOT NULL OR status = 'cancelled'
    )
  INTO v_active, v_paid, v_archived
  FROM public.loans
  WHERE user_id = v_uid;

  RETURN jsonb_build_object(
    'as_of', v_as_of,
    'late_ref', v_late_ref,
    'al_dia', v_al_dia,
    'vencido', v_vencido,
    'mora_acumulada', v_mora,
    'total', v_total,
    'tasa', CASE WHEN v_total > 0 THEN (v_vencido / v_total) * 100 ELSE 0 END,
    'aging', jsonb_build_object(
      'd1_30', v_d1,
      'd31_60', v_d31,
      'd61_90', v_d61,
      'd90plus', v_d90
    ),
    'loans_active', v_active,
    'loans_paid', v_paid,
    'loans_archived', v_archived
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reports_cartera(UUID, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reports_cartera(UUID, DATE) TO authenticated, service_role;
