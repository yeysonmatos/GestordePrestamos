// Ejecuta supabase/plan-max-loans.sql contra la BD (Management API).
// Uso:  $env:SUPABASE_ACCESS_TOKEN="sbp_..." ; node scripts/exec-plan-max-loans.mjs
import { readFileSync } from "node:fs";

const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const REF = "snwwvvmszizarakrozah";

if (!ACCESS_TOKEN) {
  console.error("Falta SUPABASE_ACCESS_TOKEN en el entorno.");
  process.exit(1);
}

const sql = readFileSync(new URL("../supabase/plan-max-loans.sql", import.meta.url), "utf-8").trim();

const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${ACCESS_TOKEN}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ query: sql }),
});
const text = await res.text();
console.log("Status:", res.status);
if (res.ok) {
  console.log(text ? text : "(sin salida - OK)");
} else {
  console.log(text);
  process.exit(1);
}
