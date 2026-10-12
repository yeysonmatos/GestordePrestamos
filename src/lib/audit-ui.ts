/**
 * Auditoría legible: etiquetas, variantes y resúmenes en español.
 * Portado de Gestor de Prestamos (src/lib/audit-ui.ts).
 */

export type ActionVariant = {
  variant: "default" | "secondary" | "destructive" | "outline";
  className?: string;
};

export interface ActionLabel extends ActionVariant {
  label: string;
}

const V_PAID: ActionVariant = { variant: "default" };
const V_ACTIVE: ActionVariant = { variant: "secondary" };
const V_SUCCESS: ActionVariant = { variant: "outline", className: "border-success/50 text-success" };
const V_CANCELLED: ActionVariant = { variant: "destructive" };
const V_DEFAULT: ActionVariant = { variant: "outline" };

export const ACTION_LABELS: Record<string, ActionLabel> = {
  "loan.liquidated": { label: "Préstamo liquidado", ...V_SUCCESS },
  "payment.reversed": { label: "Pago revertido", ...V_CANCELLED },
  capital_abono: { label: "Abono a capital", ...V_ACTIVE },
  "payment.recorded": { label: "Pago registrado", ...V_PAID },
  "loan.paid": { label: "Cuota pagada", ...V_PAID },
  "client.created": { label: "Cliente creado", ...V_PAID },
  "client.updated": { label: "Cliente actualizado", ...V_ACTIVE },
  "client.deleted": { label: "Cliente eliminado", ...V_CANCELLED },
  "loan.created": { label: "Préstamo creado", ...V_PAID },
  "loan.updated": { label: "Préstamo actualizado", ...V_ACTIVE },
  "loan.deleted": { label: "Préstamo eliminado", ...V_CANCELLED },
  "settings.updated": { label: "Configuración actualizada", ...V_DEFAULT },
  "backup.generated": { label: "Backup creado", ...V_SUCCESS },
  "backup.restored": { label: "Backup restaurado", ...V_CANCELLED },
  "ticket.created": { label: "Solicitud de soporte", ...V_ACTIVE },
  "subscription.paid": { label: "Pago de suscripción", ...V_PAID },
  "subscription.upgraded": { label: "Cambio de plan", ...V_ACTIVE },
  "subscription.rejected": { label: "Pago de suscripción rechazado", ...V_CANCELLED },
  "subscription.payment_registered": { label: "Pago registrado (pendiente)", ...V_ACTIVE },
  "subscription.payment_confirmed": { label: "Pago confirmado", ...V_PAID },
  "subscription.payment_rejected": { label: "Pago rechazado", ...V_CANCELLED },
  "subscription.plan_assigned": { label: "Plan asignado", ...V_ACTIVE },
  "subscription.extended": { label: "Suscripción extendida", ...V_SUCCESS },
  "subscription.extension_reverted": { label: "Extensión revertida", ...V_CANCELLED },
  "user.blocked": { label: "Usuario bloqueado", ...V_CANCELLED },
  "user.unblocked": { label: "Usuario desbloqueado", ...V_SUCCESS },
  "plan.created": { label: "Plan creado", ...V_PAID },
  "plan.updated": { label: "Plan actualizado", ...V_ACTIVE },
};

export const ENTITY_LABELS: Record<string, string> = {
  loan: "Préstamo",
  client: "Cliente",
  payment: "Pago",
  settings: "Configuración",
  backup: "Backup",
  support_ticket: "Ticket",
  ticket: "Ticket",
  subscription_payment: "Pago suscripción",
  subscription: "Suscripción",
  email_message: "Correo",
  user: "Usuario",
  plan: "Plan",
};

export function entityOptions(): { value: string; label: string }[] {
  const seen = new Set<string>();
  const out: { value: string; label: string }[] = [];
  for (const key of Object.keys(ENTITY_LABELS)) {
    const label = ENTITY_LABELS[key] ?? key;
    if (seen.has(label)) continue;
    seen.add(label);
    out.push({ value: key, label });
  }
  return out;
}

