CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- CLIENTES
CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  nickname TEXT,
  sex TEXT DEFAULT '' CHECK (sex IN ('M', 'F', '')),
  document_type TEXT,
  email TEXT,
  phone TEXT,
  phone_alt TEXT,
  whatsapp TEXT,
  document TEXT,
  address TEXT,
  provincia TEXT,
  municipio TEXT,
  sector TEXT,
  calle TEXT,
  numero TEXT,
  referencia TEXT,
  gps_lat DECIMAL(10,7),
  gps_lng DECIMAL(10,7),
  photo TEXT,
  occupation TEXT,
  workplace TEXT,
  monthly_income DECIMAL(12,2) DEFAULT 0,
  "references" JSONB DEFAULT '[]',
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  trust_level TEXT DEFAULT 'medium' CHECK (trust_level IN ('high', 'medium', 'low')),
  trust_score INTEGER DEFAULT 50,
  notes TEXT,
  balance DECIMAL(12,2) DEFAULT 0,
  total_loans INTEGER DEFAULT 0,
  active_loans INTEGER DEFAULT 0,
  paid_loans INTEGER DEFAULT 0,
  late_loans INTEGER DEFAULT 0,
  total_borrowed DECIMAL(12,2) DEFAULT 0,
  total_paid DECIMAL(12,2) DEFAULT 0,
  total_interest DECIMAL(12,2) DEFAULT 0,
  last_payment_at TIMESTAMPTZ,
  last_loan_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own clients" ON clients;
CREATE POLICY "Users can manage their own clients"
  ON clients FOR ALL
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_clients_user_id ON clients(user_id);
CREATE INDEX IF NOT EXISTS idx_clients_name ON clients(name);
CREATE INDEX IF NOT EXISTS idx_clients_status ON clients(status);
CREATE INDEX IF NOT EXISTS idx_clients_trust_level ON clients(trust_level);

-- PRÉSTAMOS
CREATE TABLE IF NOT EXISTS loans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  loan_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  amount DECIMAL(14,2) NOT NULL,
  interest_type TEXT NOT NULL CHECK (interest_type IN ('percentage', 'fixed')),
  interest_rate DECIMAL(8,4) NOT NULL,
  total_amount DECIMAL(14,2) NOT NULL,
  total_interest DECIMAL(14,2) NOT NULL,
  installment_amount DECIMAL(14,2) NOT NULL,
  installments INTEGER NOT NULL,
  paid_installments INTEGER DEFAULT 0,
  paid_amount DECIMAL(14,2) DEFAULT 0,
  remaining_amount DECIMAL(14,2) DEFAULT 0,
  progress DECIMAL(5,2) DEFAULT 0,
  prepaid_balance DECIMAL(14,2) DEFAULT 0,
  frequency TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly', 'biweekly', 'monthly')),
  start_date DATE NOT NULL,
  first_payment_date DATE NOT NULL,
  end_date DATE,
  amortization_type TEXT DEFAULT 'interest_only' CHECK (amortization_type IN ('interest_only', 'french')),
  open_ended BOOLEAN DEFAULT false,
  payment_day INTEGER CHECK (payment_day BETWEEN 1 AND 31),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paid', 'late', 'late_1_30', 'late_31_60', 'late_61_90', 'cancelled')),
  late_days INTEGER DEFAULT 0,
  late_interest_rate DECIMAL(8,4) DEFAULT 0,
  guarantee TEXT,
  notes TEXT,
  paid_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  deleted_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE loans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own loans" ON loans;
CREATE POLICY "Users can manage their own loans"
  ON loans FOR ALL
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_loans_user_id ON loans(user_id);
CREATE INDEX IF NOT EXISTS idx_loans_client_id ON loans(client_id);
CREATE INDEX IF NOT EXISTS idx_loans_status ON loans(status);
CREATE INDEX IF NOT EXISTS idx_loans_loan_id ON loans(loan_id);
CREATE INDEX IF NOT EXISTS idx_loans_deleted_at ON loans(user_id, deleted_at);

