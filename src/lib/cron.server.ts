// Crons de plataforma (portados de la app Next.js, fase A2/retencion):
//  - /api/cron/backup            -> respaldo diario de TODOS los usuarios + purga por retencion
//  - /api/cron/subscription-notify -> RESUMEN diario al admin de suscripciones vencidas (todos los planes; 1 correo/dia)
//  - /api/cron/reconcile         -> "revisor del sistema": integridad contable
//                                   (reconcile_money) + revisor de integridad
//                                   (system_checks: cronogramas, estados, mora y
//                                   coherencia Reportes<->Inicio) + vigilante del
//                                   backup; AVISA AL ADMIN si encuentra algo
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

interface ExpiredSub {
  user_id: string;
  email: string | null;
  business_name: string | null;
  business_phone: string | null;
  business_email: string | null;
  plan_name: string;
  plan_price: number;
  status: string;
  ends_at: string | null;
  dias: number | null;
  loans: number;
  clients: number;
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

/**
 * Resumen DIARIO de suscripciones vencidas para el admin.
 * (Antes: un correo POR CADA vencido, solo de planes Trial, todos los días = ruido
 * y además no avisaba cuando vencía un plan de pago.)
 * Ahora: UN solo correo al día con la lista completa, de TODOS los planes, usando
 * la misma regla que la app (solo cuenta la suscripción VIGENTE = la más reciente
 * de cada cliente; RPC expired_subscriptions). Cubre además la cola de correos.
 * ?test=1 fuerza el resumen aunque no haya vencidos.
 */
async function runSubscriptionNotify(request: Request): Promise<Response> {
  const force = new URL(request.url).searchParams.get("test") === "1";
  const queue = await recoverEmailQueue();

  const { data, error } = await admin.rpc("expired_subscriptions");
  if (error) return json({ error: `Error cargando vencidos: ${error.message}` }, 500);
  const expired = (typeof data === "string" ? JSON.parse(data) : (data ?? [])) as ExpiredSub[];

  if (expired.length === 0 && !force) {
    return json({ ok: true, expired: 0, notified: false, queue });
  }

  const { data: adm } = await admin
    .from("app_users")
    .select("id")
    .eq("role", "admin")
    .limit(1)
    .maybeSingle();
  if (!adm) return json({ ok: false, error: "No hay usuario admin" }, 500);

  let adminEmail: string | null = null;
  try {
    const { data: u } = await admin.auth.admin.getUserById(adm.id);
    adminEmail = u?.user?.email ?? null;
  } catch {
    adminEmail = null;
  }
  if (!adminEmail) return json({ ok: false, error: "Admin sin email" }, 500);

  const today = new Date().toISOString().slice(0, 10);
  const dedupeKey = `sub-expired-digest-${today}`;
  let notified = false;
  let skipped = false;

  const { data: dup } = await admin
    .from("email_messages")
    .select("id")
    .eq("dedupe_key", dedupeKey)
    .limit(1)
    .maybeSingle();
  if (dup && !force) {
    skipped = true;
  } else {
    const items = expired
      .slice(0, 60)
      .map((s) => {
        const name = s.business_name || s.email || s.user_id;
        const contacto = [s.email, s.business_phone ? `tel ${s.business_phone}` : null]
          .filter(Boolean)
          .join(" · ");
        const cuando =
          s.dias != null ? `venció hace <strong>${s.dias} día(s)</strong>` : `estado: ${s.status}`;
        return `<li><strong>${name}</strong>${contacto ? ` (${contacto})` : ""} — plan ${s.plan_name} (RD$ ${Number(s.plan_price).toFixed(2)}) · ${cuando} · ${s.loans} préstamo(s) activo(s) · ${s.clients} cliente(s)</li>`;
      })
      .join("");

    const htmlBody =
      expired.length === 0
        ? `<p><strong>Prueba del resumen de vencimientos</strong> (pedido a mano).</p>
           <p>Resultado: <strong>ningún suscriptor vencido</strong>. Todo al día.</p>`
        : `<p>Hay <strong>${expired.length}</strong> suscriptor(es) con la suscripción vigente vencida. La app ya los tiene en <strong>modo lectura</strong> (pueden ver todo, pero no crear préstamos ni registrar cobros) hasta que registres su pago.</p>
           <ul>${items}</ul>
           <p><strong>Qué hacer con cada uno:</strong></p>
           <ol>
             <li>Contáctalo para cobrar la renovación.</li>
             <li>Al recibir el pago: <em>Admin → Usuarios → (el negocio) → <strong>Registrar pago</strong></em> — eso extiende su suscripción y lo reactiva.</li>
             <li>Para mandarle un aviso directo al cliente: <em>Admin → Recordatorios → Enviar avisos</em>.</li>
           </ol>
           <p>Este resumen llega <strong>una sola vez al día</strong> mientras haya vencidos.</p>`;

    const id = await enqueueAndSend(admin, {
      recipientType: "admin",
      recipientEmail: adminEmail,
      templateKey: "subscription_expiry_digest",
      subject:
        expired.length === 0
          ? "Renovaciones pendientes: prueba (ningún vencido)"
          : `Renovaciones pendientes: ${expired.length} suscriptor(es) vencido(s)`,
      htmlBody,
      eventType: "subscription.expired_digest",
      entityType: "platform",
      entityId: "expired-digest",
      dedupeKey,
    });
    notified = Boolean(id);
  }

  return json({ ok: true, expired: expired.length, notified, skipped, queue });
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

interface SystemChecksReport {
  checks_run?: number;
  issue_count?: number;
  issues?: Record<string, unknown>[];
}

/** Fecha (UTC) con desplazamiento en días, en formato yyyy-mm-dd. */
function utcDate(offsetDays = 0): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

/**
 * Vigilante del backup: comprueba que CADA usuario tenga un respaldo de hoy o de
 * ayer en el bucket 'backups' (carpeta `user_<id>/<fecha>_<hora>`). Si el cron de
 * las 4:00 falla, hoy nadie se entera; esto lo avisa.
 */
async function checkBackups(): Promise<{ checked: number; missing: string[]; error?: string }> {
  const { data: users, error } = await admin.from("app_users").select("id, display_name");
  if (error) return { checked: 0, missing: [], error: error.message };

  const { data: roots, error: rootErr } = await admin.storage
    .from("backups")
    .list("", { limit: 1000 });
  if (rootErr) return { checked: 0, missing: [], error: rootErr.message };
  const rootNames = new Set((roots ?? []).map((o) => o.name));

  const today = utcDate(0);
  const yesterday = utcDate(-1);
  const missing: string[] = [];

  for (const u of users ?? []) {
    const folder = `user_${u.id}`;
    const label = u.display_name ?? u.id;
    if (!rootNames.has(folder)) {
      missing.push(`${label} (no tiene ningún respaldo)`);
      continue;
    }
    const { data: subs, error: subErr } = await admin.storage
      .from("backups")
      .list(folder, { limit: 1000 });
    if (subErr) {
      missing.push(`${label} (no se pudo leer su carpeta: ${subErr.message})`);
      continue;
    }
    const names = (subs ?? []).map((o) => o.name);
    const ok = names.some((n) => n.startsWith(today) || n.startsWith(yesterday));
    if (!ok) missing.push(`${label} (sin respaldo de hoy ni de ayer)`);
  }

  return { checked: (users ?? []).length, missing };
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

/** Traduce un hallazgo del revisor de integridad a una frase entendible. */
function describeSystemIssue(i: Record<string, unknown>): string {
  const title = String(i["title"] ?? i["code"] ?? "hallazgo");
  const count = Number(i["count"] ?? 0);
  const samples = Array.isArray(i["samples"]) ? (i["samples"] as unknown[]).map(String) : [];
  const ej = samples.length ? ` — ej.: ${samples.slice(0, 3).join(", ")}` : "";
  return `${title}: ${count} caso(s)${ej}.`;
}

/**
 * Revisor de cuentas: corre la verificación contable de toda la base, el revisor de
 * integridad (cronogramas, estados, mora y coherencia Reportes↔Inicio) y el vigilante
 * del backup. Si encuentra algo, avisa AL ADMIN por correo (el suscriptor no se toca:
 * es control de calidad interno). Un correo por día como máximo (dedupe).
 * Antes de revisar recupera/envía lo que quedara en la cola de correos, para que los
 * hallazgos de "correo atascado" no sean restos de un envío interrumpido.
 * Con ?test=1 fuerza un correo de prueba aunque no haya hallazgos.
 */
async function runReconcile(request: Request): Promise<Response> {
  const force = new URL(request.url).searchParams.get("test") === "1";

  // Cola de correos: recupera los que quedaron en "enviando" y envía los pendientes.
  // (Hasta ahora solo la recuperaba el cron de suscripciones, así que el revisor podía
  // denunciar como atascado un correo que se estaba enviando en ese momento.)
  const queue = await recoverEmailQueue();


  const { data, error } = await admin.rpc("reconcile_money", { p_user_id: null });
  if (error) return json({ ok: false, error: `Error en la revisión: ${error.message}` }, 500);
  const report = (typeof data === "string" ? JSON.parse(data) : data) as ReconcileReport | null;
  if (!report) return json({ ok: false, error: "La revisión no devolvió datos" }, 500);

  // Revisor de integridad (cronogramas, estados, mora, coherencia de pantallas)
  let checks: SystemChecksReport | null = null;
  const { data: checkData, error: checkError } = await admin.rpc("system_checks", {
    p_user_id: null,
  });
  if (!checkError) {
    checks = (
      typeof checkData === "string" ? JSON.parse(checkData) : checkData
    ) as SystemChecksReport | null;
  }

  // Vigilante del backup
  const backups = await checkBackups();

  const errorCount = Number(report.error_count ?? 0);
  const issues = checks?.issues ?? [];
  const issueCount = issues.length;
  const missingBackups = backups.missing ?? [];
  const hasFindings = errorCount > 0 || issueCount > 0 || missingBackups.length > 0;

  let notified = false;
  let skipped = false;

  if (hasFindings || force) {
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

    const today = utcDate(0);
    const dedupeKey = `reconcile-${force ? "test" : "findings"}-${today}`;
    const { data: dup } = await admin
      .from("email_messages")
      .select("id")
      .eq("dedupe_key", dedupeKey)
      .limit(1)
      .maybeSingle();
    if (dup && !force) {
      skipped = true;
    } else {
      const reconcileItems = (report.errors ?? [])
        .slice(0, 25)
        .map((e) => `<li>${describeReconcileError(e)}</li>`)
        .join("");
      const checkItems = issues
        .slice(0, 25)
        .map((i) => `<li>${describeSystemIssue(i)}</li>`)
        .join("");
      const backupItems = missingBackups
        .slice(0, 25)
        .map((b) => `<li>${b}</li>`)
        .join("");

      const sections: string[] = [];
      if (errorCount > 0) {
        sections.push(
          `<p><strong>Descuadres contables: ${errorCount}</strong></p><ul>${reconcileItems}</ul>`,
        );
      }
      if (issueCount > 0) {
        sections.push(
          `<p><strong>Revisor de integridad: ${issueCount} tipo(s) de hallazgo</strong></p><ul>${checkItems}</ul>`,
        );
      }
      if (missingBackups.length > 0) {
        sections.push(
          `<p><strong>Backups: ${missingBackups.length} usuario(s) sin respaldo reciente</strong></p><ul>${backupItems}</ul>`,
        );
      }
      if (checkError) {
        sections.push(`<p>No se pudo correr el revisor de integridad: ${checkError.message}</p>`);
      }
      if (backups.error) {
        sections.push(`<p>No se pudo verificar los backups: ${backups.error}</p>`);
      }

      const body = hasFindings
        ? `<p>La revisión automática encontró lo siguiente:</p>${sections.join("")}
           <p>Resumen contable: ${report.testable_loans ?? 0} préstamos verificados, ${report.open_ended_skipped ?? 0} abiertos omitidos, ${report.clients_checked ?? 0} clientes revisados. Comprobaciones de integridad corridas: ${checks?.checks_run ?? 0}. Backups revisados: ${backups.checked}.</p>
           <p>Los descuadres contables se corrigen recalculando las estadísticas del cliente desde el panel de administración.</p>`
        : `<p><strong>Prueba del revisor</strong> (pedida a mano).</p>
           <p>Resultado: <strong>sin hallazgos</strong>. Todo consistente.</p>
           <p>Resumen: ${report.testable_loans ?? 0} préstamos verificados, ${report.clients_checked ?? 0} clientes revisados, ${checks?.checks_run ?? 0} comprobaciones de integridad, ${backups.checked} backups revisados.</p>`;

      const id = await enqueueAndSend(admin, {
        recipientType: "admin",
        recipientEmail: adminEmail,
        templateKey: "reconcile_alert",
        subject: hasFindings
          ? `Revisión automática: ${errorCount} descuadre(s), ${issueCount} hallazgo(s), ${missingBackups.length} backup(s) pendiente(s)`
          : "Revisión automática: prueba (todo consistente)",
        htmlBody: body,
        eventType: "audit.reconcile",
        entityType: "platform",
        entityId: "reconcile",
        dedupeKey,
      });
      notified = Boolean(id);
    }
  }

  return json({
    ok: true,
    errors: errorCount,
    issues: issueCount,
    missing_backups: missingBackups.length,
    notified,
    skipped,
    queue,
    report,
    checks,
    backups,
  });
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
    if (path === "/api/cron/subscription-notify") return await runSubscriptionNotify(request);
    return await runReconcile(request);
  } catch (err) {
    return json({ ok: false, error: String((err as Error)?.message || err) }, 500);
  }
}
