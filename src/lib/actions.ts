import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import {
  buildSchedule,
  daysBetween,
  periodicRatePct,
  recalcFrenchSchedule,
  todaySD,
} from "@/lib/finance";
import type { Frequency, LoanType } from "@/lib/finance";
import type { Installment, Loan } from "@/lib/db";
import { FREQ_TO_DB, LOAN_TYPE_TO_DB, METHOD_TO_DB, toLoan } from "@/lib/db";

const round2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: number | null | undefined) => Number(v ?? 0);

async function requireUserId() {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Sesión expirada");
  return data.user.id;
}

export type NewLoanInput = {
  client_id: string;
  principal: number;
  interest_rate: number;
  term: number;
  frequency: Frequency;
  loan_type: LoanType;
  start_date: string;
  first_payment_date: string;
  late_fee_rate: number;
  notes?: string;
  /** Préstamo abierto (solo interés, sin cuotas): solo si loan_type === "solo_interes". */
  open_ended?: boolean;
};

export async function createLoan(input: NewLoanInput) {
  const user_id = await requireUserId();

  const isOpen = input.loan_type === "solo_interes" && Boolean(input.open_ended);

  const schedule = buildSchedule({
    principal: input.principal,
    interestRate: input.interest_rate,
    term: input.term,
    frequency: input.frequency,
    loanType: input.loan_type,
    firstPaymentDate: input.first_payment_date,
  });
  const totalAmount = round2(schedule.reduce((s, r) => s + r.total_amount, 0));
  const totalInterest = round2(schedule.reduce((s, r) => s + r.interest_amount, 0));
  const installmentAmount = round2(schedule[0]?.total_amount ?? 0);
  const interestPerPeriod = round2(input.principal * periodicRatePct(input.interest_rate, input.frequency));
  const lastDue = schedule[schedule.length - 1]?.due_date ?? input.first_payment_date;

  const { data: settingsRow } = await supabase
    .from("settings")
    .select("loan_id_prefix")
    .eq("user_id", user_id)
    .maybeSingle();
  const prefix = settingsRow?.loan_id_prefix || "P";
  const visibleId = `${prefix}${String(Date.now()).slice(-6)}`;

  const { data: loan, error } = await supabase
    .from("loans")
    .insert({
      user_id,
      client_id: input.client_id,
      loan_id: visibleId,
      amount: input.principal,
      interest_type: "percentage",
      interest_rate: input.interest_rate,
      total_amount: isOpen ? input.principal : totalAmount,
      total_interest: isOpen ? interestPerPeriod : totalInterest,
      installment_amount: isOpen ? interestPerPeriod : installmentAmount,
      installments: isOpen ? 0 : input.term,
      frequency: FREQ_TO_DB[input.frequency] ?? "monthly",
      start_date: input.start_date,
      first_payment_date: input.first_payment_date,
      end_date: isOpen ? null : lastDue,
      amortization_type: LOAN_TYPE_TO_DB[input.loan_type] ?? "french",
      open_ended: isOpen,
      payment_day: isOpen ? Number(input.first_payment_date.split("-")[2]) || null : null,
      status: "active",
      late_interest_rate: input.late_fee_rate,
      notes: input.notes || null,
      paid_amount: 0,
      remaining_amount: isOpen ? input.principal : totalAmount,
      paid_installments: 0,
      progress: 0,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);

  const rows = schedule.map((r) => ({
    loan_id: loan.id,
    client_id: input.client_id,
    number: r.number,
    due_date: r.due_date,
    amount: r.total_amount,
    capital: r.principal_amount,
    interest: r.interest_amount,
    balance: r.balance,
    status: "pending",
  }));
  if (rows.length > 0) {
    const { error: e2 } = await supabase.from("installments").insert(rows);
    if (e2) throw new Error(e2.message);
  }

  await supabase.rpc("update_client_stats", { p_client_id: input.client_id });
  return toLoan(loan);
}

/**
 * Edita un préstamo en el que nadie ha pagado todavía: recalcula el cronograma
 * y reemplaza las cuotas pendientes.
 */
export async function updateLoan(id: string, input: NewLoanInput) {
  const user_id = await requireUserId();
  const { data: current, error: cErr } = await supabase
    .from("loans")
    .select("id, user_id, client_id, paid_amount, paid_installments, status, deleted_at")
    .eq("id", id)
    .maybeSingle();
  if (cErr) throw new Error(cErr.message);
  if (!current) throw new Error("Préstamo no encontrado");
  if (current.deleted_at) throw new Error("Este préstamo está archivado");
  if (Number(current.paid_amount) > 0 || Number(current.paid_installments) > 0)
    throw new Error("Solo puedes editar un préstamo en el que nadie ha pagado todavía");

  const isOpen = input.loan_type === "solo_interes" && Boolean(input.open_ended);
  const schedule = buildSchedule({
    principal: input.principal,
    interestRate: input.interest_rate,
    term: input.term,
    frequency: input.frequency,
    loanType: input.loan_type,
    firstPaymentDate: input.first_payment_date,
  });
  const totalAmount = round2(schedule.reduce((s, r) => s + r.total_amount, 0));
  const totalInterest = round2(schedule.reduce((s, r) => s + r.interest_amount, 0));
  const installmentAmount = round2(schedule[0]?.total_amount ?? 0);
  const interestPerPeriod = round2(input.principal * periodicRatePct(input.interest_rate, input.frequency));
  const lastDue = schedule[schedule.length - 1]?.due_date ?? input.first_payment_date;

  const { error: upErr } = await supabase
    .from("loans")
    .update({
      amount: input.principal,
      interest_rate: input.interest_rate,
      total_amount: isOpen ? input.principal : totalAmount,
      total_interest: isOpen ? interestPerPeriod : totalInterest,
      installment_amount: isOpen ? interestPerPeriod : installmentAmount,
      installments: isOpen ? 0 : input.term,
      frequency: FREQ_TO_DB[input.frequency] ?? "monthly",
      start_date: input.start_date,
      first_payment_date: input.first_payment_date,
      end_date: isOpen ? null : lastDue,
      amortization_type: LOAN_TYPE_TO_DB[input.loan_type] ?? "french",
      open_ended: isOpen,
      payment_day: isOpen ? Number(input.first_payment_date.split("-")[2]) || null : null,
      late_interest_rate: input.late_fee_rate,
      notes: input.notes || null,
      paid_amount: 0,
      remaining_amount: isOpen ? input.principal : totalAmount,
      paid_installments: 0,
      progress: 0,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", user_id);
  if (upErr) throw new Error(upErr.message);

  await supabase.from("installments").delete().eq("loan_id", id);
  const rows = schedule.map((r) => ({
    loan_id: id,
    client_id: current.client_id,
    number: r.number,
    due_date: r.due_date,
    amount: r.total_amount,
    capital: r.principal_amount,
    interest: r.interest_amount,
    balance: r.balance,
    status: "pending",
  }));
  if (rows.length > 0) {
    const { error: e3 } = await supabase.from("installments").insert(rows);
    if (e3) throw new Error(e3.message);
  }
  await supabase.rpc("update_client_stats", { p_client_id: current.client_id });
}

export type PaymentResult = {
  payment: {
    id: string;
    amount: number;
    capital_amount: number;
    interest_amount: number;
    late_amount: number;
    payment_date: string;
    method: string;
    notes: string | null;
  };
  loan: { id: string; remaining_amount: number; status: string; prepaid_balance: number } | null;
  allocation: { paidToInstallment: number; paidToLate: number; surplus: number } | null;
};

/**
 * Aplica un pago a una cuota usando la función transaccional de la base de datos
 * (process_installment_payment): respeta el orden de cuotas, calcula la mora con días
 * de gracia, consume saldo a favor y evita cobros duplicados.
 */
export async function payInstallment(params: {
  loanId: string;
  installmentId: string;
  amount: number;
  includeMora: boolean;
  paymentDate?: string;
  method: string;
  notes?: string;
  lateInterestRate: number;
  graceDays?: number;
}): Promise<PaymentResult> {
  const user_id = await requireUserId();
  if (!Number.isFinite(params.amount) || params.amount <= 0) throw new Error("Monto inválido");
  const { data, error } = await supabase.rpc("process_installment_payment", {
    p_loan_id: params.loanId,
    p_installment_id: params.installmentId,
    p_user_id: user_id,
    p_amount: round2(params.amount),
    p_include_mora: params.includeMora,
    p_payment_date: params.paymentDate || todaySD(),
    p_method: METHOD_TO_DB[params.method] ?? "cash",
    p_notes: params.notes || "",
    p_late_interest_rate: params.lateInterestRate || 0,
    p_grace_days: Math.max(0, params.graceDays ?? 0),
  });
  if (error) throw new Error(error.message);
  const res = data as {
    ok?: boolean;
    error?: string;
    payment?: PaymentResult["payment"];
    loan?: PaymentResult["loan"];
    allocation?: PaymentResult["allocation"];
  } | null;
  if (!res?.ok) throw new Error(res?.error || "El pago no pudo ser procesado");
  await refreshLoanStatus(params.loanId);
  return { payment: res.payment!, loan: res.loan ?? null, allocation: res.allocation ?? null };
}

/** Cobro de interés de un préstamo abierto (solo interés, sin cuotas). */
export async function payOpenInterest(params: {
  loan: Loan;
  amount: number;
  method: string;
  paymentDate?: string;
  note?: string;
}) {
  const { loan, amount, method, note } = params;
  const user_id = await requireUserId();
  if (amount <= 0) throw new Error("Monto inválido");

  const { data: created, error } = await supabase
    .from("payments")
    .insert({
      user_id,
      loan_id: loan.id,
      installment_id: null,
      client_id: loan.client_id,
      amount: round2(amount),
      capital_amount: 0,
      interest_amount: round2(amount),
      late_amount: 0,
      type: "installment",
      payment_date: params.paymentDate || todaySD(),
      method: METHOD_TO_DB[method] ?? "cash",
      notes: note || "Interés (préstamo abierto)",
      status: "paid",
    })
    .select("id, amount, capital_amount, interest_amount, late_amount, payment_date, method, notes")
    .single();
  if (error) throw new Error(error.message);

  await refreshLoanStatus(loan.id);
  return {
    payment: {
      id: created.id,
      amount: num(created.amount),
      capital_amount: num(created.capital_amount),
      interest_amount: num(created.interest_amount),
      late_amount: num(created.late_amount),
      payment_date: String(created.payment_date),
      method: String(created.method),
      notes: (created.notes as string | null) ?? null,
    },
    loan: {
      id: loan.id,
      remaining_amount: loan.remaining_amount,
      status: loan.status,
      prepaid_balance: 0,
    },
    allocation: null,
  } satisfies PaymentResult;
}

/**
 * Rebalancea el préstamo tras cambiar el capital pagado (abono o reversión),
 * igual que GP: en francesa recalcula las cuotas pendientes (la cuota BAJA y
 * bajan los intereses totales, el número de cuotas y las fechas no cambian);
 * en solo interés recalcula el interés periódico sobre el saldo restante.
 * Con applied = monto del abono recién hecho, detecta liquidación por abono.
 */
async function applyCapitalRebalance(loanId: string, applied = 0) {
  const { data: loanRow } = await supabase.from("loans").select("*").eq("id", loanId).maybeSingle();
  if (!loanRow) return;
  const loan = toLoan(loanRow);

  const { data: instRows } = await supabase
    .from("installments")
    .select("*")
    .eq("loan_id", loanId)
    .order("number");
  const rows = instRows ?? [];
  const pend = rows.filter((r) => r.status !== "paid");
  const paid = rows.filter((r) => r.status === "paid");

  const { data: capRows } = await supabase
    .from("payments")
    .select("capital_amount")
    .eq("loan_id", loanId)
    .eq("status", "paid");
  const capitalPaid = round2((capRows ?? []).reduce((s, p) => s + num(p.capital_amount), 0));
  const capitalRemaining = round2(Math.max(loan.principal - capitalPaid, 0));
  const contractualPending = round2(
    pend.reduce((s, r) => s + Math.max(0, num(r.amount) - num(r.paid_amount)), 0),
  );

  // El abono cubrió todo lo contractualmente pendiente -> cerrar pagando todo.
  if (!loan.open_ended && contractualPending - applied <= 0.009 && pend.length > 0) {
    for (const inst of pend) {
      await supabase
        .from("installments")
        .update({ status: "paid", paid_amount: num(inst.amount), paid_at: todaySD() })
        .eq("id", inst.id);
    }
    return;
  }
  if (!loan.open_ended && capitalRemaining <= 0.009 && pend.length > 0) {
    for (const inst of pend) {
      await supabase
        .from("installments")
        .update({ status: "paid", paid_amount: num(inst.amount), paid_at: todaySD() })
        .eq("id", inst.id);
    }
    return;
  }

  const i = periodicRatePct(loan.interest_rate, loan.frequency);

  if (loan.open_ended) {
    await supabase
      .from("loans")
      .update({ installment_amount: round2(capitalRemaining * i) })
      .eq("id", loanId);
    return;
  }

  if (loan.loan_type === "solo_interes") {
    const newInterest = round2(capitalRemaining * i);
    const lastNum = pend.length > 0 ? Math.max(...pend.map((r) => Number(r.number))) : 0;
    for (const inst of pend) {
      const isLast = Number(inst.number) === lastNum;
      await supabase
        .from("installments")
        .update({
          amount: round2(newInterest + (isLast ? capitalRemaining : 0)),
          interest: newInterest,
          capital: isLast ? capitalRemaining : 0,
          balance: isLast ? 0 : capitalRemaining,
        })
        .eq("id", inst.id);
    }
    await supabase.from("loans").update({ installment_amount: newInterest }).eq("id", loanId);
    return;
  }

  // Francesa
  const remainingCount = pend.length;
  if (remainingCount <= 0 || capitalRemaining <= 0.009) return;
  const sched = recalcFrenchSchedule({
    capital: capitalRemaining,
    remainingCount,
    monthlyRatePct: loan.interest_rate,
    frequency: loan.frequency as Frequency,
    firstPaymentDate: loan.first_payment_date,
    startFrom: paid.length + 1,
  });
  for (const row of sched) {
    await supabase
      .from("installments")
      .update({
        amount: row.total_amount,
        capital: row.principal_amount,
        interest: row.interest_amount,
        balance: row.balance,
      })
      .eq("loan_id", loanId)
      .eq("number", row.number);
  }
  const paidTotal = paid.reduce((s, r) => s + num(r.amount), 0);
  const paidInt = paid.reduce((s, r) => s + num(r.interest), 0);
  await supabase
    .from("loans")
    .update({
      installment_amount: sched[0] ? round2(sched[0].total_amount) : loan.installment_amount,
      total_amount: round2(sched.reduce((s, r) => s + r.total_amount, 0) + paidTotal),
      total_interest: round2(sched.reduce((s, r) => s + r.interest_amount, 0) + paidInt),
    })
    .eq("id", loanId);
}

/** Abono a capital: registra el pago y rebalancea el préstamo (GP). */
export async function payCapital(params: {
  loan: Loan;
  amount: number;
  note?: string;
  method?: string;
  paymentDate?: string;
}) {
  const { loan, amount, note, method = "efectivo", paymentDate } = params;
  const user_id = await requireUserId();
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Monto inválido");
  if (paymentDate && paymentDate > todaySD()) throw new Error("La fecha no puede ser futura");

  const { error } = await supabase.from("payments").insert({
    user_id,
    loan_id: loan.id,
    client_id: loan.client_id,
    amount: round2(amount),
    capital_amount: round2(amount),
    interest_amount: 0,
    late_amount: 0,
    type: "capital_abono",
    payment_date: paymentDate || todaySD(),
    method: METHOD_TO_DB[method] ?? "cash",
    notes: note || null,
    status: "paid",
  });
  if (error) throw new Error(error.message);

  await applyCapitalRebalance(loan.id, round2(amount));
  await refreshLoanStatus(loan.id);
}

/** Liquidación anticipada: ver settlementQuote en finance.ts (función pura, testeable). */
export { settlementQuote } from "@/lib/finance";

export async function settleLoan(params: {
  loan: Loan;
  total: number;
  interest?: number;
  late?: number;
  note?: string;
}) {
  const { loan, total, interest = 0, late = 0, note } = params;
  const user_id = await requireUserId();

  const capital = round2(Math.max(total - interest - late, 0));

  const { data: pendientes } = loan.open_ended
    ? { data: null as { id: string; amount: number }[] | null }
    : await supabase
        .from("installments")
        .select("id, amount")
        .eq("loan_id", loan.id)
        .neq("status", "paid");

  const { error } = await supabase.from("payments").insert({
    user_id,
    loan_id: loan.id,
    client_id: loan.client_id,
    amount: round2(total),
    capital_amount: capital,
    interest_amount: round2(interest),
    late_amount: round2(late),
    type: "liquidation",
    payment_date: todaySD(),
    method: "cash",
    notes: note || "Liquidación anticipada",
    status: "paid",
  });
  if (error) throw new Error(error.message);

  for (const inst of pendientes ?? []) {
    await supabase
      .from("installments")
      .update({
        paid_amount: num(inst.amount),
        status: "paid",
        paid_at: todaySD(),
      })
      .eq("id", inst.id);
  }
  await supabase
    .from("loans")
    .update({ status: "paid", paid_at: new Date().toISOString() })
    .eq("id", loan.id);
  await refreshLoanStatus(loan.id);
}

/** Recalcula una cuota desde los pagos validos vinculados (como recalculateInstallment de GP). */
async function recalcInstallmentFromPayments(installmentId: string) {
  const [{ data: ps }, { data: inst }] = await Promise.all([
    supabase
      .from("payments")
      .select("capital_amount, interest_amount, late_amount, payment_date")
      .eq("installment_id", installmentId)
      .eq("status", "paid")
      .order("payment_date", { ascending: false }),
    supabase.from("installments").select("amount").eq("id", installmentId).maybeSingle(),
  ]);
  if (!inst) return;
  const amt = num(inst.amount);
  const totalPaid = (ps ?? []).reduce((s, p) => s + num(p.capital_amount) + num(p.interest_amount), 0);
  const latePaid = (ps ?? []).reduce((s, p) => s + num(p.late_amount), 0);
  const fully = totalPaid >= amt - 0.009;
  const newPaid = round2(Math.min(totalPaid, amt));
  await supabase
    .from("installments")
    .update({
      paid_amount: newPaid,
      paid_late_amount: round2(latePaid),
      status: fully ? "paid" : newPaid > 0.009 ? "partial" : "pending",
      paid_at: fully ? (ps?.[0]?.payment_date ?? null) : null,
    })
    .eq("id", installmentId);
}

export async function reversePayment(params: { paymentId: string; reason: string }) {
  const { data: payment, error } = await supabase
    .from("payments")
    .select("*")
    .eq("id", params.paymentId)
    .single();
  if (error) throw new Error(error.message);
  if (payment.status !== "paid") throw new Error("Este pago ya fue revertido");

  // Regla de negocio: solo el ULTIMO pago del préstamo se puede revertir.
  if (payment.loan_id) {
    const { data: newerPaid } = await supabase
      .from("payments")
      .select("id, payment_date, created_at")
      .eq("loan_id", payment.loan_id)
      .eq("status", "paid")
      .neq("id", payment.id)
      .order("payment_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1);
    const head = newerPaid?.[0];
    if (head) {
      const sameDay = String(head.payment_date) === String(payment.payment_date);
      const isNewer =
        String(head.payment_date) > String(payment.payment_date) ||
        (sameDay && String(head.created_at) > String(payment.created_at));
      if (isNewer) throw new Error("Solo puedes revertir el último pago registrado en este préstamo.");
    }
  }

  const { error: revErr } = await supabase
    .from("payments")
    .update({
      status: "reversed",
      reversed_at: new Date().toISOString(),
      reversal_reason: params.reason,
    })
    .eq("id", params.paymentId);
  if (revErr) throw new Error(revErr.message);

  if (payment.installment_id) {
    await recalcInstallmentFromPayments(payment.installment_id);
  } else if (payment.type === "liquidation" && payment.loan_id) {
    const { data: insts } = await supabase
      .from("installments")
      .select("id")
      .eq("loan_id", payment.loan_id);
    for (const inst of insts ?? []) await recalcInstallmentFromPayments(inst.id);
  } else if (payment.type === "capital_abono" && payment.loan_id) {
    // Devuelve el capital y rebalancea: la cuota francesa vuelve a subir,
    // el interes periodico de solo-interes se restaura (GP rebalanceReverseAbono).
    await applyCapitalRebalance(payment.loan_id);
  }

  if (payment.loan_id) await refreshLoanStatus(payment.loan_id);
}

/**
 * Recalcula las métricas del préstamo (pagado, pendiente, progreso, estado)
 * y actualiza las estadísticas del cliente. Mismas reglas que la app GP.
 */
export async function refreshLoanStatus(loanId: string) {
  const [{ data: insts }, { data: loan }] = await Promise.all([
    supabase.from("installments").select("*").eq("loan_id", loanId),
    supabase.from("loans").select("*").eq("id", loanId).maybeSingle(),
  ]);
  if (!loan) return;
  if (loan.deleted_at || loan.status === "cancelled") return;

  const rows = insts ?? [];
  const isInterestOnly = loan.amortization_type === "interest_only";
  const isOpenEnded = Boolean(loan.open_ended);

  let fullyPaidCount = 0;
  let paidAmount = 0;

  if (isOpenEnded) {
    const { data: payments } = await supabase
      .from("payments")
      .select("capital_amount")
      .eq("loan_id", loanId)
      .eq("status", "paid");
    paidAmount = payments?.reduce((s, p) => s + num(p.capital_amount), 0) || 0;
    fullyPaidCount = 0;
  } else {
    fullyPaidCount = rows.filter((i) => i.status === "paid").length;
    const installmentsPaid = rows.reduce((s, i) => s + num(i.paid_amount), 0);
    const { data: extraPayments } = await supabase
      .from("payments")
      .select("amount")
      .eq("loan_id", loanId)
      .eq("status", "paid")
      .in("type", ["capital_abono", "liquidation"]);
    const extraPaid = extraPayments?.reduce((s, p) => s + num(p.amount), 0) || 0;
    paidAmount = installmentsPaid + extraPaid;
  }

  const { data: allPayments } = await supabase
    .from("payments")
    .select("capital_amount")
    .eq("loan_id", loanId)
    .eq("status", "paid");
  const totalCapitalPaid = allPayments?.reduce((s, p) => s + num(p.capital_amount), 0) || 0;

  const remaining =
    isOpenEnded || isInterestOnly
      ? Math.max(0, num(loan.amount) - totalCapitalPaid)
      : rows
          .filter((i) => i.status !== "paid")
          .reduce((s, i) => s + Math.max(0, num(i.amount) - num(i.paid_amount)), 0);

  const progress =
    !isOpenEnded && num(loan.amount) > 0
      ? Math.round(((num(loan.amount) - remaining) / num(loan.amount)) * 100)
      : !isOpenEnded && rows.length > 0
        ? Math.round((fullyPaidCount / rows.length) * 100)
        : 0;

  const updates: Database["public"]["Tables"]["loans"]["Update"] = {
    paid_installments: fullyPaidCount,
    paid_amount: round2(paidAmount),
    remaining_amount: round2(remaining),
    progress,
  };

  const allPaid =
    !isOpenEnded && rows.length > 0 && fullyPaidCount >= rows.length && remaining <= 0.009;
  if (allPaid) {
    updates.status = "paid";
    updates.paid_at = new Date().toISOString();
  } else if (loan.status === "paid") {
    updates.status = "active";
    updates.paid_at = null;
  }

  // Pinta la mora al momento (computeLateStatus de GP): dias de atraso SIN gracia.
  if (!allPaid && !isOpenEnded) {
    let maxLate = 0;
    const now = todaySD();
    for (const r of rows) {
      if (r.status === "paid") continue;
      const d = daysBetween(String(r.due_date).slice(0, 10), now);
      if (d > maxLate) maxLate = d;
    }
    if (maxLate > 0) {
      updates.status = maxLate <= 30 ? "late_1_30" : maxLate <= 60 ? "late_31_60" : "late_61_90";
      updates.late_days = maxLate;
    } else if (String(loan.status).startsWith("late")) {
      updates.status = "active";
      updates.late_days = 0;
    }
  }

  await supabase.from("loans").update(updates).eq("id", loanId);
  await supabase.rpc("update_client_stats", { p_client_id: loan.client_id });
}

export async function archiveLoan(loanId: string, archived: boolean) {
  if (archived) {
    await supabase
      .from("loans")
      .update({ status: "cancelled", deleted_at: new Date().toISOString() })
      .eq("id", loanId);
  } else {
    await supabase
      .from("loans")
      .update({ status: "active", deleted_at: null })
      .eq("id", loanId);
    await refreshLoanStatus(loanId);
  }
}

export function whatsappLink(phone: string | null | undefined, message: string) {
  const digits = (phone ?? "").replace(/\D/g, "");
  const full = digits.length === 10 ? `1${digits}` : digits;
  return `https://wa.me/${full}?text=${encodeURIComponent(message)}`;
}

export function csvDownload(filename: string, rows: (string | number)[][]) {
  const csv = rows
    .map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}-${todaySD()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

