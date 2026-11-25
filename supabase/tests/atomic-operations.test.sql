-- Pruebas de supabase/atomic-operations.sql. Se ejecutan con supabase/tests/run.sh.
-- Cada verificación imprime "OK <caso>" o "FALLA <caso>".
\set ON_ERROR_STOP 0
\pset tuples_only on
\pset format unaligned

CREATE FUNCTION pg_temp.as_user(u uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', COALESCE(u::text, ''), false);
  SELECT set_config('role', CASE WHEN u IS NULL THEN 'postgres' ELSE 'authenticated' END, false);
$$;
CREATE FUNCTION pg_temp.check(name text, ok boolean) RETURNS text LANGUAGE sql AS $$
  SELECT CASE WHEN ok THEN 'OK ' ELSE 'FALLA ' END || name
$$;
-- Ejecuta sql como el usuario u y verifica que falle con un mensaje que contenga pattern.
CREATE FUNCTION pg_temp.expect_error(name text, u uuid, sql text, pattern text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', COALESCE(u::text, ''), true);
  IF u IS NOT NULL THEN EXECUTE 'SET LOCAL role authenticated'; END IF;
  BEGIN
    EXECUTE sql;
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET role';
    RETURN CASE WHEN SQLERRM ILIKE '%' || pattern || '%' THEN 'OK ' ELSE 'FALLA ' END || name || ' (' || SQLERRM || ')';
  END;
  EXECUTE 'RESET role';
  RETURN 'FALLA ' || name || ' (no hubo error)';
END;
$$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO PUBLIC;

-- Datos base
INSERT INTO auth.users(id,email) VALUES
  ('11111111-1111-1111-1111-111111111111','a@test'),
  ('22222222-2222-2222-2222-222222222222','b@test');
INSERT INTO app_users(id,role,status) VALUES
  ('11111111-1111-1111-1111-111111111111','client','active'),
  ('22222222-2222-2222-2222-222222222222','client','active')
  ON CONFLICT (id) DO UPDATE SET status = 'active';
DELETE FROM subscriptions;
INSERT INTO plans(name, price) SELECT 'Pro test', 1000 WHERE NOT EXISTS (SELECT 1 FROM plans);
INSERT INTO subscriptions(user_id,plan_id,status,ends_at)
  SELECT u, (SELECT id FROM plans ORDER BY price DESC LIMIT 1), 'active', now() + interval '10 days'
  FROM (VALUES ('11111111-1111-1111-1111-111111111111'::uuid),('22222222-2222-2222-2222-222222222222'::uuid)) v(u);
INSERT INTO clients(id,user_id,name,status) VALUES
  ('c1111111-1111-1111-1111-111111111111','11111111-1111-1111-1111-111111111111','Cliente A','inactive');

\set A '\'11111111-1111-1111-1111-111111111111\''
\set B '\'22222222-2222-2222-2222-222222222222\''

-- T1 crear préstamo francés con cronograma
SELECT pg_temp.as_user(:A) \g /dev/null
SELECT public.save_loan_with_schedule(NULL,
 '{"loan_id":"P000001","client_id":"c1111111-1111-1111-1111-111111111111","amount":3000,"interest_type":"percentage","interest_rate":10,"amortization_type":"french","open_ended":false,"total_amount":3619.93,"total_interest":619.93,"installment_amount":1206.65,"remaining_amount":3619.93,"installments":3,"frequency":"monthly","start_date":"2026-11-01","first_payment_date":"2026-12-01","user_id":"22222222-2222-2222-2222-222222222222"}',
 '[{"number":1,"amount":1206.65,"capital":906.65,"interest":300,"balance":2093.35,"due_date":"2026-12-01"},{"number":2,"amount":1206.65,"capital":997.32,"interest":209.33,"balance":1096.03,"due_date":"2027-01-01"},{"number":3,"amount":1206.63,"capital":1096.03,"interest":110.6,"balance":0,"due_date":"2027-02-01"}]')->>'id' AS loan \gset
SELECT pg_temp.as_user(NULL) \g /dev/null
SELECT pg_temp.check('T1 préstamo creado con user_id del dueño (ignora el enviado)', user_id = :A::uuid) FROM loans WHERE id = :'loan';
SELECT pg_temp.check('T1 tres cuotas creadas', (SELECT count(*) FROM installments WHERE loan_id = :'loan') = 3);
SELECT pg_temp.check('T1 cliente pasa a activo', status = 'active') FROM clients WHERE id = 'c1111111-1111-1111-1111-111111111111';

-- T2 editar sin pagos reemplaza el cronograma; no permite cambiar el cliente
SELECT pg_temp.as_user(:A) \g /dev/null
SELECT public.save_loan_with_schedule(:'loan','{"notes":"editado","installments":2,"client_id":"00000000-0000-0000-0000-000000000000"}',
 '[{"number":1,"amount":1500,"capital":1500,"interest":0,"balance":1500,"due_date":"2026-12-01"},{"number":2,"amount":1500,"capital":1500,"interest":0,"balance":0,"due_date":"2027-01-01"}]') \g /dev/null
SELECT pg_temp.as_user(NULL) \g /dev/null
SELECT pg_temp.check('T2 edición aplicada y cliente intacto', notes = 'editado' AND installments = 2 AND client_id = 'c1111111-1111-1111-1111-111111111111') FROM loans WHERE id = :'loan';
SELECT pg_temp.check('T2 cronograma reemplazado', (SELECT count(*) FROM installments WHERE loan_id = :'loan') = 2);
SELECT pg_temp.as_user(:A) \g /dev/null
SELECT public.save_loan_with_schedule(:'loan','{"installments":3,"notes":null,"total_amount":3619.93}',
 '[{"number":1,"amount":1206.65,"capital":906.65,"interest":300,"balance":2093.35,"due_date":"2026-11-01"},{"number":2,"amount":1206.65,"capital":997.32,"interest":209.33,"balance":1096.03,"due_date":"2027-01-01"},{"number":3,"amount":1206.63,"capital":1096.03,"interest":110.6,"balance":0,"due_date":"2027-02-01"}]') \g /dev/null

-- T3 pago de cuota con la RPC existente; luego editar queda bloqueado
SELECT public.process_cascade_payment(:'loan', :A, 1206.65, false, '2026-11-20', 'cash', null, 0, 0) \g /dev/null
SELECT pg_temp.as_user(NULL) \g /dev/null
SELECT pg_temp.check('T3 cuota 1 pagada', paid_installments = 1) FROM loans WHERE id = :'loan';
SELECT pg_temp.expect_error('T3 no se edita con pagos', :A, format($$SELECT public.save_loan_with_schedule(%L,'{"notes":"x"}',NULL)$$, :'loan'), 'pagos registrados');

-- T4 otro usuario no ve ni opera el préstamo
SELECT pg_temp.expect_error('T4 otro usuario no puede operar', :B, format($$SELECT public.apply_loan_operation(%L,'{"payment":{"amount":10,"type":"capital_abono"}}')$$, :'loan'), 'no encontrado');
SELECT pg_temp.expect_error('T4 otro usuario no crea préstamos con clientes ajenos', :B,
  $$SELECT public.save_loan_with_schedule(NULL,'{"loan_id":"X","client_id":"c1111111-1111-1111-1111-111111111111","amount":10,"interest_type":"percentage","interest_rate":1,"total_amount":10,"total_interest":0,"installment_amount":0,"installments":0,"frequency":"monthly","start_date":"2026-11-05","first_payment_date":"2026-12-05"}',NULL)$$, 'Cliente no encontrado');

-- T5 atomicidad: si una escritura falla, el pago no queda registrado
SELECT pg_temp.expect_error('T5 escritura inválida aborta la operación', :A, format($$SELECT public.apply_loan_operation(%L,'{"payment":{"amount":500,"capital_amount":500,"type":"capital_abono","payment_date":"2026-11-21"},"installment_writes":[{"key":"number","value":2,"data":{"status":"INVALIDO"}}]}')$$, :'loan'), 'check constraint');
SELECT pg_temp.check('T5 sin pago huérfano', count(*) = 0) FROM payments WHERE loan_id = :'loan' AND type = 'capital_abono';

-- T6 abono a capital con nuevo cronograma
SELECT pg_temp.as_user(:A) \g /dev/null
SELECT public.apply_loan_operation(:'loan','{"payment":{"amount":500,"capital_amount":500,"interest_amount":0,"type":"capital_abono","payment_date":"2026-11-21","method":"cash"},"installment_writes":[{"key":"number","value":2,"data":{"amount":950,"capital":800,"interest":150,"balance":793.35}},{"key":"number","value":3,"data":{"amount":950,"capital":793.35,"interest":156.65,"balance":0}}],"loan_updates":{"installment_amount":950}}')->'payment'->>'id' AS abono \gset
SELECT pg_temp.as_user(NULL) \g /dev/null
SELECT pg_temp.check('T6 saldo = cuotas pendientes recalculadas', remaining_amount = 1900 AND installment_amount = 950) FROM loans WHERE id = :'loan';
SELECT pg_temp.check('T6 pagado = cuota + abono', paid_amount = 1706.65) FROM loans WHERE id = :'loan';

-- T7 reversión del abono; doble reversión y reversión sin motivo rechazadas
SELECT pg_temp.as_user(:A) \g /dev/null
SELECT public.apply_loan_operation(:'loan', jsonb_build_object('reverse_payment_id', :'abono', 'reversal_reason', 'error',
  'installment_writes', '[{"key":"number","value":2,"data":{"amount":1206.65,"capital":997.32,"interest":209.33,"balance":1096.03}},{"key":"number","value":3,"data":{"amount":1206.63,"capital":1096.03,"interest":110.6,"balance":0}}]'::jsonb,
  'post_loan_updates', jsonb_build_object('status', 'active'))) \g /dev/null
SELECT pg_temp.as_user(NULL) \g /dev/null
SELECT pg_temp.check('T7 saldo restaurado', remaining_amount = 2413.28) FROM loans WHERE id = :'loan';
SELECT pg_temp.expect_error('T7 doble reversión rechazada', :A, format($$SELECT public.apply_loan_operation(%L, jsonb_build_object('reverse_payment_id', %L, 'reversal_reason', 'otra'))$$, :'loan', :'abono'), 'ya fue revertido');
SELECT pg_temp.expect_error('T7 reversión sin motivo rechazada', :A, format($$SELECT public.apply_loan_operation(%L, jsonb_build_object('reverse_payment_id', %L))$$, :'loan', :'abono'), 'motivo');

-- T8 reversión de un pago de cuota recalcula la cuota y el préstamo
SELECT id AS p1, installment_id AS i1 FROM payments WHERE loan_id = :'loan' AND type <> 'capital_abono' AND status = 'paid' LIMIT 1 \gset
SELECT pg_temp.as_user(:A) \g /dev/null
SELECT public.apply_loan_operation(:'loan', jsonb_build_object('reverse_payment_id', :'p1', 'reversal_reason', 'r', 'recalc_installments', jsonb_build_array(:'i1'), 'reopen_if_unpaid', true)) \g /dev/null
SELECT pg_temp.as_user(NULL) \g /dev/null
SELECT pg_temp.check('T8 cuota vuelve a pendiente', status = 'pending' AND paid_amount = 0) FROM installments WHERE id = :'i1';
SELECT pg_temp.check('T8 saldo = suma de cuotas', remaining_amount = 3619.93 AND paid_installments = 0) FROM loans WHERE id = :'loan';

-- T9 liquidación total
SELECT pg_temp.as_user(:A) \g /dev/null
SELECT public.apply_loan_operation(:'loan', jsonb_build_object(
  'payment', '{"amount":3200,"capital_amount":3000,"interest_amount":150,"late_amount":50,"type":"liquidation","payment_date":"2026-11-25","notes":"Liquidación total"}'::jsonb,
  'installment_writes', (SELECT jsonb_agg(jsonb_build_object('key','id','value',id,'data',jsonb_build_object('status','paid','paid_amount',amount,'paid_late_amount',late_amount,'paid_at','2026-11-25'))) FROM installments WHERE loan_id = :'loan' AND status <> 'paid'),
  'paid_amount_from_payments', true)) \g /dev/null
SELECT pg_temp.as_user(NULL) \g /dev/null
SELECT pg_temp.check('T9 préstamo pagado y saldo 0', status = 'paid' AND paid_amount = 3200 AND remaining_amount = 0 AND progress = 100) FROM loans WHERE id = :'loan';
SELECT pg_temp.check('T9 cliente pasa a inactivo', status = 'inactive') FROM clients WHERE id = 'c1111111-1111-1111-1111-111111111111';

-- T10 reversión de la liquidación reabre el préstamo
SELECT id AS liq FROM payments WHERE loan_id = :'loan' AND type = 'liquidation' \gset
SELECT pg_temp.as_user(:A) \g /dev/null
SELECT public.apply_loan_operation(:'loan', jsonb_build_object('reverse_payment_id', :'liq', 'reversal_reason', 'r', 'recalc_installments', 'all', 'reopen_if_unpaid', true)) \g /dev/null
SELECT pg_temp.as_user(NULL) \g /dev/null
SELECT pg_temp.check('T10 préstamo reabierto', status = 'active' AND paid_at IS NULL AND remaining_amount = 3619.93) FROM loans WHERE id = :'loan';

-- T11 préstamo abierto: pago de interés y abono de capital
SELECT pg_temp.as_user(:A) \g /dev/null
SELECT public.save_loan_with_schedule(NULL,'{"loan_id":"P000002","client_id":"c1111111-1111-1111-1111-111111111111","amount":50000,"interest_type":"percentage","interest_rate":10,"amortization_type":"interest_only","open_ended":true,"payment_day":5,"total_amount":50000,"total_interest":5000,"installment_amount":5000,"remaining_amount":50000,"installments":0,"frequency":"monthly","start_date":"2026-11-05","first_payment_date":"2026-12-05"}',NULL)->>'id' AS oe \gset
SELECT public.apply_loan_operation(:'oe','{"payment":{"amount":5000,"capital_amount":0,"interest_amount":5000,"type":"installment","payment_date":"2026-12-05"}}') \g /dev/null
SELECT public.apply_loan_operation(:'oe','{"payment":{"amount":2000,"capital_amount":2000,"type":"capital_abono","payment_date":"2026-12-06"}}') \g /dev/null
SELECT pg_temp.as_user(NULL) \g /dev/null
SELECT pg_temp.check('T11 abierto: saldo = capital - capital pagado', remaining_amount = 48000 AND paid_amount = 2000 AND status = 'active') FROM loans WHERE id = :'oe';

-- T12 modo lectura: plan vencido no puede escribir, sí leer
UPDATE subscriptions SET ends_at = now() - interval '1 day' WHERE user_id = :A;
SELECT pg_temp.expect_error('T12 vencido: crear cliente bloqueado', :A, $$INSERT INTO clients(user_id,name) VALUES ('11111111-1111-1111-1111-111111111111','X')$$, 'modo lectura');
SELECT pg_temp.expect_error('T12 vencido: editar cliente bloqueado', :A, $$UPDATE clients SET name='Y'$$, 'modo lectura');
SELECT pg_temp.expect_error('T12 vencido: operación de préstamo bloqueada', :A, format($$SELECT public.apply_loan_operation(%L,'{"payment":{"amount":1,"type":"capital_abono"}}')$$, :'loan'), 'modo lectura');
SELECT pg_temp.expect_error('T12 vencido: cobro de cuota (RPC existente) bloqueado', :A, format($$SELECT public.process_cascade_payment(%L, %L, 1, false, '2026-11-20', 'cash', null, 0, 0)$$, :'loan', :A), 'modo lectura');
SELECT pg_temp.expect_error('T12 vencido: crear préstamo bloqueado', :A, $$SELECT public.save_loan_with_schedule(NULL,'{"loan_id":"P3","client_id":"c1111111-1111-1111-1111-111111111111","amount":10,"interest_type":"percentage","interest_rate":1,"total_amount":10,"total_interest":0,"installment_amount":0,"installments":0,"frequency":"monthly","start_date":"2026-11-05","first_payment_date":"2026-12-05"}',NULL)$$, 'modo lectura');
SELECT pg_temp.as_user(:A) \g /dev/null
SELECT pg_temp.check('T12 vencido: lectura permitida', count(*) > 0) FROM loans;
SELECT pg_temp.as_user(NULL) \g /dev/null
SELECT pg_temp.check('T12 cron sin sesión no se bloquea', (SELECT public.update_client_stats('c1111111-1111-1111-1111-111111111111')::text) IS NOT DISTINCT FROM '');
SELECT pg_temp.expect_error('T12 otro usuario con plan vigente sí escribe', :B, $$INSERT INTO clients(user_id,name) VALUES ('22222222-2222-2222-2222-222222222222','Z'); SELECT 1/0$$, 'division by zero');

-- T13 usuario bloqueado por el admin
UPDATE subscriptions SET ends_at = now() + interval '1 day' WHERE user_id = :A;
UPDATE app_users SET status = 'blocked' WHERE id = :A;
SELECT pg_temp.expect_error('T13 bloqueado: escritura rechazada', :A, $$UPDATE clients SET name='Y'$$, 'modo lectura');
UPDATE app_users SET status = 'active' WHERE id = :A;

-- T14 anon y funciones internas
SET role anon;
SELECT pg_temp.check('T14 anon no ejecuta apply_loan_operation', NOT has_function_privilege('public.apply_loan_operation(uuid,jsonb)', 'EXECUTE'));
SELECT pg_temp.check('T14 anon no ejecuta save_loan_with_schedule', NOT has_function_privilege('public.save_loan_with_schedule(uuid,jsonb,jsonb)', 'EXECUTE'));
SELECT pg_temp.check('T14 anon sin acceso al esquema interno', NOT has_schema_privilege('gp_private', 'USAGE'));
RESET role;
