import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const envFile = readFileSync("C:/Users/YMatos/Desktop/GestordePrestamos/.env.local", "utf8");
const get = (k) => {
  const m = envFile.match(new RegExp(`^${k}=(.*)$`, "m"));
  return m ? m[1].trim() : null;
};
const URL = get("NEXT_PUBLIC_SUPABASE_URL");
const ANON = get("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const SERVICE = get("SUPABASE_SERVICE_ROLE_KEY");

if (!URL || !ANON || !SERVICE) {
  console.log("FALTAN claves en .env.local");
  process.exit(2);
}

const admin = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });
const user = createClient(URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } });

const email = `test-gp-${Date.now()}@example.com`;
const pass = "TestPass123!";
const results = [];
const check = (name, ok, extra = "") => {
  results.push(`${ok ? "OK  " : "FAIL"} ${name}${extra ? ` — ${extra}` : ""}`);
  if (!ok) process.exitCode = 1;
};

try {
  const { data: created, error: ce } = await admin.auth.admin.createUser({
    email,
    password: pass,
    email_confirm: true,
  });
  check("createUser (trigger crea app_users/settings/subscription)", !ce, ce?.message ?? "");
  const uid = created?.user?.id;
  if (!uid) throw new Error("sin uid");

  // 1. Login real (anon + RLS)
  const { error: le } = await user.auth.signInWithPassword({ email, password: pass });
  check("signInWithPassword (anon, RLS activa)", !le, le?.message ?? "");

  // 2. settings propio (hook useProfile)
  const { data: settings, error: se } = await user
    .from("settings")
    .select("*")
    .eq("user_id", uid)
    .maybeSingle();
  check("settings maybeSingle (useProfile)", !se && !!settings, se?.message ?? "sin fila");

  // 3. Posible UPDATE directo del trigger
  const idPrefix = settings?.loan_id_prefix || "P";
  const visibleId = `TEST${String(Date.now()).slice(-5)}`;

  // 4. clients insert (clients.new.tsx)
  const { data: client, error: ce2 } = await user
    .from("clients")
    .insert({
      user_id: uid,
      name: "Cliente Prueba",
      document: "000-0000000-0",
      phone: "8095551234",
      email: null,
      address: null,
      notes: "test",
      status: "inactive",
    })
    .select()
    .single();
  check("clients.insert (clients.new)", !ce2, ce2?.message ?? "");
  const clientId = client?.id;

  // 5. clients select + order by name (useClients)
  const { data: clients, error: ce3 } = await user
    .from("clients")
    .select("*")
    .order("name", { ascending: true });
  check("clients.select order name (useClients)", !ce3 && (clients ?? []).some((c) => c.name === "Cliente Prueba"), ce3?.message ?? "");

  // 6. loans insert (createLoan)
  const { data: loan, error: le2 } = await user
    .from("loans")
    .insert({
      user_id: uid,
      client_id: clientId,
      loan_id: visibleId,
      amount: 10000,
      interest_type: "percentage",
      interest_rate: 5,
      total_amount: 10500,
      total_interest: 500,
      installment_amount: 5250,
      installments: 2,
      frequency: "biweekly",
      start_date: new Date().toISOString().slice(0, 10),
      first_payment_date: new Date().toISOString().slice(0, 10),
      end_date: new Date().toISOString().slice(0, 10),
      amortization_type: "french",
      open_ended: false,
      status: "active",
      late_interest_rate: 5,
      notes: null,
      paid_amount: 0,
      remaining_amount: 10500,
      paid_installments: 0,
      progress: 0,
    })
    .select()
    .single();
  check("loans.insert (createLoan)", !le2, le2?.message ?? "");
  const loanId = loan?.id;
  check("loans.loan_id visible", loan?.loan_id === visibleId, loan?.loan_id ?? "");

  // 7. loans embed client (useLoans / useLoan)
  const { data: loans, error: le3 } = await user
    .from("loans")
    .select("*, client:clients(id, name, phone)")
    .order("created_at", { ascending: false });
  check("loans.select embed client (useLoans)", !le3 && (loans ?? []).some((l) => l.client?.name === "Cliente Prueba"), le3?.message ?? "");

  // 8. installments insert (createLoan schedule)
  const { error: ie } = await user.from("installments").insert([
    { loan_id: loanId, client_id: clientId, number: 1, due_date: "2026-10-20", amount: 5250, capital: 5000, interest: 250, balance: 5000, status: "pending" },
    { loan_id: loanId, client_id: clientId, number: 2, due_date: "2026-11-03", amount: 5250, capital: 5000, interest: 250, balance: 0, status: "pending" },
  ]);
  check("installments.insert (schedule)", !ie, ie?.message ?? "");

  // 9. installments embed loan+client (useAllInstallments)
  const { data: insts, error: ie2 } = await user
    .from("installments")
    .select(
      "*, loan:loans(id, status, late_interest_rate, frequency, amortization_type, open_ended, deleted_at, client:clients(id, name, phone))",
    )
    .order("due_date", { ascending: true });
  check(
    "installments.select embed loan (useAllInstallments)",
    !ie2 && (insts ?? []).some((i) => i.loan?.client?.name === "Cliente Prueba"),
    ie2?.message ?? "",
  );

  // 10. payments insert cuota (payInstallment)
  const { data: payment, error: pe } = await user
    .from("payments")
    .insert({
      user_id: uid,
      loan_id: loanId,
      installment_id: insts?.[0]?.id ?? null,
      client_id: clientId,
      amount: 5250,
      capital_amount: 5000,
      interest_amount: 250,
      late_amount: 0,
      type: "installment",
      payment_date: new Date().toISOString().slice(0, 10),
      method: "cash",
      notes: null,
      status: "paid",
    })
    .select()
    .single();
  check("payments.insert cuota (payInstallment)", !pe && !!payment, pe?.message ?? "");

  // 11. payments.insert abono a capital (payCapital)
  const { error: pe2 } = await user
    .from("payments")
    .insert({
      user_id: uid,
      loan_id: loanId,
      installment_id: null,
      client_id: clientId,
      amount: 2000,
      capital_amount: 2000,
      interest_amount: 0,
      late_amount: 0,
      type: "capital_abono",
      payment_date: new Date().toISOString().slice(0, 10),
      method: "transfer",
      notes: "abono",
      status: "paid",
    });
  check("payments.insert abono capital (payCapital)", !pe2, pe2?.message ?? "");

  // 12. installment update parcial/paid (payInstallment)
  const { error: iu } = await user.from("installments").update({
    paid_amount: 5250,
    paid_late_amount: 0,
    status: "paid",
    paid_at: new Date().toISOString().slice(0, 10),
  }).eq("id", insts?.[0]?.id);
  const { error: lu } = await user.from("loans").update({ paid_installments: 1, progress: 50 }).eq("id", loanId);
  check("installments/loans update (payInstallment)", !iu && !lu, `${iu?.message ?? ""} ${lu?.message ?? ""}`);

  // 13. update_client_stats rpc (Collections)
  const { error: rpcErr } = await user.rpc("update_client_stats", { p_client_id: clientId });
  check("rpc update_client_stats (Collections)", !rpcErr, rpcErr?.message ?? "");

  // 14. app_users propio (useIsAdmin)
  const { data: role, error: auErr } = await user.from("app_users").select("role").eq("id", uid).maybeSingle();
  check("app_users select propio + role (useIsAdmin)", !auErr && role?.role === "client", `${auErr?.message ?? ""} role=${role?.role ?? "?"}`);

  // 15. subscriptions propio (no-admin)
  const { data: mySub, error: subErr } = await user.from("subscriptions").select("*, plan:plans(name, price)").eq("user_id", uid).maybeSingle();
  check("subscriptions propio + embed plan", !subErr && mySub?.plan?.name, `${subErr?.message ?? ""} plan=${mySub?.plan?.name ?? "?"}`);

  // 16. Préstamo abierto (open_ended) — forma Fase 2
  const { data: oLoan, error: ole } = await user
    .from("loans")
    .insert({
      user_id: uid,
      client_id: clientId,
      loan_id: `OPEN${String(Date.now()).slice(-5)}`,
      amount: 50000,
      interest_type: "percentage",
      interest_rate: 4,
      total_amount: 50000,
      total_interest: 2000,
      installment_amount: 2000,
      installments: 0,
      frequency: "monthly",
      start_date: "2026-10-07",
      first_payment_date: "2026-11-07",
      end_date: null,
      amortization_type: "interest_only",
      open_ended: true,
      payment_day: 7,
      status: "active",
      late_interest_rate: 5,
      notes: "abierto",
      paid_amount: 0,
      remaining_amount: 50000,
      paid_installments: 0,
      progress: 0,
    })
    .select()
    .single();
  check("loans.insert open_ended", !ole && oLoan?.open_ended === true, ole?.message ?? "");

  const { data: oInst, count: oCount } = await user
    .from("installments")
    .select("id", { count: "exact" })
    .eq("loan_id", oLoan?.id);
  check("open_ended sin cuotas insertadas", !oInst?.length && oCount === 0, `count=${oCount}`);

  // 17. payments insert open-ended (cuota de interés)
  const { error: ope } = await user
    .from("payments")
    .insert({
      user_id: uid,
      loan_id: oLoan?.id,
      installment_id: null,
      client_id: clientId,
      amount: 2000,
      capital_amount: 0,
      interest_amount: 2000,
      late_amount: 0,
      type: "partial",
      payment_date: "2026-11-07",
      method: "cash",
      notes: "interés open-ended",
      status: "paid",
    });
  check("payments.insert open-ended (interés)", !ope, ope?.message ?? "");

  // 18. update open-ended (pagado en refresh)
  const { error: oue } = await user.from("loans").update({ paid_amount: 2000 }).eq("id", oLoan?.id);
  check("loans.update open_ended", !oue, oue?.message ?? "");

  const { count: oc1 } = await admin.from("loans").select("id", { count: "exact", head: true }).eq("user_id", uid).eq("open_ended", true);
  check("open_ended persistido (1 fila, 0 cuotas)", oc1 === 1, `loans=${oc1}`);

  // 17b. payments insert open-ended con type installment (payOpenInterest)
  const { error: ope2 } = await user
    .from("payments")
    .insert({
      user_id: uid,
      loan_id: oLoan?.id,
      installment_id: null,
      client_id: clientId,
      amount: 2000,
      capital_amount: 0,
      interest_amount: 2000,
      late_amount: 0,
      type: "installment",
      payment_date: "2026-12-07",
      method: "transfer",
      notes: "interés (payOpenInterest)",
      status: "paid",
    });
  check("payments.insert open-ended type installment (payOpenInterest)", !ope2, ope2?.message ?? "");

  // 20. useSubscription: subscriptions order+limit+single con embed plan (RLS propia)
  const { data: subRow, error: subErr2 } = await user
    .from("subscriptions")
    .select("status, starts_at, ends_at, plan:plans(name, price, billing_cycle)")
    .eq("user_id", uid)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  check("useSubscription (order+limit+single, embed plan)", !subErr2 && !!subRow?.plan, `${subErr2?.message ?? ""} plan=${subRow?.plan?.name ?? "?"}`);

  // 21. useSubscriptionPayments: subscription_payments select propio (RLS)
  const { error: sPe } = await user
    .from("subscription_payments")
    .select("id, amount, payment_date, method, notes, status")
    .eq("user_id", uid)
    .order("payment_date", { ascending: false });
  check("useSubscriptionPayments (select propio)", !sPe, sPe?.message ?? "");

  // 19. limpieza: borrar el usuario (cascade)
  const { error: dErr } = await admin.auth.admin.deleteUser(uid);
  check("deleteUser limpieza (cascade)", !dErr, dErr?.message ?? "");

  const { count: c1 } = await admin
    .from("clients")
    .select("id", { count: "exact", head: true })
    .eq("user_id", uid);
  const { count: c2 } = await admin.from("loans").select("id", { count: "exact", head: true }).eq("user_id", uid);
  const { count: c3 } = await admin
    .from("installments")
    .select("id", { count: "exact", head: true })
    .eq("client_id", clientId);
  const { count: c4 } = await admin.from("payments").select("id", { count: "exact", head: true }).eq("user_id", uid);
  check(
    "sin residuos tras borrado (clients/loans/installments/payments)",
    c1 === 0 && c2 === 0 && c3 === 0 && c4 === 0,
    `clients=${c1} loans=${c2} inst=${c3} pay=${c4}`,
  );
} catch (e) {
  check("excepción global", false, e instanceof Error ? e.message : String(e));
}

console.log("\n=== RESULTADOS ===");
for (const r of results) console.log(r);