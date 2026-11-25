-- Pruebas de supabase/atomic-operations.sql (reglas de la app TanStack:
-- src/lib/actions.ts refreshLoanStatus / recalcInstallmentFromPayments).
-- Se ejecutan con supabase/tests/run.sh. Cada verificación imprime "OK <caso>" o "FALLA <caso>".
\set ON_ERROR_STOP 0
\pset tuples_only on
\pset format unaligned

CREATE FUNCTION pg_temp.as_user(u uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', COALESCE(u::text, ''), false);
  SELECT set_config('role', CASE WHEN u IS NULL THEN 'postgres' ELSE 'authenticated' END, false);
$$;
CREATE FUNCTION pg_temp.check(name text, ok boolean) RETURNS text LANGUAGE sql AS $$
  SELECT CASE WHEN COALESCE(ok, false) THEN 'OK ' ELSE 'FALLA ' END || name
$$;
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
  ('11111111-1111-1111-1111-111111111111','a@test.do'),
  ('22222222-2222-2222-2222-222222222222','b@test.do');
INSERT INTO app_users(id,role,status) VALUES
  ('11111111-1111-1111-1111-111111111111','client','active'),
  ('22222222-2222-2222-2222-222222222222','client','active')
  ON CONFLICT (id) DO UPDATE SET status = 'active';
DELETE FROM subscriptions;
INSERT INTO plans(name, price) SELECT 'Pro test', 1000 WHERE NOT EXISTS (SELECT 1 FROM plans WHERE price > 0);
INSERT INTO subscriptions(user_id,plan_id,status,ends_at)
  SELECT u, (SELECT id FROM plans ORDER BY price DESC LIMIT 1), 'active', now() + interval '10 days'
  FROM (VALUES ('11111111-1111-1111-1111-111111111111'::uuid),('22222222-2222-2222-2222-222222222222'::uuid)) v(u);
INSERT INTO clients(id,user_id,name,status) VALUES
  ('c1111111-1111-1111-1111-111111111111','11111111-1111-1111-1111-111111111111','Cliente A','inactive');

\set A '\'11111111-1111-1111-1111-111111111111\''
\set B '\'22222222-2222-2222-2222-222222222222\''

-- Préstamo francés: 3 cuotas FUTURAS (sin atraso)
INSERT INTO loans(id, loan_id, user_id, client_id, amount, interest_type, interest_rate, total_amount, total_interest,
  installment_amount, installments, frequency, start_date, first_payment_date, amortization_type, remaining_amount)
VALUES ('f0000000-0000-0000-0000-000000000001','P-FR',:A,'c1111111-1111-1111-1111-111111111111',3000,'percentage',10,
  3619.93,619.93,1206.65,3,'monthly',public.today_rd(),public.today_rd() + 10,'french',3619.93);
INSERT INTO installments(loan_id, client_id, number, amount, capital, interest, balance, due_date) VALUES
  ('f0000000-0000-0000-0000-000000000001','c1111111-1111-1111-1111-111111111111',1,1206.65,906.65,300,2093.35,public.today_rd() + 10),
  ('f0000000-0000-0000-0000-000000000001','c1111111-1111-1111-1111-111111111111',2,1206.65,997.32,209.33,1096.03,public.today_rd() + 40),
  ('f0000000-0000-0000-0000-000000000001','c1111111-1111-1111-1111-111111111111',3,1206.63,1096.03,110.6,0,public.today_rd() + 70);
\set FR '\'f0000000-0000-0000-0000-000000000001\''

-- T1 abono a capital: pago + cronograma nuevo + préstamo recalculado en una transacción
SELECT pg_temp.as_user(:A) \g /dev/null
SELECT public.apply_loan_operation(:FR, jsonb_build_object(
  'payment', jsonb_build_object('amount',500,'capital_amount',500,'interest_amount',0,'type','capital_abono','payment_date',public.today_rd(),'method','cash'),
  'installment_writes','[{"key":"number","value":1,"data":{"amount":1005.54,"capital":755.54,"interest":250,"balance":1744.46}},
                         {"key":"number","value":2,"data":{"amount":1005.54,"capital":831.10,"interest":174.44,"balance":913.36}},
                         {"key":"number","value":3,"data":{"amount":1004.70,"capital":913.36,"interest":91.34,"balance":0}}]'::jsonb,
  'loan_updates', jsonb_build_object('installment_amount',1005.54)))->'payment'->>'id' AS abono \gset
