import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

/**
 * Tipos de vista: son los que ven las pantallas (mismos nombres de siempre).
 * En la base real (GP) las columnas se llaman distinto; los `to*` de abajo hacen la traduccion.
 */
export type Client = {
  id: string;
  user_id: string;
  full_name: string;
  cedula: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  active: boolean;
  whatsapp: string | null;
  trust_score: number;
  balance: number;
  total_paid: number;
  total_borrowed: number;
  created_at: string;
  updated_at: string;
};

export type Loan = {
  id: string;
  loan_id: string;
  user_id: string;
  client_id: string;
  principal: number;
  interest_rate: number;
  term: number;
  frequency: string;
  loan_type: string;
  start_date: string;
  first_payment_date: string;
  late_fee_rate: number;
  status: string;
  notes: string | null;
  open_ended: boolean;
  installment_amount: number;
  payment_day: number | null;
  paid_amount: number;
  remaining_amount: number;
  prepaid_balance: number;
  paid_installments: number;
  progress: number;
  created_at: string;
  updated_at: string;
};

export type Installment = {
  id: string;
  loan_id: string;
  number: number;
  due_date: string;
  principal_amount: number;
  interest_amount: number;
  total_amount: number;
  paid_amount: number;
  late_fee_paid: number;
  status: string;
  paid_at: string | null;
};

export type Payment = {
  id: string;
  loan_id: string;
  installment_id: string | null;
  user_id: string;
  amount: number;
  principal_portion: number;
  interest_portion: number;
  late_fee: number;
  kind: string;
  method: string;
  note: string | null;
  paid_at: string;
  reversed: boolean;
  reversal_reason: string | null;
  created_at: string;
};

export type Profile = {
  id: string;
  business_name: string;
  owner_name: string | null;
  phone: string | null;
  default_late_fee_rate: number;
  grace_days: number;
  plan: string;
  plan_status: string;
  plan_renews_at: string | null;
  created_at: string;
};

export type LoanWithClient = Loan & {
  client: Pick<Client, "id" | "full_name" | "phone" | "whatsapp"> | null;
};

export type SubscriptionInfo = {
  id: string;
  plan_id: string;
  status: string;
  starts_at: string;
  ends_at: string | null;
  plan_name: string;
  plan_price: number;
  plan_max_clients: number | null;
  plan_max_loans: number | null;
  billing_cycle: string;
};

export type SubscriptionPaymentRow = {
  id: string;
  amount: number;
  payment_date: string;
  method: string;
  notes: string | null;
  status: string;
};

/** Todas las cuotas, con prestamo y cliente. */
export type InstallmentFull = Installment & {
  loan: {
    id: string;
    display_id: string;
    status: string;
    late_fee_rate: number;
    frequency: string;
    loan_type: string;
    open_ended: boolean;
    principal: number;
    remaining_amount: number;
    installment_amount: number;
    payment_day: number | null;
    first_payment_date: string;
    prepaid_balance: number;
    client: { id: string; full_name: string; phone: string | null; whatsapp: string | null } | null;
  } | null;
};

type Tables = Database["public"]["Tables"];
type ClientRow = Tables["clients"]["Row"];
type LoanRow = Tables["loans"]["Row"];
type InstallmentRow = Tables["installments"]["Row"];
type PaymentRow = Tables["payments"]["Row"];
type SettingsRow = Tables["settings"]["Row"];

/* ------------------------------------------------------------------ */
/*  Traducciones de valores (base <-> vista)                           */
/* ------------------------------------------------------------------ */

export const FREQ_TO_DB: Record<string, string> = {
  diaria: "daily",
  semanal: "weekly",
  quincenal: "biweekly",
  mensual: "monthly",
};

export const FREQ_TO_VIEW: Record<string, string> = {
  daily: "diaria",
  weekly: "semanal",
  biweekly: "quincenal",
  monthly: "mensual",
};

export const LOAN_TYPE_TO_DB: Record<string, string> = {
  cuota_fija: "french",
  solo_interes: "interest_only",
};

export const LOAN_TYPE_TO_VIEW: Record<string, string> = {
  french: "cuota_fija",
  interest_only: "solo_interes",
};

export const METHOD_TO_DB: Record<string, string> = {
  efectivo: "cash",
  transferencia: "transfer",
  deposito: "deposit",
  otro: "other",
};

export const METHOD_TO_VIEW: Record<string, string> = {
  cash: "efectivo",
  transfer: "transferencia",
  deposit: "deposito",
  other: "otro",
};

