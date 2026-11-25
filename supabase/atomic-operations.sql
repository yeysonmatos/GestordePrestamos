-- ============================================================
-- Operaciones atómicas + modo lectura aplicado en la base de datos
-- ============================================================
-- 1) Modo lectura (regla de la app, src/components/app-shell.tsx): con la
--    suscripción vencida/cancelada o la cuenta bloqueada se puede COBRAR y
--    consultar, pero NO crear préstamos ni clientes nuevos. Trigger de
--    sentencia BEFORE INSERT en clients y loans (cubre también RPC SECURITY
--    DEFINER como save_loan). Solo sesiones de usuario (auth.uid() NOT NULL):
--    cron, service_role y la Management API siguen funcionando.
--
-- 2) (save_loan_with_schedule se eliminó: la app usa save_loan. Ver db-cleanup.sql.)
--
-- 3) apply_loan_operation(): aplica en UNA transacción las operaciones que
--    antes hacía el navegador en varios pasos (liquidación, abono a capital,
--    reversión de pago, pago de interés de préstamo abierto). Los cálculos del
--    cronograma siguen en TypeScript (src/lib/actions.ts); esta función solo
--    escribe, recalcula el préstamo con las MISMAS reglas que refreshLoanStatus
--    y actualiza las estadísticas del cliente.
--
-- apply_loan_operation es SECURITY INVOKER: las reglas RLS del usuario y el
-- modo lectura aplican a cada escritura.
--
-- Idempotente. Vía scripts/exec-atomic-operations.mjs
-- ============================================================

