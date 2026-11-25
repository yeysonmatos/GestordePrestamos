// Operaciones de dinero en UNA transacción (RPC apply_loan_operation,
// supabase/atomic-operations.sql). Los cálculos del cronograma se hacen aquí,
// en TypeScript; la base de datos aplica todas las escrituras juntas y, si
// algo falla, no queda nada a medias.
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type { Loan } from "@/lib/db";
import { toLoan } from "@/lib/db";
import type { InstallmentRow, InstallmentWrite, RebalanceLoan } from "@/lib/rebalance";

export { planCapitalRebalance } from "@/lib/rebalance";
export type { InstallmentRow, InstallmentWrite, RebalancePlan } from "@/lib/rebalance";

const round2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: number | null | undefined) => Number(v ?? 0);

export type LoanOperation = {
  reverse_payment_id?: string;
  reversal_reason?: string;
  payment?: {
    amount: number;
    capital_amount?: number;
    interest_amount?: number;
    late_amount?: number;
    type: "installment" | "capital_abono" | "liquidation";
    payment_date: string;
    method: string;
    notes?: string | null;
    installment_id?: string | null;
  };
  recalc_installments?: string[] | "all";
  installment_writes?: InstallmentWrite[];
  loan_updates?: Record<string, number>;
};

export type CreatedPayment = {
  id: string;
  amount: number;
  capital_amount: number;
  interest_amount: number;
  late_amount: number;
  payment_date: string;
  method: string;
  notes: string | null;
};

/** Aplica la operación completa en la base de datos (todo o nada). */
export async function applyLoanOperation(
  loanId: string,
  ops: LoanOperation,
): Promise<{ payment: CreatedPayment | null }> {
  const { data, error } = await supabase.rpc("apply_loan_operation", {
    p_loan_id: loanId,
    p_ops: ops as unknown as Json,
  });
  if (error) throw new Error(error.message);
  type RawPayment = {
    id: string;
    amount: number;
    capital_amount: number | null;
    interest_amount: number | null;
    late_amount: number | null;
    payment_date: string;
    method: string;
    notes: string | null;
  };
  const res = data as { ok?: boolean; payment?: RawPayment | null } | null;
  if (!res?.ok) throw new Error("No se pudo registrar la operación");
  const p = res.payment;
  return {
    payment: p
      ? {
          id: String(p.id),
          amount: num(p.amount),
          capital_amount: num(p.capital_amount),
          interest_amount: num(p.interest_amount),
          late_amount: num(p.late_amount),
          payment_date: String(p.payment_date),
          method: String(p.method),
          notes: p.notes ?? null,
        }
      : null,
  };
}

/** Datos que necesita planCapitalRebalance, leídos de la base. */
export async function fetchRebalanceInputs(loanId: string): Promise<{
  loan: RebalanceLoan & { deleted: boolean };
  rows: InstallmentRow[];
  capitalPaid: number;
}> {
  const [{ data: loanRow, error: lErr }, { data: instRows }, { data: capRows }] = await Promise.all(
    [
      supabase.from("loans").select("*").eq("id", loanId).maybeSingle(),
      supabase
        .from("installments")
        .select("id, number, status, amount, paid_amount, interest")
        .eq("loan_id", loanId)
        .order("number"),
      supabase.from("payments").select("capital_amount").eq("loan_id", loanId).eq("status", "paid"),
    ],
  );
  if (lErr || !loanRow) throw new Error("Préstamo no encontrado");
  const loan = toLoan(loanRow);
  return {
    loan: {
      principal: loan.principal,
      open_ended: loan.open_ended,
      interest_rate: loan.interest_rate,
      frequency: loan.frequency,
      loan_type: loan.loan_type,
      first_payment_date: loan.first_payment_date,
      installment_amount: num(loan.installment_amount),
      deleted: Boolean((loanRow as { deleted_at?: string | null }).deleted_at),
    },
    rows: (instRows ?? []) as InstallmentRow[],
    capitalPaid: round2((capRows ?? []).reduce((s, p) => s + num(p.capital_amount), 0)),
  };
}
