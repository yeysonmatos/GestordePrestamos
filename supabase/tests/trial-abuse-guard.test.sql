-- Pruebas de supabase/trial-abuse-guard.sql. Se ejecutan con supabase/tests/run.sh.
\set ON_ERROR_STOP 0
\pset tuples_only on
\pset format unaligned

CREATE FUNCTION pg_temp.check(name text, ok boolean) RETURNS text LANGUAGE sql AS $$
  SELECT CASE WHEN ok THEN 'OK ' ELSE 'FALLA ' END || name
$$;
CREATE FUNCTION pg_temp.sub_status(p_email text) RETURNS text LANGUAGE sql AS $$
  SELECT s.status FROM subscriptions s JOIN auth.users u ON u.id = s.user_id
  WHERE u.email = p_email ORDER BY s.created_at DESC LIMIT 1
$$;

INSERT INTO plans(name, price) SELECT 'Trial', 0 WHERE NOT EXISTS (SELECT 1 FROM plans WHERE name ILIKE 'Trial');
DELETE FROM trial_grants;

-- Normalización
SELECT pg_temp.check('N1 gmail ignora puntos, mayúsculas y +sufijo', public.normalize_email(' J.Uan+Prueba@GMail.com ') = 'juan@gmail.com');
SELECT pg_temp.check('N2 googlemail equivale a gmail', public.normalize_email('juan@googlemail.com') = 'juan@gmail.com');
SELECT pg_temp.check('N3 otros dominios conservan los puntos', public.normalize_email('j.uan+x@empresa.do') = 'j.uan@empresa.do');

-- T1 primera cuenta recibe prueba de 14 días
INSERT INTO auth.users(email) VALUES ('t.uno@gmail.com');
SELECT pg_temp.check('T1 primera cuenta con prueba', pg_temp.sub_status('t.uno@gmail.com') = 'trial');
SELECT pg_temp.check('T1 prueba de 14 días', (SELECT ends_at::date - starts_at::date FROM subscriptions s JOIN auth.users u ON u.id = s.user_id WHERE u.email = 't.uno@gmail.com') = 14);

-- T2 mismo correo con otra forma no recibe otra prueba
INSERT INTO auth.users(email) VALUES ('tuno+2@gmail.com');
SELECT pg_temp.check('T2 alias del mismo Gmail sin prueba (modo lectura)', pg_temp.sub_status('tuno+2@gmail.com') = 'expired');
SELECT pg_temp.check('T2 la cuenta igual se crea', EXISTS (SELECT 1 FROM app_users a JOIN auth.users u ON u.id = a.id WHERE u.email = 'tuno+2@gmail.com'));

-- T3 la prueba no se recupera borrando la cuenta
DELETE FROM auth.users WHERE email = 't.uno@gmail.com';
INSERT INTO auth.users(email) VALUES ('tuno@gmail.com');
SELECT pg_temp.check('T3 recrear la cuenta no da otra prueba', pg_temp.sub_status('tuno@gmail.com') = 'expired');

-- T4 tope global de 20 pruebas por hora
DELETE FROM trial_grants;
INSERT INTO auth.users(email) SELECT 'masivo' || g || '@gmail.com' FROM generate_series(1, 20) g;
SELECT pg_temp.check('T4 las primeras 20 reciben prueba', (SELECT count(*) FROM subscriptions s JOIN auth.users u ON u.id = s.user_id WHERE u.email LIKE 'masivo%' AND s.status = 'trial') = 20);
INSERT INTO auth.users(email) VALUES ('masivo21@gmail.com');
SELECT pg_temp.check('T4 la 21 en la misma hora queda sin prueba', pg_temp.sub_status('masivo21@gmail.com') = 'expired');
UPDATE trial_grants SET granted_at = now() - interval '2 hours';
INSERT INTO auth.users(email) VALUES ('despues@gmail.com');
SELECT pg_temp.check('T4 pasada la hora vuelve a otorgar', pg_temp.sub_status('despues@gmail.com') = 'trial');

-- T5 nada de esto bloquea el registro: settings y app_users siempre se crean
SELECT pg_temp.check('T5 todas las cuentas tienen settings y app_users',
  NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.email LIKE '%@gmail.com'
    AND (NOT EXISTS (SELECT 1 FROM settings s WHERE s.user_id = u.id) OR NOT EXISTS (SELECT 1 FROM app_users a WHERE a.id = u.id))));

-- T6 la tabla no es accesible desde la API
SET role anon;
SELECT pg_temp.check('T6 anon no lee trial_grants', NOT has_table_privilege('public.trial_grants', 'SELECT'));
RESET role;
SET role authenticated;
SELECT pg_temp.check('T6 usuarios no leen trial_grants', NOT has_table_privilege('public.trial_grants', 'SELECT'));
RESET role;
