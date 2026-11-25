-- ============================================================
-- Operaciones atómicas + modo lectura aplicado en la base de datos
-- ============================================================
-- 1) Modo lectura: un usuario con suscripción vencida/cancelada o bloqueado
--    por el admin NO puede escribir en clients, loans, installments,
--    payments ni documents. Se aplica con triggers de sentencia, así que
--    cubre también las RPC SECURITY DEFINER (process_installment_payment,
--    process_cascade_payment) y cualquier escritura directa vía PostgREST.
--    Solo aplica a sesiones de usuario (auth.uid() NOT NULL): cron,
--    service_role y la Management API siguen funcionando.
--
-- 2) save_loan_with_schedule(): crea un préstamo con su cronograma, o edita
--    un préstamo sin pagos reemplazando el cronograma, en UNA transacción.
--
-- 3) apply_loan_operation(): aplica en UNA transacción las operaciones que
--    antes hacía el navegador en varios pasos (liquidación, abono a capital,
--    reversión de pago, pago de préstamo abierto). Los cálculos siguen en
--    TypeScript; esta función solo escribe, recalcula agregados del préstamo
--    (port de updateLoanAfterPayment) y las estadísticas del cliente.
--
-- Las funciones 2 y 3 son SECURITY INVOKER: las reglas RLS del usuario y el
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
    RAISE EXCEPTION 'Tu cuenta está en modo lectura (plan vencido o cuenta suspendida). Renueva tu plan para registrar cambios.'
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
    EXECUTE format(
      'CREATE TRIGGER trg_read_only_mode BEFORE INSERT OR UPDATE OR DELETE ON public.%I
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

-- Port de recalculateInstallment (src/lib/payments.ts).
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
  v_full BOOLEAN;
BEGIN
  SELECT COALESCE(SUM(COALESCE(capital_amount, 0) + COALESCE(interest_amount, 0)), 0),
         COALESCE(SUM(COALESCE(late_amount, 0)), 0),
         MAX(payment_date)
    INTO v_paid, v_late, v_last
  FROM payments
  WHERE installment_id = p_installment_id AND status = 'paid';

  SELECT amount INTO v_amount FROM installments WHERE id = p_installment_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_full := v_paid >= v_amount;

  UPDATE installments SET
    status = CASE WHEN v_full THEN 'paid' WHEN v_paid > 0 THEN 'partial' ELSE 'pending' END,
    paid_amount = LEAST(v_paid, v_amount),
    paid_late_amount = v_late,
    paid_at = CASE WHEN v_full THEN v_last ELSE NULL END
  WHERE id = p_installment_id;
END;
$$;

REVOKE ALL ON FUNCTION gp_private._gp_recalc_installment(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION gp_private._gp_recalc_installment(UUID) TO authenticated, service_role;

-- Port de updateLoanAfterPayment (src/lib/payments.ts), sin llamar a
-- update_client_stats (lo hace quien la invoca).
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
BEGIN
  SELECT * INTO v_loan FROM loans WHERE id = p_loan_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_is_io := v_loan.amortization_type = 'interest_only';
  v_is_oe := COALESCE(v_loan.open_ended, FALSE);

  SELECT COUNT(*), COUNT(*) FILTER (WHERE status = 'paid')
    INTO v_total, v_fully
  FROM installments WHERE loan_id = p_loan_id;

  SELECT COALESCE(SUM(capital_amount), 0) INTO v_cap_paid
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
    v_remaining := GREATEST(0, v_loan.amount - v_cap_paid);
  ELSE
    SELECT COALESCE(SUM(amount - COALESCE(paid_amount, 0)), 0) INTO v_remaining
    FROM installments WHERE loan_id = p_loan_id AND status <> 'paid';
  END IF;

  IF v_is_io THEN
    v_progress := COALESCE(ROUND((v_loan.amount - v_remaining) / NULLIF(v_loan.amount, 0) * 100), 0);
  ELSIF NOT v_is_oe AND v_total > 0 THEN
    v_progress := ROUND(v_fully::NUMERIC / v_total * 100);
  ELSE
    v_progress := 0;
  END IF;

  UPDATE loans SET
    paid_installments = v_fully,
    paid_amount = v_paid,
    remaining_amount = v_remaining,
    progress = v_progress
  WHERE id = p_loan_id;

  IF NOT v_is_oe AND v_total > 0 AND v_fully >= v_total AND v_remaining <= 0 THEN
    UPDATE loans SET status = 'paid', paid_at = now() WHERE id = p_loan_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION gp_private._gp_recalc_loan(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION gp_private._gp_recalc_loan(UUID) TO authenticated, service_role;

-- ------------------------------------------------------------
-- 2. save_loan_with_schedule
-- ------------------------------------------------------------
-- p_loan_id NULL  → crea el préstamo (p_loan) y su cronograma (p_installments).
-- p_loan_id dado  → actualiza el préstamo; si p_installments no es NULL,
--                   reemplaza el cronograma. Solo si no tiene pagos.
CREATE OR REPLACE FUNCTION public.save_loan_with_schedule(
  p_loan_id UUID,
  p_loan JSONB,
  p_installments JSONB DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER SET search_path = 'public'
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_loan loans%ROWTYPE;
  v_cols TEXT;
  v_id UUID;
  v_create_cols TEXT[] := ARRAY[
    'loan_id', 'client_id', 'amount', 'interest_type', 'interest_rate', 'amortization_type',
    'open_ended', 'payment_day', 'total_amount', 'total_interest', 'installment_amount',
    'remaining_amount', 'installments', 'frequency', 'start_date', 'first_payment_date',
    'guarantee', 'notes', 'status', 'late_days'];
  v_update_cols TEXT[] := ARRAY[
    'amount', 'interest_type', 'interest_rate', 'amortization_type', 'open_ended',
    'payment_day', 'total_amount', 'total_interest', 'installment_amount', 'remaining_amount',
    'installments', 'frequency', 'start_date', 'first_payment_date', 'guarantee', 'notes',
    'status', 'late_days'];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;
  IF p_loan IS NULL OR jsonb_typeof(p_loan) <> 'object' THEN
    RAISE EXCEPTION 'Datos del préstamo inválidos';
  END IF;

  IF p_loan_id IS NULL THEN
    IF COALESCE((p_loan->>'amount')::NUMERIC, 0) <= 0 THEN
      RAISE EXCEPTION 'El monto debe ser mayor a cero';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM clients WHERE id = (p_loan->>'client_id')::UUID AND user_id = v_uid) THEN
      RAISE EXCEPTION 'Cliente no encontrado';
    END IF;

    SELECT string_agg(quote_ident(k), ', ') INTO v_cols
    FROM jsonb_object_keys(p_loan) AS k
    WHERE k = ANY (v_create_cols);

    EXECUTE format(
      'INSERT INTO public.loans (user_id, %1$s) SELECT $2, %2$s FROM jsonb_populate_record(NULL::public.loans, $1) RETURNING id',
      v_cols, v_cols)
      INTO v_id
      USING p_loan, v_uid;
  ELSE
    SELECT * INTO v_loan FROM loans WHERE id = p_loan_id AND deleted_at IS NULL FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Préstamo no encontrado';
    END IF;
    IF COALESCE(v_loan.paid_installments, 0) > 0 OR COALESCE(v_loan.paid_amount, 0) > 0
       OR EXISTS (SELECT 1 FROM payments WHERE loan_id = p_loan_id AND status = 'paid') THEN
      RAISE EXCEPTION 'No se puede editar un préstamo con pagos registrados';
    END IF;
    v_id := p_loan_id;
    PERFORM gp_private._gp_update_whitelisted('loans', v_update_cols, p_loan, 't.id = $2::uuid', v_id::TEXT, NULL);
  END IF;

  SELECT * INTO v_loan FROM loans WHERE id = v_id;

  IF p_installments IS NOT NULL THEN
    IF jsonb_typeof(p_installments) <> 'array' THEN
      RAISE EXCEPTION 'Cronograma inválido';
    END IF;
    DELETE FROM installments WHERE loan_id = v_id;
    INSERT INTO installments (loan_id, client_id, number, amount, capital, interest, balance, due_date)
    SELECT v_id, v_loan.client_id, r.number, r.amount, r.capital, r.interest, r.balance, r.due_date
    FROM jsonb_populate_recordset(NULL::installments, p_installments) AS r;
  END IF;

  PERFORM public.update_client_stats(v_loan.client_id);

  SELECT * INTO v_loan FROM loans WHERE id = v_id;
  RETURN to_jsonb(v_loan);
END;
$$;

REVOKE ALL ON FUNCTION public.save_loan_with_schedule(UUID, JSONB, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_loan_with_schedule(UUID, JSONB, JSONB) TO authenticated, service_role;

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
