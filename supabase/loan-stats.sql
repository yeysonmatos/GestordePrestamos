-- RPC centralizado get_loan_stats
-- Fuente única de verdad para "capital recuperado", mora y métricas de cartera,
-- consumido por Dashboard (sin fecha = histórico) y Reportes (rango p_from_date..p_to_date).
-- Los préstamos archivados (deleted_at NOT NULL) se excluyen de los agregados de
-- préstamos; los pagos históricos (capital/interés) sobreviven siempre.
--
-- Definición de "capital":
--   * pending_capital / active_capital / late_capital = SOLO PRINCIPAL pendiente
--     (monto del préstamo MENOS el capital ya pagado en payments.capital_amount),
--     NO el remaining_amount (que en francesa incluye el interés programado de las
--     cuotas por vencer). El interés tiene su propio indicador: generated_interest
--     ("Total intereses proyectados") y collected_interest ("Intereses cobrados").
--     Así se cumple la identidad contable: Prestado = Recuperado + Pendiente.
--
-- Clasificación de mora:
--   * UN préstamo es MOROSO cuando tiene >=1 cuota sin pagar cuyo due_date ya pasó
--     (status pending/partial/late y due_date < hoy), haya corrido o no el cron que
--     pinta estados late_1_30/31_60/61_90. Ese es el estado REAL de tu cobranza.
--   * La mora se cuenta "vencida hoy" SIN importar el período de Reportes (decisión
--     del usuario): es tu deuda real pendiente hoy, aun si el préstamo se creó antes.
--   * Las cifras de movimiento (prestado/recuperado/intereses del período) SÍ
--     respetan p_from_date/p_to_date; el estado de la cartera (activos/morosos/salud) es "hoy".

DROP FUNCTION IF EXISTS public.get_loan_stats(UUID, DATE);

