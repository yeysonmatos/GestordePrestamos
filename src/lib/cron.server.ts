// Crons de plataforma (portados de la app Next.js, fase A2/retencion):
//  - /api/cron/backup            -> respaldo diario de TODOS los usuarios + purga por retencion
//  - /api/cron/subscription-notify -> avisa al admin de trials vencidos (1x usuario por dia)
//  - /api/cron/reconcile         -> "revisor de cuentas": verifica la integridad contable
//                                   (reconcile_money) y AVISA AL ADMIN si hay descuadres
// Protegidos con CRON_SECRET (Vercel envia "Authorization: Bearer $CRON_SECRET").
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { exportBackup, pruneOldBackups } from "@/lib/backup/export";
import {
  attemptSend,
  enqueueAndSend,
  getSmtpConfig,
  isSmtpConfigured,
} from "@/lib/admin-api.server";

type AdminClient = SupabaseClient;

const admin = supabaseAdmin as unknown as AdminClient;

const RETENTION_DAYS = Number(process.env["BACKUP_RETENTION_DAYS"] || 30);

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function authorized(request: Request): boolean {
  const secret = process.env["CRON_SECRET"];
  const auth = request.headers.get("authorization") || "";
  return Boolean(secret) && auth === `Bearer ${secret}`;
}

async function runBackup(): Promise<Response> {
  const { data: appUsers, error } = await admin.from("app_users").select("id");
  if (error) return json({ error: `Error cargando usuarios: ${error.message}` }, 500);

  const userIds = (appUsers ?? []).map((u) => u.id);
  if (userIds.length === 0) return json({ ok: true, backups: 0, purged: 0, users: 0, errors: [] });

  let backups = 0;
  let purged = 0;
  const errors: string[] = [];

  for (const userId of userIds) {
    try {
      const result = await exportBackup(admin, userId);
      if ("error" in result) {
        errors.push(`usuario ${userId}: ${result.error}`);
        continue;
      }
      backups++;
      const prune = await pruneOldBackups(admin, userId, RETENTION_DAYS);
      if (prune.error) errors.push(`usuario ${userId} (purga): ${prune.error}`);
      else purged += prune.deleted;
    } catch (err) {
      errors.push(`usuario ${userId}: ${String((err as Error)?.message || err)}`);
    }
  }

  return json({ ok: true, backups, purged, users: userIds.length, errors });
}

interface TrialRow {
  user_id: string;
  status: string | null;
  ends_at: string | null;
  plan: { name: string } | null;
}

/**
 * Recupera emails atorados en 'sending' (crash/timeout del intento anterior) y
 * reintenta los 'queued' con next_retry_at vencido. Limitado para no exceder
 * el tiempo del cron: los demas quedan para la siguiente pasada.
 */
async function recoverEmailQueue(): Promise<{ recovered: number; flushed: number }> {
  const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data: stuck } = await admin
    .from("email_messages")
    .select("id")
    .eq("status", "sending")
    .is("sent_at", null)
    .lt("created_at", tenMinAgo);
  const stuckIds = (stuck ?? []).map((r) => r.id);
  let recovered = 0;
  if (stuckIds.length > 0) {
    const { error } = await admin
      .from("email_messages")
      .update({ status: "queued" })
      .in("id", stuckIds);
    if (!error) recovered = stuckIds.length;
  }

  const nowIso = new Date().toISOString();
  let flushed = 0;
  const cfg = await getSmtpConfig(admin);
  if (isSmtpConfigured(cfg)) {
    const { data: due } = await admin
      .from("email_messages")
      .select("id")
      .eq("status", "queued")
      .or(`next_retry_at.lte.${nowIso},next_retry_at.is.null`)
      .limit(15);
    for (const row of due ?? []) {
      try {
        await attemptSend(admin, row.id);
        flushed++;
      } catch {
        /* sigue con el siguiente */
      }
    }
  }
  return { recovered, flushed };
}