export const KIND_TO_DB: Record<string, string> = {
  cuota: "installment",
  abono_capital: "capital_abono",
  liquidacion: "liquidation",
};

export const KIND_TO_VIEW: Record<string, string> = {
  installment: "cuota",
  capital_abono: "abono_capital",
  liquidation: "liquidacion",
};

export function loanStatusToView(status: string | null, deletedAt?: string | null): string {
  if (deletedAt || status === "cancelled") return "archivado";
  if (status === "paid") return "pagado";
  if (status === "active" || (status ?? "").startsWith("late_")) return "en_curso";
  return "en_curso";
}

export function installmentStatusToView(status: string | null): string {
  if (status === "paid") return "pagada";
  if (status === "partial") return "parcial";
  return "pendiente";
}

export function installmentStatusToDb(status: string): string {
  if (status === "pagada") return "paid";
  if (status === "parcial") return "partial";
  return "pending";
}

/* ------------------------------------------------------------------ */
/*  Mappers: fila de la base -> objeto de vista                        */
/* ------------------------------------------------------------------ */

function num(v: number | null | undefined): number {
  return Number(v ?? 0);
}

export function toClient(r: ClientRow): Client {
  return {
    id: r.id,
    user_id: r.user_id,
    full_name: r.name,
    cedula: r.document,
    phone: r.phone,
    email: r.email,
    address: r.address,
    notes: r.notes,
    active: r.status !== "inactive",
    whatsapp: r.whatsapp ?? null,
    trust_score: num(r.trust_score) || 50,
    balance: num(r.balance),
    total_paid: num(r.total_paid),
    total_borrowed: num(r.total_borrowed),
    created_at: r.created_at ?? new Date().toISOString(),
    updated_at: r.created_at ?? new Date().toISOString(),
  };
}

export function toLoan(r: LoanRow): Loan {
  return {
    id: r.id,
    loan_id: r.loan_id ?? "",
    user_id: r.user_id,
    client_id: r.client_id,
    principal: num(r.amount),
    interest_rate: num(r.interest_rate),
    term: num(r.installments),
    frequency: FREQ_TO_VIEW[r.frequency] ?? r.frequency,
    loan_type: LOAN_TYPE_TO_VIEW[r.amortization_type ?? ""] ?? "cuota_fija",
    start_date: r.start_date,
    first_payment_date: r.first_payment_date,
    late_fee_rate: num(r.late_interest_rate),
    status: loanStatusToView(r.status, r.deleted_at),
    notes: r.notes,
    open_ended: Boolean(r.open_ended),
    installment_amount: num(r.installment_amount),
    payment_day: r.payment_day,
    paid_amount: num(r.paid_amount),
    remaining_amount: num(r.remaining_amount),
    prepaid_balance: num(r.prepaid_balance),
    paid_installments: num(r.paid_installments),
    progress: num(r.progress),
    created_at: r.created_at ?? new Date().toISOString(),
    updated_at: r.updated_at ?? r.created_at ?? new Date().toISOString(),
  };
}

export function toInstallment(r: InstallmentRow): Installment {
  return {
    id: r.id,
    loan_id: r.loan_id,
    number: r.number,
    due_date: r.due_date,
    principal_amount: num(r.capital),
    interest_amount: num(r.interest),
    total_amount: num(r.amount),
    paid_amount: num(r.paid_amount),
    late_fee_paid: num(r.paid_late_amount),
    status: installmentStatusToView(r.status),
    paid_at: r.paid_at,
  };
}

export function toPayment(r: PaymentRow): Payment {
  return {
    id: r.id,
    loan_id: r.loan_id ?? "",
    installment_id: r.installment_id,
    user_id: r.user_id,
    amount: num(r.amount),
    principal_portion: num(r.capital_amount),
    interest_portion: num(r.interest_amount),
    late_fee: num(r.late_amount),
    kind: KIND_TO_VIEW[r.type ?? ""] ?? "cuota",
    method: METHOD_TO_VIEW[r.method ?? ""] ?? r.method ?? "efectivo",
    note: r.notes,
    paid_at: r.created_at ?? new Date().toISOString(),
    reversed: r.status === "reversed",
    reversal_reason: r.reversal_reason,
    created_at: r.created_at ?? new Date().toISOString(),
  };
}

function toProfile(uid: string, settings: SettingsRow | null): Profile {
  return {
    id: uid,
    business_name: settings?.business_name ?? "Mi Negocio",
    owner_name: settings?.personal_name ?? null,
    phone: settings?.business_phone ?? null,
    default_late_fee_rate: num(settings?.late_interest_rate),
    grace_days: num(settings?.grace_days),
    plan: "",
    plan_status: "",
    plan_renews_at: null,
    created_at: settings?.updated_at ?? new Date().toISOString(),
  };
}

