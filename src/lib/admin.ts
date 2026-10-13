import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { todaySD } from "@/lib/finance";
import type { Database } from "@/integrations/supabase/types";
import {
  dashboardData,
  auditList,
  plansList,
  paymentsList,
  paymentsExport,
  assignPlanAction,
  confirmPaymentAction as confirmPaymentFn,
  extendSubscription,
  userSubscriptions,
  resendPasswordEmail,
  flushQueueAction,
  supportList,
} from "@/lib/admin-fns";

type PlanRow = Database["public"]["Tables"]["plans"]["Row"];
type SubRow = Database["public"]["Tables"]["subscriptions"]["Row"];

export const PLANES = ["trial", "basico", "pro"] as const;
export type Plan = (typeof PLANES)[number];

export const PLAN_LABEL: Record<string, string> = {
  trial: "Trial",
  gratis: "Gratis",
  basico: "Básico",
  pro: "Pro",
  ilimitado: "Ilimitado",
};

export const PLAN_PRECIO: Record<string, number> = {
  trial: 0,
  basico: 699,
  pro: 1199,
  gratis: 0,
  ilimitado: 0,
};

export const ESTADOS_PLAN = ["activo", "prueba", "suspendido"] as const;

export const ESTADO_LABEL: Record<string, string> = {
  activo: "Activo",
  prueba: "Prueba",
  suspendido: "Suspendido",
};

/** Nombre del plan en la BD -> clave de la UI */
function planKey(name: string): string {
  const n = name.toLowerCase();
  if (n.startsWith("trial") || n.startsWith("grat")) return "trial";
  if (n.startsWith("bas")) return "basico";
  if (n.startsWith("pro")) return "pro";
  return n;
}

/** Clave de la UI -> nombre del plan en la BD */
const PLAN_NAME: Record<string, string> = {
  trial: "Trial",
  basico: "Básico",
  pro: "Pro",
  gratis: "Trial",
  ilimitado: "Pro",
};

/** subscriptions.status -> estado de la UI */
const STATUS_TO_UI: Record<string, string> = {
  trial: "prueba",
  active: "activo",
  expired: "suspendido",
  cancelled: "suspendido",
};

/** Estado de la UI -> subscriptions.status */
function statusFromUi(estado: string): "trial" | "active" | "cancelled" | "expired" {
  if (estado === "prueba") return "trial";
  if (estado === "activo") return "active";
  return "cancelled";
}

/** ¿El usuario actual es administrador del SaaS? */
export function useIsAdmin() {
  return useQuery({
    queryKey: ["is-admin"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) return false;
      const { data, error } = await supabase
        .from("app_users")
        .select("role")
        .eq("id", uid)
        .maybeSingle();
      if (error) return false;
      return data?.role === "admin";
    },
  });
}

export type AdminNegocio = {
  id: string;
  business_name: string;
  owner_name: string | null;
  phone: string | null;
  plan: string;
  plan_display: string;
  plan_status: string;
  plan_renews_at: string | null;
  created_at: string;
  plan_price: number;
  clientes: number;
  prestamos: number;
  prestamosActivos: number;
  capital: number;
  cobrado: number;
  ingreso: number;
  blocked: boolean;
};

export type AdminPagosStats = {
  monthKeys: string[];
  byMonth: Record<string, number>;
  counts: { pending: number; confirmed: number; rejected: number };
  totalCobrado: number;
  confirmadosUsers: number;
  recientes: {
    id: string;
    business_name: string;
    amount: number;
    status: string;
    payment_date: string | null;
  }[];
};

function esActivo(status: string) {
  return status !== "paid" && status !== "cancelled";
}

export function useAdminData() {
  return useQuery({
    queryKey: ["admin-data"],
    queryFn: async () => {
      const res = await dashboardData();
      for (const p of res.planPrices) PLAN_PRECIO[planKey(String(p.name))] = Number(p.price);
      return {
        negocios: res.negocios as AdminNegocio[],
        totalPrestamos: res.totalPrestamos,
        totalClientes: res.totalClientes,
        totalPagos: res.totalPagos,
        pagosStats: res.pagosStats as AdminPagosStats,
      };
    },
  });
}

/** Asigna plan y estado a un usuario: crea suscripción nueva (historial), audita y avisa por correo. */
export async function assignPlan(userId: string, plan: string, estado: string) {
  await assignPlanAction({ data: { userId, plan, estado } });
}

