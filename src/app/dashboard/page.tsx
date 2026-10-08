import { createServerSideClient } from '@/lib/supabase-server'
import MainLayout from '@/components/layout/MainLayout'
import DashboardContent from './DashboardContent'
import type { LoanStats } from '@/types'
import { getLocalDate } from '@/lib/utils'
import { getUserSubscription, isExpiredForReadOnly } from '@/lib/subscription-guard'

export default async function DashboardPage() {
  const supabase = await createServerSideClient()

  const { data: { user } } = await supabase.auth.getUser()

  const subSnap = await getUserSubscription(supabase, user?.id || '')
  const readOnly = isExpiredForReadOnly(subSnap)

  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('status, ends_at, plan:plans(name)')
    .eq('user_id', user?.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: loans } = await supabase
    .from('loans')
    .select('*, client:clients(*)')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  const today = getLocalDate()

  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
  const sixMonthsAgoStr = getLocalDate(sixMonthsAgo)

  const { data: chartPayments } = await supabase
    .from('payments')
    .select('amount, payment_date')
    .eq('status', 'paid')
    .gte('payment_date', sixMonthsAgoStr)
    .order('payment_date', { ascending: false })

  const { data: loanStats } = await supabase.rpc('get_loan_stats', { p_user_id: user?.id, p_from_date: null, p_to_date: null })

  const { data: todayPayments } = await supabase
    .from('payments')
    .select('amount, payment_date')
    .eq('payment_date', today)
    .eq('status', 'paid')

  const { data: overdueInstallments } = await supabase
    .from('installments')
    .select('*, loan:loans!inner(client:clients(*))')
    .in('status', ['pending', 'partial', 'late'])
    .is('loan.deleted_at', null)
    .lt('due_date', today)
    .order('due_date', { ascending: true })
    .limit(20)

  const { data: upcomingInstallments } = await supabase
    .from('installments')
    .select('*, loan:loans!inner(client:clients(*))')
    .in('status', ['pending', 'partial', 'late'])
    .is('loan.deleted_at', null)
    .gt('due_date', today)
    .order('due_date', { ascending: true })
    .limit(10)

  return (
    <MainLayout>
      <DashboardContent
        loans={loans || []}
        chartPayments={chartPayments || []}
        loanStats={loanStats as LoanStats | null}
        todayPayments={todayPayments || []}
        overdueInstallments={overdueInstallments || []}
        upcomingInstallments={upcomingInstallments || []}
        subscription={subscription as { status: string; ends_at: string | null; plan: { name: string } | null } | null}
        readOnly={readOnly}
      />
    </MainLayout>
  )
}
