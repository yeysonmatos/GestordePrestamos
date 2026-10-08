'use client'

import { useState, useMemo, useEffect } from 'react'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import PageHeader from '@/components/ui/PageHeader'
import EmptyState from '@/components/ui/EmptyState'

import { Alert } from '@/components/ui/Alert'
import { formatCurrency, formatDate, lateStatusLabel } from '@/lib/utils'
import { loanStatusColors } from '@/lib/status-colors'
import Link from 'next/link'
import { Plus, Calendar, SquaresFour, Table, ArrowsClockwise, MagnifyingGlass, WarningCircle } from '@phosphor-icons/react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import type { Loan } from '@/types'

const LoanFilters = dynamic(() => import('@/components/loans/LoanFilters').then(m => ({ default: m.LoanFilters })), { ssr: false })

interface PendingInstallment {
  id: string
  loan_id: string
  due_date: string
  number: number
}

interface Props {
  loans: Loan[]
  pendingInstallments: PendingInstallment[]
  deletedInfo?: { loanId: string; amount: string } | null
  readOnly: boolean
}

export default function LoansClientUnified({ loans: initialLoans, pendingInstallments, deletedInfo, readOnly }: Props) {
  const router = useRouter()
  const [view, setView] = useState<'cards' | 'table'>('cards')
  const [loans] = useState(initialLoans)
  const [deletedBanner] = useState(deletedInfo || null)

  useEffect(() => {
    if (deletedInfo) {
      router.replace('/loans', { scroll: false })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Unified filter state matching LoanFilters
  const [filters, setFilters] = useState({
    search: '',
    status: 'active' as string,
    type: 'all' as string,
    frequency: 'all' as string,
    dateRange: { from: '', to: '' },
    amountRange: { min: '', max: '' },
    showFilters: false,
  })

  const isLateStatus = (s: string) => ['late', 'late_1_30', 'late_31_60', 'late_61_90'].includes(s)

  const filtered = useMemo(() => {
    const q = filters.search.toLowerCase()
    return loans.filter(l => {
      const matchesSearch = !q || l.client?.name?.toLowerCase().includes(q) || l.loan_id?.toLowerCase().includes(q) || l.client?.phone?.includes(q)
      // 'active' = en curso (incluye atrasados); los saldados solo se ven con el filtro "Pagados"
      const matchesStatus = filters.status === 'all' || l.status === filters.status || (filters.status === 'late' && isLateStatus(l.status)) || (filters.status === 'active' && (l.status === 'active' || isLateStatus(l.status)))
      const matchesType = filters.type === 'all' || l.amortization_type === filters.type
      const matchesFreq = filters.frequency === 'all' || l.frequency === filters.frequency
      const matchesDateFrom = !filters.dateRange.from || (l.first_payment_date && l.first_payment_date >= filters.dateRange.from)
      const matchesDateTo = !filters.dateRange.to || (l.first_payment_date && l.first_payment_date <= filters.dateRange.to)
      const matchesAmountMin = !filters.amountRange.min || Number(l.amount) >= Number(filters.amountRange.min)
      const matchesAmountMax = !filters.amountRange.max || Number(l.amount) <= Number(filters.amountRange.max)
      return matchesSearch && matchesStatus && matchesType && matchesFreq && matchesDateFrom && matchesDateTo && matchesAmountMin && matchesAmountMax
    })
  }, [loans, filters])

  function getLateDays(loan: Loan): number {
    if (!loan.late_days) return 0
    if (loan.status === 'late_1_30') return Math.min(loan.late_days, 30)
    if (loan.status === 'late_31_60') return Math.min(loan.late_days, 60)
    if (loan.status === 'late_61_90') return loan.late_days
    return 0
  }

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { active: 0, late: 0 }
    loans.forEach(l => {
      if (l.status === 'active') counts.active++
      else if (isLateStatus(l.status)) { counts.late++; counts.active++ }
      else counts[l.status] = (counts[l.status] || 0) + 1
    })
    return counts
  }, [loans])

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    loans.forEach(l => {
      const t = l.amortization_type || 'french'
      counts[t] = (counts[t] || 0) + 1
    })
    return counts
  }, [loans])

  const freqCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    loans.forEach(l => {
      counts[l.frequency] = (counts[l.frequency] || 0) + 1
    })
    return counts
  }, [loans])

  const counts = useMemo(() => ({
    status: statusCounts,
    type: typeCounts,
    frequency: freqCounts,
  }), [statusCounts, typeCounts, freqCounts])

  const filterActions = {
    setSearch: (v: string) => setFilters(p => ({ ...p, search: v })),
    setStatus: (v: string) => setFilters(p => ({ ...p, status: v })),
    setType: (v: string) => setFilters(p => ({ ...p, type: v })),
    setFrequency: (v: string) => setFilters(p => ({ ...p, frequency: v })),
    setDateFrom: (v: string) => setFilters(p => ({ ...p, dateRange: { ...p.dateRange, from: v } })),
    setDateTo: (v: string) => setFilters(p => ({ ...p, dateRange: { ...p.dateRange, to: v } })),
    setAmountMin: (v: string) => setFilters(p => ({ ...p, amountRange: { ...p.amountRange, min: v } })),
    setAmountMax: (v: string) => setFilters(p => ({ ...p, amountRange: { ...p.amountRange, max: v } })),
    setAmountRange: (v: { min: string; max: string }) => setFilters(p => ({ ...p, amountRange: v })),
    setShowFilters: (v: boolean) => setFilters(p => ({ ...p, showFilters: v })),
    clearAll: () => setFilters({
      search: '', status: 'active', type: 'all', frequency: 'all',
      dateRange: { from: '', to: '' },
      amountRange: { min: '', max: '' },
      showFilters: false,
    }),
    clearStatus: () => setFilters(p => ({ ...p, status: 'active' })),
    clearDateRange: () => setFilters(p => ({ ...p, dateRange: { from: '', to: '' } })),
    clearAmountRange: () => setFilters(p => ({ ...p, amountRange: { min: '', max: '' } })),
  }

  function calcNextDue(loan: Loan): string | null {
    const next = pendingInstallments.find(i => i.loan_id === loan.id)
    if (next) return formatDate(next.due_date)
    if (loan.open_ended && loan.payment_day) {
      const d = new Date()
      d.setDate(loan.payment_day)
      if (d <= new Date()) d.setMonth(d.getMonth() + 1)
      return formatDate(d.toISOString())
    }
    return null
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Préstamos"
        description="Gestiona los préstamos activos y su plan de pagos"
        action={
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => router.refresh()} className="min-h-11 min-w-11 p-0 flex items-center justify-center">
              <ArrowsClockwise className="h-4 w-4" />
            </Button>
            {!readOnly && (
              <Link href="/loans/new">
                <Button><Plus className="h-4 w-4 mr-1" /> Nuevo préstamo</Button>
              </Link>
            )}
          </div>
        }
      />

      {readOnly && (
        <Alert variant="warning" className="flex items-start gap-3 p-4 rounded-xl">
          <div className="w-9 h-9 rounded-lg bg-warning-light flex items-center justify-center shrink-0">
            <WarningCircle className="h-5 w-5 text-warning" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-warning">Modo lectura</p>
            <p className="text-xs text-warning/80 mt-0.5">
              Tu período de prueba venció. Puedes ver tus préstamos, pero no crear, editar ni cobrar.
            </p>
          </div>
        </Alert>
      )}

      {deletedBanner && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          <Alert variant="success" className="mb-4">
            El préstamo <strong>{deletedBanner.loanId}</strong> de <strong>{deletedBanner.amount ? formatCurrency(Number(deletedBanner.amount)) : formatCurrency(0)}</strong> fue eliminado. Los pagos ya cobrados siguen contando en tu Dashboard e historial y los documentos siguen guardados en el cliente.
          </Alert>
        </motion.div>
      )}

      <LoanFilters
        state={filters}
        actions={{
          setSearch: filterActions.setSearch,
          setStatus: filterActions.setStatus,
          setType: filterActions.setType,
          setFrequency: filterActions.setFrequency,
          setDateFrom: filterActions.setDateFrom,
          setDateTo: filterActions.setDateTo,
          setAmountMin: filterActions.setAmountMin,
          setAmountMax: filterActions.setAmountMax,
          setAmountRange: filterActions.setAmountRange,
          setShowFilters: filterActions.setShowFilters,
          clearAll: filterActions.clearAll,
          clearStatus: filterActions.clearStatus,
          clearDateRange: filterActions.clearDateRange,
          clearAmountRange: filterActions.clearAmountRange,
        }}
        counts={counts}
        viewToggle={
          <div className="flex border border-border rounded-lg overflow-hidden flex-shrink-0">
            <button onClick={() => setView('cards')} aria-pressed={view === 'cards'} className={`p-2 transition-colors ${view === 'cards' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'}`} title="Vista tarjetas" aria-label="Vista tarjetas">
              <SquaresFour className="h-4 w-4" />
            </button>
            <button onClick={() => setView('table')} aria-pressed={view === 'table'} className={`p-2 transition-colors ${view === 'table' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'}`} title="Vista tabla" aria-label="Vista tabla">
              <Table className="h-4 w-4" />
            </button>
          </div>
        }
      />

      {filtered.length === 0 ? (
        <EmptyState
          title={filters.search || filters.status !== 'active' || filters.type !== 'all' || filters.frequency !== 'all' ? 'Sin resultados' : 'No hay préstamos'}
          description={filters.search || filters.status !== 'active' || filters.type !== 'all' || filters.frequency !== 'all' ? 'Intenta con otros filtros o términos de búsqueda' : 'Crea tu primer préstamo para empezar.'}
          icon={<MagnifyingGlass className="h-8 w-8" weight="duotone" />}
          action={!filters.search && filters.status === 'active' && filters.type === 'all' && filters.frequency === 'all' && !readOnly ? (
            <Link href="/loans/new"><Button><Plus className="h-4 w-4 mr-1" /> Nuevo préstamo</Button></Link>
          ) : undefined}
        />
      ) : view === 'cards' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map(loan => {
            const lateDays = getLateDays(loan)
            const colors = loanStatusColors(loan.status)
            const totalInst = loan.installments || 0
            const paidCount = loan.paid_installments || 0

            return (
              <Link key={loan.id} href={`/loans/${loan.id}`}>
                <Card className="relative overflow-hidden hover:shadow-md transition-shadow cursor-pointer">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-foreground truncate">{loan.client?.name || 'Eliminado'}</p>
                      <div className="flex flex-col gap-0.5 mt-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" /> {formatDate(loan.start_date)}
                        </span>
                        <span>{loan.frequency === 'daily' ? 'Diario' : loan.frequency === 'weekly' ? 'Semanal' : loan.frequency === 'biweekly' ? 'Quincenal' : 'Mensual'}</span>
                        <span>{loan.amortization_type === 'interest_only' ? 'Solo Interés' : 'Cuotas Fijas'}</span>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0 min-w-[100px]">
                      <div className="flex justify-end">
                        <Badge variant={loan.status === 'active' ? 'info' : colors.badgeVariant}>{loan.status === 'active' ? 'En Curso' : lateStatusLabel(loan.status, lateDays)}</Badge>
                      </div>
                      <p className="font-bold text-foreground mt-1">{formatCurrency(loan.amount)}</p>
                      {!loan.open_ended && totalInst > 0 ? (
                        <p className="text-xs text-muted-foreground mt-1">{paidCount}/{totalInst} cuotas</p>
                      ) : loan.open_ended ? (
                        <p className="text-xs text-muted-foreground mt-1">{Math.round(((Number(loan.amount) - Number(loan.remaining_amount)) / Number(loan.amount)) * 100)}%</p>
                      ) : null}
                      {loan.remaining_amount > 0 && (
                        <p className="text-xs text-muted-foreground mt-1">Por Cobrar: {formatCurrency(loan.remaining_amount)}</p>
                      )}
                    </div>
                  </div>
                </Card>
              </Link>
            )
          })}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted border-b border-border">
                <th className="text-left py-3 px-3 font-medium text-muted-foreground text-xs">Cliente</th>
                <th className="text-right py-3 px-3 font-medium text-muted-foreground text-xs">Monto</th>
                <th className="text-right py-3 px-3 font-medium text-muted-foreground text-xs">Progreso</th>
                <th className="text-left py-3 px-3 font-medium text-muted-foreground text-xs hidden sm:table-cell">Frecuencia</th>
                <th className="text-left py-3 px-3 font-medium text-muted-foreground text-xs hidden md:table-cell">Teléfono</th>
                <th className="text-left py-3 px-3 font-medium text-muted-foreground text-xs hidden sm:table-cell">Vence</th>
                <th className="text-center py-3 px-3 font-medium text-muted-foreground text-xs">Estado</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(loan => {
                const lateDays = getLateDays(loan)
                return (
                  <tr key={loan.id} className="border-b border-border hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => window.location.href = `/loans/${loan.id}`}>
                    <td className="py-3 px-3 font-medium text-foreground">{loan.client?.name || 'Eliminado'}</td>
                    <td className="py-3 px-3 text-right font-semibold">{formatCurrency(loan.amount)}</td>
                    <td className="py-3 px-3 text-right">
                      <span className="text-xs text-muted-foreground">{loan.paid_installments || 0}/{loan.installments || 0}</span>
                    </td>
                    <td className="py-3 px-3 text-xs text-muted-foreground hidden sm:table-cell">
                      {loan.frequency === 'daily' ? 'Diario' : loan.frequency === 'weekly' ? 'Semanal' : loan.frequency === 'biweekly' ? 'Quincenal' : 'Mensual'}
                    </td>
                    <td className="py-3 px-3 text-xs text-primary hidden md:table-cell">{loan.client?.phone || '—'}</td>
                    <td className="py-3 px-3 text-xs text-muted-foreground hidden sm:table-cell">{calcNextDue(loan) || '—'}</td>
                    <td className="py-3 px-3 text-center">
                      <Badge variant={loanStatusColors(loan.status).badgeVariant}>{lateStatusLabel(loan.status, lateDays)}</Badge>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}