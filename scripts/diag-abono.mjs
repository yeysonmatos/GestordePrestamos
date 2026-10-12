// Diagnostico: reparto de pagos parciales + abono en francesa (usuario efimero, limpia todo).
import { readFileSync } from "node:fs";
for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
const { createClient } = await import("@supabase/supabase-js");
const ADMIN = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { supabase } = await import("@/integrations/supabase/client");
const actions = await import("@/lib/actions");
const finance = await import("@/lib/finance");

const TS = Date.now();
const EMAIL = `diag-${TS}@gp-test.local`;
const PASS = "Diag!" + TS;
let USER;
try {
  USER = (await ADMIN.auth.admin.createUser({ email: EMAIL, password: PASS, email_confirm: true })).data.user.id;
  await supabase.auth.signInWithPassword({ email: EMAIL, password: PASS });
  const CLIENT = (await supabase.from("clients").insert({ user_id: USER, name: "DIAG", phone: "8090000000", status: "active" }).select("id").single()).data.id;
  const today = finance.todaySD();
  const L = await actions.createLoan({ client_id: CLIENT, principal: 6000, interest_rate: 10, term: 4, frequency: "mensual", loan_type: "cuota_fija", start_date: today, first_payment_date: finance.addPeriods(today, "mensual", 1), late_fee_rate: 2 });
  const insts = (await supabase.from("installments").select("*").eq("loan_id", L.id).order("number")).data;
  console.log("Cuotas creadas:", insts.map((r) => `#${r.number} amt=${r.amount} cap=${r.capital} int=${r.interest} bal=${r.balance}`).join(" | "));

  await actions.payInstallment({ loanId: L.id, installmentId: insts[0].id, amount: 1892.82, includeMora: false, method: "efectivo", lateInterestRate: 2, graceDays: 3 });
  await actions.payInstallment({ loanId: L.id, installmentId: insts[1].id, amount: 900, includeMora: false, method: "efectivo", lateInterestRate: 2, graceDays: 3 });
  await actions.payInstallment({ loanId: L.id, installmentId: insts[1].id, amount: 992.82, includeMora: false, method: "efectivo", lateInterestRate: 2, graceDays: 3 });
  let ps = (await supabase.from("payments").select("amount,capital_amount,interest_amount,late_amount,installment_id").eq("loan_id", L.id).order("created_at")).data;
  console.log("Pagos cuota1-2:", ps.map((p) => `amt=${p.amount} cap=${p.capital_amount} int=${p.interest_amount} late=${p.late_amount}`).join(" | "));
  const capPagado = ps.reduce((s, p) => s + Number(p.capital_amount), 0);
  console.log("Σ capital_amount:", capPagado.toFixed(2), "| teorico: 1292.82 + 1422.10 =", (1292.82 + 1422.1).toFixed(2));

  const row = (await supabase.from("loans").select("*").eq("id", L.id).maybeSingle()).data;
  const { toLoan } = await import("@/lib/db");
  await actions.payCapital({ loan: toLoan(row), amount: 2000, note: "abono" });
  const insts2 = (await supabase.from("installments").select("*").eq("loan_id", L.id).order("number")).data;
  console.log("Tras abono 2000:", insts2.map((r) => `#${r.number} ${r.status} amt=${r.amount} cap=${r.capital} int=${r.interest} bal=${r.balance}`).join(" | "));
  const capRecalc = Number(insts2[2].capital) + Number(insts2[3].capital);
  console.log("Σ capital cuotas restantes:", capRecalc.toFixed(2), "| esperado:", (6000 - capPagado - 2000).toFixed(2));
  const loan2 = (await supabase.from("loans").select("remaining_amount,total_interest,total_amount,installment_amount").eq("id", L.id).maybeSingle()).data;
  console.log("Loan tras abono:", JSON.stringify(loan2));
} finally {
  if (USER) {
    const loanIds = (await supabase.from("loans").select("id").eq("user_id", USER)).data?.map((x) => x.id) ?? [];
    if (loanIds.length) {
      await ADMIN.from("payments").delete().in("loan_id", loanIds);
      await ADMIN.from("installments").delete().in("loan_id", loanIds);
    }
    for (const t of ["loans", "clients", "settings"]) await ADMIN.from(t).delete().eq("user_id", USER);
    const subs = (await ADMIN.from("subscriptions").select("id").eq("user_id", USER)).data ?? [];
    if (subs.length) await ADMIN.from("subscription_payments").delete().in("subscription_id", subs.map((s) => s.id));
    await ADMIN.from("subscriptions").delete().eq("user_id", USER);
    await ADMIN.from("app_users").delete().eq("id", USER);
    await ADMIN.auth.admin.deleteUser(USER);
  }
  console.log("Cleanup hecho.");
}
