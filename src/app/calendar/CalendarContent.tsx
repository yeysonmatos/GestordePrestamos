'use client'

import { useState, useMemo } from 'react'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import PageHeader from '@/components/ui/PageHeader'
import { formatCurrency, formatDate } from '@/lib/utils'
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addDays, addMonths, subMonths, isSameMonth, isSameDay, parseISO,
} from 'date-fns'
import { es } from 'date-fns/locale'
import { CaretLeft, CaretRight } from '@phosphor-icons/react'
import { nextDueDateAfter } from '@/lib/calculations'
import Badge from '@/components/ui/Badge'
import type { Installment, Payment, Client, Loan } from '@/types'

export interface OpenEndedLoan {
  id: string
  loan_id: string
  amount: number
  installment_amount: number
  remaining_amount: number
  payment_day: number
  first_payment_date: string
  client: Client | undefined
}

function getNextDueDates(loan: OpenEndedLoan, count: number = 6): string[] {
  const dates: string[] = []
  let cursor = nextDueDateAfter(loan.first_payment_date, loan.payment_day, new Date())
  for (let i = 0; i < count; i++) {
    dates.push(format(cursor, 'yyyy-MM-dd'))
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
    cursor = nextDueDateAfter(
      format(cursor, 'yyyy-MM-dd'),
      loan.payment_day,
      cursor,
    )
  }
  return dates
}

interface Props {
  installments: Installment[]
  payments: Payment[]
  openEndedLoans: OpenEndedLoan[]
}

const pendingStatuses = ['pending', 'partial', 'late']

export interface SyntheticInstallment {
  id: string
  loan_id: string
  client_id: string
  amount: number
  number: number
  status: 'pending'
  due_date: string
  loan: Loan & { client?: Client }
}

function buildSynthetic(loan: OpenEndedLoan, due: string): SyntheticInstallment {
  return {
    id: `open_${loan.id}_${due}`,
    loan_id: loan.id,
    client_id: loan.client?.id || '',
    amount: loan.installment_amount,
    number: 0,
    status: 'pending' as const,
    due_date: due,
    loan: {
      id: loan.id,
      loan_id: loan.loan_id,
      user_id: '',
      client_id: loan.client?.id || '',
      amount: loan.amount,
      interest_type: 'percentage' as const,
      interest_rate: 0,
      total_amount: loan.amount,
      total_interest: 0,
      installment_amount: loan.installment_amount,
      installments: 0,
      paid_installments: 0,
      paid_amount: 0,
      remaining_amount: loan.remaining_amount,
      progress: 0,
      frequency: 'monthly' as const,
      start_date: loan.first_payment_date,
      first_payment_date: loan.first_payment_date,
      end_date: null,
      amortization_type: 'interest_only' as const,
      open_ended: true,
      payment_day: loan.payment_day,
      status: 'active' as const,
      late_days: 0,
      late_interest_rate: 0,
      guarantee: null,
      notes: null,
      paid_at: null,
      cancelled_at: null,
      created_at: loan.first_payment_date,
      updated_at: loan.first_payment_date,
      client: loan.client,
    } as Loan & { client?: Client },
  }
}

