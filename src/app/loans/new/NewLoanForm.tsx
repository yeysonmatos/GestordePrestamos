'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/Card'
import { Alert } from '@/components/ui/Alert'
import Input, { Select } from '@/components/ui/Input'
import MoneyInput from '@/components/ui/MoneyInput'
import Button from '@/components/ui/Button'
import { createClient } from '@/lib/supabase-client'
import { logAuditEvent } from '@/lib/audit'
import { formatCurrency, formatDate, getLocalDate } from '@/lib/utils'
import { calculateLoan, firstPaymentDateFor } from '@/lib/calculations'
import { computeLateStatus } from '@/lib/loan-status'
import { FREQUENCIES } from '@/types'
import type { Client, Setting, Loan } from '@/types'
import { saveLoanWithSchedule } from '@/lib/loan-ops'

interface Props {
  clients: Client[]
  settings: Setting | null
  selectedClientId?: string
  initialData?: Loan
  isEditing?: boolean
  loanId?: string
  onSaved?: () => void
}

export default function NewLoanForm({ clients, settings, selectedClientId, initialData, isEditing, loanId, onSaved }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState(() => {
    if (isEditing && initialData) {
      return {
        client_id: initialData.client_id,
        amount: String(initialData.amount),
        interest_type: initialData.amortization_type === 'interest_only' ? 'percentage' : initialData.interest_type,
        interest_rate: String(initialData.interest_rate),
        installments: String(initialData.installments),
        frequency: initialData.frequency,
        amortization_type: initialData.amortization_type,
        open_ended: initialData.open_ended,
        start_date: initialData.start_date.split('T')[0],
        first_payment_date: initialData.first_payment_date.split('T')[0],
        guarantee: initialData.guarantee || '',
        notes: initialData.notes || '',
      }
    }
    return {
      client_id: selectedClientId || '',
      amount: '',
      interest_type: 'percentage' as 'percentage' | 'fixed',
      interest_rate: '',
      installments: String(settings?.default_installments || 10),
      frequency: settings?.default_frequency || 'weekly',
      amortization_type: 'interest_only' as 'interest_only' | 'french',
      open_ended: false,
      start_date: getLocalDate(),
      first_payment_date: firstPaymentDateFor(getLocalDate(), settings?.default_frequency || 'weekly'),
      guarantee: '',
      notes: '',
    }
  })

  const isInterestOnly = form.amortization_type === 'interest_only'

  function update(field: string, value: string) {
    setForm(prev => {
      const next = { ...prev, [field]: value }
      if (field === 'amortization_type' && value === 'interest_only' && prev.interest_type === 'fixed') {
        next.interest_type = 'percentage'
      }
      if (field === 'start_date' || field === 'frequency') {
        const autoSynced = firstPaymentDateFor(prev.start_date, prev.frequency)
        if (next.first_payment_date === autoSynced) {
          next.first_payment_date = firstPaymentDateFor(
            field === 'start_date' ? value : prev.start_date,
            field === 'frequency' ? value : prev.frequency,
          )
        }
      }
      return next
    })
  }

  const schedule = useMemo(() => {
    const amount = parseFloat(form.amount)
    const rate = parseFloat(form.interest_rate)
    const numInstallments = parseInt(form.installments)
    if (amount <= 0 || !rate || !form.start_date || !form.first_payment_date) return null
    if (!form.open_ended && !numInstallments) return null

    try {
      return calculateLoan({
        amount,
        interest_type: form.interest_type,
        interest_rate: rate,
        installments: form.open_ended ? 0 : numInstallments,
        frequency: form.frequency as 'daily' | 'weekly' | 'biweekly' | 'monthly',
        start_date: form.first_payment_date,
        amortization_type: form.amortization_type,
        open_ended: form.open_ended,
      })
    } catch {
      return null
    }
  }, [form.amount, form.interest_rate, form.interest_type, form.installments, form.frequency, form.first_payment_date, form.amortization_type, form.open_ended, form.start_date])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    if (!form.client_id) { setError('Selecciona un cliente'); setLoading(false); return }
    if (!schedule) { setError('Revisa los valores ingresados'); setLoading(false); return }

    const amount = parseFloat(form.amount)
    const rate = parseFloat(form.interest_rate)

    if (amount <= 0) { setError('El monto debe ser mayor a cero'); setLoading(false); return }

    if (isEditing && loanId) {
      const paymentDay = form.open_ended ? parseInt(form.first_payment_date.split('-')[2]) || null : null

      const res = await fetch(`/api/loans/${loanId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount,
          interest_type: form.interest_type,
          interest_rate: rate,
          amortization_type: form.amortization_type,
          open_ended: form.open_ended,
          payment_day: paymentDay,
          installments: form.open_ended ? 0 : parseInt(form.installments),
          frequency: form.frequency,
          start_date: form.start_date,
          first_payment_date: form.first_payment_date,
          guarantee: form.guarantee || null,
          notes: form.notes || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error); setLoading(false); return }
      onSaved?.()
      router.push(`/loans/${loanId}`)
      router.refresh()
      setLoading(false)
      return
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Debes iniciar sesión'); setLoading(false); return }

    const { data: settingsData } = await supabase
      .from('settings')
      .select('loan_id_prefix')
      .single()

    const prefix = settingsData?.loan_id_prefix || 'P'
    const loanIdNew = `${prefix}${String(Date.now()).slice(-6)}`

    const hasSchedule = !form.open_ended && schedule.installments.length > 0
    const late = hasSchedule ? computeLateStatus(schedule.installments.map(i => i.due_date)) : null

    // Préstamo + cronograma en una sola transacción (save_loan_with_schedule).
    let loan
    try {
      loan = await saveLoanWithSchedule(supabase, null, {
        loan_id: loanIdNew,
        client_id: form.client_id,
        amount,
        interest_type: form.interest_type,
        interest_rate: rate,
        amortization_type: form.amortization_type,
        open_ended: form.open_ended,
        payment_day: form.open_ended ? parseInt(form.first_payment_date.split('-')[2]) || null : null,
        total_amount: schedule.total_amount,
        total_interest: schedule.total_interest,
        installment_amount: schedule.installment_amount,
        remaining_amount: isInterestOnly ? amount : schedule.total_amount,
        installments: form.open_ended ? 0 : parseInt(form.installments),
        frequency: form.frequency,
        start_date: form.start_date,
        first_payment_date: form.first_payment_date,
        guarantee: form.guarantee || null,
        notes: form.notes || null,
        ...(late ? { status: late.status, late_days: late.lateDays } : {}),
      }, hasSchedule ? schedule.installments : null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear el préstamo')
      setLoading(false)
      return
    }

    const clientName = clients.find(c => c.id === form.client_id)?.name
    logAuditEvent(supabase, { userId: user.id, action: 'loan.created', entityType: 'loan', entityId: loan.id, details: { loan_id: loanIdNew, client_id: form.client_id, client_name: clientName, amount, amortization_type: form.amortization_type, open_ended: form.open_ended } })

    router.push(`/loans/${loan.id}`)
    router.refresh()
    setLoading(false)
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <Alert variant="danger">{error}</Alert>}

        {isEditing ? (
          <div className="text-sm text-muted-foreground p-3 rounded-lg bg-muted">
            Editando préstamo — los cambios solo son permitidos porque no tiene pagos registrados.
          </div>
        ) : (
          <Select label="Cliente" value={form.client_id} onChange={e => update('client_id', e.target.value)}
            options={[{ value: '', label: 'Seleccionar cliente...' }, ...clients.map(c => ({ value: c.id, label: c.name }))]}
          />
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <MoneyInput label="Monto" value={form.amount} onChange={e => update('amount', e)} required />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <Select label="Tipo interés" value={form.interest_type} onChange={e => update('interest_type', e.target.value)}
              options={isInterestOnly
                ? [{ value: 'percentage', label: 'Porcentaje %' }]
                : [{ value: 'percentage', label: 'Porcentaje %' }, { value: 'fixed', label: 'Monto fijo' }]
              }
            />
            <MoneyInput label={form.interest_type === 'percentage' ? 'Tasa %' : 'Monto'} value={form.interest_rate} onChange={e => update('interest_rate', e)} required />
          </div>
        </div>

        <Select label="Tipo de amortización" value={form.amortization_type} onChange={e => update('amortization_type', e.target.value)}
          options={[
            { value: 'interest_only', label: 'Solo Interés' },
            { value: 'french', label: 'Cuotas Fijas' },
          ]}
        />
        <p className="text-xs text-muted-foreground -mt-2">
          {isInterestOnly
            ? 'Cuotas periódicas de solo el interés. El capital se devuelve al final.'
            : 'Cada cuota incluye capital + interés.'}
        </p>

        {isInterestOnly && (
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={form.open_ended} onChange={e => setForm(prev => ({ ...prev, open_ended: e.target.checked }))}
              className="rounded border-border h-4 w-4" />
            Sin límite de cuotas (préstamo abierto)
          </label>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {!form.open_ended && (
            <Input label="N° Cuotas" type="number" min="1" value={form.installments} onChange={e => update('installments', e.target.value)} required />
          )}
          <Select label="Frecuencia" value={form.frequency} onChange={e => update('frequency', e.target.value)}
            options={FREQUENCIES.map(f => ({ value: f.value, label: f.label }))}
          />
          <Input label="Inicio" type="date" value={form.start_date} onChange={e => update('start_date', e.target.value)} required />
        </div>

        <Input label="Fecha primer pago" type="date" value={form.first_payment_date} onChange={e => update('first_payment_date', e.target.value)} required />

        <Input label="Garantía (opcional)" value={form.guarantee} onChange={e => update('guarantee', e.target.value)} placeholder="Ej: Vehículo, propiedad..." />
        <Input label="Notas (opcional)" value={form.notes} onChange={e => update('notes', e.target.value)} />

        {schedule && (() => {
          return (
            <div className="bg-primary-light rounded-lg p-4 space-y-3">
              <p className="text-sm font-semibold text-primary">Resumen del cálculo</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <div className="bg-white rounded-lg p-2.5">
                  <p className="text-xs text-muted-foreground">Monto del préstamo</p>
                  <p className="font-semibold text-foreground">{formatCurrency(parseFloat(form.amount) || 0)}</p>
                </div>
                <div className="bg-white rounded-lg p-2.5">
                  <p className="text-xs text-muted-foreground">Total de intereses</p>
                  <p className="font-semibold text-foreground">{formatCurrency(schedule.total_interest)}</p>
                </div>
                <div className="bg-white rounded-lg p-2.5">
                  <p className="text-xs text-muted-foreground">Tasa de interés</p>
                  <p className="font-semibold text-foreground">{form.interest_type === 'percentage' ? `${form.interest_rate}%` : formatCurrency(parseFloat(form.interest_rate) || 0)}</p>
                </div>
                <div className="bg-white rounded-lg p-2.5">
                  <p className="text-xs text-muted-foreground">Monto total</p>
                  <p className="font-semibold text-foreground">{formatCurrency(schedule.total_amount)}</p>
                </div>
              </div>
              {schedule.installments.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-1.5 px-2 font-medium text-muted-foreground">#</th>
                        <th className="text-right py-1.5 px-2 font-medium text-muted-foreground">Capital</th>
                        <th className="text-right py-1.5 px-2 font-medium text-muted-foreground">Interés</th>
                        <th className="text-right py-1.5 px-2 font-medium text-muted-foreground">Cuota</th>
                        <th className="text-right py-1.5 px-2 font-medium text-muted-foreground">Fecha pago</th>
                      </tr>
                    </thead>
                    <tbody>
                      {schedule.installments.map(inst => (
                        <tr key={inst.number} className="border-b border-border hover:bg-white/50">
                          <td className="py-1.5 px-2 font-medium">{inst.number}</td>
                          <td className="py-1.5 px-2 text-right">{formatCurrency(inst.capital)}</td>
                          <td className="py-1.5 px-2 text-right">{formatCurrency(inst.interest)}</td>
                          <td className="py-1.5 px-2 text-right font-medium">{formatCurrency(inst.amount)}</td>
                          <td className="py-1.5 px-2 text-right">{formatDate(inst.due_date)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {form.open_ended && (
                <p className="text-xs text-primary mt-1">Préstamo abierto — paga {formatCurrency(schedule.installment_amount)} de interés cada período</p>
              )}
            </div>
          )
        })()}

        <div className="flex gap-2 pt-2">
          <Button variant="secondary" type="button" onClick={() => router.back()} className="flex-1">{isEditing ? 'Cancelar' : 'Cancelar'}</Button>
          <Button type="submit" loading={loading} className="flex-1">{isEditing ? 'Guardar cambios' : 'Guardar préstamo'}</Button>
        </div>
      </form>
    </Card>
  )
}
