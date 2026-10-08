'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import SearchInput from '@/components/ui/SearchInput'
import PageHeader from '@/components/ui/PageHeader'
import Input from '@/components/ui/Input'
import MoneyInput from '@/components/ui/MoneyInput'
import BottomSheet from '@/components/ui/BottomSheet'
import { formatCurrency, formatDate } from '@/lib/utils'
import { paymentTypeColors, paymentMethodColor } from '@/lib/status-colors'
import { buildReceiptMessage } from '@/lib/messages'
import { createClient } from '@/lib/supabase-client'
import { calculateLateDays, calculateLateAmount, nextDueDateAfter } from '@/lib/calculations'
import { updateLoanAfterPayment } from '@/lib/payments'
import { logAuditEvent } from '@/lib/audit'
import PaymentReceipt from '@/components/loans/PaymentReceipt'
import Badge from '@/components/ui/Badge'
import ViewTabs from '@/components/ui/ViewTabs'
import { Alert } from '@/components/ui/Alert'
import { useRouter } from 'next/navigation'
import {
  CalendarCheck, Warning, Calendar, ArrowsClockwise,
  Check, ChatCircle, FileArrowDown, ShareNetwork, Receipt,
  Bank, Money, DownloadSimple,
} from '@phosphor-icons/react'
import type { Installment, Payment, Client, Setting } from '@/types'

interface OpenEndedLoan {
  id: string
  loan_id: string
  amount: number
  installment_amount: number
  remaining_amount: number
  payment_day: number
  first_payment_date: string
  client: { id: string; name: string; phone: string | null; whatsapp: string | null } | null
}

interface SyntheticInstallment {
  id: string
  loan_id: string
  client_id: string
  number: number
  amount: number
  capital: number
  interest: number
  balance: number
  paid_amount: number
  paid_late_amount: number
  due_date: string
  paid_at: string | null
  status: 'pending' | 'paid' | 'late'
  late_days: number
  late_amount: number
  loan: { loan_id: string; client: Client | null; amortization_type?: string; total_amount?: number; remaining_amount?: number; frequency?: string; open_ended?: boolean }
  isOpenEnded: true
  openEndedLoan: OpenEndedLoan
}

