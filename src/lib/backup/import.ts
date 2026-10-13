import { createHash } from "crypto";
import { BACKUP_TABLES, getBackupFolder, RESTORE_ORDER } from "./tables";
import type { SupabaseClient } from "@supabase/supabase-js";

interface RestoreManifest {
  userId: string;
  timestamp: string;
  tables: string;
  totalCount: number;
  checksums?: Record<string, string>;
  exportedAt?: string;
}

function parseCSV(csv: string): Record<string, unknown>[] {
  if (!csv.trim()) return [];
  const lines = csv.split("\n");
  const header = (lines[0] ?? "").split(",").map((h) => h.trim());
  const rows: Record<string, unknown>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || !line.trim()) continue;
    const values = parseCSVLine(line);
    if (values.length !== header.length) continue;
    const row: Record<string, unknown> = {};
    header.forEach((h, idx) => {
      const val = values[idx];
      row[h] = val === "" ? null : val;
    });
    rows.push(row);
  }
  return rows;
}

function parseCSVLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        values.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
  }
  values.push(current);
  return values;
}

function parseValue(value: unknown, key: string): unknown {
  if (value === null || value === undefined || value === "") return null;
  const numericKeys = [
    "amount",
    "total_amount",
    "total_interest",
    "installment_amount",
    "remaining_amount",
    "paid_amount",
    "capital",
    "interest",
    "balance",
    "paid_late_amount",
    "late_amount",
    "capital_amount",
    "interest_amount",
    "late_amount",
    "monthly_income",
    "trust_score",
    "interest_rate",
    "late_interest_rate",
    "late_days",
    "installments",
    "paid_installments",
    "progress",
    "number",
    "size",
    "grace_days",
    "notify_upcoming_days",
    "default_installments",
    "payment_day",
    "gps_lat",
    "gps_lng",
    "total_loans",
    "active_loans",
    "paid_loans",
    "late_loans",
    "total_borrowed",
    "total_paid",
    "total_interest",
  ];
  const boolKeys = ["open_ended"];
  if (boolKeys.includes(key)) return value === "true" || value === true;
  if (numericKeys.includes(key)) {
    const num = Number(value);
    return isNaN(num) ? null : num;
  }
  return value;
}

export async function restoreBackup(
  supabase: SupabaseClient,
  userId: string,
  folder: string,
): Promise<{ tables: string[]; count: number } | { error: string }> {
  const prefix = getBackupFolder(userId);

  // 1. Validar estructura del folder (anti path traversal)
  if (!/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/.test(folder)) {
    return { error: "Folder de backup inv├ílido" };
  }

  // 2. Descargar y validar manifest (pertenencia + checksums)
  const { data: manifestData, error: manifestError } = await supabase.storage
    .from("backups")
    .download(`${prefix}/${folder}/manifest.json`);
  if (manifestError || !manifestData) {
    return { error: "No se encontr├│ el manifest del backup" };
  }

  let manifest: RestoreManifest;
  try {
    manifest = JSON.parse(await manifestData.text());
  } catch {
    return { error: "Manifest corrupto" };
  }

  if (manifest.userId !== userId) {
    return { error: "Este backup pertenece a otra cuenta" };
  }

  // 3. Descargar todos los CSV y verificar checksums ANTES de tocar datos.
  const payload: Record<string, Record<string, unknown>[]> = {};
  const tables: string[] = [];
  let totalCount = 0;

  for (const tableName of RESTORE_ORDER) {
    const url = `${prefix}/${folder}/${tableName}.csv`;
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("backups")
      .download(url);

    if (downloadError) {
      if (downloadError.message.includes("not found")) continue;
      return { error: `Error al descargar ${tableName}: ${downloadError.message}` };
    }

    const csv = await fileData.text();

    // Integridad: si el manifest guarda checksum, debe coincidir.
    const expected = manifest.checksums?.[tableName];
    if (expected) {
      const actual = createHash("sha256").update(csv).digest("hex");
      if (actual !== expected) {
        return {
          error: `El archivo ${tableName}.csv est├í corrupto o fue alterado. Restaurado cancelado.`,
        };
      }
    }

    const rows = parseCSV(csv);
    if (rows.length === 0) continue;

    const tableConfig = BACKUP_TABLES.find((t) => t.name === tableName);
    if (!tableConfig) continue;

    const typedRows = rows.map((row) => {
      const typed: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(row)) {
        typed[key] = parseValue(val, key);
      }
      const hasUserId = Object.keys(row).some((k) => k === "user_id");
      if (!hasUserId && tableConfig.filterColumn) {
        typed["user_id"] = userId;
      }
      return typed;
    });

    payload[tableName] = typedRows;
    tables.push(tableName);
    totalCount += typedRows.length;
  }

  if (!payload["clients"] && !payload["loans"] && !payload["payments"]) {
    return { error: "El backup no contiene datos para restaurar" };
  }

  // 4. Restaurar TODO en UNA transacci├│n (RPC SECURITY DEFINER).
  const { data: result, error: rpcError } = await supabase.rpc("restore_user_backup", {
    p_user_id: userId,
    p_settings: payload["settings"] ?? [],
    p_clients: payload["clients"] ?? [],
    p_loans: payload["loans"] ?? [],
    p_installments: payload["installments"] ?? [],
    p_payments: payload["payments"] ?? [],
    p_documents: payload["documents"] ?? [],
  });

  if (rpcError) {
    return { error: `Error al restaurar: ${rpcError.message}` };
  }
  if (!result || result.ok === false) {
    return {
      error: (result && result.error) || "La restauraci├│n fall├│ y no se aplicaron cambios",
    };
  }

  // Restaurar bloBs (bytes) de documentos: las filas ya quedaron insertadas
  // por el RPC; ahora re-subimos los archivos reales al bucket 'documents'.
  const filesError = await restoreDocumentFiles(supabase, userId, folder);
  if (filesError) {
    return { error: filesError };
  }

  return { tables, count: totalCount };
}

