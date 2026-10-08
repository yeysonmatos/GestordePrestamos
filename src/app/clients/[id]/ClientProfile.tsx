'use client'

import { useState, useMemo } from 'react'
import { Card } from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import { Progress } from '@/components/ui/Progress'
import ViewTabs from '@/components/ui/ViewTabs'
import { formatCurrency, formatDate, getTrustLevelColor, getStatusLabel, lateStatusLabel } from '@/lib/utils'
import { loanStatusColors, paymentMethodColor } from '@/lib/status-colors'
import Link from 'next/link'
import { ArrowLeft, Pencil, Phone, Envelope, MapPin, FileText, Wallet, CreditCard, Receipt, Bank, Money, DownloadSimple } from '@phosphor-icons/react'
import type { Client, Loan, Payment, Document } from '@/types'

interface Props {
  client: Client
  loans: Loan[]
  payments: Payment[]
  documents: Document[]
  readOnly: boolean
}

export default function ClientProfile({ client, loans, payments, documents, readOnly }: Props) {
  const [tab, setTab] = useState('loans')

  const clientLoans = useMemo(() =>
    [...loans].sort((a, b) => (a.status === 'paid' ? 1 : 0) - (b.status === 'paid' ? 1 : 0)),
    [loans]
  )

  return (
    <div className="space-y-6">
      <Link href="/clients" className="text-sm text-primary hover:underline inline-flex items-center gap-1 w-fit">
        <ArrowLeft className="h-4 w-4" /> Volver a clientes
      </Link>

      <Card className="overflow-hidden p-0">
        <div className="px-6 py-5 border border-primary">
          <div className="flex items-start gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold text-foreground">{client.name}</h1>
                <Badge variant={client.status === 'active' ? 'active' : 'cancelled'}>
                  {getStatusLabel(client.status)}
                </Badge>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-sm text-muted-foreground">
                {client.phone && <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" /> {client.phone}</span>}
                {client.email && <span className="flex items-center gap-1"><Envelope className="h-3.5 w-3.5" /> {client.email}</span>}
                {client.document && <span className="flex items-center gap-1"><FileText className="h-3.5 w-3.5" /> {client.document}</span>}
                {client.nickname && <span className="opacity-70">&ldquo;{client.nickname}&rdquo;</span>}
              </div>
            </div>
            {!readOnly && (
              <Link href={`/clients/${client.id}/edit`} className="w-9 h-9 rounded-lg border border-primary/40 flex items-center justify-center text-primary hover:bg-primary/5 transition-colors shrink-0" title="Editar">
                <Pencil className="h-4 w-4" />
              </Link>
            )}
          </div>
        </div>

        <div className="px-6 py-4 flex items-center gap-4 flex-wrap">
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${getTrustLevelColor(client.trust_level)}`}>
            {getStatusLabel(client.trust_level)}
          </span>
          <div className="flex items-center gap-2 flex-1 max-w-[200px]">
            <Progress value={client.trust_score} variant={client.trust_level === 'high' ? 'green' : client.trust_level === 'medium' ? 'yellow' : 'red'} className="flex-1 h-1.5" />
            <span className="text-xs text-muted-foreground">{client.trust_score}%</span>
          </div>
          {client.provincia && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <MapPin className="h-3 w-3" /> {client.provincia}{client.municipio ? `, ${client.municipio}` : ''}
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-border border-t border-border">
          <div className="px-6 py-4 text-center">
            <p className="text-xs text-muted-foreground">Total prestado</p>
            <p className="text-lg font-bold text-foreground">{formatCurrency(client.total_borrowed)}</p>
          </div>
          <div className="px-6 py-4 text-center">
            <p className="text-xs text-muted-foreground">Total pagado</p>
            <p className="text-lg font-bold text-success">{formatCurrency(client.total_paid)}</p>
          </div>
          <div className="px-6 py-4 text-center">
            <p className="text-xs text-muted-foreground">Total por cobrar</p>
            <p className="text-lg font-bold text-warning">{formatCurrency(client.balance)}</p>
          </div>
          <div className="px-6 py-4 text-center">
            <p className="text-xs text-muted-foreground">Préstamos</p>
            <p className="text-lg font-bold text-foreground">{client.active_loans} activos / {client.paid_loans} pagados</p>
          </div>
        </div>
      </Card>

      <ViewTabs
        options={[
          { key: 'loans', label: 'Préstamos', count: clientLoans.length },
          { key: 'payments', label: 'Historial de pagos' },
          { key: 'documents', label: 'Documentos', count: documents.length },
        ]}
        selected={tab}
        onSelect={setTab}
        ariaLabel="Secciones del cliente"
      />

        {tab === 'loans' && (
          clientLoans.length === 0 ? (
            <Card>
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <CreditCard className="h-12 w-12 text-muted-foreground/40 mb-3" />
                <p className="text-sm font-medium text-foreground">No hay préstamos</p>
                <p className="text-xs text-muted-foreground mt-1">Los préstamos aparecerán aquí</p>
              </div>
            </Card>
          ) : (
            <div className="space-y-3">
              {clientLoans.map(loan => {
                const colors = loanStatusColors(loan.status)
                return (
                  <Link key={loan.id} href={`/loans/${loan.id}`}>
                    <Card className="relative overflow-hidden hover:shadow-md transition-shadow cursor-pointer pl-0">
                      <div className="flex items-center justify-between pl-4 pr-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-lg ${colors.avatar} flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>
                            $
                          </div>
                          <div>
                            <p className="font-semibold text-sm text-foreground">{formatCurrency(loan.amount)}</p>
                            <p className="text-xs text-muted-foreground">
                              {loan.loan_id} &middot;{' '}
                              {loan.status === 'paid' ? (
                                <span className="text-success font-medium">
                                  Cobrado {formatCurrency(loan.paid_amount)}{loan.paid_at ? ` · ${formatDate(loan.paid_at)}` : ''}
                                </span>
                              ) : (
                                formatDate(loan.start_date)
                              )}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          {loan.status !== 'active' && (
                            <Badge variant={colors.badgeVariant}>
                              {lateStatusLabel(loan.status, loan.late_days)}
                            </Badge>
                          )}
                          <p className="text-sm font-medium text-foreground">{loan.paid_installments}/{loan.installments} cuotas</p>
                          <Progress value={loan.progress} className="w-24 h-1.5 mt-1 ml-auto" />
                        </div>
                      </div>
                    </Card>
                  </Link>
                )
              })}
            </div>
          )
        )}

        {tab === 'payments' && (
          payments.length === 0 ? (
            <Card>
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <Wallet className="h-12 w-12 text-muted-foreground/40 mb-3" />
                <p className="text-sm font-medium text-foreground">Sin pagos registrados</p>
                <p className="text-xs text-muted-foreground mt-1">Los pagos aparecerán aquí cuando se realicen</p>
              </div>
            </Card>
          ) : (
            <div className="space-y-2">
              {payments.map(p => (
                <Card key={p.id} className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${paymentMethodColor(p.method)}`}>
                    {p.method === 'cash' ? <Money className="h-4 w-4" /> : p.method === 'transfer' ? <Bank className="h-4 w-4" /> : p.method === 'deposit' ? <DownloadSimple className="h-4 w-4" /> : <Receipt className="h-4 w-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-foreground">{formatCurrency(p.amount)}</span>
                      <Badge variant={p.type === 'liquidation' ? 'active' : p.type === 'capital_abono' ? 'default' : 'paid'}>
                        {p.type === 'liquidation' ? 'Liquidación' : p.type === 'capital_abono' ? 'Abono' : 'Cuota'}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {p.method === 'cash' ? 'Efectivo' : p.method === 'transfer' ? 'Transferencia' : 'Depósito'}
                      {p.notes ? ` · ${p.notes}` : ''}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground flex-shrink-0">{formatDate(p.payment_date)}</span>
                </Card>
              ))}
            </div>
          )
        )}

        {tab === 'documents' && (
          documents.length === 0 ? (
            <Card>
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <FileText className="h-12 w-12 text-muted-foreground/40 mb-3" />
                <p className="text-sm font-medium text-foreground">Sin documentos</p>
                <p className="text-xs text-muted-foreground mt-1">Los documentos subidos aparecerán aquí</p>
              </div>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {documents.map(doc => (
                <Card key={doc.id} className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary-light/30 flex items-center justify-center flex-shrink-0">
                    <FileText className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{doc.name}</p>
                    <p className="text-xs text-muted-foreground capitalize">{doc.type}</p>
                  </div>
                  <span className="text-xs text-muted-foreground">{formatDate(doc.created_at)}</span>
                </Card>
              ))}
            </div>
          )
        )}
    </div>
  )
}
