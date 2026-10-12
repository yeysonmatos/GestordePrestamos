import { formatDate, rd } from "@/lib/finance";

/** Normaliza teléfono a dígitos para wa.me (como GP). */
export function waPhone(phone: string | null | undefined): string {
  return (phone ?? "").replace(/[^0-9]/g, "");
}

export function whatsappUrl(phone: string | null | undefined, message: string): string {
  return `https://wa.me/${waPhone(phone)}?text=${encodeURIComponent(message)}`;
}

/** Recordio/amable al cliente: saludo + saldo + próxima cuota. */
export function buildClientMessage(params: {
  clientName: string;
  businessName?: string | null | undefined;
  balance?: number | null | undefined;
  nextDue?: string | null | undefined;
}): string {
  const biz = params.businessName || "Gestor de Prestamos";
  let msg = `Hola ${params.clientName}, saludos de ${biz}.`;
  if (params.balance && params.balance > 0) {
    msg += `\nSaldo por pagar: ${rd(params.balance)}`;
    if (params.nextDue) msg += `\nPróxima cuota: ${formatDate(params.nextDue)}`;
  } else {
    msg += `\nActualmente no tienes deudas pendientes. ¡Gracias!`;
  }
  return msg;
}

/** Recibo de pago para WhatsApp. */
export function buildReceiptMessage(params: {
  amount: number;
  payType: string;
  payMethod: string;
  clientName: string;
  loanId: string;
  paymentDate: string;
  notes?: string | null | undefined;
  newBalance: number;
  businessName?: string | null | undefined;
}): string {
  const lines = [
    "🧾 RECIBO DE PAGO",
    rd(params.amount),
    `${params.payType} · ${params.payMethod}`,
    "",
    `Cliente: ${params.clientName}`,
    `Préstamo: ${params.loanId}`,
    `Fecha: ${formatDate(params.paymentDate)}`,
  ];
  if (params.notes) lines.push(`Nota: ${params.notes}`);
  lines.push("", `Nuevo balance: ${rd(params.newBalance)}`, "", params.businessName || "Gestor de Prestamos");
  return lines.join("\n");
}

/** Resumen de pagos del préstamo. */
export function buildPaymentSummary(params: {
  loanId: string;
  clientName: string;
  totalPaid: number;
  pending: number;
  businessName?: string | null;
}): string {
  return [
    "📊 RESUMEN DE PAGOS",
    "",
    `Préstamo: ${params.loanId}`,
    `Cliente: ${params.clientName}`,
    `Total pagado: ${rd(params.totalPaid)}`,
    `Pendiente: ${rd(params.pending)}`,
    "",
    params.businessName || "Gestor de Prestamos",
  ].join("\n");
}