SELECT pg_temp.as_user(NULL) \g /dev/null
SELECT pg_temp.check('T1 saldo = suma de cuotas pendientes', remaining_amount = 3015.78) FROM loans WHERE id = :FR;
SELECT pg_temp.check('T1 pagado = abono (cuotas sin pagar)', paid_amount = 500 AND installment_amount = 1005.54) FROM loans WHERE id = :FR;
SELECT pg_temp.check('T1 sigue activo, sin atraso', status = 'active' AND progress = 0) FROM loans WHERE id = :FR;

-- T2 atomicidad: si una escritura falla, no queda el pago
SELECT pg_temp.expect_error('T2 escritura inválida aborta todo', :A, format($$SELECT public.apply_loan_operation(%L,'{"payment":{"amount":100,"capital_amount":100,"type":"capital_abono","payment_date":"2026-11-25"},"installment_writes":[{"key":"number","value":2,"data":{"status":"INVALIDO"}}]}')$$, :FR), 'check constraint');
SELECT pg_temp.check('T2 sin pago huérfano', count(*) = 1) FROM payments WHERE loan_id = :FR AND type = 'capital_abono';

-- T3 reversión del abono (con cronograma restaurado) + doble reversión y sin motivo rechazadas
SELECT pg_temp.as_user(:A) \g /dev/null
SELECT public.apply_loan_operation(:FR, jsonb_build_object('reverse_payment_id', :'abono', 'reversal_reason', 'error',
  'installment_writes','[{"key":"number","value":1,"data":{"amount":1206.65,"capital":906.65,"interest":300,"balance":2093.35}},
                         {"key":"number","value":2,"data":{"amount":1206.65,"capital":997.32,"interest":209.33,"balance":1096.03}},
                         {"key":"number","value":3,"data":{"amount":1206.63,"capital":1096.03,"interest":110.6,"balance":0}}]'::jsonb,
  'loan_updates', jsonb_build_object('installment_amount',1206.65))) \g /dev/null
SELECT pg_temp.as_user(NULL) \g /dev/null
SELECT pg_temp.check('T3 saldo y pagado restaurados', remaining_amount = 3619.93 AND paid_amount = 0) FROM loans WHERE id = :FR;
SELECT pg_temp.check('T3 pago marcado revertido con fecha', status = 'reversed' AND reversed_at IS NOT NULL) FROM payments WHERE id = :'abono';
SELECT pg_temp.expect_error('T3 doble reversión rechazada', :A, format($$SELECT public.apply_loan_operation(%L, jsonb_build_object('reverse_payment_id', %L, 'reversal_reason', 'x'))$$, :FR, :'abono'), 'ya fue revertido');
SELECT pg_temp.expect_error('T3 reversión sin motivo rechazada', :A, format($$SELECT public.apply_loan_operation(%L, jsonb_build_object('reverse_payment_id', %L))$$, :FR, :'abono'), 'motivo');

-- T4 liquidación: cuotas pagadas + préstamo cerrado (status paid, paid_at)
SELECT pg_temp.as_user(:A) \g /dev/null
SELECT public.apply_loan_operation(:FR, jsonb_build_object(
  'payment', jsonb_build_object('amount',3100,'capital_amount',3000,'interest_amount',100,'late_amount',0,'type','liquidation','payment_date',public.today_rd(),'method','cash'),
  'installment_writes', (SELECT jsonb_agg(jsonb_build_object('key','id','value',id,'data',jsonb_build_object('status','paid','paid_amount',amount,'paid_at',public.today_rd()))) FROM installments WHERE loan_id = :FR)))->'payment'->>'id' AS liq \gset