const NOTIF_LABELS: Record<string, string> = {
  upgrade_request: "solicitud de upgrade",
  "upgrade.request": "solicitud de upgrade",
  pay_request: "solicitud de pago",
  "pay.request": "solicitud de pago",
  new_ticket: "nuevo ticket de soporte",
  ticket_created: "nuevo ticket de soporte",
  "ticket.created": "nuevo ticket de soporte",
  ticket_replied: "respuesta de soporte",
  "ticket.replied": "respuesta de soporte",
  ticket_closed: "ticket cerrado",
  "ticket.closed": "ticket cerrado",
  payment_approved: "pago aprobado",
  "payment.approved": "pago aprobado",
  plan_updated: "plan actualizado",
  "plan.updated": "plan actualizado",
  trial_expired: "prueba vencida",
  "trial.expired": "prueba vencida",
  plan_expiring: "aviso de vencimiento",
  "subscription.expiring": "aviso de vencimiento",
};

export function actionInfo(action: string): ActionLabel {
  if (action.startsWith("notification.")) {
    const rest = action.slice("notification.".length);
    const human =
      NOTIF_LABELS[rest] ?? rest.replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toLowerCase());
    return { label: `Aviso: ${human}`, ...V_DEFAULT };
  }
  return (
    ACTION_LABELS[action] || {
      label: action.replace(/\./g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      ...V_DEFAULT,
    }
  );
}

export function actionLabel(action: string): string {
  return actionInfo(action).label;
}

const SETTINGS_LABELS: Record<string, string> = {
  business_name: "Negocio",
  business_phone: "Teléfono",
  business_email: "Email",
  business_address: "Dirección",
  personal_name: "Nombre",
  personal_phone: "Teléfono",
  personal_email: "Email",
  currency: "Moneda",
  late_interest_rate: "Mora diaria",
  loan_id_prefix: "Prefijo de ID",
  grace_days: "Días de gracia",
  notify_upcoming_days: "Aviso de vencimiento",
  default_installments: "Cuotas por defecto",
  default_frequency: "Frecuencia",
  country: "País",
  timezone: "Zona horaria",
};

const AMORT_LABELS: Record<string, string> = {
  french: "Cuotas Fijas",
  interest_only: "Solo Interés",
  "interest-only": "Solo Interés",
};

const LOAN_LABELS: Record<string, string> = {
  amount: "Monto",
  interest_rate: "Tasa",
  interest_type: "Tipo interés",
  installments: "N° cuotas",
  frequency: "Frecuencia",
  amortization_type: "Tipo",
  open_ended: "Abierto",
  payment_day: "Día de pago",
  start_date: "Inicio",
  first_payment_date: "1er pago",
  total_amount: "Total",
  total_interest: "Interés total",
  remaining_amount: "Pendiente",
  installment_amount: "Cuota",
  guarantee: "Garantía",
  notes: "Notas",
};

const FREQ_LABELS: Record<string, string> = {
  daily: "Diario",
  weekly: "Semanal",
  biweekly: "Quincenal",
  monthly: "Mensual",
};

const KNOWN_KEYS = new Set([
  "reason",
  "folder",
  "count",
  "tables",
  "__previous",
  "type",
  "name",
  "loan_id",
  "client_id",
  "client_name",
  "installment_id",
  "amount",
  "subject",
  "plan",
  "days",
  "payment_method",
  "method",
  "capital_amount",
  "interest_amount",
  "late_amount",
  "status",
  "payment_id",
  "upgraded",
  "ends_at",
  "estado",
  "plan_id",
  "subscription_id",
  "to",
  "event_type",
  ...Object.keys(SETTINGS_LABELS),
  ...Object.keys(LOAN_LABELS),
]);

function fechaCorta(v: unknown): string {
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(v);
}

function formatMoney(v: unknown): string {
  if (v == null || v === "" || Number.isNaN(Number(v))) return "";
  return `${Number(v).toLocaleString("es-DO", { maximumFractionDigits: 0 })}`;
}

