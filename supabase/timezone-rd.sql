-- ============================================================
-- TIMEZONE RD — un solo reloj: America/Santo_Domingo (UTC-4, sin DST)
--
-- Contexto: RD es UTC-4 fijo. Los clientes ejecutan JS en su zona local,
-- pero el servidor Vercel corre en UTC y PostgreSQL evalúa CURRENT_DATE en
-- UTC (default Supabase). Entre 20:00 y 00:00 hora RD (00:00–04:00 UTC del
-- día siguiente) eso hace que la mora se compute con un día de más y que
-- los estados late/vencidos se pinten antes de tiempo.
--
-- Fix: helper público public.today_rd() que devuelve la fecha de HOY en
-- America/Santo_Domingo. Todas las funciones que comparan contra "hoy"
-- dejan de usar CURRENT_DATE y pasan a usar today_rd(). Las columnas de
-- fecha (due_date, payment_date) son DATE 'yyyy-MM-dd' con la fecha RD,
-- así que comparar contra today_rd() es correcto siempre.
--
-- Idempotente (CREATE OR REPLACE). Vía scripts/exec-timezone-rd.mjs
-- ============================================================

-- ------------------------------------------------------------
-- Helper: fecha de hoy en República Dominicana
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.today_rd()
RETURNS DATE
LANGUAGE sql
STABLE
SET timezone = 'UTC'
AS $$
  SELECT (now() AT TIME ZONE 'America/Santo_Domingo')::date
$$;

GRANT EXECUTE ON FUNCTION public.today_rd() TO authenticated;
GRANT EXECUTE ON FUNCTION public.today_rd() TO service_role;

-- ------------------------------------------------------------
-- calc_late_days: días de atraso con el reloj RD
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.calc_late_days(p_due DATE, p_grace INT)
RETURNS INTEGER
LANGUAGE sql
STABLE
AS $$
  SELECT GREATEST(0, (public.today_rd() - p_due) - COALESCE(p_grace, 0))
$$;

