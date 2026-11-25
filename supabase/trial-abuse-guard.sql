-- ============================================================
-- Freno al abuso de períodos de prueba (sobre todo vía Google OAuth,
-- que no pasa por el CAPTCHA ni por el límite de correos de Supabase).
-- ============================================================
-- 1) Un período de prueba por correo normalizado. En Gmail se ignoran los
--    puntos y el sufijo +algo (j.uan+x@gmail.com = juan@gmail.com); en otros
--    dominios solo el sufijo +algo. El registro (trial_grants) sobrevive
--    aunque la cuenta se elimine.
-- 2) Tope global: más de 20 pruebas otorgadas en la última hora → las
--    cuentas siguientes se crean sin prueba (modo lectura) hasta que el
--    admin les asigne un plan.
--
-- La cuenta SIEMPRE se crea: si algo del freno falla, se otorga la prueba
-- normal (nunca se bloquea un registro por un error de esta lógica).
--
-- Idempotente. Vía scripts/exec-trial-abuse-guard.mjs
-- ============================================================

CREATE TABLE IF NOT EXISTS public.trial_grants (
  email_normalized TEXT PRIMARY KEY,
  user_id UUID,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_trial_grants_granted_at ON public.trial_grants(granted_at);

-- Solo el backend (service_role) y el propio trigger la usan.
ALTER TABLE public.trial_grants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.trial_grants FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.trial_grants TO service_role;

CREATE OR REPLACE FUNCTION public.normalize_email(p_email TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_email TEXT := lower(btrim(COALESCE(p_email, '')));
  v_local TEXT := split_part(v_email, '@', 1);
  v_domain TEXT := split_part(v_email, '@', 2);
BEGIN
  IF v_email = '' OR v_domain = '' THEN
    RETURN v_email;
  END IF;
  v_local := split_part(v_local, '+', 1);
  IF v_domain IN ('gmail.com', 'googlemail.com') THEN
    v_local := replace(v_local, '.', '');
    v_domain := 'gmail.com';
  END IF;
  RETURN v_local || '@' || v_domain;
END;
$$;

-- Backfill: los usuarios existentes ya usaron su prueba.
INSERT INTO public.trial_grants (email_normalized, user_id, granted_at)
SELECT DISTINCT ON (public.normalize_email(u.email)) public.normalize_email(u.email), u.id, u.created_at
FROM auth.users u
WHERE u.email IS NOT NULL AND u.email <> ''
ORDER BY public.normalize_email(u.email), u.created_at
ON CONFLICT (email_normalized) DO NOTHING;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_trial_plan UUID;
  v_email TEXT := public.normalize_email(NEW.email);
  v_grant_trial BOOLEAN := TRUE;
  v_inserted INTEGER;
BEGIN
  INSERT INTO settings (user_id, onboarding_completed)
  VALUES (NEW.id, false);

  INSERT INTO app_users (id, role, display_name, status)
  VALUES (NEW.id, 'client', COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)), 'active');

  SELECT p.id INTO v_trial_plan
  FROM plans p
  WHERE p.name ILIKE 'Trial' OR p.name ILIKE 'Prueba'
  LIMIT 1;

  IF v_trial_plan IS NULL THEN
    RETURN NEW;
  END IF;

  BEGIN
    IF v_email <> '' THEN
      -- Tope global: más de 20 pruebas en la última hora.
      IF (SELECT count(*) FROM trial_grants WHERE granted_at > now() - INTERVAL '1 hour') >= 20 THEN
        v_grant_trial := FALSE;
      ELSE
        -- Una prueba por correo normalizado.
        INSERT INTO trial_grants (email_normalized, user_id) VALUES (v_email, NEW.id)
        ON CONFLICT (email_normalized) DO NOTHING;
        GET DIAGNOSTICS v_inserted = ROW_COUNT;
        v_grant_trial := v_inserted > 0;
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_grant_trial := TRUE;
  END;

  IF v_grant_trial THEN
    INSERT INTO subscriptions (user_id, plan_id, status, starts_at, ends_at)
    VALUES (NEW.id, v_trial_plan, 'trial', NOW(), NOW() + INTERVAL '14 days');
  ELSE
    -- Sin prueba: la cuenta entra en modo lectura y elige un plan desde la app.
    INSERT INTO subscriptions (user_id, plan_id, status, starts_at, ends_at)
    VALUES (NEW.id, v_trial_plan, 'expired', NOW(), NOW());
  END IF;

  RETURN NEW;
END;
$$;