/** Extiende la suscripción vigente N días desde el vencimiento (o desde hoy). */
export async function extendSubscriptionDays(userId: string, days: number) {
  return extendSubscription({ data: { userId, days } });
}

/** Reenvía al usuario el correo para que defina/restablezca su contraseña. */
export async function resendRecovery(userId: string) {
  await resendPasswordEmail({ data: { userId, redirect: `${window.location.origin}/auth` } });
}

/** Historial de suscripciones (planes) de un usuario. */
export async function subscriptionHistory(userId: string) {
  const res = await userSubscriptions({ data: { userId } });
  return res.subscriptions as {
    id: string;
    plan_name: string;
    status: string;
    starts_at: string | null;
    ends_at: string | null;
    created_at: string | null;
  }[];
}

/* ==================================================================== */
/* Panel del admin: pagos de suscripción, planes y auditoría           */
/* ==================================================================== */

export type AdminPayment = {
  id: string;
  amount: number;
  status: string;
  method: string;
  payment_date: string;
  notes: string | null;
  created_at: string | null;
  user_id: string;
  target_plan_id: string | null;
  business_name: string;
  plan_name: string;
};

export type AdminPlan = PlanRow & { clients?: number };

export type AuditRow = {
  id: string;
  user_id: string | null;
  user_name: string;
  role: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string | null;
};

export const PAGO_STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente",
  confirmed: "Confirmado",
  rejected: "Rechazado",
};

export const PAGO_METHOD_LABEL: Record<string, string> = {
  cash: "Efectivo",
  transfer: "Transferencia",
  deposit: "Depósito",
  other: "Otro",
};

export type PaymentFiltersUi = {
  month?: string;
  method?: string;
  user_id?: string;
  status?: string;
  page?: number;
  page_size?: number;
};

/** subscription_payments con filtros server-side + paginación (nombres de negocio y plan). */
export function useAdminPayments(filters: PaymentFiltersUi = {}) {
  return useQuery({
    queryKey: ["admin-payments", filters],
    queryFn: async () => {
      const res = await paymentsList({ data: filters });
      return res as {
        items: AdminPayment[];
        counts: { pending: number; confirmed: number; rejected: number };
        total: number;
        total_rows: number;
        page: number;
        page_size: number;
      };
    },
  });
}

/** Todos los pagos con los filtros activos (para exportar). */
export async function adminPaymentsExport(
  filters: Omit<PaymentFiltersUi, "page" | "page_size"> = {},
) {
  const res = await paymentsExport({ data: filters });
  return res.items as AdminPayment[];
}

/** planes con suscritos = ultima suscripcion no cancelada por usuario. */
export function useAdminPlans() {
  return useQuery({
    queryKey: ["admin-plans"],
    queryFn: async () => {
      const res = await plansList();
      return res.plans as (PlanRow & { clients: number })[];
    },
  });
}

export type AuditFilters = {
  limit?: number;
  user?: string;
  action?: string;
  entity?: string;
  q?: string;
  from?: string;
  to?: string;
};

/** auditoria con filtros server-side (service role). */
export function useAdminAudit(filters: AuditFilters = {}) {
  return useQuery({
    queryKey: ["admin-audit", filters],
    queryFn: async () =>
      (await auditList({ data: filters })) as {
        rows: AuditRow[];
        total: number;
        users: { id: string; label: string }[];
      },
  });
}

/** Admin escribe la auditoría. Requiere la política admin_audit_insert (admin-full.sql). */
export async function writeAudit(opts: {
  userId: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  details?: Record<string, unknown>;
}) {
  const { error } = await supabase.from("audit_logs").insert({
    user_id: opts.userId,
    action: opts.action,
    entity_type: opts.entityType,
    entity_id: opts.entityId ?? null,
    details: (opts.details ?? null) as any,
  });
  if (error) throw new Error(error.message);
}

function sumarUnMes(iso: string): string {
  const d = new Date(iso);
  d.setMonth(d.getMonth() + 1);
  return d.toISOString();
}

function sumarUnAnio(iso: string): string {
  const d = new Date(iso);
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString();
}

