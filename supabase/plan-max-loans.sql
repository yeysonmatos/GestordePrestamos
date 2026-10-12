-- ============================================================
-- PLAN MAX LOANS — tope de prestamos activos por plan
-- (espejo de enforce_client_limit de GP; NULL = sin limite)
-- ============================================================

ALTER TABLE plans ADD COLUMN IF NOT EXISTS max_loans INTEGER;

-- Semilla: planes pagos con limite de clientes (Basico) = 10 prestamos activos;
-- Trial/Pro/gratuitos = sin limite
UPDATE plans SET max_loans = 10 WHERE price > 0 AND max_clients IS NOT NULL;
UPDATE plans SET max_loans = NULL
WHERE name ILIKE 'Trial' OR name ILIKE 'Prueba' OR price = 0;

-- ============================================================
-- Trigger: enforce el limite de prestamos activos en cada INSERT
-- ============================================================
CREATE OR REPLACE FUNCTION public.enforce_loan_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_max_loans INTEGER;
  v_count INTEGER;
  v_plan_name TEXT;
  v_is_free BOOLEAN;
BEGIN
  -- Admins exentos
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  -- Llamadas internas (service_role, restore SECURITY DEFINER) exentas
  IF auth.uid() IS NULL AND current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  SELECT MAX(p.max_loans), BOOL_OR(p.price = 0), MAX(p.name)
  INTO v_max_loans, v_is_free, v_plan_name
  FROM subscriptions s
  JOIN plans p ON p.id = s.plan_id
  WHERE s.user_id = NEW.user_id
    AND s.status IN ('active', 'trial');

  -- Sin suscripcion activa, plan gratuito o sin limite -> pasar
  IF v_max_loans IS NULL OR v_max_loans <= 0 OR v_is_free IS TRUE THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM loans
  WHERE user_id = NEW.user_id
    AND deleted_at IS NULL
    AND status IN ('active', 'late_1_30', 'late_31_60', 'late_61_90');

  IF v_count >= v_max_loans THEN
    RAISE EXCEPTION
      'Has alcanzado el limite de % prestamos activos de tu plan (%). Mejora tu plan para crear mas.',
      v_max_loans, v_plan_name;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_loan_limit ON loans;
CREATE TRIGGER trg_enforce_loan_limit
  BEFORE INSERT ON loans
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_loan_limit();