-- ------------------------------------------------------------
-- update_client_stats: mora real con el reloj RD (cuerpo completo
-- de client-status-fix2 + cambio CURRENT_DATE -> today_rd())
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_client_stats(p_client_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE
  v_late_loans INTEGER;
  v_paid_loans INTEGER;
  v_total_loans INTEGER;
  v_active_loans INTEGER;
  v_score INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = current_user AND rolsuper)
       AND current_user <> 'postgres'
       AND current_user <> 'service_role' THEN
      RETURN;
    END IF;
  ELSIF auth.uid() <> (SELECT user_id FROM clients WHERE id = p_client_id) THEN
    RETURN;
  END IF;

  v_late_loans  := (SELECT COUNT(DISTINCT l.id) FROM loans l
                    WHERE l.client_id = p_client_id AND l.deleted_at IS NULL
                    AND EXISTS (
                      SELECT 1 FROM installments i
                      WHERE i.loan_id = l.id
                        AND i.status IN ('pending','partial','late')
                        AND i.due_date < public.today_rd()
                    ));
  v_paid_loans  := (SELECT COUNT(*) FROM loans WHERE client_id = p_client_id AND status = 'paid' AND deleted_at IS NULL);
  v_total_loans := (SELECT COUNT(*) FROM loans WHERE client_id = p_client_id AND deleted_at IS NULL);
  v_active_loans := (SELECT COUNT(*) FROM loans WHERE client_id = p_client_id AND status IN ('active','late','late_1_30','late_31_60','late_61_90') AND deleted_at IS NULL);

  v_score := 50;
  IF v_late_loans = 0 THEN v_score := v_score + 25; END IF;
  IF v_paid_loans > 0 THEN v_score := v_score + 15; END IF;
  IF v_late_loans > 0 THEN v_score := v_score - 10; END IF;

  UPDATE clients SET
    total_loans     = v_total_loans,
    active_loans    = v_active_loans,
    status          = CASE WHEN v_active_loans > 0 THEN 'active' ELSE 'inactive' END,
    paid_loans      = v_paid_loans,
    late_loans      = v_late_loans,
    total_borrowed  = (SELECT COALESCE(SUM(amount),0) FROM loans WHERE client_id = p_client_id AND deleted_at IS NULL),
    total_interest  = (SELECT COALESCE(SUM(total_interest),0) FROM loans WHERE client_id = p_client_id AND deleted_at IS NULL),
    last_payment_at = (SELECT MAX(created_at) FROM payments WHERE client_id = p_client_id AND status = 'paid'),
    total_paid      = (SELECT COALESCE(SUM(amount),0) FROM payments WHERE client_id = p_client_id AND status = 'paid'),
    balance         = (SELECT COALESCE(SUM(remaining_amount),0) FROM loans WHERE client_id = p_client_id AND status IN ('active','late','late_1_30','late_31_60','late_61_90') AND deleted_at IS NULL),
    trust_score     = GREATEST(0, v_score),
    trust_level     = CASE
      WHEN v_score >= 75 THEN 'high'
      WHEN v_score >= 40 THEN 'medium'
      ELSE 'low'
    END
  WHERE id = p_client_id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_client_stats(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_client_stats(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_client_stats(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_client_stats(UUID) TO service_role;

-- ------------------------------------------------------------
-- get_loan_stats: mora real (cuotas vencidas) con el reloj RD
-- ------------------------------------------------------------
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
  IF auth.uid() IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = current_user AND rolsuper) THEN
      RETURN NULL;
    END IF;
  ELSIF auth.uid() <> p_user_id THEN
    RETURN NULL;
  END IF;

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
GRANT EXECUTE ON FUNCTION public.get_loan_stats(UUID, DATE, DATE) TO service_role;

-- ------------------------------------------------------------
-- update_all_loan_statuses: pintado de late_* con el reloj RD
-- (guarda con session_user de security-hardening2)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_all_loan_statuses()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE
  v_loan RECORD;
  v_max_late_days INTEGER;
  v_new_status TEXT;
  v_updated_count INTEGER := 0;
BEGIN
  IF session_user NOT IN ('postgres', 'service_role') THEN
    RAISE EXCEPTION 'Función reservada al sistema';
  END IF;

  FOR v_loan IN
    SELECT id FROM loans
    WHERE status IN ('active', 'late', 'late_1_30', 'late_31_60', 'late_61_90')
  LOOP
    SELECT COALESCE(MAX(GREATEST(0, public.today_rd() - due_date)), 0)
    INTO v_max_late_days
    FROM installments
    WHERE loan_id = v_loan.id
    AND status IN ('pending', 'partial', 'late');

    IF v_max_late_days <= 0 THEN
      CONTINUE;
    END IF;

    IF v_max_late_days <= 30 THEN
      v_new_status := 'late_1_30';
    ELSIF v_max_late_days <= 60 THEN
      v_new_status := 'late_31_60';
    ELSE
      v_new_status := 'late_61_90';
    END IF;

    UPDATE loans
    SET status = v_new_status,
        late_days = v_max_late_days
    WHERE id = v_loan.id;

    v_updated_count := v_updated_count + 1;
  END LOOP;

  RETURN v_updated_count;
END;
$$;

REVOKE ALL ON FUNCTION public.update_all_loan_statuses() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_all_loan_statuses() FROM anon;
REVOKE ALL ON FUNCTION public.update_all_loan_statuses() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.update_all_loan_statuses() TO service_role;

-- ------------------------------------------------------------
-- subscription_payments.payment_date: default en hora RD
-- (idempotente; cuando algo inserte sin payment_date explícito)
-- ------------------------------------------------------------
ALTER TABLE public.subscription_payments
  ALTER COLUMN payment_date SET DEFAULT (now() AT TIME ZONE 'America/Santo_Domingo')::date;