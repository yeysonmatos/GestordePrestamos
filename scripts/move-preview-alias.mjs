// Mueve el alias estable gp-preview-rd.vercel.app al ultimo deploy READY del proyecto.
// Uso: node scripts/move-preview-alias.mjs   (tras `npx vercel --yes`)
import { readFileSync } from "node:fs";

const auth = JSON.parse(readFileSync(process.env.APPDATA + "/com.vercel.cli/Data/auth.json", "utf8"));
const TEAM = "team_b8SrUibEbBLqwGZX0KKw2rbR";
const PROJECT = "prj_99QywdvnGDDcn4cfiMAePxutpTxC";
const ALIAS = "gp-preview-rd.vercel.app";

const res = await fetch(`https://api.vercel.com/v6/deployments?teamId=${TEAM}&projectId=${PROJECT}&limit=15`, {
  headers: { Authorization: `Bearer ${auth.token}` },
});
const deps = (await res.json()).deployments.filter((d) => d.readyState === "READY" && d.source === "cli");
if (!deps.length) { console.error("No hay deploy READY de CLI aun"); process.exit(1); }
const latest = deps[0];
if (latest.alias?.includes(ALIAS)) { console.log("Alias ya apunta a", latest.url); process.exit(0); }
const post = await fetch(`https://api.vercel.com/v2/deployments/${latest.uid}/aliases?teamId=${TEAM}`, {
  method: "POST",
  headers: { Authorization: `Bearer ${auth.token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ alias: ALIAS }),
});
console.log("alias ->", latest.url, "| HTTP", post.status, (await post.text()).slice(0, 120));
