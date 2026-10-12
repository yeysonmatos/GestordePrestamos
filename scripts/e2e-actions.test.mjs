// E2E con la logica REAL de la app (src/lib/actions.ts) como usuario autenticado.
// Crea un usuario desechable, corre 4 escenarios (francesa, mora, solo-interes, abierto)
// con ~25 aserciones y limpia TODOS los residuos al final.
// Uso: node --import ./scripts/e2e-register.mjs scripts/e2e-actions.test.mjs
import { readFileSync } from "node:fs";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}

const { createClient } = await import("@supabase/supabase-js");
const URL_ = process.env.SUPABASE_URL;
const ADMIN = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const TS = Date.now();
const EMAIL = `e2e-${TS}@gp-test.local`;
const PASS = "E2e-Test!" + TS;

const { supabase } = await import("@/integrations/supabase/client");
const actions = await import("@/lib/actions");
const finance = await import("@/lib/finance");

let pass = 0, fail = 0;
const chk = (name, cond, extra = "") => {
  if (cond) { pass++; console.log("PASS " + name); }
  else { fail++; console.log("FAIL " + name + (extra ? "  [" + extra + "]" : "")); }
};
const near = (a, b, tol = 1) => Math.abs(a - b) <= tol;
const getLoan = async (id) => (await supabase.from("loans").select("*").eq("id", id).maybeSingle()).data;
const getInsts = async (id) => (await supabase.from("installments").select("*").eq("loan_id", id).order("number")).data ?? [];
const pays = async (id) => (await supabase.from("payments").select("*").eq("loan_id", id).order("created_at")).data ?? [];

