
export interface PaymentAllocation {
  paidToInstallment: number
  paidToLate: number
  totalPaidOnInstallment: number
  newPaidLateAmount: number
  isNowFullyPaid: boolean
  lateDays: number
  totalLateAmount: number
  pendingLateAmount: number
  expectedTotal: number
  surplus: number
  creditConsumed: number
  newPrepaidBalance: number
}

export function calculatePaymentAllocation(
  amount: number,
  installmentAmount: number,
  previouslyPaid: number,
  previouslyPaidLate: number,
  totalLateAmount: number,
  includeMora: boolean,
  lateDays: number = 0,
  availableCredit: number = 0,
): PaymentAllocation {
  const pendingLateAmount = Math.max(0, totalLateAmount - previouslyPaidLate)
  const remaining = installmentAmount - previouslyPaid

  const creditForInstallment = Math.min(availableCredit, Math.max(0, remaining))
  const creditForLate = Math.min(Math.max(0, availableCredit - creditForInstallment), pendingLateAmount)
  const creditConsumed = creditForInstallment + creditForLate
  const effectiveRemaining = Math.max(0, remaining - creditForInstallment)
  const effectivePendingLate = Math.max(0, pendingLateAmount - creditForLate)

  let paidToInstallment: number
  let paidToLate: number

  if (includeMora) {
    paidToLate = Math.min(amount, effectivePendingLate)
    paidToInstallment = Math.min(Math.max(0, amount - paidToLate), effectiveRemaining)
  } else {
    paidToLate = 0
    paidToInstallment = Math.min(amount, effectiveRemaining)
  }

  const totalPaidOnInstallment = Math.min(previouslyPaid + creditForInstallment + paidToInstallment, installmentAmount)
  const newPaidLateAmount = previouslyPaidLate + creditForLate + paidToLate
  const surplus = Math.max(0, amount - paidToInstallment - paidToLate)
  const newPrepaidBalance = Math.max(0, availableCredit - creditConsumed + surplus)
  const expectedTotal = effectiveRemaining + (includeMora ? effectivePendingLate : 0)
  const isNowFullyPaid = amount >= expectedTotal

  return {
    paidToInstallment,
    paidToLate,
    totalPaidOnInstallment,
    newPaidLateAmount,
    isNowFullyPaid,
    lateDays,
    totalLateAmount,
    pendingLateAmount,
    expectedTotal,
    surplus,
    creditConsumed,
    newPrepaidBalance,
  }
}

// recalculateInstallment y updateLoanAfterPayment se movieron a la base de datos
// (gp_private._gp_recalc_installment / _gp_recalc_loan en supabase/atomic-operations.sql),
// dentro de la operación atómica apply_loan_operation.
