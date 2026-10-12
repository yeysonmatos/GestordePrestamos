import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const envFile = readFileSync("C:/Users/YMatos/Desktop/lovable-project-566a17d1/.env", "utf8");
const get = (k) => {
  const m = envFile.match(new RegExp(`^${k}=(.*)$`, "m"));
  return m ? m[1].trim().replace(/^"(.*)"$/, "$1") : null;
};
const URL = get("VITE_SUPABASE_URL");
const SERVICE = get("SUPABASE_SERVICE_ROLE_KEY");

const admin = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });

const tables = ["app_users", "audit_logs", "subscriptions", "plans", "subscription_payments", "platform_config"];
const { data, error } = await admin
  .from("pg_policies")
  .select("tablename, policyname, cmd, roles, qual, with_check");
if (error) {
  console.log("ERR", error.message);
  process.exit(1);
}
const rows = data ?? [];
for (const t of tables) {
  console.log(`\n=== ${t} ==="`);
  const m = rows.filter((r) => r.tablename === t);
  if (m.length === 0) { console.log("  (sin políticas)"); continue; }
  for (const p of m) {
    console.log(`  ${p.cmd} | ${String(p.qual ?? "")} | WC: ${String(p.with_check ?? "")}`.slice(0, 240));
  }
}