SELECT pg_temp.as_user(NULL) \g /dev/null
SELECT pg_temp.check('T4 préstamo pagado y saldo 0', status = 'paid' AND paid_at IS NOT NULL AND remaining_amount = 0 AND progress = 100 AND paid_installments = 3) FROM loans WHERE id = :FR;
SELECT pg_temp.check('T4 cliente pasa a inactivo', status = 'inactive') FROM clients WHERE id = 'c1111111-1111-1111-1111-111111111111';

-- T5 revertir la liquidación reabre el préstamo y devuelve las cuotas
SELECT pg_temp.as_user(:A) \g /dev/null
SELECT public.apply_loan_operation(:FR, jsonb_build_object('reverse_payment_id', :'liq', 'reversal_reason', 'r', 'recalc_installments', 'all')) \g /dev/null
SELECT pg_temp.as_user(NULL) \g /dev/null
SELECT pg_temp.check('T5 préstamo reabierto', status = 'active' AND paid_at IS NULL AND remaining_amount = 3619.93 AND paid_installments = 0) FROM loans WHERE id = :FR;
SELECT pg_temp.check('T5 cuotas pendientes otra vez', count(*) = 3) FROM installments WHERE loan_id = :FR AND status = 'pending' AND paid_amount = 0 AND paid_at IS NULL;

-- T6 reversión de pago de cuota: recalcula la cuota con tolerancia y fecha del último pago válido
INSERT INTO payments(loan_id, installment_id, client_id, user_id, amount, capital_amount, interest_amount, late_amount, payment_date)
  SELECT :FR, id, client_id, :A, 600, 300, 300, 0, public.today_rd() - 2 FROM installments WHERE loan_id = :FR AND number = 1;
INSERT INTO payments(loan_id, installment_id, client_id, user_id, amount, capital_amount, interest_amount, late_amount, payment_date)
  SELECT :FR, id, client_id, :A, 606.645, 606.645, 0, 0, public.today_rd() - 1 FROM installments WHERE loan_id = :FR AND number = 1
  RETURNING id AS p2 \gset
SELECT id AS i1 FROM installments WHERE loan_id = :FR AND number = 1 \gset
SELECT pg_temp.as_user(:A) \g /dev/null
SELECT public.apply_loan_operation(:FR, jsonb_build_object('recalc_installments', jsonb_build_array(:'i1'))) \g /dev/null
SELECT pg_temp.as_user(NULL) \g /dev/null
SELECT pg_temp.check('T6 cuota cubierta con tolerancia (1206.645 >= 1206.65 - 0.009) → pagada', status = 'paid' AND paid_amount = 1206.65 AND paid_at = public.today_rd() - 1) FROM installments WHERE id = :'i1';
SELECT pg_temp.as_user(:A) \g /dev/null
SELECT public.apply_loan_operation(:FR, jsonb_build_object('reverse_payment_id', :'p2', 'reversal_reason', 'r', 'recalc_installments', jsonb_build_array(:'i1'))) \g /dev/null
SELECT pg_temp.as_user(NULL) \g /dev/null
SELECT pg_temp.check('T6 tras revertir: parcial 600, sin fecha de pago', status = 'partial' AND paid_amount = 600 AND paid_at IS NULL) FROM installments WHERE id = :'i1';
SELECT pg_temp.check('T6 préstamo: 1 pago parcial, saldo = pendiente', paid_installments = 0 AND remaining_amount = 3019.93) FROM loans WHERE id = :FR;