type LoanEmbedded = Omit<LoanRow, "client"> & {
  client: { id: string; name: string; phone: string | null; whatsapp: string | null } | null;
};

function toLoanWithClient(r: LoanEmbedded): LoanWithClient {
  const { client, ...rest } = r;
  return {
    ...toLoan(rest as LoanRow),
    client: client
      ? { id: client.id, full_name: client.name, phone: client.phone, whatsapp: client.whatsapp ?? null }
      : null,
  };
}

type LoanBriefRow = Pick<
  LoanRow,
  | "id"
  | "loan_id"
  | "status"
  | "late_interest_rate"
  | "frequency"
  | "amortization_type"
  | "open_ended"
  | "deleted_at"
  | "amount"
  | "remaining_amount"
  | "installment_amount"
  | "payment_day"
  | "first_payment_date"
  | "prepaid_balance"
> & {
  client: { id: string; name: string; phone: string | null; whatsapp: string | null } | null;
};

type InstallmentEmbedded = Omit<InstallmentRow, "loan"> & {
  loan: LoanBriefRow | null;
};

function toInstallmentFull(r: InstallmentEmbedded): InstallmentFull {
  const { loan, ...rest } = r;
  if (!loan) return { ...toInstallment(rest as InstallmentRow), loan: null };
  const { client, ...loanRest } = loan;
  return {
    ...toInstallment(rest as InstallmentRow),
    loan: {
      id: loanRest.id,
      display_id: loanRest.loan_id ?? "",
      status: loanStatusToView(loanRest.status, loanRest.deleted_at),
      late_fee_rate: num(loanRest.late_interest_rate),
      frequency: FREQ_TO_VIEW[loanRest.frequency] ?? loanRest.frequency,
      loan_type: LOAN_TYPE_TO_VIEW[loanRest.amortization_type ?? ""] ?? "cuota_fija",
      open_ended: Boolean(loanRest.open_ended),
      principal: num(loanRest.amount),
      remaining_amount: num(loanRest.remaining_amount),
      installment_amount: num(loanRest.installment_amount),
      payment_day: loanRest.payment_day ?? null,
      first_payment_date: loanRest.first_payment_date ?? "",
      prepaid_balance: num(loanRest.prepaid_balance),
      client: client
        ? { id: client.id, full_name: client.name, phone: client.phone, whatsapp: client.whatsapp ?? null }
        : null,
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Queries                                                            */
/* ------------------------------------------------------------------ */

export const qk = {
  profile: ["profile"] as const,
  clients: ["clients"] as const,
  client: (id: string) => ["client", id] as const,
  loans: ["loans"] as const,
  loan: (id: string) => ["loan", id] as const,
  installments: (loanId: string) => ["installments", loanId] as const,
  payments: (loanId: string) => ["payments", loanId] as const,
  allInstallments: ["installments-all"] as const,
  allPayments: ["payments-all"] as const,
  subscription: ["subscription"] as const,
  subscriptionPayments: ["subscription-payments"] as const,
};

async function unwrap<T>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>) {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return (data ?? []) as T;
}

async function unwrapOne<T>(
  p: PromiseLike<{ data: T | null; error: { message: string } | null }>,
): Promise<T | null> {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data;
}

export function useProfile() {
  return useQuery({
    queryKey: qk.profile,
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) return null;
      const { data, error } = await supabase
        .from("settings")
        .select("*")
        .eq("user_id", uid)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return toProfile(uid, data);
    },
  });
}

export function useClients() {
  return useQuery({
    queryKey: qk.clients,
    queryFn: async () => {
      const rows = await unwrap<ClientRow[]>(
        supabase.from("clients").select("*").order("name", { ascending: true }),
      );
      return rows.map(toClient);
    },
  });
}

export function useClient(id: string) {
  return useQuery({
    queryKey: qk.client(id),
    queryFn: async () => {
      const row = await unwrapOne<ClientRow>(
        supabase.from("clients").select("*").eq("id", id).maybeSingle(),
      );
      return row ? toClient(row) : null;
    },
  });
}

export function useLoans() {
  return useQuery({
    queryKey: qk.loans,
    queryFn: async () => {
      const rows = await unwrap<LoanEmbedded[]>(
        supabase
          .from("loans")
          .select("*, client:clients(id, name, phone, whatsapp)")
          .order("created_at", { ascending: false }),
      );
      return rows.map(toLoanWithClient);
    },
  });
}

