'use client'

import dynamic from 'next/dynamic'
import { useMemo } from 'react'
import { Card } from '@/components/ui/Card'
import PageHeader from '@/components/ui/PageHeader'
import StatCard from '@/components/ui/StatCard'
import { Alert } from '@/components/ui/Alert'
import { formatNumber, buildMonthlySeries } from '@/lib/utils'
import { useRouter } from 'next/navigation'
import {
  TrendUp, CurrencyDollar, Handshake, Percent,
} from '@phosphor-icons/react'
import type { Loan, Payment, LoanStats } from '@/types'

const ReportsPieChart = dynamic(() => import('./ReportsCharts').then(m => m.ReportsPieChart), { ssr: false })
const IncomeLoansAreaChart = dynamic(() => import('@/components/charts/IncomeLoansAreaChart'), { ssr: false })

interface Props {
  loans: Loan[]
  payments: Payment[]
  loanStats: LoanStats | null
  initialFrom: string
  initialTo: string
  advancedReports?: boolean
}

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

export default function ReportsContent({ loans, payments, loanStats, initialFrom, initialTo, advancedReports = true }: Props) {
  const router = useRouter()

  const stats = useMemo(() => {
    const s = loanStats ?? EMPTY_STATS
    const totalAtRisk = Number(s.active_capital) + Number(s.late_capital)
    const portfolioHealth = totalAtRisk > 0
      ? Math.round((Number(s.active_capital) / totalAtRisk) * 100)
      : 100
    return { ...s, portfolioHealth }
  }, [loanStats])

  const statusData = useMemo(() => {
    return [
      { name: 'Activos', value: stats.outstanding_loans },
      { name: 'Pagados', value: stats.paid_loans },
      { name: 'Atrasados', value: stats.late_loans },
    ].filter(d => d.value > 0)
  }, [stats])

  const monthlyData = useMemo(() => {
    const points: { month: string; income: number; loans: number }[] = [
      ...payments.map(p => ({ month: p.payment_date.slice(0, 7), income: Number(p.amount), loans: 0 })),
      ...loans.filter(l => l.created_at).map(l => ({ month: l.created_at!.slice(0, 7), income: 0, loans: Number(l.amount) })),
    ]
    return buildMonthlySeries(points, 6).map(d => ({
      ...d,
      month: new Date(Number(d.month.slice(0, 4)), Number(d.month.slice(5, 7)) - 1, 1).toLocaleString('es-MX', { month: 'short' }),
    }))
  }, [loans, payments])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reportes"
        description="Estadísticas y análisis de tu cartera"
      />

      {advancedReports ? (
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="report-from" className="block text-xs font-medium text-muted-foreground mb-1">Desde</label>
            <input
              id="report-from"
              type="date"
              value={initialFrom}
              max={initialTo}
              onChange={e => {
                const v = e.target.value
                router.push(`/reports?from=${v}&to=${v > initialTo ? v : initialTo}`)
              }}
              className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground min-h-11 min-w-0"
            />
          </div>
          <div>
            <label htmlFor="report-to" className="block text-xs font-medium text-muted-foreground mb-1">Hasta</label>
            <input
              id="report-to"
              type="date"
              value={initialTo}
              min={initialFrom}
              onChange={e => {
                const v = e.target.value
                router.push(`/reports?from=${v < initialFrom ? v : initialFrom}&to=${v}`)
              }}
              className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground min-h-11 min-w-0"
            />
          </div>
        </div>
      ) : (
        <Alert variant="warning" className="flex items-center justify-between gap-3 p-4 rounded-xl text-sm">
          <div className="flex-1">
            Tu plan incluye reportes básicos. Mejora a <strong>Pro</strong> para filtrar por período y ver gráficos avanzados.
          </div>
          <a href="/account" className="inline-flex items-center justify-center rounded-lg bg-primary text-on-primary px-3 py-2 text-sm font-medium min-h-9 shrink-0">
            Ver planes
          </a>
        </Alert>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard label="Préstamos activos" value={stats.outstanding_loans} icon={Handshake} />
        <StatCard label="Capital recuperado (período)" value={formatNumber(stats.recovered_capital)} icon={CurrencyDollar} iconClassName="text-success" />
        <StatCard label="Intereses cobrados" value={formatNumber(stats.collected_interest)} icon={TrendUp} iconClassName="text-accent" />
        <StatCard label="Salud cartera" value={`${stats.portfolioHealth}%`} icon={Percent} />
      </div>

      {advancedReports && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <div className="mb-4">
              <h3 className="text-base font-semibold text-foreground">Ingresos vs Préstamos</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Últimos 6 meses</p>
            </div>
            <div className="h-72">
              <IncomeLoansAreaChart data={monthlyData} />
            </div>
          </Card>

          <Card>
            <h3 className="text-base font-semibold text-foreground mb-4">Estado de préstamos</h3>
            <div className="h-72">
              <ReportsPieChart data={statusData} />
            </div>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Card>
          <p className="text-xs text-muted-foreground">Capital prestado total</p>
          <p className="text-lg font-bold text-foreground">{formatNumber(stats.total_capital)}</p>
        </Card>
        <Card>
          <p className="text-xs text-muted-foreground">Capital pendiente</p>
          <p className="text-lg font-bold text-warning">{formatNumber(stats.pending_capital)}</p>
        </Card>
        <Card>
          <p className="text-xs text-muted-foreground">Clientes activos</p>
          <p className="text-lg font-bold text-foreground">{stats.active_clients}</p>
        </Card>
        <Card>
          <p className="text-xs text-muted-foreground">Clientes morosos</p>
          <p className="text-lg font-bold text-destructive">{stats.late_clients}</p>
        </Card>
      </div>
    </div>
  )
}