-- T7 pintado de atraso (días sin gracia) y vuelta a activo
UPDATE installments SET due_date = public.today_rd() - 15 WHERE loan_id = :FR AND number = 1;
SELECT pg_temp.as_user(:A) \g /dev/null
SELECT public.apply_loan_operation(:FR, '{}'::jsonb) \g /dev/null
SELECT pg_temp.as_user(NULL) \g /dev/null
SELECT pg_temp.check('T7 cuota vencida hace 15 días → late_1_30 / 15', status = 'late_1_30' AND late_days = 15) FROM loans WHERE id = :FR;
UPDATE installments SET due_date = public.today_rd() - 45 WHERE loan_id = :FR AND number = 1;
SELECT pg_temp.as_user(:A) \g /dev/null
SELECT public.apply_loan_operation(:FR, '{}'::jsonb) \g /dev/null
SELECT pg_temp.as_user(NULL) \g /dev/null
SELECT pg_temp.check('T7 45 días → late_31_60', status = 'late_31_60' AND late_days = 45) FROM loans WHERE id = :FR;
UPDATE installments SET due_date = public.today_rd() + 5 WHERE loan_id = :FR AND number = 1;
SELECT pg_temp.as_user(:A) \g /dev/null
SELECT public.apply_loan_operation(:FR, '{}'::jsonb) \g /dev/null
SELECT pg_temp.as_user(NULL) \g /dev/null
SELECT pg_temp.check('T7 sin cuotas vencidas → vuelve a activo con 0 días', status = 'active' AND late_days = 0) FROM loans WHERE id = :FR;

-- T8 préstamo abierto: interés, abono y liquidación (se cierra) y su reversión (se reabre)
INSERT INTO loans(id, loan_id, user_id, client_id, amount, interest_type, interest_rate, total_amount, total_interest,
  installment_amount, installments, frequency, start_date, first_payment_date, amortization_type, open_ended, payment_day, remaining_amount)
VALUES ('f0000000-0000-0000-0000-000000000002','P-OE',:A,'c1111111-1111-1111-1111-111111111111',50000,'percentage',10,
  50000,5000,5000,0,'monthly',public.today_rd(),public.today_rd() + 10,'interest_only',true,5,50000);
\set OE '\'f0000000-0000-0000-0000-000000000002\''
SELECT pg_temp.as_user(:A) \g /dev/null
SELECT public.apply_loan_operation(:OE, jsonb_build_object('payment', jsonb_build_object('amount',5000,'capital_amount',0,'interest_amount',5000,'type','installment','payment_date',public.today_rd(),'method','cash'))) \g /dev/null
SELECT public.apply_loan_operation(:OE, jsonb_build_object('payment', jsonb_build_object('amount',10000,'capital_amount',10000,'type','capital_abono','payment_date',public.today_rd(),'method','cash'), 'loan_updates', jsonb_build_object('installment_amount',4000))) \g /dev/null
SELECT pg_temp.as_user(NULL) \g /dev/null
SELECT pg_temp.check('T8 abierto tras interés + abono: saldo 40000, pagado 10000, interés 4000', remaining_amount = 40000 AND paid_amount = 10000 AND installment_amount = 4000 AND status = 'active' AND progress = 20) FROM loans WHERE id = :OE;
SELECT pg_temp.as_user(:A) \g /dev/null
SELECT public.apply_loan_operation(:OE, jsonb_build_object('payment', jsonb_build_object('amount',41000,'capital_amount',40000,'interest_amount',1000,'type','liquidation','payment_date',public.today_rd(),'method','cash')))->'payment'->>'id' AS liq_oe \gset
SELECT pg_temp.as_user(NULL) \g /dev/null
SELECT pg_temp.check('T8 abierto liquidado → pagado', status = 'paid' AND paid_at IS NOT NULL AND remaining_amount = 0) FROM loans WHERE id = :OE;
SELECT pg_temp.as_user(:A) \g /dev/null
SELECT public.apply_loan_operation(:OE, jsonb_build_object('reverse_payment_id', :'liq_oe', 'reversal_reason', 'r')) \g /dev/null
SELECT pg_temp.as_user(NULL) \g /dev/null
SELECT pg_temp.check('T8 revertir liquidación de abierto → reabierto', status = 'active' AND paid_at IS NULL AND remaining_amount = 40000) FROM loans WHERE id = :OE;