CREATE OR REPLACE FUNCTION public.get_loan_stats(p_user_id UUID, p_from_date DATE DEFAULT NULL, p_to_date DATE DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE
  v_total_capital        NUMERIC;
  v_recovered_capital    NUMERIC;
  v_pending_capital      NUMERIC;
  v_generated_interest   NUMERIC;
  v_collected_interest   NUMERIC;
  v_active_capital       NUMERIC;
  v_late_capital         NUMERIC;
  v_active_loans         INTEGER;
  v_outstanding_loans    INTEGER;
  v_paid_loans           INTEGER;
  v_late_loans           INTEGER;
  v_active_clients       INTEGER;
  v_late_clients         INTEGER;
BEGIN
  -- Guarda de seguridad: solo el owner puede leer SUS estadísticas.
  -- Un pago/estadística ajena nunca debe filtrarse (aunque el RPC salte RLS).
  IF auth.uid() IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = current_user AND rolsuper) THEN
      RETURN NULL;
    END IF;
  ELSIF auth.uid() <> p_user_id THEN
    RETURN NULL;
  END IF;

  -- ---- Movimiento (respeta el período) ----

  SELECT COALESCE(SUM(amount), 0) INTO v_total_capital
  FROM loans
  WHERE user_id = p_user_id
    AND deleted_at IS NULL
    AND (p_from_date IS NULL OR created_at >= p_from_date)
    AND (p_to_date IS NULL OR created_at < (p_to_date + 1));

  SELECT COALESCE(SUM(capital_amount), 0) INTO v_recovered_capital
  FROM payments
  WHERE user_id = p_user_id
    AND status = 'paid'
    AND (p_from_date IS NULL OR payment_date >= p_from_date)
    AND (p_to_date IS NULL OR payment_date <= p_to_date);

  -- Préstamos en curso por período (activos + atrasados en cualquiera de sus estados).
  -- Capital pendiente = SOLO principal: monto del préstamo menos el capital ya pagado
  -- (payments.capital_amount), NO remaining_amount (que en francesa incluye el interés).
  SELECT COALESCE(SUM(GREATEST(0, l.amount - COALESCE(pc.paid_capital, 0))), 0) INTO v_pending_capital
  FROM loans l
  LEFT JOIN (
    SELECT loan_id, SUM(capital_amount) AS paid_capital
    FROM payments
    WHERE status = 'paid'
    GROUP BY loan_id
  ) pc ON pc.loan_id = l.id
  WHERE l.user_id = p_user_id
    AND l.status IN ('active', 'late', 'late_1_30', 'late_31_60', 'late_61_90')
    AND l.deleted_at IS NULL
    AND (p_from_date IS NULL OR l.created_at >= p_from_date)
    AND (p_to_date IS NULL OR l.created_at < (p_to_date + 1));

  SELECT COALESCE(SUM(total_interest), 0) INTO v_generated_interest
  FROM loans
  WHERE user_id = p_user_id
    AND deleted_at IS NULL
    AND (p_from_date IS NULL OR created_at >= p_from_date)
    AND (p_to_date IS NULL OR created_at < (p_to_date + 1));

  SELECT COALESCE(SUM(interest_amount), 0) INTO v_collected_interest
  FROM payments
  WHERE user_id = p_user_id
    AND status = 'paid'
    AND (p_from_date IS NULL OR payment_date >= p_from_date)
    AND (p_to_date IS NULL OR payment_date <= p_to_date);

  -- ---- Estado de la cartera (mora real = cuotas vencidas hoy, sin período) ----

  -- Préstamos actualmente morosos: >=1 cuota vencida hoy
  WITH late_loan_ids AS (
    SELECT DISTINCT l.id
    FROM loans l
    JOIN installments i ON i.loan_id = l.id
    WHERE l.user_id = p_user_id
      AND l.deleted_at IS NULL
      AND i.status IN ('pending', 'partial', 'late')
      AND i.due_date < public.today_rd()
  )
  SELECT
    COALESCE(SUM(CASE WHEN li.id IS NULL THEN GREATEST(0, l.amount - COALESCE(pc.paid_capital, 0)) END), 0),
    COALESCE(SUM(CASE WHEN li.id IS NOT NULL THEN GREATEST(0, l.amount - COALESCE(pc.paid_capital, 0)) END), 0),
    COUNT(*) FILTER (WHERE li.id IS NULL),
    COUNT(*) FILTER (WHERE li.id IS NOT NULL),
    COUNT(DISTINCT l.client_id) FILTER (WHERE li.id IS NOT NULL)
  INTO v_active_capital, v_late_capital, v_active_loans, v_late_loans, v_late_clients
  FROM loans l
  LEFT JOIN late_loan_ids li ON li.id = l.id
  LEFT JOIN (
    SELECT loan_id, SUM(capital_amount) AS paid_capital
    FROM payments
    WHERE status = 'paid'
    GROUP BY loan_id
  ) pc ON pc.loan_id = l.id
  WHERE l.user_id = p_user_id
    AND l.deleted_at IS NULL
    AND l.status IN ('active', 'late', 'late_1_30', 'late_31_60', 'late_61_90');

  -- Préstamos en curso HOY y pagados HOY (para "Salud cartera" y gráfica de estado)
  SELECT COUNT(*) INTO v_outstanding_loans
  FROM loans
  WHERE user_id = p_user_id
    AND status IN ('active', 'late', 'late_1_30', 'late_31_60', 'late_61_90')
    AND deleted_at IS NULL;

  SELECT COUNT(*) INTO v_paid_loans
  FROM loans
  WHERE user_id = p_user_id
    AND status = 'paid'
    AND deleted_at IS NULL;

  SELECT COUNT(*) INTO v_active_clients
  FROM clients
  WHERE user_id = p_user_id
    AND status = 'active';

  RETURN jsonb_build_object(
    'total_capital',      v_total_capital,
    'recovered_capital',  v_recovered_capital,
    'pending_capital',    v_pending_capital,
    'generated_interest', v_generated_interest,
    'collected_interest', v_collected_interest,
    'active_capital',     v_active_capital,
    'late_capital',       v_late_capital,
    'active_loans',       v_active_loans,
    'outstanding_loans',  v_outstanding_loans,
    'paid_loans',         v_paid_loans,
    'late_loans',         v_late_loans,
    'active_clients',     v_active_clients,
    'late_clients',       v_late_clients
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_loan_stats(UUID, DATE, DATE) FROM public;
GRANT EXECUTE ON FUNCTION public.get_loan_stats(UUID, DATE, DATE) TO authenticated;
-- service_role conserva acceso (lo usa el API admin si hace falta el futuro)
GRANT EXECUTE ON FUNCTION public.get_loan_stats(UUID, DATE, DATE) TO service_role;