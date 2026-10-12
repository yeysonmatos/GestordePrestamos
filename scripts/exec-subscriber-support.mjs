// Ejecuta supabase/subscriber-support.sql via Management API.
import { readFileSync } from "node:fs";

const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const REF = "snwwvvmszizarakrozah";
if (!ACCESS_TOKEN) {
  console.error("Falta SUPABASE_ACCESS_TOKEN.");
  process.exit(1);
}
const sql = readFileSync(new URL("../supabase/subscriber-support.sql", import.meta.url), "utf-8").trim();
const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
  method: "POST",
  headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query: sql }),
});
const text = await res.text();
console.log("Status:", res.status, text ? text.slice(0, 200) : "(OK)");
if (!res.ok) process.exit(1);
