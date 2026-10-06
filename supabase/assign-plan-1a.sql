-- Asigna el plan cortesía "1A" a deurisenmanuelm@gmail.com
--
-- Decisiones:
--   ends_at NULL  -> sin vencimiento. isExpiredForReadOnly() (subscription-guard.ts:41)
--                    solo bloquea si ends_at YA pasó, así que NULL = acceso
--                    permanente y nunca cae en modo lectura.
--   status 'active' -> no es una prueba. El MRR lo excluye igual porque
--                    admin-stats.sql:97 filtra `WHERE p.price > 0`, y el
--                    precio del plan es 0. Los ingresos salen de
--                    subscription_payments, donde no se crea ninguna fila.
--   No se crea subscription_payments -> 0 ingreso confirmado.
--
-- Idempotente: si ya existe una suscripción al plan 1A para este usuario, no
-- inserta otra (evita duplicados si se aplica dos veces).

DO $$
DECLARE
  v_user_id UUID := 'f4bebbc7-2ed5-4a07-a8c4-13d9ed9d4130';
  v_email TEXT := 'deurisenmanuelm@gmail.com';
  v_plan_id UUID;
  v_exists BOOLEAN;
BEGIN
  SELECT id INTO v_plan_id FROM plans WHERE name = '1A';
  IF v_plan_id IS NULL THEN
    RAISE EXCEPTION 'El plan 1A no existe. Aplica primero supabase/plan-1a.sql';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM subscriptions
    WHERE user_id = v_user_id AND plan_id = v_plan_id
  ) INTO v_exists;

  IF NOT v_exists THEN
    INSERT INTO subscriptions (user_id, plan_id, status, starts_at, ends_at)
    VALUES (v_user_id, v_plan_id, 'active', NOW(), NULL);
    RAISE NOTICE 'Plan 1A asignado a %', v_email;
  ELSE
    RAISE NOTICE 'El usuario ya tenia el plan 1A; no se inserta duplicado';
  END IF;

  -- Asegura que la cuenta no quede bloqueada
  UPDATE app_users SET status = 'active' WHERE id = v_user_id;
END $$;