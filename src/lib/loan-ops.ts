import type { SupabaseClient } from '@supabase/supabase-js'
import type { Installment, Loan, Payment } from '@/types'

// Cliente de las RPC atómicas de supabase/atomic-operations.sql.
// Cada llamada se aplica completa en una transacción o no se aplica.

export interface InstallmentWrite {
  key: 'id' | 'number'
  value: string | number
  data: Partial<Installment>
}

export interface LoanOperation {
  reverse_payment_id?: string
  reversal_reason?: string
  payment?: {
    amount: number
    capital_amount?: number
    interest_amount?: number
    late_amount?: number
    type: Payment['type']
    payment_date: string
    method?: string
    notes?: string | null
    installment_id?: string | null
  }
  recalc_installments?: string[] | 'all'
  installment_writes?: InstallmentWrite[]
  loan_updates?: Partial<Loan>
  post_loan_updates?: Partial<Loan>
  reopen_if_unpaid?: boolean
  paid_amount_from_payments?: boolean
}

export interface LoanOperationResult {
  ok: boolean
  payment: Payment | null
  loan: Loan
  installments: Installment[]
}

export async function applyLoanOperation(
  supabase: SupabaseClient,
  loanId: string,
  ops: LoanOperation,
): Promise<LoanOperationResult> {
  const { data, error } = await supabase.rpc('apply_loan_operation', { p_loan_id: loanId, p_ops: ops })
  if (error) throw new Error(error.message)
  if (!data?.ok) throw new Error('No se pudo aplicar la operación')
  return data as LoanOperationResult
}

export interface ScheduleRow {
  number: number
  amount: number
  capital: number
  interest: number
  balance: number
  due_date: string
}

/**
 * Crea (loanId = null) o edita un préstamo sin pagos junto con su cronograma.
 * `schedule` null = no tocar el cronograma; [] = dejarlo vacío.
 */
export async function saveLoanWithSchedule(
  supabase: SupabaseClient,
  loanId: string | null,
  loan: Record<string, unknown>,
  schedule: ScheduleRow[] | null,
): Promise<Loan> {
  const { data, error } = await supabase.rpc('save_loan_with_schedule', {
    p_loan_id: loanId,
    p_loan: loan,
    p_installments: schedule,
  })
  if (error) throw new Error(error.message)
  return data as Loan
}