async function runTrialNotify(): Promise<Response> {
  const queue = await recoverEmailQueue();
  const { data: subs, error } = (await admin
    .from("subscriptions")
    .select("user_id, status, ends_at, plan:plans(name)")) as unknown as {
    data: TrialRow[] | null;
    error: { message: string } | null;
  };
  if (error) return json({ error: `Error cargando suscripciones: ${error.message}` }, 500);

  const { data: adm } = await admin
    .from("app_users")
    .select("id")
    .eq("role", "admin")
    .limit(1)
    .maybeSingle();
  if (!adm) return json({ ok: false, error: "No hay usuario admin" }, 500);

  let adminEmail: string | null = null;
  try {
    const { data } = await admin.auth.admin.getUserById(adm.id);
    adminEmail = data?.user?.email ?? null;
  } catch {
    adminEmail = null;
  }
  if (!adminEmail) return json({ ok: false, error: "Admin sin email" }, 500);

  const now = Date.now();
  const today = new Date().toISOString().slice(0, 10);
  const expired = (subs ?? []).filter(
    (s) =>
      s.plan?.name === "Trial" &&
      (s.status === "expired" ||
        s.status === "cancelled" ||
        (s.ends_at ? new Date(s.ends_at).getTime() < now : false)),
  );

  let notified = 0;
  const errors: string[] = [];

  for (const s of expired) {
    try {
      const dedupeKey = `trial-expired-${s.user_id}-${today}`;
      const { data: dup } = await admin
        .from("email_messages")
        .select("id")
        .eq("dedupe_key", dedupeKey)
        .limit(1)
        .maybeSingle();
      if (dup) continue;

      const { data: business } = await admin
        .from("settings")
        .select("business_name")
        .eq("user_id", s.user_id)
        .maybeSingle();
      const name = business?.business_name || s.user_id;

      const id = await enqueueAndSend(admin, {
        recipientType: "admin",
        recipientEmail: adminEmail,
        templateKey: "trial_expired",
        subject: `Trial vencido: ${name}`,
        htmlBody:
          `<p>El trial del suscriptor <strong>${name}</strong> finalizó` +
          `${s.ends_at ? ` el ${String(s.ends_at).slice(0, 10)}` : ""}.</p>` +
          `<p>Revísalo en el panel de administración (extender, cambiar plan o dejar lectura-solo).</p>`,
        eventType: "subscription.trial_expired",
        entityType: "subscription",
        entityId: String(s.user_id),
        dedupeKey,
      });
      if (id) notified++;
    } catch (err) {
      errors.push(`usuario ${s.user_id}: ${String((err as Error)?.message || err)}`);
    }
  }

  return json({ ok: true, notified, users: (subs ?? []).length, queue, errors });
}

interface ReconcileReport {
  ran?: boolean;
  testable_loans?: number;
  open_ended_skipped?: number;
  payment_rows?: number;
  clients_checked?: number;
  error_count?: number;
  errors?: Record<string, unknown>[];
}

/** Traduce un hallazgo del revisor a una frase entendible. */
function describeReconcileError(e: Record<string, unknown>): string {
  const type = String(e["type"] ?? "desconocido");
  const who = String(e["client_name"] ?? e["loan_id"] ?? e["client_id"] ?? "");
  const diff = e["diff"] == null ? null : Number(e["diff"]);
  const difTxt = diff == null ? "" : ` — diferencia ${diff}`;
  if (type === "client_balance_mismatch")
    return `Cliente ${who}: el saldo guardado (${e["stored"]}) no coincide con el calculado (${e["computed"]})${difTxt}.`;
  if (type === "loan_identity_mismatch")
    return `Préstamo ${who}: lo prestado no coincide con lo cobrado + lo pendiente${difTxt}.`;
  if (type === "payment_sum_mismatch")
    return `Pago ${String(e["payment_id"] ?? "")}: el monto no coincide con capital + interés + mora${difTxt}.`;
  return `${type}${who ? ` (${who})` : ""}: ${JSON.stringify(e)}`;
}

/**
 * Revisor de cuentas: corre la verificación contable de toda la base y, si
 * encuentra descuadres, avisa AL ADMIN por correo (el suscriptor no se toca:
 * es control de calidad interno). Un correo por día como máximo (dedupe).
 * Con ?test=1 fuerza un correo de prueba aunque no haya descuadres.
 */
