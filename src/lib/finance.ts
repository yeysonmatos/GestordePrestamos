export type Frequency = "diaria" | "semanal" | "quincenal" | "mensual";
export type LoanType = "cuota_fija" | "solo_interes";

export const FREQUENCIES: { value: Frequency; label: string; perYear: number }[] = [
  { value: "diaria", label: "Diaria", perYear: 365 },
  { value: "semanal", label: "Semanal", perYear: 52 },
  { value: "quincenal", label: "Quincenal", perYear: 24 },
  { value: "mensual", label: "Mensual", perYear: 12 },
];

export const LOAN_TYPES: { value: LoanType; label: string }[] = [
  { value: "cuota_fija", label: "Cuota fija (amortización francesa)" },
  { value: "solo_interes", label: "Solo interés (capital al final)" },
];

/** Formatea un número (montos sin símbolo de moneda). */
export function rd(value: number | null | undefined): string {
  const n = Number(value ?? 0);
  if (Number.isNaN(n)) return "0";
  return n.toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function pct(value: number): string {
  return `${Number(value ?? 0).toLocaleString("es-DO", { maximumFractionDigits: 2 })}%`;
}

/** Fecha de hoy en Santo Domingo, formato YYYY-MM-DD. */
export function todaySD(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santo_Domingo" }).format(new Date());
}

export function parseDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

export function toISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export const MONTHS_ES = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
] as const;

function sdParts(d: Date): Record<string, string> {
  const f = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Santo_Domingo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
  return Object.fromEntries(f.formatToParts(d).map((p) => [p.type, p.value]));
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "-";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]} ${MONTHS_ES[Number(m[2]) - 1]} ${m[1]}`;
  const p = sdParts(new Date(iso));
  return `${p["day"]} ${MONTHS_ES[Number(p["month"]) - 1]} ${p["year"]}`;
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  const p = sdParts(new Date(value));
  const meridiem = (p["dayPeriod"] || "").toLowerCase().startsWith("p") ? "p. m." : "a. m.";
  return `${p["day"]} ${MONTHS_ES[Number(p["month"]) - 1]} ${p["year"]} ${p["hour"]}:${p["minute"]} ${meridiem}`;
}

/**
 * Fecha para recibos con el formato unico del sistema ("16 octubre 2026").
 * Para valores "yyyy-mm-dd" evita el salto de zona horaria (UTC vs RD) que
 * corria un dia; si el valor trae hora usa el formateador del sistema.
 */
export function formatReceiptDate(value: string | null | undefined): string {
  if (!value) return "-";
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${Number(m[3])} ${MONTHS_ES[Number(m[2]) - 1]} ${m[1]}`;
  return formatDateTime(value);
}

export function addPeriods(iso: string, frequency: Frequency, count: number): string {
  const d = parseDate(iso);
  switch (frequency) {
    case "diaria":
      d.setDate(d.getDate() + count);
      break;
    case "semanal":
      d.setDate(d.getDate() + 7 * count);
      break;
    case "quincenal":
      d.setDate(d.getDate() + 15 * count);
      break;
    case "mensual":
      d.setMonth(d.getMonth() + count);
      break;
  }
  return toISO(d);
}

export function daysBetween(fromISO: string, toISOStr: string): number {
  const a = parseDate(fromISO).getTime();
  const b = parseDate(toISOStr).getTime();
  return Math.round((b - a) / 86400000);
}