function formatYesNo(v: unknown): string {
  return v === true || v === "true" ? "sí" : "no";
}

function condense(parts: string[]): string {
  return parts.join(" · ").replace(/\s{2,}/g, " ").trim();
}

function prettyTimestamp(folder: unknown): string {
  if (typeof folder !== "string") return "";
  const m = folder.match(/(\d{4}-\d{2}-\d{2})_(\d{2})-(\d{2})-(\d{2})/);
  if (!m) return "";
  const date = m[1] ?? "";
  const hh = m[2] ?? "00";
  const mm = m[3] ?? "00";
  return `${date.split("-").reverse().join("/")} ${hh}:${mm}`;
}

/** Hechos legibles (en español) para el detalle de un evento de auditoría. */
function buildFacts(
  entityType: string,
  details: Record<string, unknown>,
  full: boolean,
): string[] {
  const parts: string[] = [];

  if (entityType === "backup") {
    const ts = prettyTimestamp(details["folder"]);
    if (ts) parts.push(ts);
    if (details["count"] != null) parts.push(`${details["count"]} registros`);
    if (Array.isArray(details["tables"]) && details["tables"].length > 0) {
      parts.push(`en ${details["tables"].length} tablas`);
    } else if (details["tables"]) {
      parts.push(`en ${String(details["tables"]).split(",").length} tablas`);
    }
    return parts;
  }

  if (entityType === "payment") {
    if (details["client_name"] && typeof details["client_name"] === "string")
      parts.push(`Cliente: ${details["client_name"]}`);
    const amount = formatMoney(details["amount"]);
    if (amount) parts.push(amount);
    if (details["late_amount"] != null && Number(details["late_amount"]) > 0) {
      parts.push(`mora ${formatMoney(details["late_amount"])}`);
    }
    if (details["reason"] && typeof details["reason"] === "string")
      parts.push(`Motivo: ${details["reason"]}`);
    if (details["subject"] && typeof details["subject"] === "string")
      parts.push(`Asunto: ${details["subject"]}`);
    return parts;
  }

  if (entityType === "subscription_payment") {
    const amount = formatMoney(details["amount"]);
    if (amount) parts.push(amount);
    if (details["plan"] && typeof details["plan"] === "string") parts.push(`Plan: ${details["plan"]}`);
    if (details["days"] != null) parts.push(`${details["days"]} días`);
    if (details["reason"] && typeof details["reason"] === "string")
      parts.push(`Motivo: ${details["reason"]}`);
    return parts;
  }

  if (entityType === "email_message") {
    if (details["to"] && typeof details["to"] === "string")
      parts.push(`Correo enviado a: ${details["to"]}`);
    if (details["subject"] && typeof details["subject"] === "string")
      parts.push(`Asunto: ${details["subject"]}`);
    return parts;
  }

  if (entityType === "subscription") {
    if (details["plan"] && typeof details["plan"] === "string") parts.push(`Plan: ${details["plan"]}`);
    if (details["estado"] && typeof details["estado"] === "string") parts.push(`Estado: ${details["estado"]}`);
    if (details["upgraded"] != null)
      parts.push(details["upgraded"] === true ? "Cambio de plan" : "Renovación");
    if (details["days"] != null) {
      const d = Number(details["days"]);
      parts.push(`${d > 0 ? "+" : ""}${d} días`);
    }
    const monto = formatMoney(details["amount"]);
    if (monto) parts.push(`Monto: ${monto}`);
    if (details["ends_at"] && typeof details["ends_at"] === "string")
      parts.push(`Vence: ${fechaCorta(details["ends_at"])}`);
    if (details["client_name"] && typeof details["client_name"] === "string")
      parts.push(`Cliente: ${details["client_name"]}`);
    return parts;
  }

  if (details["name"] && typeof details["name"] === "string" && entityType !== "loan")
    parts.push(details["name"]);
  if (details["client_name"] && typeof details["client_name"] === "string")
    parts.push(`Cliente: ${details["client_name"]}`);
  if (details["reason"] && typeof details["reason"] === "string" && entityType !== "payment")
    parts.push(`Motivo: ${details["reason"]}`);
  if (details["subject"] && typeof details["subject"] === "string")
    parts.push(`Asunto: ${details["subject"]}`);

  const prevMap =
    details["__previous"] && typeof details["__previous"] === "object"
      ? (details["__previous"] as Record<string, unknown>)
      : null;

  function fmtRawVal(k: string, v: unknown): string {
    let val = String(v);
    if (
      k === "amount" ||
      k === "total_amount" ||
      k === "total_interest" ||
      k === "remaining_amount" ||
      k === "installment_amount" ||
      k === "capital_amount" ||
      k === "interest_amount" ||
      k === "late_amount"
    ) {
      return formatMoney(v);
    }
    if (k === "open_ended") return formatYesNo(v);
    if (k === "amortization_type" && AMORT_LABELS[val]) val = AMORT_LABELS[val] ?? val;
    if (k === "frequency" && FREQ_LABELS[val]) val = FREQ_LABELS[val] ?? val;
    if (k === "start_date" || k === "first_payment_date") return val;
    if (k === "late_interest_rate" || k === "interest_rate") return `${Number(v) || 0}%`;
    return val;
  }

  if (entityType === "loan") {
    const loanChanges = Object.keys(LOAN_LABELS)
      .filter((k) => details[k] != null && details[k] !== "")
      .map((k) => {
        const old = prevMap && prevMap[k] != null && prevMap[k] !== "" ? String(prevMap[k]) : null;
        if (old !== null) {
          return `${LOAN_LABELS[k]}: ${fmtRawVal(k, old)} → ${fmtRawVal(k, details[k])}`;
        }
        return `${LOAN_LABELS[k]}: ${fmtRawVal(k, details[k])}`;
      });
    if (full) {
      parts.push(...loanChanges);
    } else {
      parts.push(...loanChanges.slice(0, 5));
      if (loanChanges.length > 5) parts.push(`+${loanChanges.length - 5} más`);
    }
    return parts;
  }

  const settingsParts = Object.keys(SETTINGS_LABELS)
    .filter((k) => details[k] != null && details[k] !== "")
    .map((k) => {
      const old = prevMap && prevMap[k] != null && prevMap[k] !== "" ? String(prevMap[k]) : null;
      if (old !== null) {
        return `${SETTINGS_LABELS[k]}: ${fmtRawVal(k, old)} → ${fmtRawVal(k, details[k])}`;
      }
      return `${SETTINGS_LABELS[k]}: ${fmtRawVal(k, details[k])}`;
    });
  if (full) {
    parts.push(...settingsParts);
  } else {
    parts.push(...settingsParts.slice(0, 4));
    if (settingsParts.length > 4) parts.push(`+${settingsParts.length - 4} más`);
  }
  const extras = Object.keys(details)
    .filter((k) => !KNOWN_KEYS.has(k) && details[k] != null && details[k] !== "")
    .slice(0, full ? Infinity : 3)
    .map((k) => `${k}: ${details[k]}`);
  parts.push(...extras);
  if (!full && Object.keys(details).filter((k) => !KNOWN_KEYS.has(k) && details[k] != null && details[k] !== "").length > 3)
    parts.push("+más");
  return parts;
}

/** Frase resumida (para la fila colapsada). */
export function detailsSummary(
  entityType: string,
  details?: Record<string, unknown> | null,
): string {
  if (!details) return "";
  return condense(buildFacts(entityType, details, false));
}

/** Lista completa de hechos legibles (para el detalle expandido). */
export function detailsFacts(
  entityType: string,
  details?: Record<string, unknown> | null,
): string[] {
  if (!details) return [];
  return buildFacts(entityType, details, true).map((x) => x.replace(/\s{2,}/g, " ").trim());
}