-- CUOTAS (amortización)
CREATE TABLE IF NOT EXISTS installments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  loan_id UUID NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  capital DECIMAL(14,2) NOT NULL,
  interest DECIMAL(14,2) NOT NULL,
  balance DECIMAL(14,2) NOT NULL,
  paid_amount DECIMAL(14,2) DEFAULT 0,
  due_date DATE NOT NULL,
  paid_at DATE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'late', 'partial')),
  late_days INTEGER DEFAULT 0,
  late_amount DECIMAL(14,2) DEFAULT 0,
  paid_late_amount DECIMAL(14,2) DEFAULT 0
);

ALTER TABLE installments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage installments on their loans" ON installments;
CREATE POLICY "Users can manage installments on their loans"
  ON installments FOR ALL
  USING (
    EXISTS (SELECT 1 FROM loans WHERE loans.id = installments.loan_id AND loans.user_id = auth.uid())
  );

CREATE INDEX IF NOT EXISTS idx_installments_loan_id ON installments(loan_id);
CREATE INDEX IF NOT EXISTS idx_installments_client_id ON installments(client_id);
CREATE INDEX IF NOT EXISTS idx_installments_due_date ON installments(due_date);
CREATE INDEX IF NOT EXISTS idx_installments_status ON installments(status);

-- PAGOS
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  loan_id UUID REFERENCES loans(id) ON DELETE SET NULL,
  installment_id UUID REFERENCES installments(id) ON DELETE SET NULL,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount DECIMAL(14,2) NOT NULL,
  capital_amount DECIMAL(14,2) DEFAULT 0,
  interest_amount DECIMAL(14,2) DEFAULT 0,
  late_amount DECIMAL(14,2) DEFAULT 0,
  type TEXT DEFAULT 'installment' CHECK (type IN ('installment', 'partial', 'capital_abono', 'liquidation')),
  payment_date DATE NOT NULL,
  method TEXT DEFAULT 'cash' CHECK (method IN ('cash', 'transfer', 'deposit', 'other')),
  notes TEXT,
  status TEXT DEFAULT 'paid' CHECK (status IN ('paid', 'reversed')),
  reversed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reversed_at TIMESTAMPTZ,
  reversal_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage payments on their loans" ON payments;
DROP POLICY IF EXISTS "Users can read payments on their loans or own payments" ON payments;
CREATE POLICY "Users can read payments on their loans or own payments"
  ON payments FOR SELECT
  USING (
    auth.uid() = payments.user_id
    OR EXISTS (SELECT 1 FROM loans WHERE loans.id = payments.loan_id AND loans.user_id = auth.uid())
  );
