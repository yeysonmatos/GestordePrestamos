import { createHash } from "crypto";
import { BACKUP_TABLES, getBackupFolder, getBackupTimestamp } from "./tables";
import type { SupabaseClient } from "@supabase/supabase-js";

function toCSV(data: Record<string, unknown>[]): string {
  if (!data || data.length === 0) return "";
  const first = data[0];
  if (!first) return "";
  const keys = Object.keys(first);
  const esc = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const header = keys.join(",");
  const rows = data.map((row) => keys.map((k) => esc(row[k])).join(","));
  return [header, ...rows].join("\n");
}

export async function exportBackup(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ path: string; tables: string[]; count: number } | { error: string }> {
  const timestamp = getBackupTimestamp();
  const folder = `${getBackupFolder(userId)}/${timestamp}`;
  const tables: string[] = [];
  const checksums: Record<string, string> = {};
  let totalCount = 0;

  for (const table of BACKUP_TABLES) {
    let query = supabase.from(table.name).select("*");
    if (table.filterColumn) query = query.eq(table.filterColumn, userId);
    const { data, error } = await query.order(table.orderColumn, { ascending: true });

    if (error) return { error: `Error al exportar ${table.name}: ${error.message}` };

    const csv = toCSV(data || []);
    const fileName = `${folder}/${table.name}.csv`;
    const { error: uploadError } = await supabase.storage
      .from("backups")
      .upload(fileName, csv, { contentType: "text/csv", upsert: false });

    if (uploadError) {
      return { error: `Error al subir ${table.name}: ${uploadError.message}` };
    }

    tables.push(table.name);
    checksums[table.name] = createHash("sha256").update(csv).digest("hex");
    totalCount += (data || []).length;
  }

  const summary = JSON.stringify({
    userId,
    timestamp,
    tables: tables.join(","),
    totalCount,
    checksums,
    exportedAt: new Date().toISOString(),
  });
  const { error: manifestError } = await supabase.storage
    .from("backups")
    .upload(`${folder}/manifest.json`, summary, { contentType: "application/json", upsert: false });

  if (manifestError) {
    return { error: `Error al subir manifest.json: ${manifestError.message}` };
  }

  // Archivos de documentos (bytes del bucket 'documents'), no solo metadata.
  const filesError = await exportDocumentFiles(supabase, userId, folder);
  if (filesError) {
    return { error: filesError };
  }

  return { path: folder, tables, count: totalCount };
}

/**
 * Respalda los BLOBS de documentos del usuario: descarga cada archivo del
 * bucket 'documents' y lo sube al folder de backup bajo `files/N-<name>`,
 * guardando un manifest con el mapeo ruta-original ÔåÆ ruta-backup.
 */
async function exportDocumentFiles(
  supabase: SupabaseClient,
  userId: string,
  folder: string,
): Promise<string | null> {
  const { data: docRows, error } = await supabase
    .from("documents")
    .select("path")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) return `Error al listar documentos: ${error.message}`;
  if (!docRows?.length) return null;

  const mapping: { original: string; backup: string }[] = [];
  let idx = 0;
  for (const doc of docRows) {
    const original = doc.path;
    if (!original) continue;
    const { data: blob, error: dlErr } = await supabase.storage
      .from("documents")
      .download(original);
    if (dlErr || !blob) {
      return `Error al descargar ${original}: ${dlErr?.message || "sin datos"}`;
    }
    const base = (original.split("/").pop() || `doc-${idx}`).replace(/[^\w.-]+/g, "_");
    const backup = `${folder}/files/${idx}-${base}`;
    const { error: upErr } = await supabase.storage.from("backups").upload(backup, blob, {
      contentType: blob.type || "application/octet-stream",
      upsert: false,
    });
    if (upErr) return `Error al subir ${backup}: ${upErr.message}`;
    mapping.push({ original, backup });
    idx++;
  }

  if (mapping.length > 0) {
    const { error: mapErr } = await supabase.storage
      .from("backups")
      .upload(`${folder}/files-manifest.json`, JSON.stringify(mapping), {
        contentType: "application/json",
        upsert: false,
      });
    if (mapErr) return `Error al subir files-manifest.json: ${mapErr.message}`;
  }

  return null;
}

/**
 * Elimina backups de un usuario m├ís antiguos que `retentionDays` d├¡as.
 * Devuelve la lista de folders borrados.
 */
export async function pruneOldBackups(
  supabase: SupabaseClient,
  userId: string,
  retentionDays = 30,
): Promise<{ deleted: number; error?: string }> {
  const prefix = getBackupFolder(userId);
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

  const { data: folders, error } = await supabase.storage
    .from("backups")
    .list(prefix, { sortBy: { column: "name", order: "desc" } });

  if (error) return { deleted: 0, error: error.message };
  if (!folders?.length) return { deleted: 0 };

  const oldFolderTimestamps: string[] = [];
  for (const item of folders) {
    if (!item.name || !/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/.test(item.name)) continue;
    const folderDate = new Date(
      Number(item.name.slice(0, 4)),
      Number(item.name.slice(5, 7)) - 1,
      Number(item.name.slice(8, 10)),
      Number(item.name.slice(11, 13)),
      Number(item.name.slice(14, 16)),
      Number(item.name.slice(17, 19)),
    ).getTime();
    if (folderDate < cutoff) {
      oldFolderTimestamps.push(item.name);
    }
  }

  if (oldFolderTimestamps.length === 0) return { deleted: 0 };

  // remove() solo borra por RUTA EXACTA de objeto (no por prefijo de carpeta).
  // Hay que listar los archivos de cada carpeta vieja y borrarlos uno a uno.
  const filePaths: string[] = [];
  for (const ts of oldFolderTimestamps) {
    const folderPrefix = `${prefix}/${ts}`;
    let at = 0;
    for (;;) {
      const { data: files, error: listErr } = await supabase.storage
        .from("backups")
        .list(folderPrefix, { limit: 200, offset: at });
      if (listErr || !files) break;
      for (const f of files) {
        if (f.name) filePaths.push(`${folderPrefix}/${f.name}`);
      }
      if (files.length < 200) break;
      at += files.length;
    }
  }

  if (filePaths.length === 0) return { deleted: 0, error: "Carpetas viejas sin archivos" };

  const { error: delError } = await supabase.storage.from("backups").remove(filePaths);
  if (delError) return { deleted: 0, error: delError.message };
  return { deleted: oldFolderTimestamps.length };
}
