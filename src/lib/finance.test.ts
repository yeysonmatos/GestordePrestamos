import { describe, expect, it } from "vitest";

import {
  addPeriods,
  buildSchedule,
  installmentStatus,
  lateFee,
  moraDays,
  periodicRatePct,
  rd,
  recalcFrenchSchedule,
  todaySD,
} from "./finance";

/**
 * Ensayos de los cálculos de dinero. Los números salen de préstamos reales ya
 * verificados en producción (17 Oct 2026), así que si alguien rompe la fórmula
 * el ensayo falla antes de que llegue al usuario.
 */

describe("buildSchedule — cuota fija (francesa)", () => {
  it("mensual: 4,000 al 10% en 5 cuotas = 1,055.19 (P303249)", () => {
    const s = buildSchedule({
      principal: 4000,
      interestRate: 10,
      term: 5,
      frequency: "mensual",
      loanType: "cuota_fija",
      firstPaymentDate: "2026-11-16",
    });
    expect(s).toHaveLength(5);
    expect(s[0]!.total_amount).toBeCloseTo(1055.19, 2);
    expect(s.map((r) => r.due_date)).toEqual([
      "2026-11-16",
      "2026-12-16",
      "2027-01-16",
      "2027-02-16",
      "2027-03-16",
    ]);
    expect(s[4]!.balance).toBeCloseTo(0, 2);
  });

  it("diaria: 1,000 al 10% en 10 cuotas = 101.84 y fechas día a día (P953257)", () => {
    const s = buildSchedule({
      principal: 1000,
      interestRate: 10,
      term: 10,
      frequency: "diaria",
      loanType: "cuota_fija",
      firstPaymentDate: "2026-10-16",
    });
    expect(s[0]!.total_amount).toBeCloseTo(101.84, 2);
    expect(s[0]!.due_date).toBe("2026-10-16");
    expect(s[1]!.due_date).toBe("2026-10-17");
    expect(s[9]!.due_date).toBe("2026-10-25");
  });

  it("semanal: 7,000 al 10% en 10 cuotas = 792.94 (P073602)", () => {
    const s = buildSchedule({
      principal: 7000,
      interestRate: 10,
      term: 10,
      frequency: "semanal",
      loanType: "cuota_fija",
      firstPaymentDate: "2026-10-24",
    });
    expect(s[0]!.total_amount).toBeCloseTo(792.94, 2);
    expect(s[1]!.due_date).toBe("2026-10-31");
  });

  it("el capital de las cuotas suma exactamente lo prestado", () => {
    const s = buildSchedule({
      principal: 25000,
      interestRate: 12,
      term: 12,
      frequency: "quincenal",
      loanType: "cuota_fija",
      firstPaymentDate: "2026-11-01",
    });
    const capital = s.reduce((a, r) => a + r.principal_amount, 0);
    expect(capital).toBeCloseTo(25000, 1);
    expect(s[s.length - 1]!.balance).toBeCloseTo(0, 2);
  });

  it("sin cuotas (préstamo abierto) no genera cronograma", () => {
    expect(
      buildSchedule({
        principal: 1000,
        interestRate: 10,
        term: 0,
        frequency: "mensual",
        loanType: "cuota_fija",
        firstPaymentDate: "2026-11-16",
      }),
    ).toEqual([]);
  });
});

describe("buildSchedule — solo interés", () => {
  it("3,000 al 10% en 5 cuotas: interés 300 y el capital en la última (P864183)", () => {
    const s = buildSchedule({
      principal: 3000,
      interestRate: 10,
      term: 5,
      frequency: "mensual",
      loanType: "solo_interes",
      firstPaymentDate: "2026-11-16",
    });
    expect(s[0]!.total_amount).toBeCloseTo(300, 2);
    expect(s[0]!.principal_amount).toBe(0);
    expect(s[3]!.total_amount).toBeCloseTo(300, 2);
    expect(s[4]!.principal_amount).toBeCloseTo(3000, 2);
    expect(s[4]!.total_amount).toBeCloseTo(3300, 2);
  });
});

describe("addPeriods — vencimientos por frecuencia", () => {
  it("mensual, semanal, quincenal y diaria", () => {
    expect(addPeriods("2026-11-16", "mensual", 1)).toBe("2026-12-16");
    expect(addPeriods("2026-10-24", "semanal", 1)).toBe("2026-10-31");
    expect(addPeriods("2026-10-16", "quincenal", 1)).toBe("2026-10-31");
    expect(addPeriods("2026-10-16", "diaria", 3)).toBe("2026-10-19");
  });

  it("cuenta 0 no mueve la fecha", () => {
    expect(addPeriods("2026-11-16", "mensual", 0)).toBe("2026-11-16");
  });
});

