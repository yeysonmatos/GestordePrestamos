import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const envFile = readFileSync("C:/Users/YMatos/Desktop/lovable-project-566a17d1/.env", "utf8");
const get = (k) => {
  const m = envFile.match(new RegExp(`^${k}=(.*)$`, "m"));
  return m ? m[1].trim().replace(/^"(.*)"$/, "$1") : null;
};
const URL = get("VITE_SUPABASE_URL");
const ANON = get("VITE_SUPABASE_PUBLISHABLE_KEY");
const SERVICE = get("SUPABASE_SERVICE_ROLE_KEY");

const svc = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });
const res = [];
const check = (name, ok, extra = "") => {
  res.push(`${ok ? "OK  " : "FAIL"} ${name}${extra ? ` — ${extra}` : ""}`);
  if (!ok) process.exitCode = 1;
};

const emailA = `admin-test-${Date.now()}@example.com`;
const emailB = `user-test-${Date.now()}@example.com`;
const pass = "TestPass123!";

try {
  const { data: a } = await svc.auth.admin.createUser({ email: emailA, password: pass, email_confirm: true });
  const { data: b } = await svc.auth.admin.createUser({ email: emailB, password: pass, email_confirm: true });
  const uidA = a?.user?.id;
  const uidB = b?.user?.id;
  if (!uidA || !uidB) throw new Error("sin uids");

  const clientA = createClient(URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } });
  const clientB = createClient(URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error: le1 } = await clientA.auth.signInWithPassword({ email: emailA, password: pass });
  const { error: le2 } = await clientB.auth.signInWithPassword({ email: emailB, password: pass });
  check("login A/B", !le1 && !le2, `${le1?.message ?? ""} ${le2?.message ?? ""}`);

  // A no es admin aún
  const { data: rA0 } = await clientA.from("app_users").select("role").eq("id", uidA).maybeSingle();
  check("A empieza role client", rA0?.role !== "admin", `role=${rA0?.role}`);

  // A no ve sub de B
  const { data: subsB } = await clientA.from("subscriptions").select("id").eq("user_id", uidB);
  check("A no ve subs de B", (subsB ?? []).length === 0, `count=${subsB?.length}`);

  // Promover A a admin
  const { error: au } = await svc.from("app_users").update({ role: "admin" }).eq("id", uidA);
  check("service_role promueve a admin", !au, au?.message ?? "");
  const { data: rA1 } = await clientA.from("app_users").select("role").eq("id", uidA).maybeSingle();
  check("A es admin ahora", rA1?.role === "admin", `role=${rA1?.role}`);

  // === Admin: lecturas globales ===
  const { data: allSubs, error: e1 } = await clientA.from("subscriptions").select("id, user_id, status, plan:plans(name, price)");
  check("admin lee subscriptions global", !e1 && (allSubs ?? []).some((s) => s.user_id === uidB), `${e1?.message ?? ""} count=${allSubs?.length}`);

  const { data: allPlans, error: e2 } = await clientA.from("plans").select("id, name, price, is_active");
  check("admin lee plans (todos)", !e2 && (allPlans ?? []).length >= 3, `${e2?.message ?? ""} count=${allPlans?.length}`);

  const { data: allPay, error: e3 } = await clientA.from("subscription_payments").select("id, user_id, status");
  check("admin lee subscription_payments global", !e3, `${e3?.message ?? ""} count=${allPay?.length}`);

  const { data: allAudit, error: e4 } = await clientA.from("audit_logs").select("id, user_id");
  check("admin lee audit_logs global", !e4, `${e4?.message ?? ""} count=${allAudit?.length}`);

  const { data: allUsers, error: e5 } = await clientA.from("app_users").select("id, role, status");
  check("admin lee app_users global", !e5 && (allUsers ?? []).some((u) => u.id === uidB), `${e5?.message ?? ""}`);

  // bloqueado?: B ve su sub, A también (para neutralizar bloqueo)
  const { data: subB, error: sbe } = await clientA.from("subscriptions").select("id").eq("user_id", uidB).maybeSingle();
  check("sub de B existe", !sbe && !!subB, `${sbe?.message ?? ""}`);

  // === Admin: bloquear/desbloquear app_users ===
  const { error: b1 } = await clientA.from("app_users").update({ status: "blocked" }).eq("id", uidB);
  check("admin bloquea a B (app_users.status)", !b1, b1?.message ?? "");

  // === Admin: planes CRUD (update precio, create plan, borrar lógico) ===
  const { data: planRow, error: pe } = await clientA.from("plans").select("id, name, price").ilike("name", "Pro").maybeSingle();
  check("admin lee plan Pro", !pe && !!planRow, `${pe?.message ?? ""}`);
  const { error: up } = await clientA.from("plans").update({ price: 1199 }).eq("id", planRow?.id);
  check("admin edita plan", !up, up?.message ?? "");
  const { data: newPlan, error: npe } = await clientA
    .from("plans")
    .insert({ name: `PlanTest-${Date.now()}`, price: 0, is_active: false, billing_cycle: "monthly", currency: "DOP" })
    .select("id")
    .single();
  check("admin crea plan", !npe && !!newPlan, `${npe?.message ?? ""}`);

  // === Admin: registrar pago y confirmar (subscription_payments) ===
  const { error: spErr } = await clientA
    .from("subscription_payments")
    .insert({
      user_id: uidB,
      subscription_id: subB?.id,
      amount: 1199,
      method: "transfer",
      payment_date: new Date().toISOString().slice(0, 10),
      status: "pending",
      notes: "test",
      target_plan_id: planRow?.id ?? null,
    })
    .select()
    .single();
  check("admin registra subscription_payment (pending)", !spErr, spErr?.message ?? "");

  const { data: spRow, error: spGet } = await clientA
    .from("subscription_payments")
    .select("id")
    .eq("user_id", uidB)
    .eq("status", "pending")
    .maybeSingle();
  check("admin ve el pago pending de B", !spGet && !!spRow, `${spGet?.message ?? ""}`);

  const { error: spUpd } = await clientA
    .from("subscription_payments")
    .update({ status: "confirmed" })
    .eq("id", spRow?.id);
  check("admin confirma subscription_payment", !spUpd, spUpd?.message ?? "");

  // === Admin: insertar audit_logs ===
  const { error: auErr } = await clientA.from("audit_logs").insert({
    user_id: uidB,
    action: "subscription.payment_registered",
    entity_type: "subscription",
    entity_id: subB?.id,
    details: { amount: 1199, mode: "test" },
  });
  check("admin inserta audit_log", !auErr, auErr?.message ?? "");

  // === Usuario B NO puede ver la auditoría de otros ===
  const { data: audB } = await clientB.from("audit_logs").select("id").eq("user_id", uidA);
  check("B no ve audit de A", (audB ?? []).length === 0, `count=${audB?.length}`);

  const { error: del } = await svc.auth.admin.deleteUser(uidA);
  const { error: del2 } = await svc.auth.admin.deleteUser(uidB);
  check("cleanup users", !del && !del2, `${del?.message ?? ""} ${del2?.message ?? ""}`);
} catch (e) {
  check("excepción global", false, e instanceof Error ? e.message : String(e));
}

console.log("\n=== PERMISOS ADMIN ===");
for (const r of res) console.log(r);