export function useLoan(id: string) {
  return useQuery({
    queryKey: qk.loan(id),
    queryFn: async () => {
      const row = await unwrapOne<LoanEmbedded>(
        supabase
          .from("loans")
          .select("*, client:clients(id, name, phone, whatsapp)")
          .eq("id", id)
          .maybeSingle(),
      );
      return row ? toLoanWithClient(row) : null;
    },
  });
}

export function useInstallments(loanId: string) {
  return useQuery({
    queryKey: qk.installments(loanId),
    queryFn: async () => {
      const rows = await unwrap<InstallmentRow[]>(
        supabase
          .from("installments")
          .select("*")
          .eq("loan_id", loanId)
          .order("number", { ascending: true }),
      );
      return rows.map(toInstallment);
    },
  });
}

export function usePayments(loanId: string) {
  return useQuery({
    queryKey: qk.payments(loanId),
    queryFn: async () => {
      const rows = await unwrap<PaymentRow[]>(
        supabase
          .from("payments")
          .select("*")
          .eq("loan_id", loanId)
          .order("created_at", { ascending: false }),
      );
      return rows.map(toPayment);
    },
  });
}

export function useAllInstallments() {
  return useQuery({
    queryKey: qk.allInstallments,
    queryFn: async () => {
      const rows = await unwrap<InstallmentEmbedded[]>(
        supabase
          .from("installments")
          .select(
            "*, loan:loans(id, loan_id, status, late_interest_rate, frequency, amortization_type, open_ended, deleted_at, amount, remaining_amount, installment_amount, payment_day, first_payment_date, prepaid_balance, client:clients(id, name, phone, whatsapp))",
          )
          .order("due_date", { ascending: true }),
      );
      return rows.map(toInstallmentFull);
    },
  });
}

export function useAllPayments() {
  return useQuery({
    queryKey: qk.allPayments,
    queryFn: async () => {
      const rows = await unwrap<PaymentRow[]>(
        supabase
          .from("payments")
          .select("*")
          .neq("status", "reversed")
          .order("created_at", { ascending: false }),
      );
      return rows.map(toPayment);
    },
  });
}

/** Suscripción actual del usuario (RLS: solo la propia). */
export function useSubscription() {
  return useQuery({
    queryKey: qk.subscription,
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) return null;
      const { data, error } = await supabase
        .from("subscriptions")
        .select("id, plan_id, status, starts_at, ends_at, plan:plans(name, price, billing_cycle, max_clients, max_loans)")
        .eq("user_id", uid)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      if (error) {
        if (error.message.includes("0 rows") || error.code === "PGRST116") return null;
        throw new Error(error.message);
      }
      const plan = data.plan && typeof data.plan === "object" && "name" in (data.plan as object)
        ? (data.plan as { name: string; price: number; billing_cycle: string; max_clients: number | null; max_loans: number | null })
        : ({} as { name: string; price: number; billing_cycle: string; max_clients: number | null; max_loans: number | null });
      return {
        id: data.id,
        plan_id: data.plan_id,
        status: data.status,
        starts_at: data.starts_at,
        ends_at: data.ends_at,
        plan_name: plan.name || "—",
        plan_price: Number(plan.price || 0),
        plan_max_clients: plan.max_clients ?? null,
        plan_max_loans: plan.max_loans ?? null,
        billing_cycle: plan.billing_cycle || "monthly",
      } satisfies SubscriptionInfo;
    },
  });
}

/** Historial de pagos de suscripción del usuario (RLS: solo los propios). */
export function useSubscriptionPayments() {
  return useQuery({
    queryKey: qk.subscriptionPayments,
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) return [];
      const rows = await unwrap<SubscriptionPaymentRow[]>(
        supabase
          .from("subscription_payments")
          .select("id, amount, payment_date, method, notes, status")
          .eq("user_id", uid)
          .order("payment_date", { ascending: false }),
      );
      return rows;
    },
  });
}

/** Pagos (status paid) de un cliente, para su historial. */
export function useClientPayments(clientId: string | null) {
  return useQuery({
    queryKey: ["client-payments", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const rows = await unwrap<PaymentRow[]>(
        supabase
          .from("payments")
          .select("*")
          .eq("client_id", clientId as string)
          .eq("status", "paid")
          .order("payment_date", { ascending: false })
          .limit(120),
      );
      return rows.map(toPayment);
    },
  });
}