CREATE POLICY "Users can write payments on their loans"
  ON payments FOR ALL
  USING (EXISTS (SELECT 1 FROM loans WHERE loans.id = payments.loan_id AND loans.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM loans WHERE loans.id = payments.loan_id AND loans.user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_payments_loan_id ON payments(loan_id);
CREATE INDEX IF NOT EXISTS idx_payments_client_id ON payments(client_id);
CREATE INDEX IF NOT EXISTS idx_payments_payment_date ON payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);

-- CONFIGURACIÓN
CREATE TABLE IF NOT EXISTS settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_name TEXT DEFAULT 'Mi Negocio',
  business_address TEXT DEFAULT '',
  business_phone TEXT DEFAULT '',
  business_email TEXT DEFAULT '',
  currency TEXT DEFAULT 'DOP',
  late_interest_rate DECIMAL(8,4) DEFAULT 0,
  loan_id_prefix TEXT DEFAULT 'P',
  notify_upcoming_days INTEGER DEFAULT 3,
  default_installments INTEGER DEFAULT 10,
  default_frequency TEXT DEFAULT 'weekly' CHECK (default_frequency IN ('daily', 'weekly', 'biweekly', 'monthly')),
  grace_days INTEGER DEFAULT 0,
  language TEXT DEFAULT 'es',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own settings" ON settings;
CREATE POLICY "Users can manage their own settings"
  ON settings FOR ALL
  USING (auth.uid() = user_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_settings_user_id ON settings(user_id);

-- DOCUMENTOS
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  loan_id UUID REFERENCES loans(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('contract', 'promissory', 'guarantee', 'photo', 'note')),
  path TEXT NOT NULL,
  mime_type TEXT,
  size INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own documents" ON documents;
CREATE POLICY "Users can manage their own documents"
  ON documents FOR ALL
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_documents_client_id ON documents(client_id);
CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(type);

-- AUDIT LOGS (cambios críticos: settings, reversiones, liquidaciones, restauraciones)
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own audit logs" ON audit_logs;
CREATE POLICY "Users can manage their own audit logs"
  ON audit_logs FOR ALL
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);

-- Actualizar estadísticas del cliente
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
  -- Guarda de seguridad: solo el dueño del cliente (o el sistema vía cron/management
  --  conectado como postgres) puede recalcular sus estadísticas. Evita que un usuario
  --  altere clientes ajenos.
  IF auth.uid() IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = current_user AND rolsuper)
       AND current_user <> 'postgres' THEN
      RETURN;
    END IF;
  ELSIF auth.uid() <> (SELECT user_id FROM clients WHERE id = p_client_id) THEN
    RETURN;
  END IF;

  -- Mora real: préstamos con al menos una cuota vencida hoy (no archivados).
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
  v_score := v_score - (v_late_loans * 10);
  v_score := GREATEST(0, LEAST(100, v_score));

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
    trust_score     = v_score,
    trust_level     = CASE
      WHEN v_score >= 75 THEN 'high'
      WHEN v_score >= 40 THEN 'medium'
      ELSE 'low'
    END
  WHERE id = p_client_id;
END;
$$;

-- Insertar configuración por defecto al crear usuario
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = 'public'
AS $$
BEGIN
  INSERT INTO settings (user_id)
  VALUES (NEW.id);
  RETURN NEW;
END;
$$;

-- Trigger para crear settings automáticamente al registrarse
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- MIGRACIONES — Agrega columnas faltantes (seguro re-ejecutar)
-- ============================================================
ALTER TABLE clients ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS last_name TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS nickname TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS sex TEXT DEFAULT '';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS document_type TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS whatsapp TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS provincia TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS municipio TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS sector TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS calle TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS numero TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS referencia TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS gps_lat DECIMAL(10,7);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS gps_lng DECIMAL(10,7);

ALTER TABLE loans ADD COLUMN IF NOT EXISTS amortization_type TEXT DEFAULT 'interest_only';
ALTER TABLE loans ADD COLUMN IF NOT EXISTS open_ended BOOLEAN DEFAULT false;
ALTER TABLE loans ADD COLUMN IF NOT EXISTS payment_day INTEGER;
ALTER TABLE loans ADD COLUMN IF NOT EXISTS prepaid_balance DECIMAL(14,2) DEFAULT 0;

ALTER TABLE installments ADD COLUMN IF NOT EXISTS paid_late_amount DECIMAL(14,2) DEFAULT 0;

-- Migración: update_client_stats balance ahora usa remaining_amount
SELECT public.update_client_stats(id) FROM clients;

-- Migración: grace_days en settings
ALTER TABLE settings ADD COLUMN IF NOT EXISTS grace_days INTEGER DEFAULT 0;

-- Migración: nuevos estados de mora en loans
ALTER TABLE loans DROP CONSTRAINT IF EXISTS loans_status_check;
ALTER TABLE loans ADD CONSTRAINT loans_status_check
  CHECK (status IN ('active', 'paid', 'late', 'late_1_30', 'late_31_60', 'late_61_90', 'cancelled'));

