// Aplica supabase/save-loan-transactional.sql (RPC public.save_loan) y hace una
// prueba transaccional (ROLLBACK) para verificar que crear/editar + cuotas se
// comportan como una sola operación.
//
// Uso:  $env:SUPABASE_ACCESS_TOKEN="sbp_..." ; node scripts/exec-save-loan.mjs
import { readFileSync } from 'fs'

const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN
const REF = 'snwwvvmszizarakrozah'

if (!ACCESS_TOKEN) {
  console.error('Falta SUPABASE_ACCESS_TOKEN en el entorno.')
  process.exit(1)
}

async function query(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  })
  const text = await res.text()
  return { ok: res.ok, status: res.status, text }
}

const ddl = readFileSync('supabase/save-loan-transactional.sql', 'utf-8').trim()
const ddlRes = await query(ddl)
console.log('DDL status:', ddlRes.status)
console.log(ddlRes.text ? ddlRes.text : '(sin salida — OK)')
if (!ddlRes.ok) process.exit(1)

// Prueba transaccional: crea un préstamo de prueba, lo edita, comprueba las
// cuotas y REVIERTE todo (no deja rastro).
const test = `
DO $$
DECLARE
  v_client UUID;
  v_user UUID;
  v_loan UUID;
  v_res JSONB;
  v_cuotas INTEGER;
  v_freq TEXT;
  v_open BOOLEAN;
BEGIN
  SELECT id, user_id INTO v_client, v_user FROM public.clients LIMIT 1;
  IF v_client IS NULL THEN RAISE NOTICE 'sin clientes: prueba omitida'; RETURN; END IF;

  -- crear con 3 cuotas
  v_res := public.save_loan(
    NULL, v_client, 'TEST'||substring(md5(random()::text) from 1 for 6),
    1000, 10, 3, 'monthly', CURRENT_DATE, CURRENT_DATE + 30, CURRENT_DATE + 90,
    'french', false, NULL, 5, 'prueba',
    402.11, 1206.34, 206.34, 1206.34,
    '[{"number":1,"due_date":"2026-11-16","amount":402.11,"capital":302.11,"interest":100,"balance":697.89},
      {"number":2,"due_date":"2026-12-16","amount":402.11,"capital":332.32,"interest":69.79,"balance":365.57},
      {"number":3,"due_date":"2027-01-16","amount":402.11,"capital":365.57,"interest":36.54,"balance":0}]'::jsonb
  );
  v_loan := (v_res->>'loan_id')::uuid;
  RAISE NOTICE 'creado: %', v_res;
  SELECT count(*) INTO v_cuotas FROM public.installments WHERE loan_id = v_loan;
  RAISE NOTICE 'cuotas creadas: %', v_cuotas;

  -- editar: pasarlo a ABIERTO (0 cuotas) → las cuotas DEBEN desaparecer
  v_res := public.save_loan(
    v_loan, v_client, NULL,
    1000, 10, 0, 'monthly', CURRENT_DATE, CURRENT_DATE + 30, NULL,
    'interest_only', true, 16, 5, '',
    100, 1000, 100, 1000, '[]'::jsonb
  );
  SELECT count(*) INTO v_cuotas FROM public.installments WHERE loan_id = v_loan;
  SELECT frequency, open_ended INTO v_freq, v_open FROM public.loans WHERE id = v_loan;
  RAISE NOTICE 'tras pasar a abierto -> cuotas: % (debe ser 0) | freq=% open=%', v_cuotas, v_freq, v_open;

  -- editar un préstamo CON pagos debe fallar (y revertir)
  BEGIN
    UPDATE public.loans SET paid_amount = 10 WHERE id = v_loan;
    PERFORM public.save_loan(
      v_loan, v_client, NULL, 1000, 10, 3, 'monthly', CURRENT_DATE, CURRENT_DATE + 30,
      CURRENT_DATE + 90, 'french', false, NULL, 5, '', 402.11, 1206.34, 206.34, 1206.34,
      '[{"number":1,"due_date":"2026-11-16","amount":402.11,"capital":302.11,"interest":100,"balance":697.89}]'::jsonb
    );
    RAISE NOTICE 'ERROR: no bloqueó la edición con pagos';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'ok: bloqueó la edición con pagos -> %', SQLERRM;
  END;

  RAISE EXCEPTION 'ROLLBACK_DE_PRUEBA';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM = 'ROLLBACK_DE_PRUEBA' THEN
    RAISE NOTICE 'prueba terminada: se revierte todo';
  ELSE
    RAISE;
  END IF;
END $$;
`

const testRes = await query(test)
console.log('\nPRUEBA status:', testRes.status)
console.log(testRes.text || '(sin salida)')

const check = await query(
  `SELECT count(*) AS pruebas FROM public.loans WHERE loan_id LIKE 'TEST%';`,
)
console.log('\nResiduo de prueba (debe ser 0):', check.text)
