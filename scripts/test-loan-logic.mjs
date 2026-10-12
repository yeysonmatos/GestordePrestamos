// Prueba de la logica de prestamos (importa finance.ts directamente).
// Uso: node scripts/test-loan-logic.mjs
import {
  accruedInterest,
  addPeriods,
  buildSchedule,
  installmentStatus,
  lateFee,
  periodicRatePct,
  recalcFrenchSchedule,
  settlementQuote,
  todaySD,
  toISO,
  parseDate,
} from "../src/lib/finance.ts";

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log("PASS " + name); }
  else { fail++; console.log("FAIL " + name + (extra ? "  [" + extra + "]" : "")); }
};
const near = (a, b, tol = 0.02) => Math.abs(a - b) <= tol;

// ---- 1) Francesa mensual 10,000 al 10% en 10 cuotas (paridad con GP) ----
const f = buildSchedule({ principal: 10000, interestRate: 10, term: 10, frequency: "mensual", loanType: "cuota_fija", firstPaymentDate: "2026-09-10" });
const iM = periodicRatePct(10, "mensual");
const cuotaGP = (10000 * iM * Math.pow(1 + iM, 10)) / (Math.pow(1 + iM, 10) - 1);
ok("francesa mensual: 10 cuotas", f.length === 10);
ok("francesa mensual: cuota = formula GP (1627.45)", near(f[0].total_amount, Math.round(cuotaGP * 100) / 100), String(f[0].total_amount));
ok("francesa mensual: cuota constante (última ajusta centavos)", f.slice(0, 9).every((r) => near(r.total_amount, f[0].total_amount)) && near(f[9].total_amount, f[0].total_amount, 1.0), String(f[9].total_amount));
ok("francesa mensual: balance final 0", f[9].balance === 0, String(f[9].balance));
ok("francesa mensual: interes creciente capital", f[0].interest_amount > f[9].interest_amount);
ok("francesa mensual: fechas 10/09,10/10,10/11", f[0].due_date === "2026-09-10" && f[1].due_date === "2026-10-10" && f[2].due_date === "2026-11-10");

// ---- 2) Conversion por frecuencia (misma tasa mensual 10%) ----
ok("periodicRatePct semanal 10% = 2.3333%", near(periodicRatePct(10, "semanal"), (10 / 100) * (7 / 30), 1e-9));
ok("periodicRatePct diaria = mensual/30", near(periodicRatePct(10, "diaria"), 0.1 / 30, 1e-9));
ok("periodicRatePct quincenal = 14/30", near(periodicRatePct(10, "quincenal"), 0.1 * 14 / 30, 1e-9));
const w = buildSchedule({ principal: 10000, interestRate: 10, term: 12, frequency: "semanal", loanType: "cuota_fija", firstPaymentDate: "2026-09-10" });
const iS = periodicRatePct(10, "semanal");
const cuotaSemanal = (10000 * iS * Math.pow(1 + iS, 12)) / (Math.pow(1 + iS, 12) - 1);
ok("francesa semanal: cuota 965.06 (conversion GP)", near(w[0].total_amount, Math.round(cuotaSemanal * 100) / 100), String(w[0].total_amount));
ok("francesa semanal: fechas +7 dias", w[1].due_date === "2026-09-17" && w[3].due_date === "2026-10-01");

// ---- 3) Solo interes 12,000 al 10% mensual en 6 (capital al final) ----
const si = buildSchedule({ principal: 12000, interestRate: 10, term: 6, frequency: "mensual", loanType: "solo_interes", firstPaymentDate: "2026-09-05" });
ok("solo interes: 5 cuotas de interes puro", si.slice(0, 5).every((r) => r.principal_amount === 0 && near(r.total_amount, 1200, 0.01)));
ok("solo interes: ultima = interes + capital", near(si[5].total_amount, 1200 + 12000, 0.01) && si[5].principal_amount === 12000);