/** Registra un pago de suscripción (pendiente) + auditoría. */
export async function registerPayment(opts: {
  userId: string;
  amount: number;
  method: string;
  paymentDate: string;
  notes?: string;
  planId?: string | null;
}) {
  const { data: sub, error: subErr } = await supabase
    .from("subscriptions")
    .select("id")
    .eq("user_id", opts.userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (subErr) throw new Error(subErr.message);
  if (!sub) throw new Error("Ese negocio no tiene suscripción");

  const { data: pay, error: payErr } = await supabase
    .from("subscription_payments")
    .insert({
      user_id: opts.userId,
      subscription_id: sub.id,
      amount: opts.amount,
      method: opts.method,
      payment_date: opts.paymentDate,
      notes: opts.notes ?? null,
      status: "pending",
      target_plan_id: opts.planId ?? null,
    })
    .select("id")
    .single();
  if (payErr) throw new Error(payErr.message);

  await writeAudit({
    userId: opts.userId,
    action: "subscription.payment_registered",
    entityType: "subscription",
    entityId: sub.id,
    details: { amount: opts.amount, method: opts.method, payment_id: pay.id },
  });
}

/** Confirma un pago (server, atómico): aplica ciclo/upgrade, audita y avisa por correo. */
export async function confirmPayment(paymentId: string) {
  await confirmPaymentFn({ data: { paymentId } });
}

/** Rechaza un pago pendiente + auditoría. */
export async function rejectPayment(paymentId: string) {
  const { data: pay, error: pErr } = await supabase
    .from("subscription_payments")
    .select("id, user_id, amount, status")
    .eq("id", paymentId)
    .single();
  if (pErr) throw new Error(pErr.message);
  if ((pay as any).status !== "pending") throw new Error("Solo se rechazan pagos pendientes");

  const { error } = await supabase
    .from("subscription_payments")
    .update({ status: "rejected" })
    .eq("id", paymentId);
  if (error) throw new Error(error.message);
  await writeAudit({
    userId: pay.user_id,
    action: "subscription.payment_rejected",
    entityType: "subscription_payment",
    entityId: paymentId,
    details: { amount: Number(pay.amount) },
  });
}

/** Inserta o actualiza un plan (admin). */
export async function savePlan(
  plan: Partial<AdminPlan> & { name: string; price: number } & { id?: string },
) {
  const price = Number(plan.price);
  if (Number.isNaN(price) || price < 0) throw new Error("Precio inválido");
  const payload: any = {
    name: plan.name,
    price,
    billing_cycle: plan.billing_cycle ?? "monthly",
    currency: "DOP",
    is_active: plan.is_active !== false,
    description: (plan as any).description ?? null,
    features: (plan as any).features ?? null,
    max_clients: (plan as any).max_clients ?? null,
    max_loans: (plan as any).max_loans ?? null,
  };

  if (plan.id) {
    payload.id = plan.id;
    const { error } = await supabase.from("plans").update(payload).eq("id", plan.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("plans").insert(payload);
    if (error) throw new Error(error.message);
  }
}

/** Bloquea/desbloquea el acceso de un usuario + auditoría. */
export async function setUserAccess(userId: string, blocked: boolean) {
  const { error } = await supabase
    .from("app_users")
    .update({ status: blocked ? "blocked" : "active" })
    .eq("id", userId);
  if (error) throw new Error(error.message);
  await writeAudit({
    userId,
    action: blocked ? "user.blocked" : "user.unblocked",
    entityType: "user",
    entityId: userId,
    details: { status: blocked ? "blocked" : "active" } as any,
  });
}

/** Elimina un plan (solo admin via politica FOR ALL is_admin). */
export async function deletePlan(id: string) {
  const { error } = await supabase.from("plans").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/** Procesa la cola de correos pendientes (Comunicaciones → Procesar cola). */
export async function flushEmailQueue() {
  return flushQueueAction({ data: { max: 20 } });
}

/** Número de pagos pendientes (para el badge del menú admin). */
export function usePendingPayments() {
  return useQuery({
    queryKey: ["admin-pending-count"],
    staleTime: 30_000,
    queryFn: async () => {
      const res = await paymentsList({ data: { page: 1, page_size: 1 } });
      return res.counts.pending as number;
    },
  });
}

/** Número de solicitudes de soporte abiertas (badge del menú admin). */
export function usePendingSupport() {
  return useQuery({
    queryKey: ["admin-pending-support"],
    staleTime: 30_000,
    queryFn: async () => {
      const res = (await supportList({ data: { status: "open" } })) as { tickets?: unknown[] };
      return (res.tickets ?? []).length;
    },
  });
}
