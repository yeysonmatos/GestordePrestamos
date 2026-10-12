// Siembra 12 prestamos de prueba (3 tipos x 4 frecuencias) en el cliente TEST,
// con vencimientos futuros para validar la logica en pantalla sin mora inicial.
// Uso: node scripts/seed-scenario-tests.mjs   (requiere SUPABASE_ACCESS_TOKEN en el entorno)
import { randomUUID } from "node:crypto";
import { buildSchedule, addPeriods, todaySD, periodicRatePct } from "../src/lib/finance.ts";

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
  if (!res.ok) throw new Error(text.slice(0, 300));
  return text;
}

const USER = JSON.parse(await sql("SELECT u.id AS user_id FROM app_users u WHERE u.role <> 'admin' ORDER BY u.created_at LIMIT 1"))[0].user_id;

let rows = JSON.parse(await sql(`SELECT id FROM clients WHERE user_id='${USER}'::uuid AND name='TEST LOGICA (no borrar)' LIMIT 1`));
const CLIENT = rows[0]?.id ?? JSON.parse(await sql(`INSERT INTO clients (user_id,name,phone,status) VALUES ('${USER}'::uuid,'TEST LOGICA (no borrar)','8095550000','active') RETURNING id`))[0].id;

const today = todaySD();
const P = 6000, RATE = 10, TERM = 4;
const FREQS = [["diaria", "D"], ["semanal", "S"], ["quincenal", "Q"], ["mensual", "M"]];
const TYPES = [
  ["cuota_fija", "CF", "french", false],
  ["solo_interes", "SI", "interest_only", false],
  ["solo_interes", "SA", "interest_only", true],
];

const r2 = (n) => Math.round(n * 100) / 100;
const summary = [];
for (const [freq, FL] of FREQS) {
  for (const [loanType, TL, amort, open] of TYPES) {
    const first = addPeriods(today, freq, 1);
    const LOAN = randomUUID();
    const loanId = `TST-${TL}${FL}`;
    let sched, total, totInt, installment;
    if (open) {
      sched = [];
      total = P; totInt = 0;
      installment = r2(P * periodicRatePct(RATE, freq));
    } else {
      sched = buildSchedule({ principal: P, interestRate: RATE, term: TERM, frequency: freq, loanType, firstPaymentDate: first });
      total = r2(sched.reduce((s, x) => s + x.total_amount, 0));
      totInt = r2(sched.reduce((s, x) => s + x.interest_amount, 0));
      installment = sched[0].total_amount;
    }
    await sql(`INSERT INTO loans (id,user_id,client_id,loan_id,amount,interest_type,interest_rate,total_amount,total_interest,installment_amount,installments,frequency,start_date,first_payment_date,amortization_type,open_ended,status,late_interest_rate,paid_amount,remaining_amount,paid_installments,progress)
      VALUES ('${LOAN}'::uuid,'${USER}'::uuid,'${CLIENT}'::uuid,'${loanId}',${P},'percentage',${RATE},${total},${totInt},${installment},${open ? 0 : TERM},'${freq === "quincenal" ? "biweekly" : freq === "mensual" ? "monthly" : freq === "semanal" ? "weekly" : "daily"}','${today}','${first}','${amort}',${open},'active',2,0,${total},0,0);`);
    if (!open) {
      const insts = sched.map((x) => `('${randomUUID()}'::uuid,'${LOAN}'::uuid,'${CLIENT}'::uuid,${x.number},'${x.due_date}',${x.total_amount},${x.principal_amount},${x.interest_amount},${x.balance},'pending',0)`).join(",");
      await sql(`INSERT INTO installments (id,loan_id,client_id,number,due_date,amount,capital,interest,balance,status,paid_amount) VALUES ${insts};`);
    }
    summary.push(`${loanId} · ${freq} · cuota ${installment} · vence ${first}${open ? " (abierto)" : ` · total ${total}`}`);
  }
}
await sql(`SELECT public.update_client_stats('${CLIENT}'::uuid);`);
console.log(`Cliente TEST: ${CLIENT}\nUsuario: ${USER}\nHoy: ${today}\n` + summary.join("\n"));
console.log("Listo: 12 prestamos creados (TST-*).");
