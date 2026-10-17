-- ============================================================
-- save-loan-transactional.sql — Crear/editar préstamo en UNA sola transacción
--
-- RPC public.save_loan(): inserta o actualiza el préstamo, reemplaza sus cuotas
-- y recalcula las estadísticas del cliente en UNA transacción PostgreSQL.
-- Si CUALQUIER paso falla (validación, límite de plan, red, dato inválido) se
-- revierte TODO: nunca queda un préstamo cambiado con las cuotas viejas.
-- (Así nacieron las "cuotas fantasma" del 17 Oct 2026: el borrado de cuotas
--  falló en silencio y el préstamo quedó abierto con sus 10 cuotas.)
--
-- Guardas de seguridad:
--   * Solo el dueño del cliente/préstamo (auth.uid()) o el sistema
--     (postgres / service_role) puede llamarla.
--   * Editar exige: préstamo existente, no archivado y SIN pagos.
--   * El límite de préstamos del plan lo aplica el trigger existente
--     (trg_enforce_loan_limit), que sigue vigente dentro de la transacción.
--
-- Idempotente (CREATE OR REPLACE). Se aplica con scripts/exec-save-loan.mjs
-- ============================================================

CREATE OR REPLACE FUNCTION public.save_loan(
  p_loan_id UUID,               -- NULL = crear; con valor = editar ese préstamo
  p_client_id UUID,
  p_visible_id TEXT,            -- número visible (solo al crear)
  p_amount NUMERIC,
  p_interest_rate NUMERIC,
  p_installments INTEGER,
  p_frequency TEXT,
  p_start_date DATE,
  p_first_payment_date DATE,
  p_end_date DATE,
  p_amortization_type TEXT,
  p_open_ended BOOLEAN,
  p_payment_day INTEGER,
  p_late_interest_rate NUMERIC,
  p_notes TEXT,
  p_installment_amount NUMERIC,
  p_total_amount NUMERIC,
  p_total_interest NUMERIC,
  p_remaining_amount NUMERIC,
  p_schedule JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_user_id UUID;
  v_client_user UUID;
  v_loan_id UUID;
  v_visible TEXT;
  v_current RECORD;
  v_row RECORD;
  v_created BOOLEAN := false;
  v_count INTEGER := 0;
BEGIN
  v_user_id := auth.uid();

  -- 1. El cliente debe existir y ser del que llama
  SELECT user_id INTO v_client_user FROM public.clients WHERE id = p_client_id;
  IF v_client_user IS NULL THEN
    RAISE EXCEPTION 'El cliente no existe.';
  END IF;

  IF v_user_id IS NULL THEN
    -- Llamadas del sistema (service_role / postgres)
    IF current_user NOT IN ('postgres', 'service_role') THEN
      RAISE EXCEPTION 'No autorizado.';
    END IF;
    v_user_id := v_client_user;
  ELSIF v_client_user <> v_user_id THEN
    RAISE EXCEPTION 'No autorizado: ese cliente no es tuyo.';
  END IF;

  -- 2. Crear o editar
  IF p_loan_id IS NULL THEN
    INSERT INTO public.loans (
      user_id, client_id, loan_id, amount, interest_type, interest_rate,
      total_amount, total_interest, installment_amount, installments,
      frequency, start_date, first_payment_date, end_date, amortization_type,
      open_ended, payment_day, status, late_interest_rate, notes,
      paid_amount, remaining_amount, paid_installments, progress
    ) VALUES (
      v_user_id, p_client_id, p_visible_id, p_amount, 'percentage', p_interest_rate,
      p_total_amount, p_total_interest, p_installment_amount, p_installments,
      p_frequency, p_start_date, p_first_payment_date, p_end_date, p_amortization_type,
      p_open_ended, p_payment_day, 'active', p_late_interest_rate, NULLIF(p_notes, ''),
      0, p_remaining_amount, 0, 0
    )
    RETURNING id, loan_id INTO v_loan_id, v_visible;
    v_created := true;
  ELSE
    SELECT * INTO v_current FROM public.loans WHERE id = p_loan_id FOR UPDATE;
    IF v_current.id IS NULL THEN
      RAISE EXCEPTION 'Préstamo no encontrado.';
    END IF;
    IF v_current.user_id <> v_user_id THEN
      RAISE EXCEPTION 'No autorizado: ese préstamo no es tuyo.';
    END IF;
    IF v_current.deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'Este préstamo está archivado.';
    END IF;
    IF COALESCE(v_current.paid_amount, 0) > 0
       OR COALESCE(v_current.paid_installments, 0) > 0 THEN
      RAISE EXCEPTION 'Solo puedes editar un préstamo en el que nadie ha pagado todavía.';
    END IF;

    UPDATE public.loans SET
      amount = p_amount,
      interest_rate = p_interest_rate,
      total_amount = p_total_amount,
      total_interest = p_total_interest,
      installment_amount = p_installment_amount,
      installments = p_installments,
      frequency = p_frequency,
      start_date = p_start_date,
      first_payment_date = p_first_payment_date,
      end_date = p_end_date,
      amortization_type = p_amortization_type,
      open_ended = p_open_ended,
      payment_day = p_payment_day,
      late_interest_rate = p_late_interest_rate,
      notes = NULLIF(p_notes, ''),
      paid_amount = 0,
      remaining_amount = p_remaining_amount,
      paid_installments = 0,
      progress = 0,
      updated_at = now()
    WHERE id = p_loan_id;

    v_loan_id := p_loan_id;
    v_visible := v_current.loan_id;
  END IF;

  -- 3. Reemplazar las cuotas (mismo paso, misma transacción)
  DELETE FROM public.installments WHERE loan_id = v_loan_id;

  FOR v_row IN
    SELECT * FROM jsonb_to_recordset(COALESCE(p_schedule, '[]'::jsonb))
      AS x(number INTEGER, due_date DATE, amount NUMERIC, capital NUMERIC,
           interest NUMERIC, balance NUMERIC)
  LOOP
    INSERT INTO public.installments (
      loan_id, client_id, number, due_date, amount, capital, interest, balance, status
    ) VALUES (
      v_loan_id, p_client_id, v_row.number, v_row.due_date, v_row.amount,
      v_row.capital, v_row.interest, v_row.balance, 'pending'
    );
    v_count := v_count + 1;
  END LOOP;

  -- 4. Estadísticas del cliente (confianza, balance, estado)
  PERFORM public.update_client_stats(p_client_id);

  RETURN jsonb_build_object(
    'ok', true,
    'loan_id', v_loan_id,
    'visible_id', v_visible,
    'created', v_created,
    'installments', v_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.save_loan(
  UUID, UUID, TEXT, NUMERIC, NUMERIC, INTEGER, TEXT, DATE, DATE, DATE, TEXT,
  BOOLEAN, INTEGER, NUMERIC, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, JSONB
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.save_loan(
  UUID, UUID, TEXT, NUMERIC, NUMERIC, INTEGER, TEXT, DATE, DATE, DATE, TEXT,
  BOOLEAN, INTEGER, NUMERIC, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, JSONB
) TO authenticated, service_role;
