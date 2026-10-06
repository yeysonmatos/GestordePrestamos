'use client'

import dynamic from 'next/dynamic'
import { useMemo } from 'react'
import { Card } from '@/components/ui/Card'
import StatCard from '@/components/ui/StatCard'
import Badge from '@/components/ui/Badge'
import { Alert } from '@/components/ui/Alert'
import PageHeader from '@/components/ui/PageHeader'
import { Avatar } from '@/components/ui/Avatar'
import { formatCurrency, formatNumber, formatDate, buildMonthlySeries, getLocalDate, daysBetweenDateStrings } from '@/lib/utils'
import Link from 'next/link'
import {
  Wallet, PiggyBank, CurrencyDollar, TrendUp, Users, Warning,
  Calendar, ArrowRight, Alarm,
} from '@phosphor-icons/react'
import type { Loan, Installment, LoanStats } from '@/types'

const IncomeLoansAreaChart = dynamic(() => import('@/components/charts/IncomeLoansAreaChart'), { ssr: false })

const EMPTY_STATS: LoanStats = {
  total_capital: 0,
  recovered_capital: 0,
  pending_capital: 0,
  generated_interest: 0,
  collected_interest: 0,
  active_capital: 0,
  late_capital: 0,
  active_loans: 0,
  outstanding_loans: 0,
  paid_loans: 0,
  late_loans: 0,
  active_clients: 0,
  late_clients: 0,
}

interface Props {
  loans: Loan[]
  chartPayments: { amount: number; payment_date: string }[]
  loanStats: LoanStats | null
  todayPayments: { amount: number; payment_date: string }[]
  overdueInstallments: Installment[]
  upcomingInstallments: Installment[]
  subscription: { status: string; ends_at: string | null; plan: { name: string } | null } | null
  readOnly: boolean
}

export default function DashboardContent({
  loans, chartPayments, loanStats, todayPayments, overdueInstallments, upcomingInstallments, subscription, readOnly,
}: Props) {
  const stats = loanStats ?? EMPTY_STATS
  const todayTotal = todayPayments.reduce((s, p) => s + Number(p.amount), 0)
  const overdueTotal = overdueInstallments.reduce((s, i) => s + (Number(i.amount) - Number(i.paid_amount || 0)), 0)

  const monthlyData = useMemo(() => {
    const points: { month: string; income: number; loans: number }[] = [
      ...chartPayments.map(p => ({ month: p.payment_date.slice(0, 7), income: Number(p.amount), loans: 0 })),
      ...loans.filter(l => l.created_at).map(l => ({ month: l.created_at!.slice(0, 7), income: 0, loans: Number(l.amount) })),
    ]
    return buildMonthlySeries(points, 6).map(d => ({
      month: new Date(Number(d.month.slice(0, 4)), Number(d.month.slice(5, 7)) - 1, 1).toLocaleString('es-MX', { month: 'short' }),
      income: d.income,
      loans: d.loans,
    }))
  }, [chartPayments, loans])

  const subEndsAt = subscription?.ends_at ? new Date(subscription.ends_at).getTime() : null
  const subExpired = !!subEndsAt && subEndsAt <= Date.now()
  const subDaysLeft = subscription?.ends_at ? Math.max(0, daysBetweenDateStrings(getLocalDate(), subscription.ends_at.slice(0, 10))) : 0
  const subExpiringSoon = !!subEndsAt && !subExpired && subDaysLeft <= 3

  return (
    <div className="space-y-6">
      {readOnly ? (
        <Alert variant="warning" className="flex items-start gap-3 p-4 rounded-xl">
          <div className="w-9 h-9 rounded-lg bg-warning-light flex items-center justify-center shrink-0">
            <Alarm className="h-5 w-5 text-warning" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-warning">
              Tu período de prueba venció. Estás en modo lectura
            </p>
            <p className="text-xs text-warning/80 mt-0.5">
              Puedes ver, pero no crear, editar ni cobrar.
            </p>
            <Link href="/account" className="text-xs font-medium text-warning underline mt-1 inline-block">
              Ver planes y renovar
            </Link>
          </div>
        </Alert>
      ) : subscription && subExpired ? (
        <Alert variant="danger" className="flex items-start gap-3 p-4 rounded-xl">
          <div className="w-9 h-9 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0">
            <Alarm className="h-5 w-5 text-destructive" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-destructive">
              Tu plan {subscription.plan?.name || ''} venció el {formatDate(subscription.ends_at!)}
            </p>
            <p className="text-xs text-destructive/80 mt-0.5">
              Estás en modo de solo lectura. Elige un plan para seguir usando todas las funciones.
            </p>
            <Link href="/account" className="text-xs font-medium text-destructive underline mt-1 inline-block">
              Ver planes y renovar
            </Link>
          </div>
        </Alert>
      ) : subscription && subExpiringSoon ? (
        <Alert variant="warning" className="flex items-start gap-3 p-4 rounded-xl">
          <div className="w-9 h-9 rounded-lg bg-warning-light flex items-center justify-center shrink-0">
            <Alarm className="h-5 w-5 text-warning" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-warning">
              Tu plan {subscription.plan?.name || ''} vence en {subDaysLeft === 0 ? 'hoy' : `${subDaysLeft} día${subDaysLeft === 1 ? '' : 's'}`} ({formatDate(subscription.ends_at!)})
            </p>
            <p className="text-xs text-warning/80 mt-0.5">
              Contacta al administrador para renovar tu mensualidad y evitar la suspensión del servicio.
            </p>
            <Link href="/account" className="text-xs font-medium text-warning underline mt-1 inline-block">
              Ver planes y renovar
            </Link>
          </div>
        </Alert>
      ) : null}

      <PageHeader title="Dashboard" description="Resumen de tu cartera de préstamos" />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard label="Total Capital Prestado" value={formatNumber(stats.total_capital)} icon={Wallet} />
        <StatCard label="Total capital recuperado" value={formatNumber(stats.recovered_capital)} icon={PiggyBank} />
        <StatCard label="Total Capital Pendiente" value={formatNumber(stats.pending_capital)} icon={CurrencyDollar} />
        <StatCard label="Total Intereses proyectados" value={formatNumber(stats.generated_interest)} icon={TrendUp} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard label="Clientes activos" value={stats.active_clients} icon={Users} />
        <StatCard label="Clientes morosos" value={stats.late_clients} icon={Warning} iconClassName="text-destructive" />
        <StatCard label="Cobros del día" value={formatNumber(todayTotal)} icon={Calendar} iconClassName="text-success" />
        <StatCard label="Cobros vencidos" value={formatNumber(overdueTotal)} icon={Warning} iconClassName="text-destructive" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <div className="mb-4">
            <h3 className="text-base font-semibold text-foreground">Ingresos vs. préstamos otorgados</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Últimos 6 meses</p>
          </div>
          <div className="h-72">
            <IncomeLoansAreaChart data={monthlyData} />
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-foreground">Próximos pagos</h3>
            <Link href="/collections" className="text-xs text-primary hover:underline flex items-center gap-1">
              Ver todo <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="space-y-3">
            {upcomingInstallments.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No hay pagos próximos</p>
            ) : (
              upcomingInstallments.map(inst => (
                <div key={inst.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted">
                  <Avatar name={inst.loan?.client?.name || '?'} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{inst.loan?.client?.name}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(inst.due_date)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-foreground">{formatCurrency(inst.amount)}</p>
                    <Badge variant="active">Pendiente</Badge>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}