describe("periodicRatePct — la tasa mensual se convierte por período", () => {
  it("10% mensual equivale a 1/30 diario, 7/30 semanal y 10% mensual", () => {
    expect(periodicRatePct(10, "mensual")).toBeCloseTo(0.1, 6);
    expect(periodicRatePct(10, "diaria")).toBeCloseTo(0.1 / 30, 6);
    expect(periodicRatePct(10, "semanal")).toBeCloseTo((0.1 * 7) / 30, 6);
    expect(periodicRatePct(10, "quincenal")).toBeCloseTo((0.1 * 14) / 30, 6);
  });
});

describe("installmentStatus — una cuota que vence HOY todavía no está atrasada", () => {
  const hoy = todaySD();

  it("vence hoy → pendiente (pasa a vencida mañana)", () => {
    expect(installmentStatus({ total_amount: 100, paid_amount: 0, due_date: hoy })).toBe(
      "pendiente",
    );
  });

  it("venció ayer → vencida", () => {
    const ayer = addPeriods(hoy, "diaria", -1);
    expect(installmentStatus({ total_amount: 100, paid_amount: 0, due_date: ayer })).toBe(
      "vencida",
    );
  });

  it("pagada completa y pago parcial", () => {
    const ayer = addPeriods(hoy, "diaria", -1);
    expect(installmentStatus({ total_amount: 100, paid_amount: 100, due_date: ayer })).toBe(
      "pagada",
    );
    expect(installmentStatus({ total_amount: 100, paid_amount: 40, due_date: hoy })).toBe(
      "parcial",
    );
    expect(installmentStatus({ total_amount: 100, paid_amount: 40, due_date: ayer })).toBe(
      "vencida",
    );
  });
});

describe("lateFee / moraDays — mora diaria sobre el saldo, tras los días de gracia", () => {
  it("900 al 5% diario con 2 días de atraso = 90", () => {
    expect(
      lateFee({ dueDate: "2026-10-15", pending: 900, lateFeeRate: 5, today: "2026-10-17" }),
    ).toBeCloseTo(90, 2);
  });

  it("con 3 días de gracia y 2 de atraso no cobra mora", () => {
    expect(
      lateFee({
        dueDate: "2026-10-15",
        pending: 900,
        lateFeeRate: 5,
        graceDays: 3,
        today: "2026-10-17",
      }),
    ).toBe(0);
  });

  it("sin atraso no hay mora", () => {
    expect(
      lateFee({ dueDate: "2026-10-17", pending: 900, lateFeeRate: 5, today: "2026-10-17" }),
    ).toBe(0);
  });

  it("moraDays descuenta la gracia", () => {
    expect(moraDays("2026-10-15", 0, "2026-10-17")).toBe(2);
    expect(moraDays("2026-10-15", 3, "2026-10-17")).toBe(0);
  });
});

describe("recalcFrenchSchedule — recálculo tras un abono a capital", () => {
  it("con menos capital y las cuotas restantes, la cuota baja y el capital cuadra", () => {
    // La app lo llama con la fecha del PRIMER pago del préstamo y el número de la
    // primera cuota pendiente (p. ej. startFrom=3 si ya pagó 2).
    const rows = recalcFrenchSchedule({
      capital: 2000,
      remainingCount: 3,
      monthlyRatePct: 10,
      frequency: "mensual",
      firstPaymentDate: "2026-10-16",
      startFrom: 3,
    });
    expect(rows).toHaveLength(3);
    expect(rows[0]!.number).toBe(3);
    expect(rows[0]!.due_date).toBe("2026-12-16");
    expect(rows[1]!.due_date).toBe("2027-01-16");
    const capital = rows.reduce((a, r) => a + r.principal_amount, 0);
    expect(capital).toBeCloseTo(2000, 1);
    expect(rows[2]!.balance).toBeCloseTo(0, 2);
  });
});

describe("rd — formato de montos", () => {
  it("dos decimales con separador de miles", () => {
    expect(rd(1234567.891)).toBe("1,234,567.89");
    expect(rd(null)).toBe("0.00");
  });
});
