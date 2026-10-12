import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { existsSync } from "node:fs";

const SRC = new URL("../src/", import.meta.url);

function tryExts(u) {
  const p = fileURLToPath(u);
  for (const ext of ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]) {
    const cand = p + ext;
    if (existsSync(cand) && !cand.endsWith(".")) return cand;
    if (ext === "" && existsSync(p) && !p.endsWith(".ts")) continue;
  }
  if (existsSync(p)) return p;
  return null;
}

export async function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) {
    const base = new URL(specifier.slice(2), SRC);
    const hit = tryExts(base);
    if (hit) return { url: pathToFileURL(hit).href, format: hit.endsWith(".tsx") ? "module-typescript" : hit.endsWith(".ts") ? "module-typescript" : undefined, shortCircuit: true };
  }
  if (context.parentURL && context.parentURL.startsWith(SRC.href) && specifier.startsWith(".")) {
    const target = new URL(specifier, context.parentURL);
    const hit = tryExts(target);
    if (hit) return { url: pathToFileURL(hit).href, format: hit.endsWith(".ts") || hit.endsWith(".tsx") ? "module-typescript" : undefined, shortCircuit: true };
  }
  return next(specifier, context);
}

export async function load(url, context, next) {
  if (url.startsWith(SRC.href) && url.endsWith(".ts")) {
    let src = await readFile(fileURLToPath(url), "utf8");
    src = src.replaceAll("import.meta.env", "process.env");
    return { format: "module-typescript", source: src, shortCircuit: true };
  }
  return next(url, context);
}
