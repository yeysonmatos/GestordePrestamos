// Plan de rebalanceo del cronograma tras un abono a capital o su reversión.
// Función pura (sin base de datos) para poder probarla; la escritura la hace
// applyLoanOperation (src/lib/loan-ops.ts) en una sola transacción.
import { periodicRatePct, recalcFrenchSchedule } from "./finance";
import type { Frequency } from "./finance";
import type { Loan } from "./db";

const round2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: number | null | undefined) => Number(v ?? 0);

export type InstallmentRow = {
  id: string;
  number: number;
  status: string | null;
  amount: number;
  paid_amount: number | null;
  interest: number | null;
};

export type InstallmentWrite = {
  key: "id" | "number";
  value: string | number;
  data: Record<string, string | number>;
};

export type RebalancePlan = {
  installmentWrites: InstallmentWrite[];
  loanUpdates: Record<string, number>;
};

export type RebalanceLoan = Pick<
  Loan,
  "principal" | "open_ended" | "interest_rate" | "frequency" | "loan_type" | "first_payment_date"
> & { installment_amount: number };

/**
 * Plan de rebalanceo tras cambiar el capital pagado (abono o su reversión).
 * Mismas reglas que tenía applyCapitalRebalance: en francesa recalcula las
 * cuotas pendientes (baja la cuota y los intereses; número de cuotas y fechas
 * no cambian); en solo interés recalcula el interés periódico sobre el saldo;
 * en préstamo abierto, el interés del período. Si el abono cubre todo lo
 * pendiente, marca las cuotas como pagadas.
 *
 * @param capitalPaid capital cobrado DESPUÉS de la operación.
 * @param applied     monto del abono recién hecho (0 en una reversión).
 */
export function planCapitalRebalance(params: {
  loan: RebalanceLoan;
  rows: InstallmentRow[];
  capitalPaid: number;
  applied?: number;
  today: string;
}): RebalancePlan {
  const { loan, rows, today } = params;
  const applied = params.applied ?? 0;
  const pend = rows.filter((r) => r.status !== "paid");
  const paid = rows.filter((r) => r.status === "paid");
  const capitalRemaining = round2(Math.max(loan.principal - params.capitalPaid, 0));
  const contractualPending = round2(
    pend.reduce((s, r) => s + Math.max(0, num(r.amount) - num(r.paid_amount)), 0),
  );

  const closeAll = (): RebalancePlan => ({
    installmentWrites: pend.map((inst) => ({
      key: "id",
      value: inst.id,
      data: { status: "paid", paid_amount: num(inst.amount), paid_at: today },
    })),
    loanUpdates: {},
  });

  // El abono cubrió todo lo contractualmente pendiente -> cerrar pagando todo.
  if (!loan.open_ended && contractualPending - applied <= 0.009 && pend.length > 0) {
    return closeAll();
  }
  if (!loan.open_ended && capitalRemaining <= 0.009 && pend.length > 0) {
    return closeAll();
  }

  const i = periodicRatePct(loan.interest_rate, loan.frequency);

  if (loan.open_ended) {
    return {
      installmentWrites: [],
      loanUpdates: { installment_amount: round2(capitalRemaining * i) },
    };
  }

  if (loan.loan_type === "solo_interes") {
    const newInterest = round2(capitalRemaining * i);
    const lastNum = pend.length > 0 ? Math.max(...pend.map((r) => Number(r.number))) : 0;
    return {
      installmentWrites: pend.map((inst) => {
        const isLast = Number(inst.number) === lastNum;
        return {
          key: "id",
          value: inst.id,
          data: {
            amount: round2(newInterest + (isLast ? capitalRemaining : 0)),
            interest: newInterest,
            capital: isLast ? capitalRemaining : 0,
            balance: isLast ? 0 : capitalRemaining,
          },
        };
      }),
      loanUpdates: { installment_amount: newInterest },
    };
  }

  // Francesa
  if (pend.length <= 0 || capitalRemaining <= 0.009)
    return { installmentWrites: [], loanUpdates: {} };
  const sched = recalcFrenchSchedule({
    capital: capitalRemaining,
    remainingCount: pend.length,
    monthlyRatePct: loan.interest_rate,
    frequency: loan.frequency as Frequency,
    firstPaymentDate: loan.first_payment_date,
    startFrom: paid.length + 1,
  });
  const paidTotal = paid.reduce((s, r) => s + num(r.amount), 0);
  const paidInt = paid.reduce((s, r) => s + num(r.interest), 0);
  return {
    installmentWrites: sched.map((row) => ({
      key: "number",
      value: row.number,
      data: {
        amount: row.total_amount,
        capital: row.principal_amount,
        interest: row.interest_amount,
        balance: row.balance,
      },
    })),
    loanUpdates: {
      installment_amount: sched[0] ? round2(sched[0].total_amount) : loan.installment_amount,
      total_amount: round2(sched.reduce((s, r) => s + r.total_amount, 0) + paidTotal),
      total_interest: round2(sched.reduce((s, r) => s + r.interest_amount, 0) + paidInt),
    },
  };
}