-- T9 préstamo archivado: no se opera (la app marca el pago revertido aparte)
UPDATE loans SET deleted_at = now(), status = 'cancelled' WHERE id = :OE;
SELECT pg_temp.expect_error('T9 préstamo archivado rechazado', :A, format($$SELECT public.apply_loan_operation(%L,'{}')$$, :OE), 'no encontrado');
UPDATE loans SET deleted_at = NULL, status = 'active' WHERE id = :OE;

-- T10 otro usuario no opera el préstamo
SELECT pg_temp.expect_error('T10 otro usuario no puede operar', :B, format($$SELECT public.apply_loan_operation(%L,'{"payment":{"amount":10,"type":"capital_abono"}}')$$, :FR), 'no encontrado');

-- T11 modo lectura: plan vencido COBRA, pero no crea clientes ni préstamos
UPDATE subscriptions SET ends_at = now() - interval '1 day' WHERE user_id = :A;
SELECT pg_temp.as_user(:A) \g /dev/null
SELECT pg_temp.check('T11 vencido: puede cobrar', (public.apply_loan_operation(:OE, jsonb_build_object('payment', jsonb_build_object('amount',4000,'capital_amount',0,'interest_amount',4000,'type','installment','payment_date',public.today_rd(),'method','cash')))->>'ok')::boolean);
SELECT pg_temp.as_user(NULL) \g /dev/null
SELECT pg_temp.expect_error('T11 vencido: crear cliente bloqueado', :A, $$INSERT INTO clients(user_id,name) VALUES ('11111111-1111-1111-1111-111111111111','X')$$, 'modo lectura');
SELECT pg_temp.expect_error('T11 vencido: crear préstamo bloqueado', :A, format($$INSERT INTO loans(loan_id,user_id,client_id,amount,interest_type,interest_rate,total_amount,total_interest,installment_amount,installments,frequency,start_date,first_payment_date) VALUES ('X',%L,'c1111111-1111-1111-1111-111111111111',10,'percentage',1,10,0,0,0,'monthly',public.today_rd(),public.today_rd())$$, :A), 'modo lectura');
SELECT pg_temp.as_user(:A) \g /dev/null
UPDATE clients SET notes = 'editado vencido' WHERE id = 'c1111111-1111-1111-1111-111111111111';
SELECT pg_temp.as_user(NULL) \g /dev/null
SELECT pg_temp.check('T11 vencido: puede editar un cliente', notes = 'editado vencido') FROM clients WHERE id = 'c1111111-1111-1111-1111-111111111111';
UPDATE subscriptions SET ends_at = now() + interval '1 day' WHERE user_id = :A;

-- T12 permisos
SET role anon;
SELECT pg_temp.check('T12 anon no ejecuta apply_loan_operation', NOT has_function_privilege('public.apply_loan_operation(uuid,jsonb)', 'EXECUTE'));
SELECT pg_temp.check('T12 anon no ejecuta process_installment_payment', NOT has_function_privilege('public.process_installment_payment(uuid,uuid,uuid,numeric,boolean,date,text,text,numeric,integer)', 'EXECUTE'));
SELECT pg_temp.check('T12 anon no ejecuta process_cascade_payment', NOT has_function_privilege('public.process_cascade_payment(uuid,uuid,numeric,boolean,date,text,text,numeric,integer)', 'EXECUTE'));
SELECT pg_temp.check('T12 anon sin acceso al esquema interno', NOT has_schema_privilege('gp_private', 'USAGE'));
RESET role;
SET role authenticated;
SELECT pg_temp.check('T12 usuario sí ejecuta apply_loan_operation', has_function_privilege('public.apply_loan_operation(uuid,jsonb)', 'EXECUTE'));
SELECT pg_temp.check('T12 usuario sí ejecuta process_installment_payment', has_function_privilege('public.process_installment_payment(uuid,uuid,uuid,numeric,boolean,date,text,text,numeric,integer)', 'EXECUTE'));
RESET role;
