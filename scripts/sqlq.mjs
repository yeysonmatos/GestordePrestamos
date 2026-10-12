const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const REF = "snwwvvmszizarakrozah";
const q = process.argv[2];
const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
  method: "POST",
  headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query: q }),
});
console.log(res.status, await res.text());