-- ============================================================
-- C3 — Pago de cuota transaccional (evita pagos dobles/parciales)
-- Replica la lógica de src/lib/payments.ts en una sola transacción
-- con bloqueo de filas (FOR UPDATE) para concurrencia segura.
-- ============================================================
CREATE OR REPLACE FUNCTION public.calc_late_days(p_due DATE, p_grace INT)
RETURNS INTEGER
LANGUAGE sql
STABLE
AS $$
  SELECT GREATEST(0, (public.today_rd() - p_due) - COALESCE(p_grace, 0))
$$;

CREATE OR REPLACE FUNCTION public.calc_late_amount(p_amount DECIMAL, p_late_days INTEGER, p_rate DECIMAL)
RETURNS DECIMAL(14,2)
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_late_days <= 0 OR p_rate <= 0 THEN 0
    ELSE ROUND(p_amount * (p_rate / 100) * p_late_days, 2)
  END
$$;

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
  -- Guarda de seguridad: el pago debe registrarse para el usuario autenticado,
  -- no tolerable a uno inventado por el cliente.
  IF p_user_id <> auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Usuario no autorizado');
  END IF;

  SELECT * INTO v_loan
  FROM loans
  WHERE id = p_loan_id AND user_id = p_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Préstamo no encontrado o sin permisos');
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
    RETURN jsonb_build_object('ok', false, 'error', 'La cuota ya está completamente pagada');
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

  -- Recalcular métricas del préstamo (equivale a updateLoanAfterPayment)
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

-- ============================================================
-- ÍNDICES COMPUESTOS PARA ESCALABILIDAD (consultas calientes)
-- ============================================================
-- installments: due_date + status (dashboard vencidas, collections hoy/vencidas/próximos)
CREATE INDEX IF NOT EXISTS idx_installments_due_date_status ON installments(due_date, status);
-- installments: loan_id + number (detalle de préstamo ordenado)
CREATE INDEX IF NOT EXISTS idx_installments_loan_id_number ON installments(loan_id, number);
-- payments: status + payment_date (historial pagados en calendar/reports/collections)
CREATE INDEX IF NOT EXISTS idx_payments_status_payment_date ON payments(status, payment_date);
-- payments: loan_id + created_at (pagos por préstamo ordenados)
CREATE INDEX IF NOT EXISTS idx_payments_loan_id_created_at ON payments(loan_id, created_at);
-- loans: user_id + status (filtro de préstamos activos/atrasados)
CREATE INDEX IF NOT EXISTS idx_loans_user_id_status ON loans(user_id, status);
-- loans: user_id + created_at (listados ordenados por fecha)
CREATE INDEX IF NOT EXISTS idx_loans_user_id_created_at ON loans(user_id, created_at);
-- documents: user_id (filtrado por dueño)
CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id);

-- ============================================================
-- pg_cron: TAREAS PROGRAMADAS (requiere extensión pg_cron habilitada en Supabase)
-- ============================================================

-- Función para actualizar estados de mora de todos los préstamos (equivalente a /api/loan-status)
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

-- Habilitar pg_cron (ejecutar una vez; si ya está habilitado no hace nada)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Job diario a las 03:00 RD (07:00 UTC) para actualizar estados de mora
-- SELECT cron.schedule('update-loan-statuses-daily', '0 7 * * *', 'SELECT public.update_all_loan_statuses();');

-- Job semanal (domingos 04:00 RD / 08:00 UTC) para limpiar audit_logs > 1 año
-- SELECT cron.schedule('cleanup-audit-logs-weekly', '0 8 * * 0', 'DELETE FROM audit_logs WHERE created_at < NOW() - INTERVAL ''1 year'';');

-- Job diario a las 05:00 RD (09:00 UTC) para recalcular stats de clientes con préstamos activos/morosos
-- SELECT cron.schedule('recalc-client-stats-daily', '0 9 * * *', 'SELECT public.update_client_stats(id) FROM clients;');
