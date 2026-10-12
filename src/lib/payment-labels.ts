import type { Payment } from "./db";

export function getPaymentLabel(
  payment: Payment,
  opts?: { installmentNumber?: number | null; includeMethod?: boolean },
): string {
  const method =
    opts?.includeMethod === false || !payment.method
      ? ""
      : " · " + payment.method.charAt(0).toUpperCase() + payment.method.slice(1);
  const num = opts?.installmentNumber;
  switch (payment.kind) {
    case "cuota":
      if (!payment.installment_id) return "Interés (préstamo abierto)" + method;
      return (num && num > 0 ? "Cuota " + num : "Cuota") + method;
    case "abono_capital":
      return "Abono a capital" + method;
    case "liquidacion":
      return "Liquidación" + method;
    default:
      return (num && num > 0 ? "Cuota " + num : "Pago") + method;
  }
}
