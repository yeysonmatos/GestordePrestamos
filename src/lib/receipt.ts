import type { Loan, Payment } from "@/lib/db";
import type { Receipt } from "@/components/pay-dialog";
import { getPaymentLabel } from "@/lib/payment-labels";

const METHOD_LABEL: Record<string, string> = {
  efectivo: "Efectivo",
  cash: "Efectivo",
  transferencia: "Transferencia",
  transfer: "Transferencia",
  deposito: "Depósito",
  deposit: "Depósito",
  otro: "Otro",
  other: "Otro",
};

/**
 * Reconstruye el recibo de un pago ya guardado (para reenviarlo cuando haga
 * falta). Todo viene de la fila del pago; el saldo se recalcula:
 *  - si es el ultimo pago vigente: el `remaining_amount` actual (valor exacto);
 *  - si es uno anterior: capital pendiente hasta ese pago
 *    (`prestado - capital cobrado hasta ahi`), que es la identidad contable
 *    que usa la app para "capital pendiente".
 */
export function receiptFromPayment(opts: {
  payment: Payment;
  loan: Loan;
  clientName: string;
  business: string;
  phone: string | null;
  whatsapp: string | null;
  installmentNumber: number | null;
  payments: Payment[];
  currentBalance: number;
}): Receipt {
  const { payment, loan, payments } = opts;
  const ordered = payments
    .filter((p) => !p.reversed)
    .slice()
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  const idx = ordered.findIndex((p) => p.id === payment.id);
  const upTo = ordered.slice(0, idx + 1);
  const isLatest = idx === ordered.length - 1;

  const capitalPaid = upTo.reduce((s, p) => s + Number(p.principal_portion || 0), 0);
  const historicalBalance = Math.max(0, Number(loan.principal) - capitalPaid);

  return {
    paymentId: payment.id,
    business: opts.business,
    client: opts.clientName,
    loanDisplayId: loan.loan_id ?? "",
    payType: getPaymentLabel(payment, {
      installmentNumber: opts.installmentNumber,
      includeMethod: false,
    }),
    method:
      METHOD_LABEL[String(payment.method || "").toLowerCase()] ?? String(payment.method || ""),
    amount: Number(payment.amount),
    capital: Number(payment.principal_portion),
    interest: Number(payment.interest_portion),
    late: Number(payment.late_fee),
    date: payment.payment_date ?? payment.paid_at,
    newBalance: isLatest ? Math.max(0, opts.currentBalance) : historicalBalance,
    phone: opts.phone,
    whatsapp: opts.whatsapp,
    notes: payment.note ?? null,
    copy: true,
  };
}
