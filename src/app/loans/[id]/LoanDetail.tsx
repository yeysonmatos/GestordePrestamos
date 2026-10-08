'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-client'
import { formatCurrency, formatDate, lateStatusLabel } from '@/lib/utils'
import { paymentTypeColors, paymentMethodColor, loanStatusColors } from '@/lib/status-colors'
import { buildReceiptMessage, buildClientMessage, buildPaymentSummary } from '@/lib/messages'
import { calculateProportionalInterest, calculateLateDays, calculateLateAmount, nextDueDateAfter } from '@/lib/calculations'
import PaymentReceipt from '@/components/loans/PaymentReceipt'
import { Card } from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import MoneyInput from '@/components/ui/MoneyInput'
import { Progress } from '@/components/ui/Progress'
import BottomSheet from '@/components/ui/BottomSheet'
import { Alert } from '@/components/ui/Alert'
import {
  ArrowLeft, WhatsappLogo, Files, Signature, ArrowCounterClockwise,
  Check, FileArrowDown, ShareNetwork, PencilSimple, Receipt,
  Bank, Money, DownloadSimple, TrashSimple,
} from '@phosphor-icons/react'
import type { Loan, Installment, Payment, Setting } from '@/types'
import { useFrenchLoan } from './useFrenchLoan'
import { useInterestOnlyLoan } from './useInterestOnlyLoan'
import type { LoanHandlerInput } from './loan-handler.types'

interface Props {
  loan: Loan
  installments: Installment[]
  payments: Payment[]
  settings: Setting | null
  readOnly: boolean
}

