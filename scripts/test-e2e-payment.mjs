// E2E transaccional: loan francesa semanal + RPC process_installment_payment.
// El DO termina en RAISE EXCEPTION -> la transaccion entera hace ROLLBACK (0 residuos)
// y el mensaje con las aserciones regresa en el error de la API. Tecnica usada en GP.
// Uso: node scripts/test-e2e-payment.mjs  (requiere SUPABASE_ACCESS_TOKEN en el entorno)
import { randomUUID } from "node:crypto";
import { buildSchedule, todaySD, daysBetween } from "../src/lib/finance.ts";

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const REF = "snwwvvmszizarakrozah";
if (!TOKEN) { console.error("Falta SUPABASE_ACCESS_TOKEN"); process.exit(1); }

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  return { ok: res.ok, text };
}

const pick = await sql("SELECT c.id AS client_id, c.user_id FROM clients c JOIN app_users u ON u.id = c.user_id WHERE u.role <> 'admin' ORDER BY c.created_at LIMIT 1");
const [{ client_id: CLIENT, user_id: USER }] = JSON.parse(pick.text);

const today = todaySD();
const first = (() => {
  const d = new Date();
  d.setDate(d.getDate() - 24);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santo_Domingo" }).format(d);
})();
const sched = buildSchedule({ principal: 10000, interestRate: 10, term: 4, frequency: "semanal", loanType: "cuota_fija", firstPaymentDate: first });
const [i1] = sched;
const LOAN = randomUUID();
const ids = sched.map(() => randomUUID());

const LATE_RATE = 2, GRACE = 3;
const late1 = Math.round(i1.total_amount * (LATE_RATE / 100) * Math.max(0, daysBetween(i1.due_date, today) - GRACE) * 100) / 100;
const total = sched.reduce((s, r) => s + r.total_amount, 0);
const totInt = sched.reduce((s, r) => s + r.interest_amount, 0);

const insertLoan = `INSERT INTO loans (id, user_id, client_id, loan_id, amount, interest_type, interest_rate, total_amount, total_interest, installment_amount, installments, frequency, start_date, first_payment_date, amortization_type, open_ended, status, late_interest_rate, paid_amount, remaining_amount, paid_installments, progress)
  VALUES ('${LOAN}'::uuid,'${USER}'::uuid,'${CLIENT}'::uuid,'E2E-${LOAN.slice(0, 6)}',10000,'percentage',10,${total},${totInt},${i1.total_amount},4,'weekly','${first}','${first}','french',false,'active',${LATE_RATE},0,${total},0,0);`;
const insertInsts = sched
  .map((r, k) => `INSERT INTO installments (id, loan_id, client_id, number, due_date, amount, capital, interest, balance, status, paid_amount)
  VALUES ('${ids[k]}'::uuid,'${LOAN}'::uuid,'${CLIENT}'::uuid,${r.number},'${r.due_date}',${r.total_amount},${r.principal_amount},${r.interest_amount},${r.balance},'pending',0);`)
  .join("\n");

const payA = `SELECT public.process_installment_payment(p_loan_id=>'${LOAN}'::uuid, p_installment_id=>'${ids[0]}'::uuid, p_user_id=>'${USER}'::uuid, p_amount=>${late1}, p_include_mora=>true, p_payment_date=>'${today}'::date, p_method=>'cash', p_notes=>'E2A solo alcanza la mora', p_late_interest_rate=>${LATE_RATE}, p_grace_days=>${GRACE}) INTO v_res;`;
const payB = `SELECT public.process_installment_payment(p_loan_id=>'${LOAN}'::uuid, p_installment_id=>'${ids[0]}'::uuid, p_user_id=>'${USER}'::uuid, p_amount=>${i1.total_amount}, p_include_mora=>false, p_payment_date=>'${today}'::date, p_method=>'cash', p_notes=>'E2B saldo de la cuota', p_late_interest_rate=>${LATE_RATE}, p_grace_days=>${GRACE}) INTO v_res2;`;

const query = `DO $do$
DECLARE
  v_res jsonb; v_res2 jsonb; v_status text; v_paid numeric; v_late numeric; v_n int; v_rem numeric; v_pai int; v_msg text := '';
BEGIN
  ${insertLoan}
  ${insertInsts}
  ${payA}
  SELECT status, paid_amount, paid_late_amount INTO v_status, v_paid, v_late FROM installments WHERE id='${ids[0]}'::uuid;
  SELECT remaining_amount, paid_installments INTO v_rem, v_pai FROM loans WHERE id='${LOAN}'::uuid;
  v_msg := v_msg || format('A[rpcOk=%s cuota_parcial status=%s paid=%s latePagada=%s loanRemaining=%s]', v_res->>'ok', v_status, v_paid, v_late, v_rem);
  ${payB}
  SELECT status, paid_amount INTO v_status, v_paid FROM installments WHERE id='${ids[0]}'::uuid;
  SELECT COUNT(*) INTO v_n FROM payments WHERE loan_id='${LOAN}'::uuid;
  SELECT paid_installments INTO v_pai FROM loans WHERE id='${LOAN}'::uuid;
  v_msg := v_msg || format(' | B[rpcOk=%s status=%s paid=%s pagos=%s cuotaPagadas=%s]', v_res2->>'ok', v_status, v_paid, v_n, v_pai);
  RAISE EXCEPTION 'E2E_ROLLBACK %', v_msg;
END $do$;`;

const run = await sql(query);
const m = run.text.match(/E2E_ROLLBACK (.+?)"/s);
console.log("Transaccion abortada (rollback):", run.ok === false ? "SI (como se esperaba)" : "NO — CUIDADO");
console.log("Resultado E2E:", m ? m[1].trim() : run.text.slice(0, 500));

const after = await sql(`SELECT COUNT(*)::int AS residuos FROM loans WHERE id='${LOAN}'::uuid`);
console.log("Residuos despues del rollback:", after.text);
