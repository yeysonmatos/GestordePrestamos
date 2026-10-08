import { createServerSideClient } from '@/lib/supabase-server'
import { getLocalDate } from '@/lib/utils'
import MainLayout from '@/components/layout/MainLayout'
import ReportsContent from './ReportsContent'
import type { LoanStats } from '@/types'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export default async function ReportsPage(props: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const { from, to } = await props.searchParams
  const supabase = await createServerSideClient()

  const { data: { user } } = await supabase.auth.getUser()

  // Reportes avanzados: Trial (gratis) y Pro (pago con límite NULL) los habilitan.
  // Básico (pago con límite numérico) ve reportes básicos.
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('plan:plans(max_clients, price)')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const subPlan = Array.isArray(sub?.plan) ? sub!.plan[0] : sub?.plan
  const planPrice = Number((subPlan as { price?: number } | undefined)?.price || 0)
  const planMaxClients = (subPlan as { max_clients?: number } | undefined)?.max_clients ?? null
  const advancedReports = sub ? (planPrice === 0 || planMaxClients === null) : true

  // Rango de fechas: por defecto del 1 de enero del año actual hasta hoy.
  const today = getLocalDate()
  const defaultFrom = `${today.slice(0, 4)}-01-01`
  const effectiveFrom = advancedReports ? (from && DATE_RE.test(from) ? from : defaultFrom) : null
  const effectiveTo = advancedReports ? (to && DATE_RE.test(to) ? to : today) : null

  let loansQuery = supabase.from('loans').select('*, client:clients(*)').is('deleted_at', null)
  if (effectiveFrom) loansQuery = loansQuery.gte('created_at', effectiveFrom)
  if (effectiveTo) loansQuery = loansQuery.lte('created_at', `${effectiveTo}T23:59:59`)
  const { data: loans } = await loansQuery.order('created_at', { ascending: false })

  let paymentsQuery = supabase.from('payments').select('*, loan:loans(client:clients(*))').eq('status', 'paid')
  if (effectiveFrom) paymentsQuery = paymentsQuery.gte('payment_date', effectiveFrom)
  if (effectiveTo) paymentsQuery = paymentsQuery.lte('payment_date', effectiveTo)
  const { data: payments } = await paymentsQuery.order('payment_date', { ascending: false })

  const { data: loanStats } = await supabase.rpc('get_loan_stats', {
    p_user_id: user?.id,
    p_from_date: effectiveFrom ?? null,
    p_to_date: effectiveTo ?? null,
  })

  return (
    <MainLayout>
      <ReportsContent
        loans={loans || []}
        payments={payments || []}
        loanStats={loanStats as LoanStats | null}
        initialFrom={effectiveFrom ?? defaultFrom}
        initialTo={effectiveTo ?? today}
        advancedReports={advancedReports}
      />
    </MainLayout>
  )
}