const userId = process.env.__E2E_USER ?? null;
let USER, CLIENT;
try {
  const created = await ADMIN.auth.admin.createUser({ email: EMAIL, password: PASS, email_confirm: true });
  USER = created.data.user.id;
  const si = await supabase.auth.signInWithPassword({ email: EMAIL, password: PASS });
  if (si.error) throw si.error;
  console.log("Usuario efimero:", USER);

  const cl = await supabase.from("clients").insert({ user_id: USER, name: "CLIENTE E2E", phone: "8095551234", status: "active" }).select("id").single();
  if (cl.error) throw new Error(cl.error.message);
  CLIENT = cl.data.id;
  const today = finance.todaySD();

  // ============ Loan A: francesa mensual limpia ============
  const A = await actions.createLoan({ client_id: CLIENT, principal: 6000, interest_rate: 10, term: 4, frequency: "mensual", loan_type: "cuota_fija", start_date: today, first_payment_date: finance.addPeriods(today, "mensual", 1), late_fee_rate: 2 });
  let instsA = await getInsts(A.id);
  chk("A1 crear francesa: 4 cuotas", instsA.length === 4);
  chk("A1 cuota 1892.82", near(instsA[0].amount, 1892.82), String(instsA[0].amount));
  chk("A1 desglose #1 int 600 / cap 1292.82", near(instsA[0].interest, 600) && near(instsA[0].capital, 1292.82));
  chk("A1 fechas +1 mes", instsA[1].due_date === finance.addPeriods(today, "mensual", 2));

  const i2 = instsA[1];
  let threw = false;
  try { await actions.payInstallment({ loanId: A.id, installmentId: i2.id, amount: 1892.82, includeMora: false, method: "efectivo", lateInterestRate: 2, graceDays: 3 }); }
  catch { threw = true; }
  chk("A2 guarda de orden: no se puede saltar la cuota 1", threw);

  const p1 = await actions.payInstallment({ loanId: A.id, installmentId: instsA[0].id, amount: 1892.82, includeMora: false, method: "efectivo", lateInterestRate: 2, graceDays: 3 });
  instsA = await getInsts(A.id);
  chk("A3 pago completo #1 -> paid", instsA[0].status === "paid");
  chk("A3 allocation cap/int 1292.82/600", near(p1.payment.capital_amount, 1292.82) && near(p1.payment.interest_amount, 600));
  let loanA = await getLoan(A.id);
  chk("A3 loan paid_installments=1 progress=25", loanA.paid_installments === 1 && loanA.progress === 25, `${loanA.paid_installments}/${loanA.progress}`);
  chk("A3 remaining = suma no pagadas", near(loanA.remaining_amount, 1892.82 * 3), String(loanA.remaining_amount));

  await actions.payInstallment({ loanId: A.id, installmentId: instsA[1].id, amount: 900, includeMora: false, method: "efectivo", lateInterestRate: 2, graceDays: 3 });
  instsA = await getInsts(A.id);
  chk("A4 pago parcial -> partial paid_amount 900", instsA[1].status === "partial" && near(instsA[1].paid_amount, 900), `${instsA[1].status}/${instsA[1].paid_amount}`);
  await actions.payInstallment({ loanId: A.id, installmentId: instsA[1].id, amount: 992.82, includeMora: false, method: "efectivo", lateInterestRate: 2, graceDays: 3 });
  instsA = await getInsts(A.id);
  chk("A4 completar parcial -> paid", instsA[1].status === "paid");

  const beforeAbono = (await getInsts(A.id)).map((r) => r.due_date).join(",");
  await actions.payCapital({ loan: await toLoanFresh(A.id), amount: 2000, note: "abono E2E" });
  instsA = await getInsts(A.id);
  chk("A6 abono: cuota pendiente BAJA", instsA[2].amount < 1892.82, String(instsA[2].amount));
  chk("A6 abono: fechas y cantidad de cuotas no cambian", instsA.length === 4 && instsA.map((r) => r.due_date).join(",") === beforeAbono);
  chk("A6 abono: Σ capital de cuotas restantes = principal - capitals pagados - abono", near(instsA[2].capital + instsA[3].capital, 6000 - 1292.82 - 1422.1 - 2000, 1.5), String(instsA[2].capital + instsA[3].capital));

  const lastPays = await pays(A.id);
  const abonoPay = lastPays.filter((p) => p.type === "capital_abono").pop();
  await actions.reversePayment({ paymentId: abonoPay.id, reason: "test" });
  instsA = await getInsts(A.id);
  chk("A7 revertir abono restaura cuota 1892.82", near(instsA[2].amount, 1892.82), String(instsA[2].amount));

  const p3 = await actions.payInstallment({ loanId: A.id, installmentId: instsA[2].id, amount: 1892.82, includeMora: false, method: "efectivo", lateInterestRate: 2, graceDays: 3 });
  await actions.reversePayment({ paymentId: p3.payment.id, reason: "test" });
  instsA = await getInsts(A.id);
  loanA = await getLoan(A.id);
  chk("A8 revertir pago de cuota -> pending y contador baja", instsA[2].status === "pending" && loanA.paid_installments === 2, `${instsA[2].status}/${loanA.paid_installments}`);

  threw = false;
  try { await actions.reversePayment({ paymentId: p1.payment.id, reason: "no deberia poder" }); }
  catch (e) { threw = /ltimo pago/.test(String(e.message)); }
  chk("A9 solo se reversiona el ULTIMO pago", threw);

  // ============ Loan B: mora ============
  const dueBack = finance.addPeriods(today, "mensual", -1); // vencida hace ~30 dias
  const B = await actions.createLoan({ client_id: CLIENT, principal: 6000, interest_rate: 10, term: 4, frequency: "mensual", loan_type: "cuota_fija", start_date: finance.addPeriods(dueBack, "mensual", -1), first_payment_date: dueBack, late_fee_rate: 2 });
  let instsB = await getInsts(B.id);
  let loanB = await getLoan(B.id);
  chk("B1 loan con cuota vencida se pinta late_*", String(loanB.status).startsWith("late"), loanB.status);
  const late = finance.lateFee({ dueDate: instsB[0].due_date, pending: Number(instsB[0].amount), lateFeeRate: 2, graceDays: 3 });
  chk("B1 mora > 0 (2%/dia tras 3 de gracia)", late > 200, String(late));
  const pb = await actions.payInstallment({ loanId: B.id, installmentId: instsB[0].id, amount: Number(instsB[0].amount) + late, includeMora: true, method: "efectivo", lateInterestRate: 2, graceDays: 3 });
  instsB = await getInsts(B.id);
  chk("B2 pago con mora: payment.late_amount coincide", near(pb.payment.late_amount, late, 1), `${pb.payment.late_amount} vs ${late}`);
  chk("B2 cuota paid tras cubrir mora+cuota", instsB[0].status === "paid");

  // ============ Loan C: solointeres cerrado ============
  const C = await actions.createLoan({ client_id: CLIENT, principal: 6000, interest_rate: 10, term: 4, frequency: "mensual", loan_type: "solo_interes", start_date: today, first_payment_date: finance.addPeriods(today, "mensual", 1), late_fee_rate: 2 });
  const instsC = await getInsts(C.id);
  chk("C1 crear solo-interes: 3 de interes 600 + ultima 6600", instsC.slice(0, 3).every((r) => near(r.amount, 600) && near(r.capital, 0)) && near(instsC[3].amount, 6600) && near(instsC[3].capital, 6000));
  const pc = await actions.payInstallment({ loanId: C.id, installmentId: instsC[0].id, amount: 600, includeMora: false, method: "efectivo", lateInterestRate: 2, graceDays: 3 });
  let loanC = await getLoan(C.id);
  chk("C2 pago de interes: capital 0, capital pendiente sigue 6000", near(pc.payment.capital_amount, 0) && near(loanC.remaining_amount, 6000), `${pc.payment.capital_amount}/${loanC.remaining_amount}`);
  await actions.payCapital({ loan: await toLoanFresh(C.id), amount: 1000, note: "abono SI" });
  const instsC2 = await getInsts(C.id);
  chk("C3 abono recalcula interes: cuotas pendientes a 500", near(instsC2[1].amount, 500) && near(instsC2[2].amount, 500), `${instsC2[1].amount}/${instsC2[2].amount}`);
  chk("C3 ultima = 500 + 5000 = 5500", near(instsC2[3].amount, 5500), String(instsC2[3].amount));

  await actions.settleLoan({ loan: await toLoanFresh(C.id), total: 6500, interest: 1500, late: 0, note: "liq E2E" });
  const loanC2 = await getLoan(C.id);
  const instsC3 = await getInsts(C.id);
  chk("C4 liquidacion cierra prestamo (paid)", loanC2.status === "paid", loanC2.status);
  chk("C4 todas las cuotas quedan pagadas", instsC3.every((r) => r.status === "paid"));

  // ============ Loan D: abierto ============
  const D = await actions.createLoan({ client_id: CLIENT, principal: 6000, interest_rate: 10, term: 0, frequency: "mensual", loan_type: "solo_interes", open_ended: true, start_date: today, first_payment_date: finance.addPeriods(today, "mensual", 1), late_fee_rate: 2 });
  chk("D1 abierto: sin cuotas, installment_amount = 600", (await getInsts(D.id)).length === 0 && near((await getLoan(D.id)).installment_amount, 600));
  await actions.payOpenInterest({ loan: await toLoanFresh(D.id), amount: 600, method: "efectivo", note: "interes abierto" });
  const paysD = await pays(D.id);
  chk("D2 cobro de interes abierto registrado (int 600 cap 0)", near(paysD[0].interest_amount, 600) && near(paysD[0].capital_amount, 0));
  await actions.payCapital({ loan: await toLoanFresh(D.id), amount: 2000, note: "abono abierto" });
  let loanD = await getLoan(D.id);
  chk("D3 abono en abierto: remaining 4000, cuota 400", near(loanD.remaining_amount, 4000) && near(loanD.installment_amount, 400), `${loanD.remaining_amount}/${loanD.installment_amount}`);
  await actions.settleLoan({ loan: await toLoanFresh(D.id), total: 4000, interest: 0, late: 0, note: "liq abierto" });
  loanD = await getLoan(D.id);
  chk("D4 liquidacion de abierto deja status=paid", loanD.status === "paid", `status=${loanD.status} (refreshLoanStatus lo revierte a active)`);

  // ============ Stats / identidad contable ============
  const { data: stats } = await supabase.rpc("get_loan_stats", { p_user_id: USER });
  if (stats) {
    const t = Number(stats.total_capital), r = Number(stats.recovered_capital), p = Number(stats.pending_capital);
    chk("S1 identidad Prestado = Recuperado + Pendiente", near(t, r + p, 1), `${t} vs ${r}+${p}`);
  } else chk("S1 get_loan_stats responde", false);

  await actions.archiveLoan(A.id, true);
  const loanAarch = await getLoan(A.id);
  chk("X1 archivar: deleted_at + cancelled", Boolean(loanAarch.deleted_at) && loanAarch.status === "cancelled");
  chk("X1 pagos del archivado sobreviven", (await pays(A.id)).length > 0);
} catch (e) {
  fail++; console.log("ERROR FATAL:", e.message);
} finally {
  if (USER) {
    for (const t of ["payments", "installments"]) {
      await ADMIN.from(t).delete().in("loan_id", (await ADMIN.from("loans").select("id").eq("user_id", USER)).data?.map((x) => x.id) ?? ["00000000-0000-0000-0000-000000000000"]);
    }
    for (const t of ["loans", "clients", "settings"]) await ADMIN.from(t).delete().eq("user_id", USER);
    const subs = (await ADMIN.from("subscriptions").select("id").eq("user_id", USER)).data ?? [];
    if (subs.length) await ADMIN.from("subscription_payments").delete().in("subscription_id", subs.map((s) => s.id));
    await ADMIN.from("subscriptions").delete().eq("user_id", USER);
    await ADMIN.from("app_users").delete().eq("id", USER);
    await ADMIN.auth.admin.deleteUser(USER);
  }
  const still = await ADMIN.from("loans").select("id", { count: "exact", head: true }).eq("user_id", USER ?? "00000000-0000-0000-0000-000000000000");
  console.log("Residuos loans del efimero:", still.count ?? 0);
  await supabase.auth.signOut();
}

async function toLoanFresh(id) {
  const row = await getLoan(id);
  const { toLoan } = await import("@/lib/db");
  return toLoan(row);
}
console.log(`\n${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);