async function runReconcile(request: Request): Promise<Response> {
  const force = new URL(request.url).searchParams.get("test") === "1";

  const { data, error } = await admin.rpc("reconcile_money", { p_user_id: null });
  if (error) return json({ ok: false, error: `Error en la revisión: ${error.message}` }, 500);
  const report = (typeof data === "string" ? JSON.parse(data) : data) as ReconcileReport | null;
  if (!report) return json({ ok: false, error: "La revisión no devolvió datos" }, 500);

  const errorCount = Number(report.error_count ?? 0);
  let notified = false;
  let skipped = false;

  if (errorCount > 0 || force) {
    const { data: adm } = await admin
      .from("app_users")
      .select("id")
      .eq("role", "admin")
      .limit(1)
      .maybeSingle();
    if (!adm) return json({ ok: false, error: "No hay usuario admin", report }, 500);

    let adminEmail: string | null = null;
    try {
      const { data: u } = await admin.auth.admin.getUserById(adm.id);
      adminEmail = u?.user?.email ?? null;
    } catch {
      adminEmail = null;
    }
    if (!adminEmail) return json({ ok: false, error: "Admin sin email", report }, 500);

    const today = new Date().toISOString().slice(0, 10);
    const dedupeKey = `reconcile-${force ? "test" : "errors"}-${today}`;
    const { data: dup } = await admin
      .from("email_messages")
      .select("id")
      .eq("dedupe_key", dedupeKey)
      .limit(1)
      .maybeSingle();
    if (dup && !force) {
      skipped = true;
    } else {
      const items = (report.errors ?? [])
        .slice(0, 25)
        .map((e) => `<li>${describeReconcileError(e)}</li>`)
        .join("");
      const body =
        errorCount === 0
          ? `<p><strong>Prueba del revisor de cuentas</strong> (pedida a mano).</p>
             <p>Resultado: <strong>0 descuadres</strong>. Todo consistente.</p>
             <p>Resumen: ${report.testable_loans ?? 0} préstamos verificados, ${report.open_ended_skipped ?? 0} abiertos omitidos, ${report.clients_checked ?? 0} clientes revisados.</p>`
          : `<p>El revisor de cuentas encontró <strong>${errorCount} descuadre(s)</strong>.</p>
             <ul>${items}</ul>
             <p>Resumen: ${report.testable_loans ?? 0} préstamos verificados, ${report.open_ended_skipped ?? 0} abiertos omitidos, ${report.clients_checked ?? 0} clientes revisados.</p>
             <p>Se corrige recalculando las estadísticas del cliente afectado desde el panel de administración.</p>`;

      const id = await enqueueAndSend(admin, {
        recipientType: "admin",
        recipientEmail: adminEmail,
        templateKey: "reconcile_alert",
        subject:
          errorCount === 0
            ? "Revisor de cuentas: prueba (todo consistente)"
            : `Revisor de cuentas: ${errorCount} descuadre(s) detectado(s)`,
        htmlBody: body,
        eventType: "audit.reconcile",
        entityType: "platform",
        entityId: "reconcile",
        dedupeKey,
      });
      notified = Boolean(id);
    }
  }

  return json({ ok: true, errors: errorCount, notified, skipped, report });
}

export async function handleCronRequest(request: Request): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  if (
    path !== "/api/cron/backup" &&
    path !== "/api/cron/subscription-notify" &&
    path !== "/api/cron/reconcile"
  )
    return null;
  if (request.method !== "GET" && request.method !== "POST") {
    return json({ error: "Método no permitido" }, 405);
  }
  if (!authorized(request)) return json({ error: "No autorizado" }, 401);
  try {
    if (path === "/api/cron/backup") return await runBackup();
    if (path === "/api/cron/subscription-notify") return await runTrialNotify();
    return await runReconcile(request);
  } catch (err) {
    return json({ ok: false, error: String((err as Error)?.message || err) }, 500);
  }
}
