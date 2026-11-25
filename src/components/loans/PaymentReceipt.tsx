'use client'

import { formatCurrency, formatDate } from '@/lib/utils'
import type { Payment, Setting } from '@/types'

interface ReceiptLoan {
  loan_id: string
  remaining_amount: number
  client?: { name?: string } | null
}

interface Props {
  payment: Payment
  loan: ReceiptLoan
  settings: Setting | null
  previousBalance?: number
  typeLabel?: string
}

export default function PaymentReceipt({ payment, loan, settings, previousBalance, typeLabel }: Props) {
  const businessName = settings?.business_name || 'Gestor de Prestamos'
  const receiptNumber = payment.id?.slice(0, 8).toUpperCase() || 'N/A'
  const clientName = loan.client?.name || '—'
  const newBalance = loan.remaining_amount ?? Math.max(0, (previousBalance ?? loan.remaining_amount) - payment.amount)
  const hasMora = Number(payment.late_amount) > 0

  return (
    <div id="payment-receipt" className="receipt bg-white p-5 max-w-sm mx-auto">
      <div className="text-center mb-4">
        <p className="text-xs text-muted-foreground uppercase tracking-wider">{businessName}</p>
        <h2 className="text-lg font-bold text-foreground mt-1">RECIBO DE PAGO</h2>
        <p className="text-xs text-muted-foreground font-mono mt-0.5">No. {receiptNumber}</p>
      </div>

      <div className="text-center mb-4">
        <p className="text-3xl font-bold text-foreground">{formatCurrency(payment.amount)}</p>
        <p className="text-sm text-muted-foreground mt-1">
          {typeLabel || (payment.type === 'installment' ? 'Cuota' : payment.type === 'capital_abono' ? 'Abono a capital' : payment.type === 'liquidation' ? 'Liquidación' : 'Pago')}
          {payment.method === 'cash' ? ' · Efectivo' : payment.method === 'transfer' ? ' · Transferencia' : payment.method === 'deposit' ? ' · Depósito' : ''}
        </p>
      </div>

      <div className="border-t border-border pt-3 space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Cliente</span>
          <span className="font-medium text-foreground">{clientName}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Préstamo</span>
          <span className="font-medium text-foreground">{loan.loan_id}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Fecha</span>
          <span className="font-medium text-foreground">{formatDate(payment.payment_date)}</span>
        </div>
      </div>

      <div className="border-t border-border mt-3 pt-3 space-y-2 text-sm">
        {previousBalance !== undefined && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Balance anterior</span>
            <span className="font-medium text-foreground">{formatCurrency(previousBalance)}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-muted-foreground">Capital</span>
          <span className="font-medium text-foreground">{formatCurrency(Number(payment.capital_amount) || 0)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Interés</span>
          <span className="font-medium text-foreground">{formatCurrency(Number(payment.interest_amount) || 0)}</span>
        </div>
        {hasMora && (
          <div className="flex justify-between text-destructive">
            <span>Mora</span>
            <span className="font-medium">{formatCurrency(payment.late_amount)}</span>
          </div>
        )}
        <div className="flex justify-between font-bold text-foreground border-t border-border pt-2">
          <span>Nuevo balance</span>
          <span>{formatCurrency(newBalance)}</span>
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
  )
}