export type ScheduleRow = {
  number: number;
  due_date: string;
  principal_amount: number;
  interest_amount: number;
  total_amount: number;
  balance: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Días por período según frecuencia (vista). */
export const PERIOD_DAYS: Record<string, number> = {
  diaria: 1,
  semanal: 7,
  quincenal: 14,
  mensual: 30,
};

/**
 * Convierte la tasa mensual (%) a tasa fraccionada del período, como GP:
 * mensual / 30 x dias del periodo. 10% mensual en semanal = 0.02333.
 */
export function periodicRatePct(monthlyRatePct: number, frequency: Frequency | string): number {
  const days = PERIOD_DAYS[frequency] ?? 30;
  return (Number(monthlyRatePct) / 100) * (days / 30);
}

/** Interés devengado día a día sobre un capital (tasa mensual, sin tope de período). */
export function accruedInterest(capital: number, monthlyRatePct: number, days: number): number {
  if (days <= 0 || capital <= 0 || !monthlyRatePct) return 0;
  return round2(capital * (monthlyRatePct / 100 / 30) * days);
}

/**
 * Genera el cronograma. `interestRate` es la tasa MENSUAL (%); se convierte a
 * tasa por período según la frecuencia (igual que GP).
 */
export function buildSchedule(params: {
  principal: number;
  interestRate: number;
  term: number;
  frequency: Frequency;
  loanType: LoanType;
  firstPaymentDate: string;
}): ScheduleRow[] {
  const { principal, interestRate, term, frequency, loanType, firstPaymentDate } = params;
  const i = periodicRatePct(interestRate, frequency);
  const rows: ScheduleRow[] = [];
  if (!principal || !term || term < 1) return rows;

  if (loanType === "solo_interes") {
    let balance = principal;
    for (let n = 1; n <= term; n++) {
      const interest = round2(principal * i);
      const capital = n === term ? principal : 0;
      balance = round2(balance - capital);
      rows.push({
        number: n,
        due_date: addPeriods(firstPaymentDate, frequency, n - 1),
        principal_amount: capital,
        interest_amount: interest,
        total_amount: round2(capital + interest),
        balance,
      });
    }
    return rows;
  }

  const payment = i === 0 ? principal / term : (principal * i) / (1 - Math.pow(1 + i, -term));
  let balance = principal;
  for (let n = 1; n <= term; n++) {
    const interest = round2(balance * i);
    let capital = round2(payment - interest);
    if (n === term) capital = round2(balance);
    balance = round2(balance - capital);
    rows.push({
      number: n,
      due_date: addPeriods(firstPaymentDate, frequency, n - 1),
      principal_amount: capital,
      interest_amount: interest,
      total_amount: round2(capital + interest),
      balance: Math.max(balance, 0),
    });
  }
  return rows;
}

/** Mora acumulada: tasa % DIARIA sobre el saldo restante, tras los días de gracia (como GP/BD compartida). */
export function lateFee(params: {
  dueDate: string;
  pending: number;
  lateFeeRate: number;
  graceDays?: number;
  today?: string;
}): number {
  const { dueDate, pending, lateFeeRate } = params;
  const today = params.today ?? todaySD();
  const grace = Math.max(0, Math.floor(params.graceDays ?? 0));
  const days = Math.max(0, daysBetween(dueDate, today) - grace);
  if (days <= 0 || pending <= 0 || !lateFeeRate) return 0;
  return round2(pending * (lateFeeRate / 100) * days);
}

/** Días de atraso reales (tras gracia) de una cuota vencida. */
export function moraDays(dueDate: string, graceDays = 0, today?: string): number {
  return Math.max(0, daysBetween(dueDate, today ?? todaySD()) - Math.max(0, graceDays));
}

/** Próximo vencimiento mensual del día configurado (préstamos abiertos), desde `from` (yyyy-mm-dd). */
export function nextDueDateAfter(
  firstPaymentDate: string | null | undefined,
  paymentDay: number | null | undefined,
  from: string,
): string {
  const day = Math.max(
    1,
    Math.min(31, Number(paymentDay) || Number(firstPaymentDate?.slice(8, 10)) || 1),
  );
  const base = parseDate(from || todaySD());
  let year = base.getFullYear();
  let month = base.getMonth();
  const clampDay = (y: number, m: number) => {
    const last = new Date(y, m + 1, 0).getDate();
    return new Date(y, m, Math.min(day, last));
  };
  let due = clampDay(year, month);
  if (toISO(due) <= from) {
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
    due = clampDay(year, month);
  }
  return toISO(due);
}

export type InstallmentStatus = "pagada" | "parcial" | "vencida" | "pendiente";

export function installmentStatus(inst: {
  total_amount: number;
  paid_amount: number;
  due_date: string;
}): InstallmentStatus {
  const pending = round2(inst.total_amount - inst.paid_amount);
  if (pending <= 0.009) return "pagada";
  const overdue = daysBetween(inst.due_date, todaySD()) > 0;
  if (inst.paid_amount > 0) return overdue ? "vencida" : "parcial";
  return overdue ? "vencida" : "pendiente";
}

export const STATUS_LABEL: Record<InstallmentStatus, string> = {
  pagada: "Pagada",
  parcial: "Parcial",
  vencida: "Vencida",
  pendiente: "Pendiente",
};

export const LOAN_STATUS_LABEL: Record<string, string> = {
  en_curso: "En curso",
  pagado: "Pagado",
  archivado: "Archivado",
};

/**
 * Recalcula el cronograma frances restante con un capital menor (abono a capital):
 * mantiene el numero de cuotas y las fechas originales, la cuota sale mas baja.
 * Igual que recalculateFrenchSchedule de GP.
 */
export function recalcFrenchSchedule(params: {
  capital: number;
  remainingCount: number;
  monthlyRatePct: number;
  frequency: Frequency;
  firstPaymentDate: string;
  startFrom: number;
}): ScheduleRow[] {
  const { capital, remainingCount, monthlyRatePct, frequency, firstPaymentDate, startFrom } =
    params;
  if (capital <= 0 || remainingCount <= 0) return [];
  const i = periodicRatePct(monthlyRatePct, frequency);
  const payment =
    i === 0 ? capital / remainingCount : (capital * i) / (1 - Math.pow(1 + i, -remainingCount));
  let balance = capital;
  const rows: ScheduleRow[] = [];
  for (let k = 0; k < remainingCount; k++) {
    const n = startFrom + k;
    const interest = round2(balance * i);
    let principal = round2(payment - interest);
    if (k === remainingCount - 1) principal = round2(balance);
    balance = round2(balance - principal);
    rows.push({
      number: n,
      due_date: addPeriods(firstPaymentDate, frequency, n - 1),
      principal_amount: principal,
      interest_amount: interest,
      total_amount: round2(principal + interest),
      balance: Math.max(balance, 0),
    });
  }
  return rows;
}

/** Datos mínimos que necesita el cálculo de liquidación (vistas Loan/Installment los cumplen). */
export type QuoteLoan = {
  principal: number;
  interest_rate: number;
  start_date: string;
};

export type QuoteInstallment = {
  due_date: string;
  total_amount: number;
  principal_amount: number;
  paid_amount: number;
};

/**
 * Liquidación anticipada (igual que GP): capital pendiente real (principal menos
 * todo capital ya pagado) + interés devengado dia por dia desde el ultimo pago
 * hasta hoy + mora pendiente. Sin cuotas intermedias ni topes de periodo.
 */
export function settlementQuote(params: {
  loan: QuoteLoan;
  installments: QuoteInstallment[];
  mora?: number;
  lastPaymentDate?: string | null;
  capitalPaid?: number;
}) {
  const { loan, installments, mora = 0, lastPaymentDate } = params;
  const pendientes = installments.filter((i) => i.total_amount - i.paid_amount > 0.009);

  const capital =
    params.capitalPaid != null
      ? round2(Math.max(loan.principal - params.capitalPaid, 0))
      : round2(pendientes.reduce((s, i) => s + i.principal_amount, 0));

  const ref = lastPaymentDate || pendientes[0]?.due_date || loan.start_date;
  const days = Math.max(0, daysBetween(String(ref).slice(0, 10), todaySD()));
  const interes = round2(accruedInterest(capital, loan.interest_rate, days));

  return {
    capital,
    interes,
    mora: round2(mora),
    total: round2(Math.max(capital + interes + mora, 0)),
    cuotas: pendientes.length,
  };
}