export default function LoanDetail({ loan: initialLoan, installments: initialInstallments, payments: initialPayments, settings, readOnly }: Props) {
  const supabase = createClient()
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [loan, setLoan] = useState<Loan>(initialLoan)
  const [installments, setInstallments] = useState<Installment[]>(initialInstallments)
  const [payments, setPayments] = useState<Payment[]>(initialPayments)
  const [showPayment, setShowPayment] = useState(false)
  const [showCapitalAbono, setShowCapitalAbono] = useState(false)
  const [showLiquidation, setShowLiquidation] = useState(false)
  const [showContract, setShowContract] = useState(false)
  const [showDocs, setShowDocs] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [successPayment, setSuccessPayment] = useState<Payment | null>(null)
  const [successPayments, setSuccessPayments] = useState<Payment[]>([])
  const [successCoveredCount, setSuccessCoveredCount] = useState(0)
  const [docs, setDocs] = useState<Array<{id: string; name: string; type: string; path: string}>>([])
  const [loading, setLoading] = useState(false)
  const [paymentError, setPaymentError] = useState('')

  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [paymentNotes, setPaymentNotes] = useState('')
  const [paymentDate, setPaymentDate] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
  const [paymentInstallmentId, setPaymentInstallmentId] = useState<string>('')
  const [includeMora, setIncludeMora] = useState(true)
  const [selectedInstallmentMora, setSelectedInstallmentMora] = useState<{ lateDays: number; lateAmount: number } | null>(null)
  const [selectedPaymentInstallment, setSelectedPaymentInstallment] = useState<Installment | null>(null)
  const [capitalAbonoAmount, setCapitalAbonoAmount] = useState('')
  const [showReversalModal, setShowReversalModal] = useState(false)
  const [reversalPaymentId, setReversalPaymentId] = useState<string | null>(null)
  const [reversalReason, setReversalReason] = useState('')
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [deleteReason, setDeleteReason] = useState('')
  const [summaryCopied, setSummaryCopied] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) setUserId(data.user.id)
    })
  }, [supabase])

  const loadDocs = useCallback(async () => {
    const { data } = await supabase
      .from('documents')
      .select('id, name, type, path')
      .eq('loan_id', loan.id)
      .order('created_at', { ascending: false })
    if (data) setDocs(data)
  }, [loan.id, supabase])

  useEffect(() => { loadDocs() }, [loadDocs])

  const isOpenEnded = loan.open_ended
  const isInterestOnly = loan.amortization_type === 'interest_only'

  const calcPendingMora = () => {
    const graceDays = settings?.grace_days || 0
    const lateRate = settings?.late_interest_rate ?? 0
    let total = 0
    for (const inst of installments) {
      if (inst.status === 'paid') continue
      const remaining = inst.amount - (inst.paid_amount || 0)
      const lateDays = calculateLateDays(inst.due_date, graceDays)
      if (lateDays > 0) {
        const totalLate = calculateLateAmount(Math.max(remaining, 0.01), lateDays, lateRate)
        const paidLate = inst.paid_late_amount || 0
        total += Math.max(0, totalLate - paidLate)
      }
    }
    return total
  }

  const calcCapitalRemaining = () => {
    const paidCapital = payments
      .filter(p => p.status === 'paid' && Number(p.capital_amount) > 0)
      .reduce((s, p) => s + Number(p.capital_amount), 0)
    return Math.max(0, Number(loan.amount) - paidCapital)
  }

  const openPayModal = (inst: Installment) => {
    setPaymentInstallmentId(inst.id)
    setSelectedPaymentInstallment(inst)
    const remaining = inst.amount - (inst.paid_amount || 0)
    const graceDays = settings?.grace_days || 0
    const ld = calculateLateDays(inst.due_date, graceDays)
    const totalLate = ld > 0
      ? calculateLateAmount(remaining > 0 ? remaining : inst.amount, ld, settings?.late_interest_rate ?? 0)
      : 0
    const paidLate = inst.paid_late_amount || 0
    const remainingLateVal = Math.max(0, totalLate - paidLate)
    setSelectedInstallmentMora(ld > 0 ? { lateDays: ld, lateAmount: remainingLateVal } : null)
    setIncludeMora(true)
    setPaymentAmount(String(remaining + remainingLateVal))
    setShowPayment(true)
  }


  const hookInput: LoanHandlerInput = {
    state: {
      loan,
      installments,
      payments,
      paymentDate,
      paymentMethod,
      paymentNotes,
      paymentAmount,
      paymentInstallmentId,
      includeMora,
      selectedInstallmentMora,
      selectedPaymentInstallment,
      capitalAbonoAmount,
      successPayment,
      successPayments,
      successCoveredCount,
      showPayment,
      showSuccess,
      showCapitalAbono,
      showLiquidation,
      showReversalModal,
      reversalPaymentId,
      reversalReason,
      loading,
    },
    setters: {
      setLoan,
      setInstallments,
      setPayments,
      setPaymentDate,
      setPaymentMethod,
      setPaymentNotes,
      setPaymentAmount,
      setPaymentInstallmentId,
      setIncludeMora,
      setSelectedInstallmentMora,
      setSelectedPaymentInstallment,
      setCapitalAbonoAmount,
      setSuccessPayment,
      setSuccessPayments,
      setSuccessCoveredCount,
      setShowPayment,
      setShowSuccess,
      setShowCapitalAbono,
      setShowLiquidation,
      setShowReversalModal,
      setReversalPaymentId,
      setReversalReason,
      setLoading,
      setPaymentError,
    },
    services: {
      supabase,
      userId: userId || '',
      settings,
      router,
    },
  }

  const interestOnlyHandlers = useInterestOnlyLoan(hookInput)
  const frenchHandlers = useFrenchLoan(hookInput)
  const handlers = loan.amortization_type === 'interest_only' ? interestOnlyHandlers : frenchHandlers

  const { handlePayInstallment, handleCapitalAbono, handleLiquidation, handleReversePayment } = handlers

  const handleDeleteLoan = async () => {
    if (loading) return
    setLoading(true)
    setDeleteError('')
    try {
      const res = await fetch(`/api/loans/${loan.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: deleteReason }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        setDeleteError(body?.error || 'No se pudo eliminar el préstamo')
        setLoading(false)
        return
      }
    } catch {
      setDeleteError('Error de conexión al eliminar el préstamo')
      setLoading(false)
      return
    }
    router.push(`/loans?deleted=${encodeURIComponent(loan.loan_id)}&amount=${encodeURIComponent(String(loan.amount))}`)
    router.refresh()
  }

  const progressValue = isOpenEnded
    ? Math.round(((Number(loan.amount) - Number(loan.remaining_amount)) / Number(loan.amount)) * 100)
    : (loan.progress > 0 ? loan.progress : (installments.length > 0 ? Math.round((installments.filter(i => i.status === 'paid').length / installments.length) * 100) : 0))

  const capitalPorCobrar = isOpenEnded
    ? Number(loan.remaining_amount)
    : installments
      .filter(i => i.status !== 'paid')
      .reduce((s, i) => s + Number(i.capital), 0)
  const interesPorCobrar = isOpenEnded
    ? 0
    : installments
      .filter(i => i.status !== 'paid')
      .reduce((s, i) => s + Number(i.interest), 0)
  const totalPorCobrar = capitalPorCobrar + interesPorCobrar

  const balanceAfterPayment = useMemo(() => {
    const map = new Map<string, number>()
    const sorted = [...payments].filter(p => p.status === 'paid').sort((a, b) => a.payment_date.localeCompare(b.payment_date))
    let total = Number(loan.remaining_amount) + sorted.reduce((s, p) => s + Number(p.amount), 0)
    for (const p of sorted) { total -= Number(p.amount); map.set(p.id, Math.max(0, total)) }
    return map
  }, [payments, loan.remaining_amount])

  const lastPayment = payments.filter(p => p.status === 'paid').sort((a, b) => b.payment_date.localeCompare(a.payment_date))[0]
  const nextDueDate = isOpenEnded
    ? (() => {
        const last = lastPayment?.payment_date || loan.first_payment_date
        const next = nextDueDateAfter(loan.first_payment_date, loan.payment_day || 1, new Date(last))
        return formatDate(next)
      })()
    : null

  return (
    <div className="space-y-6">
      <Link href="/loans" className="text-sm text-primary hover:underline flex items-center gap-1">
        <ArrowLeft className="h-4 w-4" /> Volver a préstamos
      </Link>

      {readOnly && (
        <Alert variant="warning">
          <p className="text-sm font-semibold text-warning">Modo lectura: tu prueba venció</p>
          <p className="text-xs text-warning/80 mt-0.5">No puedes cobrar, editar ni eliminar préstamos.</p>
        </Alert>
      )}

      <Card>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-foreground">{loan.client?.name || 'Eliminado'}</h1>
              <Badge variant={loanStatusColors(loan.status).badgeVariant}>{lateStatusLabel(loan.status, loan.late_days || 0)}</Badge>
              {loan.prepaid_balance > 0 && (
                <Badge variant="success">Saldo a favor: {formatCurrency(loan.prepaid_balance)}</Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {formatCurrency(loan.amount)} · {formatDate(loan.start_date)}
              {loan.client?.phone && (
                <span> · <a href={`tel:${loan.client.phone}`}>{loan.client.phone}</a></span>
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-1 flex-shrink-0">
            {loan.paid_installments === 0 && loan.paid_amount === 0 && !readOnly && (
              <Link href={`/loans/${loan.id}/edit`} className="w-9 h-9 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/5 transition-colors" title="Editar">
                <PencilSimple className="h-5 w-5" />
              </Link>
            )}
            <button type="button" onClick={() => {
              const phone = loan.client?.whatsapp || loan.client?.phone
              if (phone) {
                const nextPending = installments
                  .filter(i => i.status !== 'paid' && i.due_date && i.due_date >= paymentDate)
                  .sort((a, b) => a.due_date.localeCompare(b.due_date))[0]
                const msg = buildClientMessage({
                  clientName: loan.client?.name || 'cliente',
                  businessName: settings?.business_name || '',
                  activeLoans: 1,
                  balance: loan.remaining_amount,
                  nextDue: nextPending ? formatDate(nextPending.due_date) : undefined,
                })
                window.open(`https://wa.me/${phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(msg)}`, '_blank')
              }
            }} className="w-9 h-9 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-emerald-600 hover:bg-emerald-50 transition-colors" title="WhatsApp">
              <WhatsappLogo className="h-5 w-5" />
            </button>
            <button type="button" onClick={() => { loadDocs(); setShowDocs(true) }} className="w-9 h-9 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors" title="Documentos">
              <Files className="h-5 w-5" />
            </button>
            <button type="button" onClick={() => setShowContract(true)} className="w-9 h-9 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-accent hover:bg-accent/10 transition-colors" title="Contrato">
              <Signature className="h-5 w-5" />
            </button>
            {!readOnly && (
              <button type="button" onClick={() => { setDeleteError(''); setDeleteReason(''); setShowDeleteModal(true) }} className="w-9 h-9 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-red-50 transition-colors" title="Eliminar préstamo">
                <TrashSimple className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mt-4">
          <div className="bg-muted rounded-lg p-2.5 text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider truncate">{isInterestOnly ? 'Interés' : 'Cuota'}</p>
            <p className="text-sm font-bold text-foreground truncate">{formatCurrency(loan.installment_amount)}</p>
          </div>
          <div className="bg-muted rounded-lg p-2.5 text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider truncate">Capital prestado</p>
            <p className="text-sm font-bold text-foreground truncate">{formatCurrency(loan.amount)}</p>
          </div>
          <div className="bg-muted rounded-lg p-2.5 text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider truncate">Pagado</p>
            <p className="text-sm font-bold text-success truncate">{formatCurrency(loan.paid_amount)}</p>
          </div>
          <div className="bg-muted rounded-lg p-2.5 text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider truncate">Mora</p>
            <p className="text-sm font-bold text-destructive truncate">{formatCurrency(calcPendingMora())}</p>
          </div>
          <div className="bg-muted rounded-lg p-2.5 text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider truncate">Por cobrar</p>
            <p className="text-sm font-bold text-foreground truncate">{formatCurrency(totalPorCobrar)}</p>
            {!isInterestOnly && (
              <p className="text-[9px] text-muted-foreground/60 mt-0.5 truncate">
                Cap: {formatCurrency(capitalPorCobrar)} · Int: {formatCurrency(interesPorCobrar)}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5 mt-3">
          <span className="text-xs px-2.5 py-1 rounded-full bg-primary/5 text-primary font-medium">
            {loan.frequency === 'daily' ? 'Diario' : loan.frequency === 'weekly' ? 'Semanal' : loan.frequency === 'biweekly' ? 'Quincenal' : 'Mensual'}
          </span>
          <span className="text-xs px-2.5 py-1 rounded-full bg-primary/5 text-primary font-medium">
            {isOpenEnded ? 'Abierto' : `${loan.installments} cuotas`}
          </span>
          <span className="text-xs px-2.5 py-1 rounded-full bg-primary/5 text-primary font-medium">
            {isInterestOnly ? 'Solo Interés' : 'Cuotas Fijas'}
          </span>
          <span className="text-xs px-2.5 py-1 rounded-full bg-primary/5 text-primary font-medium">
            Tasa: {loan.interest_type === 'percentage' ? `${loan.interest_rate}%` : formatCurrency(loan.interest_rate)}
          </span>
          {loan.guarantee && (
            <span className="text-xs px-2.5 py-1 rounded-full bg-primary/5 text-primary font-medium">
              Garantía: {loan.guarantee}
            </span>
          )}
          {isOpenEnded && loan.payment_day && (
            <span className="text-xs px-2.5 py-1 rounded-full bg-primary/5 text-primary font-medium">
              Día {loan.payment_day}
            </span>
          )}
        </div>

        <div className="mt-4 flex items-center gap-4">
          <Progress value={progressValue} className="flex-1" />
          <span className="text-sm text-muted-foreground flex-shrink-0">
            {progressValue}% · {isOpenEnded ? `${formatCurrency(Number(loan.amount) - Number(loan.remaining_amount))}/${formatCurrency(loan.amount)}` : `${loan.paid_installments}/${loan.installments} cuotas`}
          </span>
        </div>

        {(loan.status === 'active' || loan.status.startsWith('late')) && !readOnly && (
          <div className="flex gap-2 mt-4 pt-4 border-t border-border">
            <Button size="sm" onClick={() => {
              setPaymentAmount(isOpenEnded ? String(loan.installment_amount) : '')
              setPaymentInstallmentId('')
              setIncludeMora(true)
              setShowPayment(true)
            }} className="min-h-11 flex-1 sm:flex-none">{isInterestOnly ? 'Pagar intereses' : 'Pagar cuota'}</Button>
            <Button variant="secondary" size="sm" onClick={() => setShowCapitalAbono(true)} className="min-h-11">Abonar</Button>
            <Button variant="secondary" size="sm" onClick={() => setShowLiquidation(true)} className="min-h-11">Liquidar</Button>
          </div>
        )}
      </Card>

      <Card>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-foreground">{isOpenEnded ? 'Resumen del préstamo' : 'Calendario de pagos'}</h3>
        </div>

        {isOpenEnded ? (
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>Préstamo abierto — no tiene límite de cuotas.</p>
            <p>Interés por período: <strong>{formatCurrency(loan.installment_amount)}</strong></p>
            {nextDueDate && <p>Próximo vencimiento: <strong>{nextDueDate}</strong></p>}
            <p>Capital pendiente: <strong>{formatCurrency(loan.remaining_amount)}</strong></p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <div className="bg-muted rounded-lg p-3">
                <p className="text-xs text-muted-foreground">Pendientes</p>
                <p className="text-lg font-bold text-foreground">{installments.filter(i => i.status !== 'paid').length}</p>
              </div>
              <div className="bg-muted rounded-lg p-3">
                <p className="text-xs text-muted-foreground">Pagadas</p>
                <p className="text-lg font-bold text-success">{installments.filter(i => i.status === 'paid').length}</p>
              </div>
              <div className="bg-muted rounded-lg p-3">
                <p className="text-xs text-muted-foreground">Por cobrar</p>
                <p className="text-lg font-bold text-foreground">{formatCurrency(installments.filter(i => i.status !== 'paid').reduce((s, i) => s + (i.amount - (i.paid_amount || 0)), 0))}</p>
              </div>
              <div className="bg-muted rounded-lg p-3">
                <p className="text-xs text-muted-foreground">Mora total</p>
                <p className="text-lg font-bold text-destructive">{formatCurrency(calcPendingMora())}</p>
              </div>
            </div>
            <div className="max-h-[55vh] overflow-y-auto pr-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {installments.map(inst => {
                  const remaining = inst.amount - (inst.paid_amount || 0)
                  const now = new Date()
                  const dueDate = new Date(inst.due_date)
                  const isLate = now > dueDate && inst.status !== 'paid'
                  const graceDays = settings?.grace_days || 0
                  const lateDays = calculateLateDays(inst.due_date, graceDays)
                  const totalLate = lateDays > 0
                    ? calculateLateAmount(remaining > 0 ? remaining : inst.amount, lateDays, settings?.late_interest_rate ?? 0)
                    : 0
                  const remainingLate = Math.max(0, totalLate - (inst.paid_late_amount || 0))
                  const cardBorder = 'border-border'
                  const numBg = inst.status === 'paid' ? 'bg-success/10 text-success' :
                    inst.status === 'partial' ? 'bg-blue-100 text-blue-700' :
                    isLate ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                  const badgeLabel = inst.status === 'paid' ? 'Pagada' :
                    inst.status === 'partial' ? 'Parcial' :
                    isLate ? 'Vencida' : 'Pendiente'
                  const badgeVariant: 'paid' | 'active' | 'late' | 'default' = inst.status === 'paid' ? 'paid' :
                    inst.status === 'partial' ? 'active' :
                    isLate ? 'late' : 'active'
                  return (
                    <div key={inst.id} className={`rounded-xl border-2 p-4 ${cardBorder} transition-shadow hover:shadow-sm`}>
                      <div className="flex items-center gap-3 mb-3">
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0 ${numBg}`}>
                          {inst.number}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm text-foreground">{inst.status === 'paid' ? formatCurrency(inst.amount) : formatCurrency(remaining)}{inst.status === 'partial' && <span className="text-xs text-muted-foreground font-normal ml-1">restantes</span>}</p>
                          <p className="text-xs text-muted-foreground">{formatDate(inst.due_date)}</p>
                        </div>
                        <Badge variant={badgeVariant}>{badgeLabel}</Badge>
                      </div>
                      {!isInterestOnly && (
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground mb-2 px-1">
                          <span>Cap: <strong className="text-foreground">{formatCurrency(inst.capital)}</strong></span>
                          <span>Int: <strong className="text-foreground">{formatCurrency(inst.interest)}</strong></span>
                          {remainingLate > 0 && <span>Mora: <strong className="text-destructive">{formatCurrency(remainingLate)}</strong></span>}
                          <span>Saldo: <strong className="text-foreground">{formatCurrency(inst.balance)}</strong></span>
                        </div>
                      )}
                      {isInterestOnly && (
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground mb-2 px-1">
                          <span>Int: <strong className="text-foreground">{formatCurrency(inst.interest)}</strong></span>
                          {remainingLate > 0 && <span>Mora: <strong className="text-destructive">{formatCurrency(remainingLate)}</strong></span>}
                          <span>Bal: <strong className="text-foreground">{formatCurrency(inst.balance)}</strong></span>
                        </div>
                      )}
                      {inst.status !== 'paid' && !readOnly && (
                        <button
                          type="button"
                          onClick={() => openPayModal(inst)}
                          className="w-full py-2.5 rounded-lg border border-primary text-primary text-sm font-semibold hover:bg-primary/5 transition-colors"
                        >
                          {`Pagar ${formatCurrency(remaining)}`}
                        </button>
                      )}
                      {inst.status === 'paid' && (
                        <div className="flex items-center gap-2 text-xs text-success font-medium px-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-success" />
                          Cobrado {inst.paid_at ? formatDate(inst.paid_at) : ''}
                        </div>
                      )}
                      {inst.status === 'partial' && (
                        <div className="flex items-center gap-2 text-xs text-blue-600 font-medium px-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />
                          Pagado {formatCurrency(inst.paid_amount!)} de {formatCurrency(inst.amount)}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </>
        )}
      </Card>

      <Card>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-foreground">Pagos ({payments.length})</h3>
          {payments.length > 0 && (
            <button
              type="button"
              onClick={() => {
                const total = payments.filter(p => p.status === 'paid').reduce((s, p) => s + Number(p.amount), 0)
                const msg = buildPaymentSummary({
                  loanId: loan.loan_id,
                  clientName: loan.client?.name || '',
                  totalPaid: total,
                  remaining: loan.remaining_amount,
                  businessName: settings?.business_name || 'Gestor de Prestamos',
                })
                navigator.clipboard.writeText(msg).then(() => {
                  setSummaryCopied(true)
                  setTimeout(() => setSummaryCopied(false), 2000)
                })
              }}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              title="Copia un resumen de los pagos del préstamo para poder enviarlo"
            >
              {summaryCopied ? '¡Resumen copiado!' : 'Copiar resumen'}
            </button>
          )}
        </div>
        {payments.length === 0 ? (
          <div className="text-center py-8">
            <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
              <Receipt className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="font-medium text-foreground">Sin pagos registrados</p>
            <p className="text-sm text-muted-foreground mt-1">Los pagos aparecerán aquí cuando se registren</p>
          </div>
        ) : (
          <div className="space-y-2">
            {payments.map(p => {
              const methodIcon = p.method === 'cash' ? <Money className="h-4 w-4" /> : p.method === 'transfer' ? <Bank className="h-4 w-4" /> : p.method === 'deposit' ? <DownloadSimple className="h-4 w-4" /> : <Receipt className="h-4 w-4" />
              const installmentNum = installments.find(i => i.id === p.installment_id)?.number
              const typeLabel = p.type === 'capital_abono' ? 'Abono a capital' : p.type === 'liquidation' ? 'Liquidación' : p.type === 'installment' ? (installmentNum ? `Cuota ${installmentNum}` : 'Interés') : 'Cuota'
              const typeColor = paymentTypeColors(p.type)
              return (
                <div key={p.id} className="flex items-center gap-3 p-3 rounded-xl border border-border hover:border-primary/30 transition-all">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${paymentMethodColor(p.method)}`}>
                    {methodIcon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-foreground">{formatCurrency(p.amount)}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5 truncate">
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0 ${typeColor}`}>{typeLabel}</span>
                      {p.capital_amount > 0 && (
                        <span className="text-[10px] text-muted-foreground/60">Cap: {formatCurrency(p.capital_amount)}</span>
                      )}
                      <span className="truncate">{p.method === 'cash' ? 'Efectivo' : p.method === 'transfer' ? 'Transferencia' : p.method === 'deposit' ? 'Depósito' : 'Otro'}{p.notes ? ` · ${p.notes}` : ''}</span>
                    </p>
                  </div>
                    <div className="text-right flex-shrink-0 ml-1">
                    <p className="text-xs text-muted-foreground">{formatDate(p.payment_date)}</p>
                    {p.status === 'paid' && balanceAfterPayment.has(p.id) && (
                      <p className="text-[10px] text-muted-foreground/60">Saldo: {formatCurrency(balanceAfterPayment.get(p.id)!)}</p>
                    )}
                    <div className="flex gap-1 mt-1 justify-end">
                      {p.status === 'paid' && (
                        <>
                          <button onClick={() => {
                            const payType = p.type === 'installment' ? 'Cuota' : p.type === 'capital_abono' ? 'Abono a capital' : p.type === 'liquidation' ? 'Liquidación' : 'Pago'
                            const payMethod = p.method === 'cash' ? 'Efectivo' : p.method === 'transfer' ? 'Transferencia' : p.method === 'deposit' ? 'Depósito' : 'Otro'
                            const msg = buildReceiptMessage({
                              amount: p.amount,
                              payType,
                              payMethod,
                              clientName: loan.client?.name || '',
                              loanId: loan.loan_id,
                              paymentDate: p.payment_date,
                              remaining: loan.remaining_amount,
                              businessName: settings?.business_name || 'Gestor de Prestamos',
                              notes: p.notes,
                            })
                            const phone = loan.client?.whatsapp || loan.client?.phone
                            if (phone) {
                              window.open(`https://wa.me/${phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(msg)}`, '_blank')
                            } else {
                              navigator.clipboard.writeText(msg).then(() => alert('Recibo copiado al portapapeles'))
                            }
                          }} className="w-7 h-7 rounded-md hover:bg-emerald-50 hover:text-emerald-600 flex items-center justify-center transition-colors" title="WhatsApp"><WhatsappLogo className="h-3.5 w-3.5" /></button>
                          {!readOnly && (
                            <button onClick={() => { setReversalPaymentId(p.id); setReversalReason(''); setShowReversalModal(true) }} className="w-7 h-7 rounded-md hover:bg-red-50 flex items-center justify-center text-sm transition-colors" title="Reversar">
                              <ArrowCounterClockwise className="h-3.5 w-3.5 text-destructive" />
                            </button>
                          )}
                        </>
                      )}
                      {p.status !== 'paid' && (
                        <div className="flex flex-col items-end gap-0.5">
                          <Badge variant="cancelled">Reversado</Badge>
                          {p.reversal_reason && (
                            <span className="text-[9px] text-muted-foreground/70 whitespace-nowrap max-w-[180px] truncate" title={p.reversal_reason}>
                              {p.reversal_reason}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}

          </div>
        )}
      </Card>

      <BottomSheet open={showPayment} onClose={() => { setShowPayment(false); setPaymentInstallmentId(''); setSelectedInstallmentMora(null) }} title={isInterestOnly ? 'Pagar intereses' : 'Realizar pago'}>
        <form onSubmit={handlePayInstallment} className="space-y-4">
        {paymentError && (
          <Alert variant="danger">{paymentError}</Alert>
        )}

        {!isOpenEnded && (
          <div className="space-y-1 mb-4">
            <label className="block text-sm font-medium text-muted-foreground mb-2">{isInterestOnly ? 'Cuota de interés a pagar' : 'Seleccionar cuota'}</label>
            {(() => {
              const pendingList = installments.filter(i => i.status !== 'paid')
              const firstPendingId = pendingList.length > 0 ? pendingList.reduce((a, b) => (a.number < b.number ? a : b)).id : null
              return (
                <>
                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {pendingList.map(inst => {
                      const isBlocked = firstPendingId !== null && inst.id !== firstPendingId
                      const remaining = inst.amount - (inst.paid_amount || 0)
                      const isPartial = (inst.paid_amount || 0) > 0
                      const graceDays = settings?.grace_days || 0
                      const lateDays = calculateLateDays(inst.due_date, graceDays)
                      const now = new Date()
                      const isLate = now > new Date(inst.due_date)
                      const isSelected = paymentInstallmentId === inst.id
                      let numBg = 'bg-warning-light text-warning'
                      let badgeLabel = 'Pendiente'
                      let badgeBg = 'bg-warning-light/60 text-warning'
                      if (isPartial) { numBg = 'bg-primary-light/30 text-primary'; badgeLabel = 'Parcial'; badgeBg = 'bg-primary-light/40 text-primary' }
                      if (isLate && !isPartial) { numBg = 'bg-destructive/10 text-destructive'; badgeLabel = 'Atrasado'; badgeBg = 'bg-destructive/10 text-destructive' }
                      if (isBlocked) { numBg = 'bg-muted text-muted-foreground'; badgeBg = 'bg-muted text-muted-foreground' }
                      return (
                        <label
                          key={inst.id}
                          className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                            isBlocked
                              ? 'border-dashed border-border opacity-60 cursor-not-allowed'
                              : isSelected
                                ? 'border-primary bg-primary/5'
                                : 'border-border hover:border-primary/40 hover:bg-muted'
                          }`}
                        >
                          <input
                            type="radio"
                            name="installment"
                            value={inst.id}
                            checked={isSelected}
                            disabled={isBlocked}
                            onChange={() => {
                              setPaymentInstallmentId(inst.id)
                              const totalLate = lateDays > 0
                                ? calculateLateAmount(remaining > 0 ? remaining : inst.amount, lateDays, settings?.late_interest_rate ?? 0)
                                : 0
                              const paidLate = inst.paid_late_amount || 0
                              const remainingLate = Math.max(0, totalLate - paidLate)
                              setPaymentAmount(String(remaining + (includeMora && remainingLate > 0 ? remainingLate : 0)))
                              setSelectedPaymentInstallment(inst)
                              setSelectedInstallmentMora(lateDays > 0 ? { lateDays, lateAmount: remainingLate } : null)
                            }}
                            className="accent-primary h-4 w-4 flex-shrink-0"
                          />
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0 ${numBg}`}>
                            {inst.number}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-sm text-foreground">
                              {isPartial ? formatCurrency(remaining) : formatCurrency(inst.amount)}
                              {isPartial && <span className="text-xs text-muted-foreground font-normal ml-1">restantes</span>}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {isBlocked
                                ? 'Primero paga la cuota #' + (inst.number - 1)
                                : `Vence: ${formatDate(inst.due_date)}`}
                              {isPartial && <> · Pagado {formatCurrency(inst.paid_amount!)}</>}
                            </div>
                          </div>
                          {isBlocked ? (
                            <span className={`text-xs font-medium px-2.5 py-1 rounded-full flex-shrink-0 ${badgeBg}`}>Bloqueada</span>
                          ) : (
                            <span className={`text-xs font-medium px-2.5 py-1 rounded-full flex-shrink-0 ${badgeBg}`}>
                              {badgeLabel}
                            </span>
                          )}
                        </label>
                      )
                    })}
                  </div>
                  {pendingList.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">Todas las cuotas están pagadas</p>
                  )}
                </>
              )
            })()}
          </div>
        )}

        {isOpenEnded && (
          <div className="bg-muted rounded-lg p-3 mb-4">
            <p className="text-sm text-muted-foreground">
              Interés del período: <strong className="text-foreground">{formatCurrency(loan.installment_amount)}</strong>
              {nextDueDate && <> · Vence: <strong className="text-foreground">{nextDueDate}</strong></>}
            </p>
          </div>
        )}

        <div className="space-y-1 mb-4">
          <MoneyInput value={paymentAmount} onChange={setPaymentAmount} placeholder="Monto" required />
          <div className="flex gap-2 mt-2 flex-wrap">
            <button type="button" onClick={() => {
              if (selectedPaymentInstallment) {
                const remaining = selectedPaymentInstallment.amount - (selectedPaymentInstallment.paid_amount || 0)
                const mora = includeMora ? (selectedInstallmentMora?.lateAmount || 0) : 0
                setPaymentAmount(String(Math.max(0, remaining + mora - (loan.prepaid_balance || 0))))
              }
            }} className="px-3 py-1.5 text-xs font-medium rounded-lg bg-muted text-muted-foreground hover:bg-border transition-colors">Completo</button>
            {isInterestOnly && selectedPaymentInstallment && selectedPaymentInstallment.interest < selectedPaymentInstallment.amount && (
              <button type="button" onClick={() => {
                setPaymentAmount(String(selectedPaymentInstallment.interest))
              }} className="px-3 py-1.5 text-xs font-medium rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors">
                Solo intereses ({formatCurrency(selectedPaymentInstallment.interest)})
              </button>
            )}
            <button type="button" onClick={() => {
              const val = parseFloat(paymentAmount) || 0
              setPaymentAmount(String(Math.round(val / 2 * 100) / 100))
            }} className="px-3 py-1.5 text-xs font-medium rounded-lg bg-muted text-muted-foreground hover:bg-border transition-colors">Mitad</button>
          </div>
        </div>

        {loan.prepaid_balance > 0 && (
          <Alert variant="success">
            Saldo a favor disponible: <strong>{formatCurrency(loan.prepaid_balance)}</strong>. Se aplicará automáticamente a esta cuota.
          </Alert>
        )}

        {selectedInstallmentMora && selectedPaymentInstallment && (() => {
          const remaining = selectedPaymentInstallment.amount - (selectedPaymentInstallment.paid_amount || 0)
          const moraAmount = selectedInstallmentMora.lateAmount
          return (
            <div className={`mb-4 transition-all duration-200 ${includeMora ? 'opacity-100' : 'opacity-70'}`}>
              <label className="flex items-center gap-2 text-sm p-3 rounded-lg border border-border cursor-pointer hover:bg-muted transition-colors">
                <input
                  type="checkbox"
                  checked={includeMora}
                  onChange={e => {
                    const checked = e.target.checked
                    setIncludeMora(checked)
                    setPaymentAmount(String(checked ? remaining + moraAmount : remaining))
                  }}
                  className="rounded border-border h-4 w-4"
                />
                <span>Incluir mora: <strong>{formatCurrency(moraAmount)}</strong> ({selectedInstallmentMora.lateDays} días)</span>
              </label>

              {includeMora && (
                <div className="mt-2 p-3 rounded-lg bg-muted border border-border animate-in fade-in slide-in-from-top-1 duration-200">
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">Subtotal cuota</span><span className="font-medium">{formatCurrency(remaining)}</span></div>
                  <div className="flex justify-between text-sm mt-1"><span className="text-destructive">Mora ({selectedInstallmentMora.lateDays}d)</span><span className="font-medium text-destructive">+ {formatCurrency(moraAmount)}</span></div>
                  <div className="border-t border-border mt-2 pt-2 flex justify-between text-sm font-semibold"><span className="text-foreground">Total</span><span className="text-foreground">{formatCurrency(remaining + moraAmount)}</span></div>
                </div>
              )}
            </div>
          )
        })()}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div className="min-w-0">
            <label className="block text-sm font-medium text-muted-foreground mb-1">Método</label>
            <select value={paymentMethod} onChange={e => setPaymentMethod(e.currentTarget.value)}
              className="block w-full min-w-0 rounded-lg border border-border px-3 py-2 text-sm bg-card min-h-11">
              <option value="cash">Efectivo</option>
              <option value="transfer">Transferencia</option>
              <option value="deposit">Depósito</option>
              <option value="other">Otro</option>
            </select>
          </div>
          <div className="min-w-0">
            <Input label="Fecha" type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} required />
          </div>
        </div>

        <div className="mb-4">
          <Input label="Notas" value={paymentNotes} onChange={e => setPaymentNotes(e.target.value)} placeholder="Referencia del pago" />
        </div>

        <div className="flex gap-2 pt-2">
          <Button variant="secondary" type="button" onClick={() => { setShowPayment(false); setPaymentInstallmentId(''); setSelectedInstallmentMora(null) }} className="flex-1">Cancelar</Button>
          <Button type="submit" loading={loading} className="flex-1">Pagar</Button>
        </div>
        </form>
      </BottomSheet>

      <BottomSheet open={showCapitalAbono} onClose={() => setShowCapitalAbono(false)} title="Abonar al capital">
        <form onSubmit={handleCapitalAbono} className="space-y-4">
          {paymentError && (
            <Alert variant="danger">{paymentError}</Alert>
          )}
          {(() => {
            const capRemaining = calcCapitalRemaining()
            const abono = parseFloat(capitalAbonoAmount) || 0
            const nuevoCapital = Math.max(0, capRemaining - abono)
            return (
              <>
                <div className="bg-primary/5 rounded-xl p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Capital actual</span>
                    <span className="font-semibold">{formatCurrency(capRemaining)}</span>
                  </div>
                  {abono > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Abono</span>
                      <span className="font-semibold text-success">- {formatCurrency(abono)}</span>
                    </div>
                  )}
                  <div className="border-t border-primary/10 pt-2 flex justify-between text-sm font-bold">
                    <span>Capital restante</span>
                    <span>{formatCurrency(nuevoCapital)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground pt-1">
                    Las cuotas pendientes se reducirán proporcionalmente
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">Monto a abonar</label>
                  <div className="flex gap-2">
                    <MoneyInput value={capitalAbonoAmount} onChange={setCapitalAbonoAmount} placeholder="Monto a abonar" required />
                    <span className="text-xs text-muted-foreground self-center flex-shrink-0">máx {formatCurrency(capRemaining)}</span>
                  </div>
                  <div className="flex gap-2 mt-2">
                    {[25, 50, 75, 100].map(pct => (
                      <button key={pct} type="button" onClick={() => {
                        setCapitalAbonoAmount(String(Math.round(capRemaining * pct / 100 * 100) / 100))
                      }} className={`flex-1 px-2 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                        Math.abs(abono - capRemaining * pct / 100) < 0.01
                          ? 'border-primary bg-primary/5 text-primary'
                          : 'border-border bg-background text-muted-foreground hover:bg-muted'
                      }`}>
                        {pct}%
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="min-w-0">
                    <label className="block text-sm font-medium text-muted-foreground mb-1">Método</label>
                    <select value={paymentMethod} onChange={e => setPaymentMethod(e.currentTarget.value)}
                      className="block w-full min-w-0 rounded-lg border border-border px-3 py-2 text-sm bg-card min-h-11">
                      <option value="cash">Efectivo</option>
                      <option value="transfer">Transferencia</option>
                      <option value="deposit">Depósito</option>
                      <option value="other">Otro</option>
                    </select>
                  </div>
                  <div className="min-w-0">
                    <Input label="Fecha" type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} required />
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <Button variant="secondary" type="button" onClick={() => setShowCapitalAbono(false)} className="flex-1">Cancelar</Button>
                  <Button type="submit" loading={loading} className="flex-1">
                    {abono > 0 ? `Abonar ${formatCurrency(abono)}` : 'Abonar'}
                  </Button>
                </div>
              </>
            )
          })()}
        </form>
      </BottomSheet>

      <BottomSheet open={showLiquidation} onClose={() => setShowLiquidation(false)} title="Liquidar préstamo">
        <div className="space-y-4">
          {paymentError && (
            <Alert variant="danger">{paymentError}</Alert>
          )}
          {(() => {
            const capRemaining = calcCapitalRemaining()
            if (capRemaining <= 0) return <p className="text-sm text-muted-foreground">No hay capital pendiente</p>

            const lastDate = lastPayment?.payment_date || loan.first_payment_date
            const days = Math.max(0, Math.floor((new Date().getTime() - new Date(lastDate).getTime()) / (1000 * 60 * 60 * 24)))
            const monthlyRate = loan.interest_type === 'percentage' ? loan.interest_rate / 100 : 0
            const propInterest = monthlyRate > 0 ? calculateProportionalInterest(capRemaining, monthlyRate, days) : 0
            const mora = calcPendingMora()
            const total = capRemaining + propInterest + mora

            return (
              <div className="space-y-3">
                <div className="bg-muted rounded-lg p-3 space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Capital pendiente</span>
                    <span className="font-semibold">{formatCurrency(capRemaining)}</span>
                  </div>
                  {propInterest > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Interés proporcional ({days}d)</span>
                      <span className="font-semibold">{formatCurrency(propInterest)}</span>
                    </div>
                  )}
                  {mora > 0 && (
                    <div className="flex justify-between">
                      <span className="text-destructive">Mora pendiente</span>
                      <span className="font-semibold text-destructive">{formatCurrency(mora)}</span>
                    </div>
                  )}
                  <hr className="border-border my-1" />
                  <div className="flex justify-between text-base">
                    <span className="font-bold">Total</span>
                    <span className="font-bold text-foreground">{formatCurrency(total)}</span>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  Al liquidar, el préstamo se marcará como pagado.
                </p>
              </div>
            )
          })()}
          <div className="flex gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowLiquidation(false)} className="flex-1">Cancelar</Button>
            <Button onClick={handleLiquidation} loading={loading} className="flex-1">Confirmar liquidación</Button>
          </div>
        </div>
      </BottomSheet>

      <BottomSheet open={showReversalModal} onClose={() => setShowReversalModal(false)} title="Motivo de la reversión">
        <form onSubmit={async (e) => {
          e.preventDefault()
          if (!reversalPaymentId || !reversalReason.trim()) return
          await handleReversePayment(reversalPaymentId)
          setShowReversalModal(false)
        }} className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Ingresa el motivo por el cual estás revirtiendo este pago:
          </p>
          <textarea
            value={reversalReason}
            onChange={e => setReversalReason(e.target.value)}
            required
            placeholder="Ej: Pago duplicado, error de monto, reversión solicitada..."
            className="block w-full rounded-lg border border-border px-3 py-2 text-sm min-h-[100px] resize-none"
          />
          <div className="flex gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => setShowReversalModal(false)} className="flex-1">Cancelar</Button>
            <Button type="submit" loading={loading} className="flex-1">Confirmar reversión</Button>
          </div>
        </form>
      </BottomSheet>

      <BottomSheet open={showDeleteModal} onClose={() => setShowDeleteModal(false)} title="Eliminar préstamo">
        <div className="space-y-3 text-sm text-foreground">
          {deleteError && <Alert variant="danger">{deleteError}</Alert>}
          <p className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2">
            <TrashSimple className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
            <span className="text-sm text-muted-foreground">
              ¿Seguro que deseas eliminar el préstamo <strong>{loan.loan_id}</strong> de <strong>{formatCurrency(loan.amount)}</strong>?
            </span>
          </p>
          <p className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
            <Check className="h-4 w-4 text-success flex-shrink-0 mt-0.5" />
            <span>
              Los <strong>pagos ya cobrados</strong> seguirán contando en tu Dashboard e historial y los <strong>documentos</strong>
              seguirán guardados en el cliente.
            </span>
          </p>
          {Number(loan.prepaid_balance) > 0 && (
            <p className="flex items-start gap-2 rounded-lg bg-warning-light px-3 py-2 text-xs text-warning">
              <Check className="h-4 w-4 text-warning flex-shrink-0 mt-0.5" />
              <span>
                El <strong>saldo a favor de {formatCurrency(loan.prepaid_balance)}</strong> se conserva junto al préstamo.
              </span>
            </p>
          )}
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1.5">Motivo de eliminación (opcional)</label>
            <textarea
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
              rows={2}
              maxLength={300}
              placeholder="Ej. Préstamo duplicado, error de captura..."
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
            />
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => setShowDeleteModal(false)} className="flex-1">Cancelar</Button>
            <Button variant="danger" type="button" loading={loading} onClick={handleDeleteLoan} className="flex-1">
              {loading ? 'Eliminando...' : 'Sí, eliminar'}
            </Button>
          </div>
        </div>
      </BottomSheet>

      <BottomSheet open={showContract} onClose={() => setShowContract(false)} title="Contrato de préstamo">
        <div id="loan-contract" className="receipt bg-white p-5 max-w-xs text-sm text-foreground space-y-2">
          <p className="text-center font-bold text-base">CONTRATO DE PRÉSTAMO</p>
          <p className="text-center text-xs text-muted-foreground">No. {loan.loan_id}</p>
          <p>Por medio del presente contrato, se formaliza el préstamo entre:</p>
          <p><strong>PRESTAMISTA:</strong> {settings?.business_name || 'El Prestamista'}</p>
          <p><strong>CLIENTE:</strong> {loan.client?.name}</p>
          <p><strong>MONTO:</strong> {formatCurrency(loan.amount)}</p>
          <p><strong>INTERÉS:</strong> {loan.interest_type === 'percentage' ? `${loan.interest_rate}%` : formatCurrency(loan.interest_rate)}</p>
          {isInterestOnly ? (
            <>
              <p><strong>TIPO:</strong> Solo Interés (pagos periódicos de interés, capital al liquidar)</p>
              <p><strong>INTERÉS POR PERÍODO:</strong> {formatCurrency(loan.installment_amount)}</p>
            </>
          ) : (
            <>
              <p><strong>MONTO TOTAL A PAGAR:</strong> {formatCurrency(loan.total_amount)}</p>
              <p><strong>CUOTAS:</strong> {loan.installments} de {formatCurrency(loan.installment_amount)}</p>
            </>
          )}
          <p><strong>CUOTAS:</strong> {isOpenEnded ? 'Abierto (sin límite)' : loan.installments}</p>
          <p><strong>FRECUENCIA:</strong> {loan.frequency === 'daily' ? 'Diario' : loan.frequency === 'weekly' ? 'Semanal' : loan.frequency === 'biweekly' ? 'Quincenal' : 'Mensual'}</p>
          {isOpenEnded && loan.payment_day && <p><strong>DÍA DE PAGO:</strong> {loan.payment_day} de cada mes</p>}
          <p><strong>FECHA DE INICIO:</strong> {formatDate(loan.start_date)}</p>
          <p><strong>PRIMER PAGO:</strong> {formatDate(loan.first_payment_date)}</p>
          {loan.guarantee && <p><strong>GARANTÍA:</strong> {loan.guarantee}</p>}
          <p className="pt-3 text-xs text-muted-foreground">Documento generado el {formatDate(new Date().toISOString())}</p>
          <div className="grid grid-cols-2 gap-6 pt-8 pb-2">
            <div>
              <div className="border-t-2 border-foreground pt-1 text-center text-xs text-muted-foreground">Firma del prestamista</div>
            </div>
            <div>
              <div className="border-t-2 border-foreground pt-1 text-center text-xs text-muted-foreground">Firma del cliente</div>
            </div>
          </div>
          <style>{`
            @media print {
              body * { visibility: hidden; }
              #loan-contract, #loan-contract * { visibility: visible; }
              #loan-contract {
                position: fixed; top: 0; left: 0; right: 0;
                max-width: 380px; margin: 0 auto;
                page-break-inside: avoid;
                break-inside: avoid;
              }
              #loan-contract p, #loan-contract div { break-inside: avoid; }
              @page { margin: 8mm; size: a4 portrait; }
            }
          `}</style>
        </div>
        <div className="flex gap-2 pt-4">
          <Button variant="secondary" className="flex-1" onClick={() => window.print()}>
            <FileArrowDown className="h-4 w-4 mr-1" /> Imprimir / PDF
          </Button>
        </div>
      </BottomSheet>

      <BottomSheet open={showDocs} onClose={() => setShowDocs(false)} title="Documentos del préstamo">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {['contract', 'promissory', 'guarantee', 'photo'].map(type => {
              const labels: Record<string, string> = { contract: 'Contrato', promissory: 'Pagaré', guarantee: 'Garantía', photo: 'Foto' }
              return (
                <label key={type} className="flex flex-col items-center gap-1 p-3 border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-primary text-xs text-muted-foreground">
                  <span>{labels[type]}</span>
                  <input type="file" className="hidden" accept="image/*,.pdf"
                    onChange={async (e) => {
                      const file = e.target.files?.[0]
                      if (!file || !userId) return
                      const path = `loans/${loan.id}/${type}_${Date.now()}`
                      const { error: uploadErr } = await supabase.storage.from('documents').upload(path, file)
                      if (uploadErr) return
                      await supabase.from('documents').insert({
                        client_id: loan.client_id,
                        loan_id: loan.id,
                        user_id: userId,
                        name: file.name,
                        type,
                        path,
                        mime_type: file.type,
                        size: file.size,
                      })
                      loadDocs()
                    }} />
                </label>
              )
            })}
          </div>
          {docs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Sin documentos</p>
          ) : (
            <div className="space-y-2">
              {docs.map(doc => (
                <div key={doc.id} className="flex items-center justify-between py-2 border-b last:border-0 text-sm">
                  <div>
                    <p className="font-medium text-foreground">{doc.name}</p>
                    <p className="text-xs text-muted-foreground">{doc.type === 'contract' ? 'Contrato' : doc.type === 'promissory' ? 'Pagaré' : doc.type === 'guarantee' ? 'Garantía' : 'Foto'}</p>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Button variant="secondary" size="sm" onClick={async () => {
                      const { data } = await supabase.storage.from('documents').createSignedUrl(doc.path, 60)
                      if (data) window.open(data.signedUrl, '_blank')
                    }}>Ver</Button>
                    <Button variant="secondary" size="sm" onClick={async () => {
                      await supabase.from('documents').delete().eq('id', doc.id)
                      await supabase.storage.from('documents').remove([doc.path])
                      loadDocs()
                    }} className="text-destructive">Eliminar</Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </BottomSheet>

      <BottomSheet open={showSuccess} onClose={() => setShowSuccess(false)} title="Pago exitoso">
        <div className="text-center space-y-5 py-2">
          <div className="mx-auto w-16 h-16 bg-success/15 rounded-full flex items-center justify-center">
            <Check className="h-8 w-8 text-success" />
          </div>
          <p className="text-xl font-semibold text-foreground">Pago registrado correctamente</p>

          {successPayment && (() => {
            const prevBalance = Number(loan.remaining_amount) + Number(successPayment.amount)
            return (
              <>
                {successPayments.length > 1 ? (
                  <div id="payment-receipt" className="receipt bg-white p-5 max-w-sm mx-auto">
                    <div className="text-center mb-4">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider">{settings?.business_name || 'Gestor de Prestamos'}</p>
                      <h2 className="text-lg font-bold text-foreground mt-1">RECIBO DE PAGO</h2>
                      <p className="text-xs text-muted-foreground font-mono mt-0.5">No. {successPayments[0]?.id?.slice(0, 8).toUpperCase() || 'N/A'}</p>
                    </div>
                    <div className="text-center mb-4">
                      <p className="text-3xl font-bold text-foreground">{formatCurrency(successPayments.reduce((s, p) => s + Number(p.amount), 0))}</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Se pagaron {successCoveredCount} cuotas{paymentMethod === 'cash' ? ' · Efectivo' : paymentMethod === 'transfer' ? ' · Transferencia' : paymentMethod === 'deposit' ? ' · Depósito' : ''}
                      </p>
                    </div>
                    <div className="border-t border-border pt-3 space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Cliente</span>
                        <span className="font-medium text-foreground">{loan.client?.name || '—'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Préstamo</span>
                        <span className="font-medium text-foreground">{loan.loan_id}</span>
                      </div>
                    </div>
                    <div className="border-t border-border mt-3 pt-3 space-y-2 text-sm">
                      {successPayments.map(p => (
                        <div key={p.id} className="flex justify-between">
                          <span className="text-muted-foreground">Cuota #{(p.installment_id ? installments.find(i => i.id === p.installment_id)?.number : undefined) ?? '—'}</span>
                          <span className="font-medium text-foreground">{formatCurrency(Number(p.amount))}</span>
                        </div>
                      ))}
                      <div className="flex justify-between font-bold text-foreground border-t border-border pt-2">
                        <span>Total pagado</span>
                        <span>{formatCurrency(successPayments.reduce((s, p) => s + Number(p.amount), 0))}</span>
                      </div>
                      {successPayment && (
                        <>
                          {Number(successPayment.capital_amount) > 0 && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Capital</span>
                              <span className="font-medium text-foreground">{formatCurrency(successPayment.capital_amount)}</span>
                            </div>
                          )}
                          {Number(successPayment.interest_amount) > 0 && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Interés</span>
                              <span className="font-medium text-foreground">{formatCurrency(successPayment.interest_amount)}</span>
                            </div>
                          )}
                          {Number(successPayment.late_amount) > 0 && (
                            <div className="flex justify-between text-destructive">
                              <span>Mora</span>
                              <span className="font-medium">{formatCurrency(successPayment.late_amount)}</span>
                            </div>
                          )}
                        </>
                      )}
                      <div className="flex justify-between font-bold text-foreground border-t border-border pt-2">
                        <span>Nuevo balance</span>
                        <span>{formatCurrency(loan.remaining_amount)}</span>
                      </div>
                    </div>
                    <p className="text-center text-xs text-muted-foreground mt-4">¡Gracias por su pago!</p>
                    <style>{`
                      @media print {
                        body * { visibility: hidden; }
                        #payment-receipt, #payment-receipt * { visibility: visible; }
                        #payment-receipt {
                          position: fixed; top: 0; left: 0; right: 0;
                          max-width: 380px; margin: 0 auto;
                          page-break-inside: avoid;
                          break-inside: avoid;
                        }
                        @page { margin: 10mm; size: auto; }
                      }
                    `}</style>
                  </div>
                ) : (
                  <div className="border border-border rounded-xl overflow-hidden">
                    <PaymentReceipt
                      payment={successPayment}
                      loan={loan}
                      settings={settings}
                      previousBalance={prevBalance}
                    />
                  </div>
                )}
                {loan.prepaid_balance > 0 && (
                  <Alert variant="success">
                    Saldo a favor actual del préstamo: <strong>{formatCurrency(loan.prepaid_balance)}</strong>. Se aplicará a la próxima cuota.
                  </Alert>
                )}
              </>
            )
          })()}

          <div className="flex flex-col sm:flex-row gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => window.print()}>
              <FileArrowDown className="h-4 w-4 mr-1" /> PDF
            </Button>
            <Button variant="secondary" className="flex-1" onClick={() => {
              const actualDate = successPayment?.payment_date || paymentDate
              const totalAmount = successPayments.length > 1
                ? successPayments.reduce((s, p) => s + Number(p.amount), 0)
                : (successPayment?.amount || 0)
              const payType = successPayment?.type === 'installment' ? 'Cuota' : successPayment?.type === 'capital_abono' ? 'Abono a capital' : successPayment?.type === 'liquidation' ? 'Liquidación' : 'Pago'
              const payMethod = paymentMethod === 'cash' ? 'Efectivo' : paymentMethod === 'transfer' ? 'Transferencia' : paymentMethod === 'deposit' ? 'Depósito' : 'Otro'
              const msg = buildReceiptMessage({
                amount: totalAmount,
                payType: successPayments.length > 1 ? `Cuotas x${successPayments.length}` : payType,
                payMethod,
                clientName: loan.client?.name || '',
                loanId: loan.loan_id,
                paymentDate: actualDate,
                remaining: loan.remaining_amount,
                businessName: settings?.business_name || 'Gestor de Prestamos',
              })
              const phone = loan.client?.whatsapp || loan.client?.phone
              if (phone) {
                window.open(`https://wa.me/${phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(msg)}`, '_blank')
              } else {
                navigator.clipboard.writeText(msg).then(() => alert('Recibo copiado al portapapeles'))
              }
            }}>
              <WhatsappLogo className="h-4 w-4 mr-1" /> WhatsApp
            </Button>
            <Button variant="secondary" className="flex-1" onClick={() => {
              const actualDate = successPayment?.payment_date || paymentDate
              const totalAmount = successPayments.length > 1
                ? successPayments.reduce((s, p) => s + Number(p.amount), 0)
                : (successPayment?.amount || 0)
              const payType = successPayment?.type === 'installment' ? 'Cuota' : successPayment?.type === 'capital_abono' ? 'Abono a capital' : successPayment?.type === 'liquidation' ? 'Liquidación' : 'Pago'
              const payMethod = paymentMethod === 'cash' ? 'Efectivo' : paymentMethod === 'transfer' ? 'Transferencia' : paymentMethod === 'deposit' ? 'Depósito' : 'Otro'
              const msg = buildReceiptMessage({
                amount: totalAmount,
                payType: successPayments.length > 1 ? `Cuotas x${successPayments.length}` : payType,
                payMethod,
                clientName: loan.client?.name || '',
                loanId: loan.loan_id,
                paymentDate: actualDate,
                remaining: loan.remaining_amount,
                businessName: settings?.business_name || 'Gestor de Prestamos',
              })
              navigator.clipboard.writeText(msg).then(() => alert('Recibo copiado al portapapeles'))
            }}>
            <ShareNetwork className="h-4 w-4 mr-1" /> Compartir
            </Button>
          </div>
          <Button className="w-full" onClick={() => setShowSuccess(false)}>Cerrar</Button>
        </div>
      </BottomSheet>
    </div>
  )
}