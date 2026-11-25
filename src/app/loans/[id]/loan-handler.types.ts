import type { SupabaseClient } from '@supabase/supabase-js'
import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime'
import type { Payment, Installment, Loan, Setting } from '@/types'

export interface LoanHandlerState {
  loan: Loan
  installments: Installment[]
  payments: Payment[]
  paymentDate: string
  paymentMethod: string
  paymentNotes: string
  paymentAmount: string
  paymentInstallmentId: string
  includeMora: boolean
  selectedInstallmentMora: { lateDays: number; lateAmount: number } | null
  selectedPaymentInstallment: Installment | null
  capitalAbonoAmount: string
  successPayment: Payment | null
  successPayments: Payment[]
  successCoveredCount: number
  showPayment: boolean
  showSuccess: boolean
  showCapitalAbono: boolean
  showLiquidation: boolean
  showReversalModal: boolean
  reversalPaymentId: string | null
  reversalReason: string
  loading: boolean
}

export interface LoanHandlerSetters {
  setLoan: React.Dispatch<React.SetStateAction<Loan>>
  setInstallments: React.Dispatch<React.SetStateAction<Installment[]>>
  setPayments: React.Dispatch<React.SetStateAction<Payment[]>>
  setPaymentDate: React.Dispatch<React.SetStateAction<string>>
  setPaymentMethod: React.Dispatch<React.SetStateAction<string>>
  setPaymentNotes: React.Dispatch<React.SetStateAction<string>>
  setPaymentAmount: React.Dispatch<React.SetStateAction<string>>
  setPaymentInstallmentId: React.Dispatch<React.SetStateAction<string>>
  setIncludeMora: React.Dispatch<React.SetStateAction<boolean>>
  setSelectedInstallmentMora: React.Dispatch<React.SetStateAction<{ lateDays: number; lateAmount: number } | null>>
  setSelectedPaymentInstallment: React.Dispatch<React.SetStateAction<Installment | null>>
  setCapitalAbonoAmount: React.Dispatch<React.SetStateAction<string>>
  setSuccessPayment: React.Dispatch<React.SetStateAction<Payment | null>>
  setSuccessPayments: React.Dispatch<React.SetStateAction<Payment[]>>
  setSuccessCoveredCount: React.Dispatch<React.SetStateAction<number>>
  setShowPayment: React.Dispatch<React.SetStateAction<boolean>>
  setShowSuccess: React.Dispatch<React.SetStateAction<boolean>>
  setShowCapitalAbono: React.Dispatch<React.SetStateAction<boolean>>
  setShowLiquidation: React.Dispatch<React.SetStateAction<boolean>>
  setShowReversalModal: React.Dispatch<React.SetStateAction<boolean>>
  setReversalPaymentId: React.Dispatch<React.SetStateAction<string | null>>
  setReversalReason: React.Dispatch<React.SetStateAction<string>>
  setLoading: React.Dispatch<React.SetStateAction<boolean>>
  setPaymentError: React.Dispatch<React.SetStateAction<string>>
}

export interface LoanHandlerServices {
  supabase: SupabaseClient
  userId: string
  settings: Setting | null
  router: AppRouterInstance
}

export interface LoanHandlerInput {
  state: LoanHandlerState
  setters: LoanHandlerSetters
  services: LoanHandlerServices
}

export interface ScheduleRowWrite {
  key: 'number' | 'id'
  value: string | number
  data: Partial<Installment>
}

export interface AbonoRebalanceInput {
  amount: number
  existingCapitalPaid: number
  loan: Loan
  installments: Installment[]
  paymentDate: string
}

export interface AbonoRebalanceResult {
  installmentsToWrite: ScheduleRowWrite[]
  loanUpdates: Record<string, string | number | boolean | null>
  stateLoan: Partial<Loan>
  fallbackInstallments?: Installment[]
}

export type AbonoRebalanceFn = (input: AbonoRebalanceInput) => Promise<AbonoRebalanceResult>

export interface ReverseAbonoInput {
  payment: Payment
  newRemaining: number
  newPaid: number
  loan: Loan
  installments: Installment[]
  payments: Payment[]
}

export interface ReverseAbonoResult {
  installmentsToWrite: ScheduleRowWrite[]
  loanUpdates: Record<string, string | number | boolean | null>
  stateLoan: Partial<Loan>
  installmentsPreview?: Installment[]
}

export type ReverseAbonoFn = (input: ReverseAbonoInput) => Promise<ReverseAbonoResult>

export interface LoanRebalanceStrategies {
  rebalanceCapitalAbono: AbonoRebalanceFn
  rebalanceReverseAbono: ReverseAbonoFn
}

export interface LoanHandlers {
  handlePayInstallment: (e: React.FormEvent) => Promise<void>
  handleCapitalAbono: (e: React.FormEvent) => Promise<void>
  handleLiquidation: () => Promise<void>
  handleReversePayment: (paymentId: string) => Promise<boolean>
}