-- ------------------------------------------------------------
-- 1. Modo lectura
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_write_business(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE
  v_role TEXT;
  v_status TEXT;
  v_sub RECORD;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN TRUE;
  END IF;

  SELECT role, status INTO v_role, v_status FROM app_users WHERE id = p_user_id;
  IF v_role = 'admin' THEN
    RETURN TRUE;
  END IF;
  IF v_status = 'blocked' THEN
    RETURN FALSE;
  END IF;

  -- Misma regla que src/proxy.ts / subscription-guard.ts: suscripción más
  -- reciente; sin suscripción no se bloquea.
  SELECT status, ends_at INTO v_sub
  FROM subscriptions
  WHERE user_id = p_user_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN TRUE;
  END IF;
  IF v_sub.status IN ('expired', 'cancelled') THEN
    RETURN FALSE;
  END IF;
  IF v_sub.ends_at IS NOT NULL AND v_sub.ends_at < now() THEN
    RETURN FALSE;
  END IF;
  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.can_write_business(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_write_business(UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.enforce_read_only_mode()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.can_write_business(auth.uid()) THEN
    RAISE EXCEPTION 'Tu suscripción venció: estás en modo lectura. Puedes cobrar y consultar, pero no crear préstamos ni clientes nuevos.'
      USING ERRCODE = 'P0001', HINT = 'read_only_mode';
  END IF;
  RETURN NULL;
END;
$$;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['clients', 'loans', 'installments', 'payments', 'documents'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_read_only_mode ON public.%I', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['clients', 'loans'] LOOP
    EXECUTE format(
      'CREATE TRIGGER trg_read_only_mode BEFORE INSERT ON public.%I
         FOR EACH STATEMENT EXECUTE FUNCTION public.enforce_read_only_mode()', t);
  END LOOP;
END;
$$;

-- ------------------------------------------------------------
-- Helpers internos — esquema gp_private (PostgREST solo expone public,
-- así que no se pueden llamar por la API). SECURITY INVOKER: corren con
-- los permisos y RLS de quien llama.
-- ------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS gp_private;
REVOKE ALL ON SCHEMA gp_private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA gp_private TO authenticated, service_role;

-- Aplica un UPDATE con solo las columnas permitidas presentes en p_data.
-- p_where es un fragmento SQL con $2 / $3 como parámetros.
CREATE OR REPLACE FUNCTION gp_private._gp_update_whitelisted(
  p_table TEXT, p_allowed TEXT[], p_data JSONB, p_where TEXT, p_arg2 TEXT, p_arg3 TEXT
) RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
DECLARE
  v_sets TEXT;
  v_count INTEGER;
BEGIN
  IF p_data IS NULL OR jsonb_typeof(p_data) <> 'object' THEN
    RETURN 0;
  END IF;

  SELECT string_agg(format('%I = (s.r).%I', k, k), ', ')
    INTO v_sets
  FROM jsonb_object_keys(p_data) AS k
  WHERE k = ANY (p_allowed);

  IF v_sets IS NULL THEN
    RETURN 0;
  END IF;

  EXECUTE format(
    'UPDATE public.%1$I t SET %2$s FROM (SELECT jsonb_populate_record(NULL::public.%1$I, $1) AS r) s WHERE %3$s',
    p_table, v_sets, p_where)
  USING p_data, p_arg2, p_arg3;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION gp_private._gp_update_whitelisted(TEXT, TEXT[], JSONB, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION gp_private._gp_update_whitelisted(TEXT, TEXT[], JSONB, TEXT, TEXT, TEXT) TO authenticated, service_role;

-- Igual que recalcInstallmentFromPayments (src/lib/actions.ts): tolerancia de
-- 0.009 y montos redondeados a 2 decimales.
CREATE OR REPLACE FUNCTION gp_private._gp_recalc_installment(p_installment_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
DECLARE
  v_paid NUMERIC;
  v_late NUMERIC;
  v_last DATE;
  v_amount NUMERIC;
  v_new_paid NUMERIC;
  v_full BOOLEAN;
BEGIN
  SELECT COALESCE(SUM(COALESCE(capital_amount, 0) + COALESCE(interest_amount, 0)), 0),
         COALESCE(SUM(COALESCE(late_amount, 0)), 0)
    INTO v_paid, v_late
  FROM payments
  WHERE installment_id = p_installment_id AND status = 'paid';

  SELECT payment_date INTO v_last
  FROM payments
  WHERE installment_id = p_installment_id AND status = 'paid'
  ORDER BY payment_date DESC
  LIMIT 1;

  SELECT amount INTO v_amount FROM installments WHERE id = p_installment_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_full := v_paid >= v_amount - 0.009;
  v_new_paid := ROUND(LEAST(v_paid, v_amount), 2);

  UPDATE installments SET
    status = CASE WHEN v_full THEN 'paid' WHEN v_new_paid > 0.009 THEN 'partial' ELSE 'pending' END,
    paid_amount = v_new_paid,
    paid_late_amount = ROUND(v_late, 2),
    paid_at = CASE WHEN v_full THEN v_last ELSE NULL END
  WHERE id = p_installment_id;
END;
$$;

REVOKE ALL ON FUNCTION gp_private._gp_recalc_installment(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION gp_private._gp_recalc_installment(UUID) TO authenticated, service_role;

-- Igual que refreshLoanStatus (src/lib/actions.ts), sin llamar a
-- update_client_stats (lo hace quien la invoca): métricas, cierre/reapertura
-- y pintado de atraso (días sin gracia, con la fecha de RD).
CREATE OR REPLACE FUNCTION gp_private._gp_recalc_loan(p_loan_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
DECLARE
  v_loan loans%ROWTYPE;
  v_is_io BOOLEAN;
  v_is_oe BOOLEAN;
  v_total INTEGER;
  v_fully INTEGER;
  v_paid NUMERIC;
  v_cap_paid NUMERIC;
  v_remaining NUMERIC;
  v_progress NUMERIC;
  v_all_paid BOOLEAN;
  v_status TEXT;
  v_paid_at TIMESTAMPTZ;
  v_late_days INTEGER;
  v_max_late INTEGER;
BEGIN
  SELECT * INTO v_loan FROM loans WHERE id = p_loan_id;
  IF NOT FOUND OR v_loan.deleted_at IS NOT NULL OR v_loan.status = 'cancelled' THEN
    RETURN;
  END IF;

  v_is_io := v_loan.amortization_type = 'interest_only';
  v_is_oe := COALESCE(v_loan.open_ended, FALSE);

  SELECT COUNT(*), COUNT(*) FILTER (WHERE status = 'paid')
    INTO v_total, v_fully
  FROM installments WHERE loan_id = p_loan_id;

  SELECT COALESCE(SUM(COALESCE(capital_amount, 0)), 0) INTO v_cap_paid
  FROM payments WHERE loan_id = p_loan_id AND status = 'paid';

  IF v_is_oe THEN
    v_paid := v_cap_paid;
    v_fully := 0;
  ELSE
    SELECT COALESCE(SUM(COALESCE(paid_amount, 0)), 0) INTO v_paid
    FROM installments WHERE loan_id = p_loan_id;
    v_paid := v_paid + COALESCE((
      SELECT SUM(amount) FROM payments
      WHERE loan_id = p_loan_id AND status = 'paid' AND type IN ('capital_abono', 'liquidation')
    ), 0);
  END IF;

  IF v_is_oe OR v_is_io THEN
    v_remaining := GREATEST(0, COALESCE(v_loan.amount, 0) - v_cap_paid);
  ELSE
    SELECT COALESCE(SUM(GREATEST(0, amount - COALESCE(paid_amount, 0))), 0) INTO v_remaining
    FROM installments WHERE loan_id = p_loan_id AND status <> 'paid';
  END IF;

  IF v_is_io AND COALESCE(v_loan.amount, 0) > 0 THEN
    v_progress := ROUND((v_loan.amount - v_remaining) / v_loan.amount * 100);
  ELSIF NOT v_is_oe AND v_total > 0 THEN
    v_progress := ROUND(v_fully::NUMERIC / v_total * 100);
  ELSE
    v_progress := 0;
  END IF;

  v_status := v_loan.status;
  v_paid_at := v_loan.paid_at;
  v_late_days := v_loan.late_days;

  IF v_is_oe THEN
    v_all_paid := v_remaining <= 0.009;
  ELSE
    v_all_paid := v_total > 0 AND v_fully >= v_total AND v_remaining <= 0.009;
  END IF;

  IF v_all_paid THEN
    v_status := 'paid';
    v_paid_at := now();
  ELSIF v_loan.status = 'paid' THEN
    v_status := 'active';
    v_paid_at := NULL;
  END IF;

  IF NOT v_all_paid AND NOT v_is_oe THEN
    SELECT COALESCE(MAX(public.today_rd() - due_date::date), 0) INTO v_max_late
    FROM installments WHERE loan_id = p_loan_id AND status <> 'paid';
    IF v_max_late > 0 THEN
      v_status := CASE WHEN v_max_late <= 30 THEN 'late_1_30'
                       WHEN v_max_late <= 60 THEN 'late_31_60'
                       ELSE 'late_61_90' END;
      v_late_days := v_max_late;
    ELSIF v_loan.status LIKE 'late%' THEN
      v_status := 'active';
      v_late_days := 0;
    END IF;
  END IF;

  UPDATE loans SET
    paid_installments = v_fully,
    paid_amount = ROUND(v_paid, 2),
    remaining_amount = ROUND(v_remaining, 2),
    progress = v_progress,
    status = v_status,
    paid_at = v_paid_at,
    late_days = v_late_days
  WHERE id = p_loan_id;
END;
$$;

REVOKE ALL ON FUNCTION gp_private._gp_recalc_loan(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION gp_private._gp_recalc_loan(UUID) TO authenticated, service_role;

-- ------------------------------------------------------------
-- 3. apply_loan_operation
-- ------------------------------------------------------------
-- p_ops (todas las claves opcionales), se aplican en este orden:
--   reverse_payment_id, reversal_reason  → marca el pago como revertido
--   payment {amount, capital_amount, interest_amount, late_amount, type,
--            payment_date, method, notes, installment_id} → inserta el pago
--   recalc_installments [uuid...] | "all" → recalcula cuotas desde sus pagos
--   installment_writes [{key:'id'|'number', value, data:{...}}]
--   loan_updates {...}                    → antes de recalcular agregados
--   (siempre) recalcula agregados del préstamo
--   post_loan_updates {...}               → después de recalcular agregados
--   reopen_if_unpaid true                 → 'paid' → 'active' si progress < 100
--   paid_amount_from_payments true        → paid_amount = Σ pagos cobrados
--   (siempre) update_client_stats
-- Devuelve { ok, payment, loan, installments }.
CREATE OR REPLACE FUNCTION public.apply_loan_operation(p_loan_id UUID, p_ops JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER SET search_path = 'public'
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_loan loans%ROWTYPE;
  v_payment payments%ROWTYPE;
  v_has_payment BOOLEAN := FALSE;
  v_pay JSONB;
  v_write JSONB;
  v_key TEXT;
  v_n INTEGER;
  v_inst_id UUID;
  v_inst_cols TEXT[] := ARRAY['amount', 'capital', 'interest', 'balance', 'status', 'paid_amount', 'paid_late_amount', 'paid_at'];
  v_loan_cols TEXT[] := ARRAY['installment_amount', 'total_amount', 'total_interest', 'remaining_amount', 'paid_amount', 'status', 'progress', 'paid_installments', 'paid_at'];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;
  p_ops := COALESCE(p_ops, '{}'::JSONB);

  SELECT * INTO v_loan FROM loans WHERE id = p_loan_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Préstamo no encontrado';
  END IF;

  -- Reversión
  IF p_ops ? 'reverse_payment_id' THEN
    IF COALESCE(btrim(p_ops->>'reversal_reason'), '') = '' THEN
      RAISE EXCEPTION 'Indica el motivo de la reversión';
    END IF;
    UPDATE payments
      SET status = 'reversed', reversal_reason = p_ops->>'reversal_reason', reversed_at = now()
      WHERE id = (p_ops->>'reverse_payment_id')::UUID AND loan_id = p_loan_id AND status = 'paid';
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n = 0 THEN
      RAISE EXCEPTION 'El pago no existe o ya fue revertido';
    END IF;
  END IF;

  -- Nuevo pago
  IF p_ops ? 'payment' THEN
    v_pay := p_ops->'payment';
    IF COALESCE((v_pay->>'amount')::NUMERIC, 0) <= 0 THEN
      RAISE EXCEPTION 'Monto inválido';
    END IF;
    INSERT INTO payments (
      loan_id, client_id, user_id, installment_id, amount, capital_amount, interest_amount,
      late_amount, type, payment_date, method, notes
    ) VALUES (
      p_loan_id, v_loan.client_id, v_uid,
      NULLIF(v_pay->>'installment_id', '')::UUID,
      (v_pay->>'amount')::NUMERIC,
      COALESCE((v_pay->>'capital_amount')::NUMERIC, 0),
      COALESCE((v_pay->>'interest_amount')::NUMERIC, 0),
      COALESCE((v_pay->>'late_amount')::NUMERIC, 0),
      COALESCE(v_pay->>'type', 'installment'),
      COALESCE((v_pay->>'payment_date')::DATE, public.today_rd()),
      COALESCE(v_pay->>'method', 'cash'),
      NULLIF(v_pay->>'notes', '')
    ) RETURNING * INTO v_payment;
    v_has_payment := TRUE;
  END IF;

  -- Recalcular cuotas desde sus pagos
  IF p_ops ? 'recalc_installments' THEN
    IF p_ops->>'recalc_installments' = 'all' THEN
      FOR v_inst_id IN SELECT id FROM installments WHERE loan_id = p_loan_id LOOP
        PERFORM gp_private._gp_recalc_installment(v_inst_id);
      END LOOP;
    ELSE
      FOR v_inst_id IN
        SELECT i.id FROM installments i
        JOIN jsonb_array_elements_text(p_ops->'recalc_installments') AS x(val) ON i.id = x.val::UUID
        WHERE i.loan_id = p_loan_id
      LOOP
        PERFORM gp_private._gp_recalc_installment(v_inst_id);
      END LOOP;
    END IF;
  END IF;

  -- Escrituras de cronograma
  IF jsonb_typeof(p_ops->'installment_writes') = 'array' THEN
    FOR v_write IN SELECT * FROM jsonb_array_elements(p_ops->'installment_writes') LOOP
      v_key := COALESCE(v_write->>'key', 'id');
      IF v_key NOT IN ('id', 'number') THEN
        RAISE EXCEPTION 'Clave de cuota inválida: %', v_key;
      END IF;
      PERFORM gp_private._gp_update_whitelisted(
        'installments', v_inst_cols, v_write->'data',
        format('t.loan_id = $2::uuid AND t.%I::text = $3', v_key),
        p_loan_id::TEXT, v_write->>'value');
    END LOOP;
  END IF;

  PERFORM gp_private._gp_update_whitelisted('loans', v_loan_cols, p_ops->'loan_updates', 't.id = $2::uuid', p_loan_id::TEXT, NULL);

  PERFORM gp_private._gp_recalc_loan(p_loan_id);

  PERFORM gp_private._gp_update_whitelisted('loans', v_loan_cols, p_ops->'post_loan_updates', 't.id = $2::uuid', p_loan_id::TEXT, NULL);

  -- Tras una reversión: si el préstamo estaba 'paid' y ya no está completo, reabrirlo.
  IF COALESCE((p_ops->>'reopen_if_unpaid')::BOOLEAN, FALSE) THEN
    UPDATE loans SET status = 'active', paid_at = NULL
    WHERE id = p_loan_id AND status = 'paid' AND COALESCE(progress, 0) < 100;
  END IF;

  IF COALESCE((p_ops->>'paid_amount_from_payments')::BOOLEAN, FALSE) THEN
    UPDATE loans SET paid_amount = COALESCE((
      SELECT SUM(amount) FROM payments WHERE loan_id = p_loan_id AND status = 'paid'
    ), 0) WHERE id = p_loan_id;
  END IF;

  PERFORM public.update_client_stats(v_loan.client_id);

  SELECT * INTO v_loan FROM loans WHERE id = p_loan_id;
  RETURN jsonb_build_object(
    'ok', TRUE,
    'payment', CASE WHEN v_has_payment THEN to_jsonb(v_payment) ELSE NULL END,
    'loan', to_jsonb(v_loan),
    'installments', COALESCE((
      SELECT jsonb_agg(to_jsonb(i) ORDER BY i.number) FROM installments i WHERE i.loan_id = p_loan_id
    ), '[]'::JSONB)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_loan_operation(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_loan_operation(UUID, JSONB) TO authenticated, service_role;