function getNextDueDate(loan: OpenEndedLoan): string {
  const next = nextDueDateAfter(loan.first_payment_date, loan.payment_day, new Date())
  const y = next.getFullYear()
  const m = String(next.getMonth() + 1).padStart(2, '0')
  const d = String(next.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

interface Props {
  todayInstallments: Installment[]
  overdueInstallments: Installment[]
  upcomingInstallments: Installment[]
  recentPayments: Payment[]
  openEndedLoans: OpenEndedLoan[]
  settings: Setting | null
}

export default function CollectionsContent({
  todayInstallments: initialToday, overdueInstallments: initialOverdue, upcomingInstallments: initialUpcoming, recentPayments: initialPayments, openEndedLoans, settings,
}: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [userId, setUserId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [showPayment, setShowPayment] = useState(false)
  const [selectedInstallment, setSelectedInstallment] = useState<Installment | SyntheticInstallment | null>(null)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [paymentNotes, setPaymentNotes] = useState('')
  const [paymentDate, setPaymentDate] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
  const [loading, setLoading] = useState(false)
  const [paymentError, setPaymentError] = useState('')
  const [filter, setFilter] = useState<'today' | 'overdue' | 'upcoming' | 'history'>('today')
  const [historyLimit, setHistoryLimit] = useState(20)
  const [includeMora, setIncludeMora] = useState(true)
  const [installmentMora, setInstallmentMora] = useState<{ lateDays: number; lateAmount: number } | null>(null)
  const [todayInstallments, setTodayInstallments] = useState(initialToday)
  const [overdueInstallments, setOverdueInstallments] = useState(initialOverdue)
  const [upcomingInstallments, setUpcomingInstallments] = useState(initialUpcoming)
  const [payments, setPayments] = useState(initialPayments)
  const [showSuccess, setShowSuccess] = useState(false)
  const [successPayment, setSuccessPayment] = useState<Payment | null>(null)
  const [successPrepaidBalance, setSuccessPrepaidBalance] = useState(0)
  const [successLoanInfo, setSuccessLoanInfo] = useState<{ loan_id: string; clientName: string; whatsapp: string | null; phone: string | null; amount: number; remaining_amount: number; amortization_type: string; frequency: string; open_ended: boolean } | null>(null)

  const lateInterestRate = settings?.late_interest_rate ?? 0
  const graceDays = settings?.grace_days || 0

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setUserId(data.user.id)
    })
  }, [])

  const synthetic = useMemo(() => {
    const today: SyntheticInstallment[] = []
    const overdue: SyntheticInstallment[] = []
    const upcoming: SyntheticInstallment[] = []

    const now = (() => {
      const d = new Date()
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    })()

    openEndedLoans.forEach(loan => {
      const due = getNextDueDate(loan)
      const entry: SyntheticInstallment = {
        id: `open_${loan.id}`,
        loan_id: loan.id,
        client_id: loan.client?.id || '',
        number: 0,
        amount: loan.installment_amount,
        capital: 0,
        interest: loan.installment_amount,
        balance: loan.remaining_amount,
        paid_amount: 0,
        paid_late_amount: 0,
        due_date: due,
        paid_at: null,
        status: 'pending',
        late_days: 0,
        late_amount: 0,
        loan: { loan_id: loan.loan_id, client: loan.client ? { id: loan.client.id, name: loan.client.name, phone: loan.client.phone ?? null } : null } as SyntheticInstallment['loan'],
        isOpenEnded: true,
        openEndedLoan: loan,
      }

      if (due === now) today.push(entry)
      else if (due < now) overdue.push(entry)
      else upcoming.push(entry)
    })

    return { today, overdue, upcoming }
  }, [openEndedLoans])

  const allToday = useMemo(() => [...todayInstallments, ...synthetic.today], [todayInstallments, synthetic.today])
  const allOverdue = useMemo(() => [...overdueInstallments, ...synthetic.overdue], [overdueInstallments, synthetic.overdue])
  const allUpcoming = useMemo(() => [...upcomingInstallments, ...synthetic.upcoming], [upcomingInstallments, synthetic.upcoming])

  const enrichedOverdue = useMemo(() => {
    return allOverdue.map(inst => {
      const lateDays = calculateLateDays(inst.due_date, graceDays)
      const remaining = inst.amount - (inst.paid_amount || 0)
      const totalLate = calculateLateAmount(remaining > 0 ? remaining : inst.amount, lateDays, lateInterestRate)
      const paidLate = inst.paid_late_amount || 0
      const remainingLate = Math.max(0, totalLate - paidLate)
      return { ...inst, late_days: Math.max(inst.late_days, lateDays), late_amount: Math.max(Number(inst.late_amount || 0), remainingLate) }
    })
  }, [allOverdue, lateInterestRate])

  const handlePay = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (loading) return
    if (!selectedInstallment || !userId) return
    const inst = selectedInstallment
    const isOpenEndedType = 'isOpenEnded' in inst && inst.isOpenEnded

    if (isOpenEndedType) {
      setLoading(true)
      setPaymentError('')
      const amount = parseFloat(paymentAmount)
      if (isNaN(amount) || amount <= 0) { setPaymentError('Monto inválido'); setLoading(false); return }

      const { data: payment, error } = await supabase
        .from('payments')
        .insert({
          loan_id: inst.loan_id,
          client_id: inst.client_id,
          user_id: userId,
          amount,
          capital_amount: 0,
          interest_amount: amount,
          payment_date: paymentDate,
          method: paymentMethod,
          notes: paymentNotes || null,
          type: 'installment',
        })
        .select()
        .single()

      if (error) { setPaymentError('Error al registrar pago: ' + error.message); setLoading(false); return }

      if (payment) {
        logAuditEvent(supabase, { userId, action: 'payment.recorded', entityType: 'payment', entityId: payment.id, details: { loan_id: inst.loan?.loan_id || inst.loan_id, client_name: inst.loan?.client?.name, amount, type: 'interest_only' } })
        await updateLoanAfterPayment(supabase, inst.loan_id, inst.client_id)

        setPayments(prev => [payment, ...prev])
        setSuccessPayment(payment)
        const openEndedLoan = inst.openEndedLoan || await supabase.from('loans').select('*, client:client_id(*)').eq('id', inst.loan_id).single().then(r => r.data)
        setSuccessLoanInfo({
          loan_id: inst.loan?.loan_id || inst.loan_id,
          clientName: inst.loan?.client?.name || openEndedLoan?.client?.name || '—',
          whatsapp: (inst.loan?.client?.whatsapp || openEndedLoan?.client?.whatsapp) || null,
          phone: (inst.loan?.client?.phone || openEndedLoan?.client?.phone) || null,
          amount: Number(inst.amount),
          remaining_amount: openEndedLoan?.remaining_amount ?? 0,
          amortization_type: 'interest_only' as const,
          frequency: 'monthly' as const,
          open_ended: true,
        })
        setShowSuccess(true)
        setShowPayment(false)
        setSelectedInstallment(null)
        setPaymentAmount('')
        setInstallmentMora(null)
        router.refresh()
      }
      setLoading(false)
      return
    }

    setLoading(true)

    const amount = parseFloat(paymentAmount)
    if (isNaN(amount) || amount <= 0) { setLoading(false); return }

    const realInst = inst as Installment

    try {
      const { data: rpcResult, error: rpcError } = await supabase.rpc('process_installment_payment', {
        p_loan_id: inst.loan_id,
        p_installment_id: realInst.id,
        p_user_id: userId,
        p_amount: amount,
        p_include_mora: includeMora,
        p_payment_date: paymentDate,
        p_method: paymentMethod,
        p_notes: paymentNotes,
        p_late_interest_rate: lateInterestRate,
        p_grace_days: graceDays,
      })
      if (rpcError) throw new Error(`Error al procesar el pago: ${rpcError.message}`)
      if (!rpcResult?.ok) throw new Error(rpcResult?.error || 'Error al procesar el pago')

      const payment = rpcResult.payment
      const allocation = rpcResult.allocation
      const loanUpdates = rpcResult.loan

      logAuditEvent(supabase, { userId, action: 'payment.recorded', entityType: 'payment', entityId: payment.id, details: { loan_id: inst.loan?.loan_id || inst.loan_id, client_name: inst.loan?.client?.name, installment_id: realInst.id, amount: Number(payment.amount), late_amount: Number(payment.late_amount ?? 0), capital_amount: Number(payment.capital_amount ?? 0), interest_amount: Number(payment.interest_amount ?? 0) } })

      const newStatus = allocation.isNowFullyPaid ? 'paid' as const : allocation.totalPaidOnInstallment > 0 ? 'partial' as const : 'pending' as const
      const updatedInstallment: Installment = {
        ...realInst,
        status: newStatus,
        paid_amount: allocation.totalPaidOnInstallment,
        paid_late_amount: allocation.newPaidLateAmount,
        late_amount: allocation.totalLateAmount,
        late_days: allocation.lateDays,
        paid_at: allocation.isNowFullyPaid ? paymentDate : null,
      }

      setTodayInstallments(prev => prev.map(i => i.id === realInst.id ? updatedInstallment : i))
      setOverdueInstallments(prev => prev.map(i => i.id === realInst.id ? updatedInstallment : i))
      setUpcomingInstallments(prev => prev.map(i => i.id === realInst.id ? updatedInstallment : i))
      setPayments(prev => [payment, ...prev])
      setSuccessPayment(payment)
      setSuccessLoanInfo({
        loan_id: inst.loan?.loan_id || inst.loan_id,
        clientName: inst.loan?.client?.name || ('isOpenEnded' in inst && inst.isOpenEnded ? (inst as SyntheticInstallment).openEndedLoan?.client?.name : undefined) || '—',
        whatsapp: inst.loan?.client?.whatsapp || ('isOpenEnded' in inst && inst.isOpenEnded ? (inst as SyntheticInstallment).openEndedLoan?.client?.whatsapp : undefined) || null,
        phone: inst.loan?.client?.phone || ('isOpenEnded' in inst && inst.isOpenEnded ? (inst as SyntheticInstallment).openEndedLoan?.client?.phone : undefined) || null,
        amount: Number(inst.loan?.total_amount || inst.amount),
        remaining_amount: loanUpdates?.remaining_amount ?? inst.loan?.remaining_amount ?? 0,
        amortization_type: inst.loan?.amortization_type || 'french',
        frequency: inst.loan?.frequency || 'monthly',
        open_ended: inst.loan?.open_ended || false,
      })
      setSuccessPrepaidBalance(allocation.newPrepaidBalance)
      setShowSuccess(true)
      setShowPayment(false)
      setSelectedInstallment(null)
      setPaymentAmount('')
      setInstallmentMora(null)
      router.refresh()
    } catch (err) {
      setPaymentError(err instanceof Error ? err.message : 'Error al procesar el pago')
    }

    setLoading(false)
  }, [selectedInstallment, userId, paymentAmount, includeMora, paymentDate, paymentMethod, paymentNotes, lateInterestRate, graceDays, supabase, router])

  const todayTotal = useMemo(() => allToday.reduce((s, i) => s + Number(i.amount) - Number('paid_amount' in i ? (i.paid_amount || 0) : 0), 0), [allToday])
  const overdueTotal = useMemo(() => enrichedOverdue.reduce((s, i) => s + Number(i.amount) - Number('paid_amount' in i ? (i.paid_amount || 0) : 0), 0), [enrichedOverdue])
  const upcomingTotal = useMemo(() => allUpcoming.reduce((s, i) => s + Number(i.amount) - Number('paid_amount' in i ? (i.paid_amount || 0) : 0), 0), [allUpcoming])

  function openPayment(inst: Installment | SyntheticInstallment) {
    setSelectedInstallment(inst)
    const lateDays = calculateLateDays(inst.due_date, graceDays)
    const remaining = inst.amount - (inst.paid_amount || 0)
    const totalLate = lateDays > 0 ? calculateLateAmount(remaining > 0 ? remaining : inst.amount, lateDays, lateInterestRate) : 0
    const paidLate = ('paid_late_amount' in inst ? (inst.paid_late_amount || 0) : 0)
    const remainingLate = Math.max(0, totalLate - paidLate)
    const hasMora = remainingLate > 0
    setInstallmentMora(hasMora ? { lateDays, lateAmount: remainingLate } : null)
    setIncludeMora(hasMora)
    setPaymentAmount(String(hasMora ? remaining + remainingLate : remaining))
    setShowPayment(true)
  }

  const allList: (Installment | SyntheticInstallment)[] = filter === 'today' ? allToday
    : filter === 'overdue' ? enrichedOverdue
    : filter === 'upcoming' ? allUpcoming
    : []

  const filteredList: (Installment | SyntheticInstallment)[] = allList.filter(inst => {
    if (!search) return true
    const name = inst.loan?.client?.name?.toLowerCase() || ''
    return name.includes(search.toLowerCase())
  })

  const filterTabs = [
    { key: 'today' as const, label: 'Hoy', count: allToday.length },
    { key: 'overdue' as const, label: 'Vencidos', count: enrichedOverdue.length },
    { key: 'upcoming' as const, label: 'Próximos', count: allUpcoming.length },
    { key: 'history' as const, label: 'Historial', count: payments.length },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cobros"
        description="Gestiona los pagos y cobros diarios"
        action={<div className="flex gap-2"><Button variant="secondary" size="sm" aria-label="Actualizar" onClick={() => router.refresh()} className="min-h-11 min-w-11 p-0 flex items-center justify-center"><ArrowsClockwise className="h-4 w-4" /></Button></div>}
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="flex items-center gap-4">
          <div className="h-10 w-10 rounded-xl bg-white border border-border flex items-center justify-center">
            <CalendarCheck className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-xl font-bold text-foreground">{formatCurrency(todayTotal)}</p>
            <p className="text-xs text-muted-foreground">Hoy ({allToday.length})</p>
          </div>
        </Card>
        <Card className="flex items-center gap-4">
          <div className="h-10 w-10 rounded-xl bg-white border border-border flex items-center justify-center">
            <Warning className="h-5 w-5 text-destructive" />
          </div>
          <div>
            <p className="text-xl font-bold text-foreground">{formatCurrency(overdueTotal)}</p>
            <p className="text-xs text-muted-foreground">Vencidos ({enrichedOverdue.length})</p>
          </div>
        </Card>
        <Card className="flex items-center gap-4">
          <div className="h-10 w-10 rounded-xl bg-white border border-border flex items-center justify-center">
            <Calendar className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-xl font-bold text-foreground">{formatCurrency(upcomingTotal)}</p>
            <p className="text-xs text-muted-foreground">Próximos ({allUpcoming.length})</p>
          </div>
        </Card>
      </div>

      <div className="flex flex-col lg:flex-row lg:items-center gap-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Buscar por cliente..." className="flex-1" />
        <ViewTabs
          options={filterTabs}
          selected={filter}
          onSelect={v => setFilter(v as 'today' | 'overdue' | 'upcoming' | 'history')}
          ariaLabel="Filtrar cobros"
          className="w-full lg:w-auto"
        />
      </div>

      {filter === 'history' ? (
        <Card>
          <h3 className="text-base font-semibold text-foreground mb-4">Últimos cobros realizados</h3>
          {payments.length === 0 ? (
            <div className="text-center py-10">
              <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
                <Receipt className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="font-medium text-foreground">Sin cobros registrados</p>
              <p className="text-sm text-muted-foreground mt-1">Los cobros aparecerán aquí cuando se registren</p>
            </div>
          ) : (
            <div className="space-y-2">
              {payments.slice(0, historyLimit).map(p => {
                const methodIcon = p.method === 'cash' ? <Money className="h-4 w-4" /> : p.method === 'transfer' ? <Bank className="h-4 w-4" /> : p.method === 'deposit' ? <DownloadSimple className="h-4 w-4" /> : <Receipt className="h-4 w-4" />
                const typeLabel = p.type === 'capital_abono' ? 'Abono' : p.type === 'liquidation' ? 'Liquidación' : p.type === 'installment' ? 'Interés' : 'Cuota'
                const typeColor = paymentTypeColors(p.type)
                return (
                  <div key={p.id} className="flex items-center gap-3 p-3 rounded-xl border border-border hover:border-primary/30 transition-all">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${paymentMethodColor(p.method)}`}>
                      {methodIcon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-foreground truncate">{p.loan?.client?.name || p.loan?.loan_id || 'Eliminado'}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1.5 truncate">
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0 ${typeColor}`}>{typeLabel}</span>
                        <span className="truncate">{p.method === 'cash' ? 'Efectivo' : p.method === 'transfer' ? 'Transferencia' : p.method === 'deposit' ? 'Depósito' : 'Otro'}{p.notes ? ` · ${p.notes}` : ''}</span>
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0 ml-1">
                      <p className="font-semibold text-success text-sm">{formatCurrency(p.amount)}</p>
                      <p className="text-[11px] text-muted-foreground">{formatDate(p.payment_date)}</p>
                      {p.status !== 'paid' && p.reversal_reason && (
                        <span className="text-[9px] text-destructive/80 block mt-0.5 truncate max-w-[160px]" title={p.reversal_reason}>
                          Reversado: {p.reversal_reason}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
              {payments.length > historyLimit && (
                <button
                  type="button"
                  onClick={() => setHistoryLimit(prev => prev + 20)}
                  className="w-full py-3 text-sm font-medium text-primary hover:text-primary/80 transition-colors border border-dashed border-border rounded-lg"
                >
                  Ver más ({payments.length - historyLimit} restantes)
                </button>
              )}
            </div>
          )}
        </Card>
      ) : filteredList.length === 0 ? (
        <Card>
          <div className="text-center py-10">
            <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
              {filter === 'today' ? <CalendarCheck className="h-6 w-6 text-muted-foreground" /> : filter === 'overdue' ? <Warning className="h-6 w-6 text-muted-foreground" /> : <Calendar className="h-6 w-6 text-muted-foreground" />}
            </div>
            <p className="font-medium text-foreground">
              {filter === 'today' ? 'No hay cobros para hoy' : filter === 'overdue' ? 'No hay cuotas vencidas' : 'No hay cuotas próximas'}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {filter === 'today' ? 'Los cobros del día aparecerán aquí' : filter === 'overdue' ? 'Todo está al día' : 'No hay cuotas programadas'}
            </p>
          </div>
        </Card>
      ) : (
        <div className="max-h-[55vh] overflow-y-auto pr-1 grid grid-cols-1 md:grid-cols-2 gap-3">
          {filteredList.map((inst: Installment | SyntheticInstallment) => {
            const client = inst.loan?.client
            const isOpen = ('isOpenEnded' in inst && inst.isOpenEnded)
            const remainingLate = Math.max(0, (inst.late_amount || 0) - ((inst as Installment).paid_late_amount || 0))
            const remaining = inst.amount - (inst.paid_amount || 0)
            const isPartial = (inst.paid_amount ?? 0) > 0 && inst.status !== 'paid'
            return (
              <div key={inst.id} className="bg-card rounded-xl border border-border p-4 hover:shadow-sm transition-shadow">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="font-semibold text-sm text-foreground">{client?.name || 'Eliminado'}</p>
                      {filter === 'overdue' && (
                        <Badge variant={inst.late_days > 60 ? 'late_61_90' : inst.late_days > 30 ? 'late_31_60' : 'late_1_30'}>
                          {inst.late_days}d atrasado
                        </Badge>
                      )}
                      {filter === 'today' && (
                        <Badge variant="active">Hoy</Badge>
                      )}
                      {isPartial && (
                        <Badge variant="active">Parcial</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {isOpen ? 'Interés' : `Cuota #${inst.number}`}
                      {filter === 'upcoming' && <span className="ml-1">· {formatDate(inst.due_date)}</span>}
                      {isPartial && <span className="text-blue-600 font-medium ml-1">({formatCurrency(inst.paid_amount!)} pagado)</span>}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-bold text-foreground">
                      {isPartial ? formatCurrency(remaining) : formatCurrency(inst.amount)}
                    </p>
                    {remainingLate > 0 && (
                      <p className="text-xs text-destructive font-medium">+{formatCurrency(remainingLate)} mora</p>
                    )}
                    <Button size="sm" onClick={() => openPayment(inst)} className="mt-1.5 min-h-9">
                      Cobrar
                    </Button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <BottomSheet open={showPayment} onClose={() => { setShowPayment(false); setSelectedInstallment(null); setInstallmentMora(null) }} title="Registrar cobro">
        <form onSubmit={handlePay} className="space-y-4">
          {paymentError && (
            <Alert variant="danger">{paymentError}</Alert>
          )}
          {selectedInstallment && (() => {
            const inst = selectedInstallment
            const remaining = inst.amount - (inst.paid_amount || 0)
            const mora = installmentMora
            return (
              <>
                <div className="bg-primary/5 rounded-xl p-4 text-sm space-y-1.5">
                  <div className="mb-2">
                    <p className="font-semibold text-foreground">{inst.loan?.client?.name}</p>
                  </div>
                  {('isOpenEnded' in inst && inst.isOpenEnded) ? (
                    <p><span className="text-muted-foreground">Interés del período:</span> <strong>{formatCurrency(inst.amount)}</strong></p>
                  ) : (
                    <p><span className="text-muted-foreground">Cuota #{(inst as Installment).number}:</span> <strong>{formatCurrency(inst.amount)}</strong></p>
                  )}
                  <p><span className="text-muted-foreground">Vence:</span> <strong>{formatDate(inst.due_date)}</strong></p>
                  {(inst.paid_amount ?? 0) > 0 && (
                    <p className="text-primary"><span className="text-muted-foreground">Pagado antes:</span> <strong>{formatCurrency(inst.paid_amount!)}</strong></p>
                  )}
                  <p><span className="text-muted-foreground">Restante:</span> <strong>{formatCurrency(remaining)}</strong></p>
                  {mora && (
                    <p className="text-destructive"><span className="text-muted-foreground">Mora:</span> <strong>{formatCurrency(mora.lateAmount)}</strong> ({mora.lateDays} días)</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">Monto</label>
                  <MoneyInput value={paymentAmount} onChange={setPaymentAmount} required />
                <div className="flex gap-2 mt-2 flex-wrap">
                    <button type="button" onClick={() => setPaymentAmount(String(Math.max(0, remaining + (includeMora && mora ? mora.lateAmount : 0) - Number((inst.loan as { prepaid_balance?: number } | undefined)?.prepaid_balance || 0))))} className="px-3 py-1.5 text-xs font-medium rounded-lg bg-muted text-muted-foreground hover:bg-border transition-colors">Completo</button>
                    <button type="button" onClick={() => { const v = parseFloat(paymentAmount) || 0; setPaymentAmount(String(Math.round(v / 2 * 100) / 100)) }} className="px-3 py-1.5 text-xs font-medium rounded-lg bg-muted text-muted-foreground hover:bg-border transition-colors">Mitad</button>
                  </div>
                </div>
                {Number((inst.loan as { prepaid_balance?: number } | undefined)?.prepaid_balance || 0) > 0 && (
                  <Alert variant="success">
                    Saldo a favor disponible: <strong>{formatCurrency(Number((inst.loan as { prepaid_balance?: number } | undefined)?.prepaid_balance || 0))}</strong>. Se aplicará automáticamente a esta cuota.
                  </Alert>
                )}
                {mora && (
                  <div className={`transition-all duration-200 ${includeMora ? 'opacity-100' : 'opacity-70'}`}>
                    <label className="flex items-center gap-2 text-sm p-3 rounded-lg border border-border cursor-pointer hover:bg-muted transition-colors">
                      <input type="checkbox" checked={includeMora}
                        onChange={e => { const c = e.target.checked; setIncludeMora(c); setPaymentAmount(String(c ? remaining + (mora?.lateAmount ?? 0) : remaining)) }}
                        className="rounded border-border h-4 w-4" />
                      <span>Incluir mora: <strong>{formatCurrency(mora.lateAmount)}</strong> ({mora.lateDays} días)</span>
                    </label>
                    {includeMora && (
                      <div className="mt-2 p-3 rounded-lg bg-muted border border-border animate-in fade-in slide-in-from-top-1 duration-200">
                        <div className="flex justify-between text-sm"><span className="text-muted-foreground">Subtotal cuota</span><span className="font-medium">{formatCurrency(remaining)}</span></div>
                        <div className="flex justify-between text-sm mt-1"><span className="text-destructive">Mora ({mora.lateDays}d)</span><span className="font-medium text-destructive">+ {formatCurrency(mora.lateAmount)}</span></div>
                        <div className="border-t border-border mt-2 pt-2 flex justify-between text-sm font-semibold"><span>Total</span><span>{formatCurrency(remaining + mora.lateAmount)}</span></div>
                      </div>
                    )}
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="min-w-0">
                    <label className="block text-sm font-medium text-muted-foreground mb-1">Método</label>
                    <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}
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
                <Input label="Notas" value={paymentNotes} onChange={e => setPaymentNotes(e.target.value)} placeholder="Referencia del pago" />
                <div className="flex gap-2 pt-2">
                  <Button variant="secondary" type="button" className="flex-1" onClick={() => { setShowPayment(false); setSelectedInstallment(null); setInstallmentMora(null) }}>Cancelar</Button>
                  <Button type="submit" loading={loading} className="flex-1">Cobrar</Button>
                </div>
              </>
            )
          })()}
        </form>
      </BottomSheet>

      <BottomSheet open={showSuccess} onClose={() => { setShowSuccess(false); setSuccessPrepaidBalance(0) }} title="Pago exitoso">
        <div className="text-center space-y-5 py-2">
          <div className="mx-auto w-16 h-16 bg-success/15 rounded-full flex items-center justify-center">
            <Check className="h-8 w-8 text-success" />
          </div>
          <p className="text-xl font-semibold text-foreground">Pago registrado correctamente</p>

          {successPayment && successLoanInfo && (
            <div className="border border-border rounded-xl overflow-hidden">
              <PaymentReceipt
                payment={successPayment}
                loan={{
                  loan_id: successLoanInfo.loan_id,
                  remaining_amount: successLoanInfo.remaining_amount,
                  client: { name: successLoanInfo.clientName },
                }}
                settings={settings}
              />
            </div>
          )}

          {successPrepaidBalance > 0 && (
            <Alert variant="success">
              Saldo a favor actual del préstamo: <strong>{formatCurrency(successPrepaidBalance)}</strong>. Se aplicará a la próxima cuota.
            </Alert>
          )}

          <div className="flex flex-col sm:flex-row gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => window.print()}>
              <FileArrowDown className="h-4 w-4 mr-1" /> PDF
            </Button>
            <Button variant="secondary" className="flex-1" onClick={() => {
              if (!successPayment || !successLoanInfo) return
              const payType = successPayment.type === 'installment' ? 'Cuota' : successPayment.type === 'capital_abono' ? 'Abono a capital' : successPayment.type === 'liquidation' ? 'Liquidación' : 'Pago'
              const payMethod = successPayment.method === 'cash' ? 'Efectivo' : successPayment.method === 'transfer' ? 'Transferencia' : successPayment.method === 'deposit' ? 'Depósito' : 'Otro'
              const msg = buildReceiptMessage({
                amount: successPayment.amount,
                payType,
                payMethod,
                clientName: successLoanInfo.clientName,
                loanId: successLoanInfo.loan_id,
                paymentDate: successPayment.payment_date,
                remaining: successLoanInfo.remaining_amount,
                businessName: settings?.business_name || 'Gestor de Prestamos',
              })
              const phone = successLoanInfo.whatsapp || successLoanInfo.phone
              if (phone) {
                window.open(`https://wa.me/${phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(msg)}`, '_blank')
              } else {
                navigator.clipboard.writeText(msg)
              }
            }}>
              <ChatCircle className="h-4 w-4 mr-1" /> WhatsApp
            </Button>
            <Button variant="secondary" className="flex-1" onClick={() => {
              if (!successPayment || !successLoanInfo) return
              const payType = successPayment.type === 'installment' ? 'Cuota' : successPayment.type === 'capital_abono' ? 'Abono a capital' : successPayment.type === 'liquidation' ? 'Liquidación' : 'Pago'
              const payMethod = successPayment.method === 'cash' ? 'Efectivo' : successPayment.method === 'transfer' ? 'Transferencia' : successPayment.method === 'deposit' ? 'Depósito' : 'Otro'
              const msg = buildReceiptMessage({
                amount: successPayment.amount,
                payType,
                payMethod,
                clientName: successLoanInfo.clientName,
                loanId: successLoanInfo.loan_id,
                paymentDate: successPayment.payment_date,
                remaining: successLoanInfo.remaining_amount,
                businessName: settings?.business_name || 'Gestor de Prestamos',
              })
              navigator.clipboard.writeText(msg)
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
