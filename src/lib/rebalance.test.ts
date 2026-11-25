import { describe, expect, it } from "vitest";

import { buildSchedule } from "./finance";
import { planCapitalRebalance, type InstallmentRow } from "./rebalance";

// planCapitalRebalance calcula qué escribir tras un abono a capital o su
// reversión; la base de datos lo aplica en una sola transacción.

const loanFrancesa = {
  principal: 4000,
  open_ended: false,
  interest_rate: 10,
  frequency: "mensual",
  loan_type: "cuota_fija",
  first_payment_date: "2026-11-16",
  installment_amount: 1055.19,
};

function rowsFrom(principal: number, paidCount = 0): InstallmentRow[] {
  return buildSchedule({
    principal,
    interestRate: 10,
    term: 5,
    frequency: "mensual",
    loanType: "cuota_fija",
    firstPaymentDate: "2026-11-16",
  }).map((r, idx) => ({
    id: `inst-${r.number}`,
    number: r.number,
    status: idx < paidCount ? "paid" : "pending",
    amount: r.total_amount,
    paid_amount: idx < paidCount ? r.total_amount : 0,
    interest: r.interest_amount,
  }));
}

describe("planCapitalRebalance — cuota fija (francesa)", () => {
  it("un abono baja la cuota y los intereses; mismas cuotas y números", () => {
    const plan = planCapitalRebalance({
      loan: loanFrancesa,
      rows: rowsFrom(4000),
      capitalPaid: 1000,
      applied: 1000,
      today: "2026-11-25",
    });
    expect(plan.installmentWrites).toHaveLength(5);
    expect(plan.installmentWrites.map((w) => w.key)).toEqual(Array(5).fill("number"));
    expect(plan.installmentWrites.map((w) => w.value)).toEqual([1, 2, 3, 4, 5]);
    // 3,000 al 10% en 5 cuotas = 3/4 de la cuota original
    expect(plan.loanUpdates["installment_amount"]).toBeCloseTo(791.39, 2);
    expect(plan.loanUpdates["installment_amount"]!).toBeLessThan(1055.19);
    // El capital de las cuotas nuevas suma el capital restante
    const capital = plan.installmentWrites.reduce((s, w) => s + Number(w.data["capital"]), 0);
    expect(capital).toBeCloseTo(3000, 1);
  });

  it("con cuotas ya pagadas solo recalcula las pendientes (desde la siguiente)", () => {
    const rows = rowsFrom(4000, 2);
    const plan = planCapitalRebalance({
      loan: loanFrancesa,
      rows,
      capitalPaid: 2000,
      applied: 500,
      today: "2026-11-25",
    });
    expect(plan.installmentWrites.map((w) => w.value)).toEqual([3, 4, 5]);
    const paidTotal = rows[0]!.amount + rows[1]!.amount;
    const pendTotal = plan.installmentWrites.reduce((s, w) => s + Number(w.data["amount"]), 0);
    expect(plan.loanUpdates["total_amount"]).toBeCloseTo(paidTotal + pendTotal, 1);
  });

  it("revertir el abono (capital pagado vuelve a 0) restaura la cuota original", () => {
    const plan = planCapitalRebalance({
      loan: loanFrancesa,
      rows: rowsFrom(3000),
      capitalPaid: 0,
      today: "2026-11-25",
    });
    expect(plan.loanUpdates["installment_amount"]).toBeCloseTo(1055.19, 2);
  });

  it("si el abono cubre todo lo pendiente, marca todas las cuotas como pagadas", () => {
    const rows = rowsFrom(4000);
    const pending = rows.reduce((s, r) => s + r.amount, 0);
    const plan = planCapitalRebalance({
      loan: loanFrancesa,
      rows,
      capitalPaid: 4000,
      applied: pending,
      today: "2026-11-25",
    });
    expect(plan.loanUpdates).toEqual({});
    expect(plan.installmentWrites).toHaveLength(5);
    for (const w of plan.installmentWrites) {
      expect(w.key).toBe("id");
      expect(w.data["status"]).toBe("paid");
      expect(w.data["paid_at"]).toBe("2026-11-25");
    }
  });
});

describe("planCapitalRebalance — solo interés y préstamo abierto", () => {
  it("solo interés: nuevo interés sobre el saldo y el capital en la última cuota", () => {
    const rows: InstallmentRow[] = [1, 2, 3].map((n) => ({
      id: `i${n}`,
      number: n,
      status: "pending",
      amount: n === 3 ? 10500 : 500,
      paid_amount: 0,
      interest: 500,
    }));
    const plan = planCapitalRebalance({
      loan: { ...loanFrancesa, principal: 10000, loan_type: "solo_interes", interest_rate: 5 },
      rows,
      capitalPaid: 4000,
      applied: 4000,
      today: "2026-11-25",
    });
    expect(plan.loanUpdates["installment_amount"]).toBeCloseTo(300, 2);
    const last = plan.installmentWrites.find((w) => w.value === "i3")!;
    expect(last.data).toMatchObject({ amount: 6300, capital: 6000, balance: 0, interest: 300 });
    const first = plan.installmentWrites.find((w) => w.value === "i1")!;
    expect(first.data).toMatchObject({ amount: 300, capital: 0, balance: 6000 });
  });

  it("préstamo abierto: solo cambia el interés del período", () => {
    const plan = planCapitalRebalance({
      loan: {
        ...loanFrancesa,
        principal: 50000,
        open_ended: true,
        loan_type: "solo_interes",
        interest_rate: 10,
      },
      rows: [],
      capitalPaid: 10000,
      applied: 10000,
      today: "2026-11-25",
    });
    expect(plan.installmentWrites).toEqual([]);
    expect(plan.loanUpdates["installment_amount"]).toBeCloseTo(4000, 2);
  });
});
