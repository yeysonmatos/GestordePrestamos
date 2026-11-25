import type { LoanHandlerInput, LoanRebalanceStrategies } from './loan-handler.types'
import type { Loan, Payment } from '@/types'
import { calculateLateDays, calculateLateAmount, calculateProportionalInterest } from '@/lib/calculations'
import { applyLoanOperation, type LoanOperation } from '@/lib/loan-ops'
import { daysBetweenDateStrings } from '@/lib/utils'
import { logAuditEvent } from '@/lib/audit'

const errorMessage = (err: unknown, fallback: string) => err instanceof Error ? err.message : fallback

export function useSharedLoanHandlers(input: LoanHandlerInput, strategies: LoanRebalanceStrategies) {
  const { state, setters, services } = input
  const { supabase, userId, settings, router } = services
  const { rebalanceCapitalAbono, rebalanceReverseAbono } = strategies

  const handlePayInstallment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (state.loading) return
    if (state.loan.open_ended) {
      setters.setLoading(true)
      setters.setPaymentError('')
      const amount = parseFloat(state.paymentAmount)
      if (isNaN(amount) || amount <= 0) { setters.setPaymentError('Monto inválido'); setters.setLoading(false); return }
      let payment: Payment
      try {
        const result = await applyLoanOperation(supabase, state.loan.id, {
          payment: {
            amount, capital_amount: 0, interest_amount: amount,
            payment_date: state.paymentDate, method: state.paymentMethod,
            notes: state.paymentNotes || null, type: 'installment',
          },
        })
        payment = result.payment as Payment
        setters.setLoan(prev => ({ ...prev, ...result.loan }))
      } catch (err) {
        setters.setPaymentError('Error al registrar pago: ' + errorMessage(err, 'desconocido'))
        setters.setLoading(false)
        return
      }
      logAuditEvent(supabase, { userId, action: 'payment.recorded', entityType: 'payment', entityId: payment.id, details: { loan_id: state.loan.loan_id, client_name: state.loan.client?.name, amount, type: 'interest_only' } })
      setters.setPayments(prev => [payment, ...prev])
      setters.setSuccessPayment(payment)
      setters.setSuccessPayments([payment])
      setters.setSuccessCoveredCount(1)
      setters.setShowPayment(false)
      setters.setShowSuccess(true)
      setters.setPaymentInstallmentId('')
      setters.setPaymentAmount('')
      setters.setPaymentNotes('')
      setters.setIncludeMora(true)
      setters.setSelectedInstallmentMora(null)
      setters.setSelectedPaymentInstallment(null)
      router.refresh()
      setters.setLoading(false)
      return
    }
    if (!state.paymentInstallmentId || !userId) return
    const inst = state.installments.find(i => i.id === state.paymentInstallmentId)
    if (!inst) return
    setters.setLoading(true)
    setters.setPaymentError('')
    const amount = parseFloat(state.paymentAmount)
    if (isNaN(amount) || amount <= 0) { setters.setPaymentError('Monto inválido'); setters.setLoading(false); return }
    try {
      const graceDays = settings?.grace_days || 0
      const lateRate = settings?.late_interest_rate ?? 0

      const { data: rpcResult, error: rpcError } = await supabase.rpc('process_cascade_payment', {
        p_loan_id: state.loan.id,
        p_user_id: userId,
        p_amount: amount,
        p_include_mora: state.includeMora,
        p_payment_date: state.paymentDate,
        p_method: state.paymentMethod,
        p_notes: state.paymentNotes,
        p_late_interest_rate: lateRate,
        p_grace_days: graceDays,
      })
      if (rpcError) throw new Error(`Error al procesar el pago: ${rpcError.message}`)
      if (!rpcResult?.ok) throw new Error(rpcResult?.error || 'Error al procesar el pago')

      const payments: Payment[] = rpcResult.payments || []
      const loanUpdates = rpcResult.loan
      const coveredCount = Number(rpcResult.coveredCount || 1)

      for (const p of payments) {
        logAuditEvent(supabase, { userId, action: 'payment.recorded', entityType: 'payment', entityId: p.id, details: { loan_id: state.loan.loan_id, client_name: state.loan.client?.name, installment_id: p.installment_id || null, amount: Number(p.amount), late_amount: Number(p.late_amount || 0) } })
      }

      setters.setPayments(prev => [...payments, ...prev])
      setters.setLoan(prev => ({
        ...prev,
        paid_amount: loanUpdates.paid_amount ?? prev.paid_amount,
        remaining_amount: loanUpdates.remaining_amount ?? prev.remaining_amount,
        progress: loanUpdates.progress ?? prev.progress,
        paid_installments: loanUpdates.paid_installments ?? prev.paid_installments,
        status: loanUpdates.status ?? prev.status,
        prepaid_balance: Number(rpcResult.newPrepaidBalance ?? prev.prepaid_balance),
        paid_at: loanUpdates.paid_at ?? prev.paid_at,
      }))

      const refreshedInsts = await supabase.from('installments').select('*').eq('loan_id', state.loan.id).order('number')
      if (refreshedInsts.data) setters.setInstallments(refreshedInsts.data)

      setters.setSuccessPayment(payments[payments.length - 1] || payments[0] || null)
      setters.setSuccessPayments(payments)
      setters.setSuccessCoveredCount(coveredCount)
      setters.setShowPayment(false)
      setters.setShowSuccess(true)
      setters.setPaymentInstallmentId('')
      setters.setPaymentAmount('')
      setters.setPaymentNotes('')
      setters.setIncludeMora(true)
      setters.setSelectedInstallmentMora(null)
      setters.setSelectedPaymentInstallment(null)
      router.refresh()
    } catch (err) {
      setters.setPaymentError(err instanceof Error ? err.message : 'Error al procesar el pago')
    }
    setters.setLoading(false)
  }

  const handleLiquidation = async () => {
    if (state.loading) return
    if (!userId) return
    setters.setLoading(true)
    setters.setPaymentError('')
    const paidCapital = state.payments.filter(p => p.status === 'paid' && Number(p.capital_amount) > 0).reduce((s, p) => s + Number(p.capital_amount), 0)
    const capRemaining = Math.max(0, Number(state.loan.amount) - paidCapital)
    const graceDays = settings?.grace_days || 0
    const lateRate = settings?.late_interest_rate ?? 0
    let totalMora = 0
    for (const inst of state.installments) {
      if (inst.status === 'paid') continue
      const remaining = inst.amount - (inst.paid_amount || 0)
      const lateDays = calculateLateDays(inst.due_date, graceDays)
      if (lateDays > 0) {
        const totalLate = calculateLateAmount(Math.max(remaining, 0.01), lateDays, lateRate)
        const paidLate = inst.paid_late_amount || 0
        totalMora += Math.max(0, totalLate - paidLate)
      }
    }
    const lastPayment = state.payments.filter(p => p.status === 'paid').sort((a, b) => b.payment_date.localeCompare(a.payment_date))[0]
    const lastDate = lastPayment?.payment_date || state.loan.first_payment_date
    // Días calendario entre el último pago y la fecha de la liquidación (fechas
    // 'yyyy-MM-dd' en hora RD, sin depender de la zona horaria del navegador).
    const days = Math.max(0, daysBetweenDateStrings(String(lastDate).slice(0, 10), state.paymentDate))
    const monthlyRate = state.loan.interest_type === 'percentage' ? state.loan.interest_rate / 100 : 0
    const propInterest = monthlyRate > 0 ? calculateProportionalInterest(capRemaining, monthlyRate, days) : 0
    const total = capRemaining + propInterest + totalMora

    let result
    try {
      result = await applyLoanOperation(supabase, state.loan.id, {
        payment: {
          amount: total, capital_amount: capRemaining, interest_amount: propInterest, late_amount: totalMora,
          payment_date: state.paymentDate, method: state.paymentMethod,
          notes: state.paymentNotes || 'Liquidación total', type: 'liquidation',
        },
        installment_writes: state.installments
          .filter(inst => inst.status !== 'paid')
          .map(inst => ({ key: 'id' as const, value: inst.id, data: { status: 'paid' as const, paid_amount: inst.amount, paid_late_amount: inst.late_amount || 0, paid_at: state.paymentDate } })),
        paid_amount_from_payments: true,
      })
    } catch (err) {
      setters.setPaymentError('Error al liquidar: ' + errorMessage(err, 'desconocido'))
      setters.setLoading(false)
      return
    }
    const payment = result.payment as Payment
    logAuditEvent(supabase, { userId, action: 'loan.liquidated', entityType: 'loan', entityId: state.loan.id, details: { loan_id: state.loan.loan_id, client_id: state.loan.client_id, client_name: state.loan.client?.name, amount: total, capital_amount: capRemaining, interest_amount: propInterest, late_amount: totalMora } })
    setters.setPayments(prev => [payment, ...prev])
    setters.setLoan(prev => ({ ...prev, ...result.loan }))
    setters.setInstallments(result.installments)
    setters.setSuccessPayment(payment)
    setters.setSuccessPayments([payment])
    setters.setSuccessCoveredCount(1)
    setters.setShowLiquidation(false)
    setters.setShowSuccess(true)
    router.refresh()
    setters.setLoading(false)
  }

  const handleCapitalAbono = async (e: React.FormEvent) => {
    e.preventDefault()
    if (state.loading) return
    if (!userId) return
    const amount = parseFloat(state.capitalAbonoAmount)
    if (isNaN(amount) || amount <= 0) return
    setters.setLoading(true)
    setters.setPaymentError('')
    const { data: existingCapitalPayments } = await supabase.from('payments').select('capital_amount').eq('loan_id', state.loan.id).eq('status', 'paid')
    const existingCapitalPaid = existingCapitalPayments?.reduce((s, p) => s + Number(p.capital_amount), 0) || 0

    let result
    try {
      const rebalance = await rebalanceCapitalAbono({
        amount, existingCapitalPaid, loan: state.loan, installments: state.installments, paymentDate: state.paymentDate,
      })
      result = await applyLoanOperation(supabase, state.loan.id, {
        payment: {
          amount, capital_amount: amount, interest_amount: 0,
          payment_date: state.paymentDate, method: state.paymentMethod,
          notes: state.paymentNotes || null, type: 'capital_abono',
        },
        installment_writes: rebalance.installmentsToWrite,
        loan_updates: rebalance.loanUpdates as Partial<Loan>,
      })
    } catch (err) {
      setters.setPaymentError('Error al registrar abono: ' + errorMessage(err, 'desconocido'))
      setters.setLoading(false)
      return
    }
    const payment = result.payment as Payment
    logAuditEvent(supabase, { userId, action: 'capital_abono', entityType: 'payment', entityId: payment.id, details: { loan_id: state.loan.loan_id, client_name: state.loan.client?.name, amount } })
    setters.setPayments(prev => [payment, ...prev])
    setters.setLoan(prev => ({ ...prev, ...result.loan }))
    setters.setInstallments(result.installments)
    setters.setShowCapitalAbono(false)
    setters.setCapitalAbonoAmount('')
    setters.setSuccessPayment(payment)
    setters.setSuccessPayments([payment])
    setters.setSuccessCoveredCount(1)
    setters.setShowSuccess(true)
    router.refresh()
    setters.setLoading(false)
  }

  // Devuelve true si la reversión se aplicó; si falla deja el error en paymentError.
  const handleReversePayment = async (paymentId: string): Promise<boolean> => {
    if (state.loading) return false
    const payment = state.payments.find(p => p.id === paymentId)
    if (!payment || payment.status !== 'paid') return false
    const reason = state.reversalReason
    if (!reason.trim()) return false
    setters.setLoading(true)
    setters.setPaymentError('')

    const ops: LoanOperation = { reverse_payment_id: paymentId, reversal_reason: reason, reopen_if_unpaid: true }
    if (payment.installment_id) {
      ops.recalc_installments = [payment.installment_id]
    } else if (payment.type === 'liquidation') {
      ops.recalc_installments = 'all'
    } else if (payment.type === 'capital_abono') {
      const newPaid = Math.max(0, Number(state.loan.paid_amount) - Number(payment.amount))
      const newRemaining = Math.max(0, Number(state.loan.remaining_amount) + Number(payment.capital_amount || 0))
      if (newRemaining > 0) {
        const rebalance = await rebalanceReverseAbono({
          payment, newRemaining, newPaid, loan: state.loan, installments: state.installments, payments: state.payments,
        })
        ops.installment_writes = rebalance.installmentsToWrite
        ops.loan_updates = rebalance.loanUpdates as Partial<Loan>
      }
      // Mismo criterio que antes: el saldo vuelve a sumar el capital del abono.
      ops.post_loan_updates = { remaining_amount: newRemaining, paid_amount: newPaid, status: 'active' }
    }

    let result
    try {
      result = await applyLoanOperation(supabase, state.loan.id, ops)
    } catch (err) {
      setters.setPaymentError('Error al revertir el pago: ' + errorMessage(err, 'desconocido'))
      setters.setLoading(false)
      return false
    }
    logAuditEvent(supabase, { userId, action: 'payment.reversed', entityType: 'payment', entityId: paymentId, details: { loan_id: state.loan.loan_id, client_name: state.loan.client?.name, amount: payment.amount, reason } })
    setters.setPayments(prev => prev.map(p => p.id === paymentId ? { ...p, status: 'reversed', reversal_reason: reason } : p))
    // El saldo y las cuotas vienen de la base de datos: la pantalla queda igual a lo guardado.
    setters.setLoan(prev => ({ ...prev, ...result.loan }))
    setters.setInstallments(result.installments)
    router.refresh()
    setters.setLoading(false)
    return true
  }

  return { handlePayInstallment, handleCapitalAbono, handleLiquidation, handleReversePayment }
}