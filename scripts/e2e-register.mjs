// Loader Node: resuelve '@/x' -> src/x.ts y reemplaza import.meta.env por process.env.
// Uso: node --import ./scripts/e2e-register.mjs scripts/e2e-actions.test.mjs
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { existsSync } from "node:fs";
import { register } from "node:module";

register("./e2e-loader.mjs", import.meta.url);