export default function CalendarContent({ installments, payments, openEndedLoans }: Props) {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [listLimit, setListLimit] = useState(10)

  const monthStart = startOfMonth(currentDate)
  const monthEnd = endOfMonth(currentDate)
  const calStart = startOfWeek(monthStart)
  const calEnd = endOfWeek(monthEnd)

  const days = useMemo(() => {
    const d: Date[] = []
    let day = calStart
    while (day <= calEnd) {
      d.push(day)
      day = addDays(day, 1)
    }
    return d
  }, [currentDate])

  const events = useMemo(() => {
    const dueByDate: Record<string, (Installment | SyntheticInstallment)[]> = {}
    const paidByDate: Record<string, Payment[]> = {}

    installments.forEach(inst => {
      if (inst.status === 'paid') return
      const key = inst.due_date
      if (!dueByDate[key]) dueByDate[key] = []
      dueByDate[key].push(inst)
    })

    openEndedLoans.forEach(loan => {
      const dates = getNextDueDates(loan, 12)
      dates.forEach(due => {
        if (!dueByDate[due]) dueByDate[due] = []
        dueByDate[due].push(buildSynthetic(loan, due))
      })
    })

    payments.forEach(p => {
      const key = p.payment_date
      if (!paidByDate[key]) paidByDate[key] = []
      paidByDate[key].push(p)
    })

    return { dueByDate, paidByDate }
  }, [installments, payments, openEndedLoans])

  function formatKey(date: Date) {
    return format(date, 'yyyy-MM-dd')
  }

  const weekDays = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

  return (
    <div className="space-y-6">
      <PageHeader
        title="Calendario"
        description="Vista mensual de cuotas y pagos"
      />

      <Card>
        <div className="flex items-center justify-between mb-4">
          <Button variant="ghost" size="sm" onClick={() => setCurrentDate(subMonths(currentDate, 1))}>
            <CaretLeft className="h-5 w-5" />
          </Button>
          <h2 className="text-lg font-semibold text-foreground">
            {format(currentDate, "MMMM 'de' yyyy", { locale: es })}
          </h2>
          <Button variant="ghost" size="sm" onClick={() => setCurrentDate(addMonths(currentDate, 1))}>
            <CaretRight className="h-5 w-5" />
          </Button>
        </div>

        <div className="grid grid-cols-7 gap-px bg-gray-200 rounded-lg overflow-hidden">
          {weekDays.map(d => (
            <div key={d} className="bg-background px-2 py-2 text-center text-xs font-semibold text-muted-foreground">
              {d}
            </div>
          ))}
          {days.map(day => {
            const key = formatKey(day)
            const dayDue = events.dueByDate[key] || []
            const dayPaid = events.paidByDate[key] || []
            const isToday = isSameDay(day, new Date())
            const isCurrent = isSameMonth(day, currentDate)
            const totalDue = dayDue.reduce((s, i) => s + Number(i.amount) - Number('paid_amount' in i ? (i.paid_amount || 0) : 0), 0)
            const totalPaid = dayPaid.reduce((s, p) => s + Number(p.amount), 0)

            return (
              <button
                key={key}
                type="button"
                aria-label={format(day, "d 'de' MMMM 'de' yyyy", { locale: es })}
                onClick={() => {
                  setSelectedDate(selectedDate === key ? null : key)
                  setListLimit(10)
                }}
                className={`bg-card min-h-[80px] p-1.5 text-left w-full ${
                  !isCurrent ? 'opacity-40' : ''
                } ${isToday ? 'ring-2 ring-primary ring-inset' : ''} ${
                  selectedDate === key ? 'ring-2 ring-accent' : ''
                } hover:bg-muted/50 transition-colors cursor-pointer`}
              >
                <p className={`text-xs font-medium mb-1 ${
                  isToday ? 'text-primary' : 'text-muted-foreground'
                }`}>
                  {format(day, 'd')}
                </p>
                {dayDue.length > 0 && (
                  <div className="space-y-0.5">
                    <p className="text-[10px] text-destructive font-medium">
                      {dayDue.length} vencen · {formatCurrency(totalDue)}
                    </p>
                    {dayDue.some(i => pendingStatuses.includes(i.status) && parseISO(i.due_date) < new Date()) && (
                      <p className="text-[10px] text-destructive font-medium">Atrasado</p>
                    )}
                  </div>
                )}
                {dayPaid.length > 0 && (
                  <p className="text-[10px] text-success font-medium">
                    {formatCurrency(totalPaid)} cobrado
                  </p>
                )}
              </button>
            )
          })}
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-foreground">
            {selectedDate
              ? `Cuotas del ${format(parseISO(selectedDate), "d 'de' MMMM", { locale: es })}`
              : `Cuotas del ${format(currentDate, "MMMM 'de' yyyy", { locale: es })}`}
          </h3>
          {selectedDate && (
            <button type="button" onClick={() => { setSelectedDate(null); setListLimit(10) }} className="text-xs text-primary hover:underline">
              Mostrar todo el mes
            </button>
          )}
        </div>
        {(() => {
          const openEndedSynthetic = openEndedLoans.flatMap(loan =>
            getNextDueDates(loan, 12).map(due => buildSynthetic(loan, due))
          )
          const allPending = [...installments, ...openEndedSynthetic] as (Installment | SyntheticInstallment)[]
          const filtered = allPending.filter(i => {
            const matchMonth = isSameMonth(parseISO(i.due_date), currentDate) && pendingStatuses.includes(i.status)
            if (!selectedDate) return matchMonth
            return matchMonth && i.due_date === selectedDate
          })
          if (filtered.length === 0) {
            return (
              <p className="text-sm text-muted-foreground text-center py-4">
                {selectedDate ? 'No hay cuotas pendientes este día' : 'No hay cuotas pendientes este mes'}
              </p>
            )
          }
          return (
            <div className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {filtered.slice(0, listLimit).map(inst => {
                  const isOverdue = parseISO(inst.due_date) < new Date() && inst.status !== 'paid'
                  const badgeLabel = inst.status === 'paid' ? 'Pagada' :
                    inst.status === 'partial' ? 'Parcial' :
                    isOverdue ? 'Vencida' : 'Pendiente'
                  return (
                    <div key={inst.id} className="bg-card rounded-xl border border-border p-4 hover:shadow-sm transition-shadow">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold text-sm text-foreground truncate">
                            {inst.loan?.client?.name || inst.loan?.loan_id || ''}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {inst.number > 0 ? `Cuota #${inst.number}` : 'Cuota mensual'}
                            <span className="ml-1">· Vence: {formatDate(inst.due_date)}</span>
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                          <Badge variant={inst.status === 'paid' ? 'paid' : inst.status === 'partial' || !isOverdue ? 'active' : 'late'}>
                            {badgeLabel}
                          </Badge>
                          <span className="font-semibold text-foreground">{formatCurrency(inst.amount)}</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
              {filtered.length > listLimit && (
                <button
                  type="button"
                  onClick={() => setListLimit(prev => prev + 10)}
                  className="w-full py-3 text-sm font-medium text-primary hover:text-primary/80 transition-colors border border-dashed border-border rounded-lg"
                >
                  Ver más ({filtered.length - listLimit} restantes)
                </button>
              )}
            </div>
          )
        })()}
      </Card>
    </div>
  )
}