// ---- 4) Abono a capital francesa: la cuota BAJA, n y fechas NO cambian ----
// Escenario: prestamo 1 (10 cuotas 1627.45), pagadas 2, abono 2000 -> quedan 8 pagos de 8000
const capitalPagadoCuotas = f.slice(0, 2).reduce((s, r) => s + r.principal_amount, 0);
const trasAbono = 10000 - capitalPagadoCuotas - 2000;
const sched2 = recalcFrenchSchedule({ capital: trasAbono, remainingCount: 8, monthlyRatePct: 10, frequency: "mensual", firstPaymentDate: "2026-09-10", startFrom: 3 });
const cuotaEsperadaTrasAbono = (trasAbono * iM * Math.pow(1 + iM, 8)) / (Math.pow(1 + iM, 8) - 1);
ok("abono: 8 cuotas recalculadas (numeros 3-10)", sched2.length === 8 && sched2[0].number === 3 && sched2[7].number === 10);
ok("abono: cuota baja y = formula GP con capital " + trasAbono, sched2[0].total_amount < f[0].total_amount && near(sched2[0].total_amount, Math.round(cuotaEsperadaTrasAbono * 100) / 100), String(sched2[0].total_amount) + " vs " + Math.round(cuotaEsperadaTrasAbono * 100) / 100);
ok("abono: fechas identicas al cronograma original", sched2.every((r, k) => r.due_date === f[k + 2].due_date));
ok("abono: balance final 0", sched2[7].balance === 0);
ok("abono: intereses totales bajan", sched2.reduce((s, r) => s + r.interest_amount, 0) < f.slice(2).reduce((s, r) => s + r.interest_amount, 0));

// ---- 5) Reversion del abono: la cuota SUBE de nuevo ----
const schedBack = recalcFrenchSchedule({ capital: trasAbono + 2000, remainingCount: 8, monthlyRatePct: 10, frequency: "mensual", firstPaymentDate: "2026-09-10", startFrom: 3 });
ok("reversion abono: cuota restaurada a 1627.45", near(schedBack[0].total_amount, f[0].total_amount, 0.02), String(schedBack[0].total_amount));

// ---- 6) Solo interes con abono: el interes periodico se recalcula sobre el saldo ----
const round2Local = (n) => Math.round(n * 100) / 100;
const saldoSI = 12000 - 3000; // abono 3000
const nuevaCuotaSI = round2Local(saldoSI * periodicRatePct(10, "mensual"));
ok("solo interes: interes tras abono = saldo x 10% (900)", nuevaCuotaSI === 900, String(nuevaCuotaSI));

// ---- 7) Mora: % diaria tras dias de gracia, sobre el pendiente ----
const d = parseDate(todaySD());
d.setDate(d.getDate() - 10);
const dueVencido = toISO(d);
const mora = lateFee({ dueDate: dueVencido, pending: 500, lateFeeRate: 2, graceDays: 3 });
ok("mora: 500 x 2% x 7 dias (10-3 gracia) = 70", mora === 70, String(mora));
ok("mora: dentro de gracia = 0", lateFee({ dueDate: dueVencido, pending: 500, lateFeeRate: 2, graceDays: 15 }) === 0);

// ---- 8) Estado de cuota ----
ok("estado: pagada", installmentStatus({ total_amount: 100, paid_amount: 100, due_date: dueVencido }) === "pagada");
ok("estado: vencida (parcial + atrasada)", installmentStatus({ total_amount: 100, paid_amount: 40, due_date: dueVencido }) === "vencida");
ok("estado: parcial (futuro)", installmentStatus({ total_amount: 100, paid_amount: 40, due_date: addPeriods(todaySD(), "mensual", 1) }) === "parcial");
ok("estado: pendiente (futuro)", installmentStatus({ total_amount: 100, paid_amount: 0, due_date: addPeriods(todaySD(), "mensual", 1) }) === "pendiente");

// ---- 9) Liquidacion: capital real + devengo diario + mora ----
const back10 = new Date(); back10.setDate(back10.getDate() - 10);
const lastPay = toISO(back10);
const q = settlementQuote({
  loan: { principal: 10000, interest_rate: 10, start_date: "2026-09-10" },
  installments: f.map((r) => ({ due_date: r.due_date, total_amount: r.total_amount, principal_amount: r.principal_amount, paid_amount: 0 })),
  mora: 100,
  lastPaymentDate: lastPay,
  capitalPaid: 4000,
});
ok("liquidacion: capital = 10000 - 4000 pagado", q.capital === 6000, String(q.capital));
ok("liquidacion: interes diario 6000 x (10/30)% x 10d = 200", near(q.interes, accruedInterest(6000, 10, 10), 0.5), String(q.interes));
ok("liquidacion: total = capital + interes + mora", near(q.total, 6000 + 200 + 100, 1), String(q.total));
ok("accruedInterest 0 dias = 0", accruedInterest(6000, 10, 0) === 0);

console.log("\n" + pass + " pass / " + fail + " fail");
process.exit(fail ? 1 : 0);