/**
 * Re-upload de los BLOBS de documentos desde el backup (folder/files-Manifest.json)
 * hacia el bucket 'documents', en sus rutas originales.
 */
async function restoreDocumentFiles(
  supabase: SupabaseClient,
  userId: string,
  folder: string,
): Promise<string | null> {
  const prefix = getBackupFolder(userId);
  const { data: manifestData, error: manifestError } = await supabase.storage
    .from("backups")
    .download(`${prefix}/${folder}/files-manifest.json`);
  if (manifestError) return null; // backup sin archivos ÔåÆ OK

  let mapping: { original: string; backup: string }[];
  try {
    mapping = JSON.parse(await manifestData.text());
  } catch {
    return "files-manifest.json corrupto";
  }
  if (!Array.isArray(mapping)) return "files-manifest.json inv├ílido";

  for (const entry of mapping) {
    if (!entry?.original || !entry?.backup) continue;
    // Seguridad: la ruta original debe pertenecer a este usuario.
    if (!entry.original.startsWith(`${userId}/`)) {
      return `La ruta del documento no pertenece al usuario: ${entry.original}`;
    }
    const { data: blob, error: dlErr } = await supabase.storage
      .from("backups")
      .download(entry.backup);
    if (dlErr || !blob) return `Error al descargar blob de backup: ${entry.backup}`;

    const { error: upErr } = await supabase.storage
      .from("documents")
      .upload(entry.original, blob, { upsert: true });
    if (upErr) return `Error al restaurar archivo ${entry.original}: ${upErr.message}`;
  }

  return null;
}

export async function listBackups(
  supabase: SupabaseClient,
  userId: string,
): Promise<
  Array<{ folder: string; timestamp: string; tables: number; count: number; createdAt: string }>
> {
  const prefix = getBackupFolder(userId);

  const { data: folders, error } = await supabase.storage
    .from("backups")
    .list(prefix, { sortBy: { column: "name", order: "desc" } });

  if (error) return [];

  const backups: Array<{
    folder: string;
    timestamp: string;
    tables: number;
    count: number;
    createdAt: string;
  }> = [];

  for (const item of folders) {
    if (!item.name || !/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/.test(item.name)) continue;
    const manifestUrl = `${prefix}/${item.name}/manifest.json`;
    const { data: manifestData } = await supabase.storage.from("backups").download(manifestUrl);

    let tables = 0;
    let count = 0;
    let createdAt = "";
    if (manifestData) {
      try {
        const manifest = JSON.parse(await manifestData.text());
        tables = manifest.tables ? manifest.tables.split(",").length : 0;
        count = manifest.totalCount || 0;
        createdAt = manifest.exportedAt || "";
      } catch {
        /* manifest opcional */
      }
    }
    backups.push({ folder: item.name, timestamp: item.name, tables, count, createdAt });
  }

  return backups;
}
