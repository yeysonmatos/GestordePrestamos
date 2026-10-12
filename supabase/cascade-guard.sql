-- Guarda de secuencia + pago en cascada
-- 1) process_installment_payment: bloquea pago de cuotas fuera de orden
-- 2) process_cascade_payment: aplica un monto sobre N cuotas en orden (1 transaccion)
-- Idempotente. Aplicar via SQL editor de Supabase.

--------------- 1) Guarda de orden en pagos individuales ---------------
CREATE OR REPLACE FUNCTION public.process_installment_payment(
  p_loan_id UUID,
  p_installment_id UUID,
  p_user_id UUID,
  p_amount DECIMAL,
  p_include_mora BOOLEAN,
  p_payment_date DATE,
  p_method TEXT,
  p_notes TEXT,
  p_late_interest_rate DECIMAL,
  p_grace_days INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE
  v_loan RECORD;
  v_inst RECORD;
  v_late_days INTEGER;
  v_previously_paid DECIMAL;
  v_previously_paid_late DECIMAL;
  v_remaining DECIMAL;
  v_total_late DECIMAL;
  v_pending_late DECIMAL;
  v_credit DECIMAL;
  v_credit_for_inst DECIMAL;
  v_credit_for_late DECIMAL;
  v_credit_consumed DECIMAL;
  v_effective_remaining DECIMAL;
  v_effective_pending_late DECIMAL;
  v_paid_to_late DECIMAL;
  v_paid_to_inst DECIMAL;
  v_total_paid_on_inst DECIMAL;
  v_new_paid_late DECIMAL;
  v_surplus DECIMAL;
  v_new_balance DECIMAL;
  v_expected_total DECIMAL;
  v_is_now_fully_paid BOOLEAN;
  v_new_status TEXT;
  v_interest_amount DECIMAL;
  v_capital_amount DECIMAL;
  v_payment_id UUID;
  v_payment JSONB;
  v_loan_state JSONB;
BEGIN
  IF p_user_id <> auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Usuario no autorizado');
  END IF;

  SELECT * INTO v_loan
  FROM loans
  WHERE id = p_loan_id AND user_id = p_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Prestamo no encontrado o sin permisos');
  END IF;

  SELECT * INTO v_inst
  FROM installments
  WHERE id = p_installment_id AND loan_id = p_loan_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Cuota no encontrada');
  END IF;

  -- Guarda de orden: no permitir pagar una cuota si hay una anterior con saldo pendiente
  IF EXISTS (
    SELECT 1 FROM installments i
    WHERE i.loan_id = p_loan_id
      AND i.number < v_inst.number
      AND (i.amount - COALESCE(i.paid_amount, 0)) > 0.005
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Debes pagar las cuotas anteriores primero');
  END IF;

  v_late_days := public.calc_late_days(v_inst.due_date, p_grace_days);
  v_previously_paid := COALESCE(v_inst.paid_amount, 0);
  v_previously_paid_late := COALESCE(v_inst.paid_late_amount, 0);
  v_remaining := v_inst.amount - v_previously_paid;
  v_total_late := public.calc_late_amount(GREATEST(v_remaining, 0), v_late_days, p_late_interest_rate);
  v_credit := COALESCE(v_loan.prepaid_balance, 0);

  v_pending_late := GREATEST(0, v_total_late - v_previously_paid_late);

  IF v_remaining <= 0 AND v_pending_late <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La cuota ya esta completamente pagada');
  END IF;

  v_credit_for_inst := LEAST(v_credit, GREATEST(0, v_remaining));
  v_credit_for_late := LEAST(GREATEST(0, v_credit - v_credit_for_inst), v_pending_late);
  v_credit_consumed := v_credit_for_inst + v_credit_for_late;
  v_effective_remaining := GREATEST(0, v_remaining - v_credit_for_inst);
  v_effective_pending_late := GREATEST(0, v_pending_late - v_credit_for_late);

  IF p_include_mora THEN
    v_paid_to_late := LEAST(p_amount, v_effective_pending_late);
    v_paid_to_inst := LEAST(GREATEST(0, p_amount - v_paid_to_late), v_effective_remaining);
  ELSE
    v_paid_to_late := 0;
    v_paid_to_inst := LEAST(p_amount, v_effective_remaining);
  END IF;

  v_total_paid_on_inst := LEAST(v_previously_paid + v_credit_for_inst + v_paid_to_inst, v_inst.amount);
  v_new_paid_late := v_previously_paid_late + v_credit_for_late + v_paid_to_late;
  v_surplus := GREATEST(0, p_amount - v_paid_to_inst - v_paid_to_late);
  v_new_balance := GREATEST(0, v_credit - v_credit_consumed + v_surplus);
  v_expected_total := v_effective_remaining + (CASE WHEN p_include_mora THEN v_effective_pending_late ELSE 0 END);
  v_is_now_fully_paid := (p_amount >= v_expected_total);

  IF v_is_now_fully_paid THEN v_new_status := 'paid';
  ELSIF v_total_paid_on_inst > 0 THEN v_new_status := 'partial';
  ELSE v_new_status := 'pending';
  END IF;

  v_interest_amount := LEAST(v_paid_to_inst, GREATEST(0, v_inst.interest - LEAST(v_previously_paid, v_inst.interest)));
  v_capital_amount := v_paid_to_inst - v_interest_amount;

  INSERT INTO payments (loan_id, installment_id, client_id, user_id, amount, capital_amount, interest_amount, late_amount, payment_date, method, notes)
  VALUES (v_loan.id, v_inst.id, v_loan.client_id, p_user_id, p_amount, v_capital_amount, v_interest_amount, v_paid_to_late, p_payment_date, COALESCE(p_method, 'cash'), p_notes)
  RETURNING id INTO v_payment_id;

  UPDATE installments SET
    status = v_new_status,
    paid_amount = v_total_paid_on_inst,
    paid_late_amount = v_new_paid_late,
    late_amount = v_total_late,
    late_days = v_late_days,
    paid_at = CASE WHEN v_is_now_fully_paid THEN p_payment_date ELSE NULL END
  WHERE id = v_inst.id;

  UPDATE loans SET prepaid_balance = v_new_balance WHERE id = v_loan.id;

  DECLARE
    v_fully_paid_count INTEGER;
    v_inst_count INTEGER;
    v_new_paid_amount DECIMAL;
    v_new_remaining DECIMAL;
    v_all_paid BOOLEAN;
  BEGIN
    SELECT
      (SELECT COUNT(*) FROM installments WHERE loan_id = v_loan.id AND status = 'paid')::INTEGER,
      (SELECT COUNT(*) FROM installments WHERE loan_id = v_loan.id)::INTEGER,
      CASE
        WHEN v_loan.open_ended THEN (SELECT COALESCE(SUM(capital_amount), 0) FROM payments WHERE loan_id = v_loan.id AND status = 'paid')
        ELSE
          (SELECT COALESCE(SUM(paid_amount), 0) FROM installments WHERE loan_id = v_loan.id)
          + (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE loan_id = v_loan.id AND status = 'paid' AND type IN ('capital_abono', 'liquidation'))
      END,
      CASE
        WHEN v_loan.open_ended OR v_loan.amortization_type = 'interest_only'
          THEN GREATEST(0, v_loan.amount - (SELECT COALESCE(SUM(capital_amount), 0) FROM payments WHERE loan_id = v_loan.id AND status = 'paid'))
        ELSE (SELECT COALESCE(SUM(amount - paid_amount), 0) FROM installments WHERE loan_id = v_loan.id AND status <> 'paid')
      END
    INTO v_fully_paid_count, v_inst_count, v_new_paid_amount, v_new_remaining;

    v_all_paid := (NOT v_loan.open_ended) AND v_inst_count > 0 AND v_fully_paid_count >= v_inst_count AND v_new_remaining <= 0;

    UPDATE loans SET
      paid_installments = v_fully_paid_count,
      paid_amount = v_new_paid_amount,
      remaining_amount = v_new_remaining,
      progress = CASE
        WHEN v_loan.amortization_type = 'interest_only' THEN ROUND(((v_loan.amount - v_new_remaining) / v_loan.amount) * 100)
        WHEN NOT v_loan.open_ended AND v_inst_count > 0 THEN ROUND((v_fully_paid_count::DECIMAL / v_inst_count) * 100)
        ELSE 0
      END,
      status = CASE WHEN v_all_paid THEN 'paid' ELSE v_loan.status END,
      paid_at = CASE WHEN v_all_paid THEN NOW() ELSE v_loan.paid_at END
    WHERE id = v_loan.id;

    PERFORM public.update_client_stats(v_loan.client_id);
  END;

  SELECT jsonb_build_object(
    'id', id, 'loan_id', loan_id, 'installment_id', installment_id, 'client_id', client_id,
    'user_id', user_id, 'amount', amount, 'capital_amount', capital_amount,
    'interest_amount', interest_amount, 'late_amount', late_amount, 'type', type,
    'payment_date', payment_date, 'method', method, 'notes', notes, 'status', status,
    'created_at', created_at
  ) INTO v_payment
  FROM payments WHERE id = v_payment_id;

  SELECT jsonb_build_object(
    'id', id, 'paid_installments', paid_installments, 'paid_amount', paid_amount,
    'remaining_amount', remaining_amount, 'progress', progress, 'status', status,
    'paid_at', paid_at, 'prepaid_balance', prepaid_balance
  ) INTO v_loan_state
  FROM loans WHERE id = v_loan.id;

  RETURN jsonb_build_object(
    'ok', true,
    'payment', v_payment,
    'loan', v_loan_state,
    'allocation', jsonb_build_object(
      'paidToInstallment', v_paid_to_inst,
      'paidToLate', v_paid_to_late,
      'totalPaidOnInstallment', v_total_paid_on_inst,
      'newPaidLateAmount', v_new_paid_late,
      'isNowFullyPaid', v_is_now_fully_paid,
      'lateDays', v_late_days,
      'totalLateAmount', v_total_late,
      'pendingLateAmount', v_pending_late,
      'expectedTotal', v_expected_total,
      'surplus', v_surplus,
      'creditConsumed', v_credit_consumed,
      'newPrepaidBalance', v_new_balance
    )
  );
END;
$$;

--------------- 2) Pago en cascada (una transaccion) ---------------
CREATE OR REPLACE FUNCTION public.process_cascade_payment(
  p_loan_id UUID,
  p_user_id UUID,
  p_amount DECIMAL,
  p_include_mora BOOLEAN,
  p_payment_date DATE,
  p_method TEXT,
  p_notes TEXT,
  p_late_interest_rate DECIMAL,
  p_grace_days INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE
  v_loan RECORD;
  v_inst RECORD;
  v_late_days INTEGER;
  v_prev_paid DECIMAL;
  v_prev_paid_late DECIMAL;
  v_remaining DECIMAL;
  v_total_late DECIMAL;
  v_pending_late DECIMAL;
  v_credit_available DECIMAL;
  v_cash_available DECIMAL;
  v_credit_for_inst DECIMAL;
  v_credit_for_late DECIMAL;
  v_effective_remaining DECIMAL;
  v_effective_pending_late DECIMAL;
  v_paid_to_late DECIMAL;
  v_paid_to_inst DECIMAL;
  v_total_paid_on_inst DECIMAL;
  v_new_paid_late DECIMAL;
  v_expected_total DECIMAL;
  v_is_now_fully_paid BOOLEAN;
  v_new_status TEXT;
  v_interest_amount DECIMAL;
  v_capital_amount DECIMAL;
  v_payment_id UUID;
  v_payment JSONB;
  v_payments JSONB := '[]'::JSONB;
  v_covered INTEGER := 0;
  v_new_prepaid DECIMAL;
  v_loan_state JSONB;
  v_fully_paid_count INTEGER;
  v_inst_count INTEGER;
  v_new_paid_amount DECIMAL;
  v_new_remaining DECIMAL;
  v_all_paid BOOLEAN;
BEGIN
  IF p_user_id <> auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Usuario no autorizado');
  END IF;

  SELECT * INTO v_loan
  FROM loans
  WHERE id = p_loan_id AND user_id = p_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Prestamo no encontrado o sin permisos');
  END IF;

  IF v_loan.open_ended THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El prestamo abierto usa el pago de intereses');
  END IF;

  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Monto invalido');
  END IF;

  v_credit_available := COALESCE(v_loan.prepaid_balance, 0);
  v_cash_available := p_amount;
  v_inst_count := 0;

  FOR v_inst IN
    SELECT * FROM installments
    WHERE loan_id = p_loan_id
    ORDER BY number ASC
  LOOP
    v_prev_paid := COALESCE(v_inst.paid_amount, 0);
    v_prev_paid_late := COALESCE(v_inst.paid_late_amount, 0);
    v_remaining := v_inst.amount - v_prev_paid;

    IF v_remaining <= 0.005 THEN
      CONTINUE;
    END IF;

    -- credit first
    v_credit_for_inst := LEAST(v_credit_available, GREATEST(0, v_remaining));
    v_credit_available := v_credit_available - v_credit_for_inst;

    -- mora y resto pendiente
    v_late_days := public.calc_late_days(v_inst.due_date, p_grace_days);
    v_total_late := public.calc_late_amount(GREATEST(v_remaining, 0), v_late_days, p_late_interest_rate);
    v_pending_late := GREATEST(0, v_total_late - v_prev_paid_late);
    v_credit_for_late := LEAST(v_credit_available, v_pending_late);
    v_credit_available := v_credit_available - v_credit_for_late;

    v_effective_remaining := GREATEST(0, v_remaining - v_credit_for_inst);
    v_effective_pending_late := GREATEST(0, v_pending_late - v_credit_for_late);

    -- cash allocation (same as individual)
    IF p_include_mora THEN
      v_paid_to_late := LEAST(v_cash_available, v_effective_pending_late);
      v_paid_to_inst := LEAST(GREATEST(0, v_cash_available - v_paid_to_late), v_effective_remaining);
    ELSE
      v_paid_to_late := 0;
      v_paid_to_inst := LEAST(v_cash_available, v_effective_remaining);
    END IF;

    v_cash_available := v_cash_available - v_paid_to_inst - v_paid_to_late;
    v_total_paid_on_inst := LEAST(v_prev_paid + v_credit_for_inst + v_paid_to_inst, v_inst.amount);
    v_new_paid_late := v_prev_paid_late + v_credit_for_late + v_paid_to_late;
    v_expected_total := v_effective_remaining + (CASE WHEN p_include_mora THEN v_effective_pending_late ELSE 0 END);
    v_is_now_fully_paid := (v_paid_to_inst + v_paid_to_late) >= (v_expected_total - 0.005);
    v_new_status := CASE WHEN v_is_now_fully_paid THEN 'paid' WHEN v_total_paid_on_inst > 0 THEN 'partial' ELSE 'pending' END;

    IF (v_paid_to_inst + v_paid_to_late) > 0.005 THEN
      v_interest_amount := LEAST(v_paid_to_inst, GREATEST(0, v_inst.interest - LEAST(v_previously_paid, v_inst.interest)));
      v_capital_amount := v_paid_to_inst - v_interest_amount;

      INSERT INTO payments (loan_id, installment_id, client_id, user_id, amount, capital_amount, interest_amount, late_amount, payment_date, method, notes)
      VALUES (v_loan.id, v_inst.id, v_loan.client_id, p_user_id, v_paid_to_inst + v_paid_to_late, v_capital_amount, v_interest_amount, v_paid_to_late, p_payment_date, COALESCE(p_method, 'cash'), p_notes)
      RETURNING id INTO v_payment_id;

      SELECT jsonb_build_object(
        'id', id, 'loan_id', loan_id, 'installment_id', installment_id, 'client_id', client_id,
        'user_id', user_id, 'amount', amount, 'capital_amount', capital_amount,
        'interest_amount', interest_amount, 'late_amount', late_amount, 'type', type,
        'payment_date', payment_date, 'method', method, 'notes', notes, 'status', status,
        'created_at', created_at
      ) INTO v_payment FROM payments WHERE id = v_payment_id;

      v_payments := v_payments || jsonb_build_array(v_payment);
      v_covered := v_covered + 1;
    END IF;

    UPDATE installments SET
      status = v_new_status,
      paid_amount = v_total_paid_on_inst,
      paid_late_amount = v_new_paid_late,
      late_amount = v_total_late,
      late_days = v_late_days,
      paid_at = CASE WHEN v_is_now_fully_paid THEN p_payment_date ELSE NULL END
    WHERE id = v_inst.id;

    IF v_credit_available <= 0.005 AND v_cash_available <= 0.005 THEN
      EXIT;
    END IF;
  END LOOP;

  v_new_prepaid := GREATEST(0, v_credit_available + v_cash_available);
  UPDATE loans SET prepaid_balance = v_new_prepaid WHERE id = p_loan_id;

  SELECT
    (SELECT COUNT(*) FROM installments WHERE loan_id = p_loan_id AND status = 'paid')::INTEGER,
    (SELECT COUNT(*) FROM installments WHERE loan_id = p_loan_id)::INTEGER,
    CASE
      WHEN v_loan.open_ended THEN (SELECT COALESCE(SUM(capital_amount), 0) FROM payments WHERE loan_id = p_loan_id AND status = 'paid')
      ELSE
        (SELECT COALESCE(SUM(paid_amount), 0) FROM installments WHERE loan_id = p_loan_id)
        + (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE loan_id = p_loan_id AND status = 'paid' AND type IN ('capital_abono', 'liquidation'))
    END,
    CASE
      WHEN v_loan.open_ended OR v_loan.amortization_type = 'interest_only'
        THEN GREATEST(0, v_loan.amount - (SELECT COALESCE(SUM(capital_amount), 0) FROM payments WHERE loan_id = p_loan_id AND status = 'paid'))
      ELSE (SELECT COALESCE(SUM(amount - paid_amount), 0) FROM installments WHERE loan_id = p_loan_id AND status <> 'paid')
    END
  INTO v_fully_paid_count, v_inst_count, v_new_paid_amount, v_new_remaining;

  v_all_paid := (NOT v_loan.open_ended) AND v_inst_count > 0 AND v_fully_paid_count >= v_inst_count AND v_new_remaining <= 0;

  UPDATE loans SET
    paid_installments = v_fully_paid_count,
    paid_amount = v_new_paid_amount,
    remaining_amount = v_new_remaining,
    progress = CASE
      WHEN v_loan.amortization_type = 'interest_only' THEN ROUND(((v_loan.amount - v_new_remaining) / v_loan.amount) * 100)
      WHEN v_inst_count > 0 THEN ROUND((v_fully_paid_count::DECIMAL / v_inst_count) * 100)
      ELSE 0
    END,
    status = CASE WHEN v_all_paid THEN 'paid' ELSE v_loan.status END,
    paid_at = CASE WHEN v_all_paid THEN NOW() ELSE v_loan.paid_at END
  WHERE id = p_loan_id;

  PERFORM public.update_client_stats(v_loan.client_id);

  SELECT jsonb_build_object(
    'id', id, 'paid_installments', paid_installments, 'paid_amount', paid_amount,
    'remaining_amount', remaining_amount, 'progress', progress, 'status', status,
    'paid_at', paid_at, 'prepaid_balance', prepaid_balance
  ) INTO v_loan_state FROM loans WHERE id = p_loan_id;

  RETURN jsonb_build_object(
    'ok', true,
    'payments', v_payments,
    'coveredCount', v_covered,
    'loan', v_loan_state,
    'newPrepaidBalance', v_new_prepaid
  );
END;
$$;