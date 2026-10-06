'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card } from '@/components/ui/Card'
import { Alert } from '@/components/ui/Alert'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import { Select, Textarea } from '@/components/ui/Input'
import PageHeader from '@/components/ui/PageHeader'
import { formatNumber, formatDate } from '@/lib/utils'
import { createClient } from '@/lib/supabase-client'
import { computeUpgradeAmount, formatPlanAmount } from '@/lib/prorate'
import ChangePasswordForm from './ChangePasswordForm'
import MfaSetup from '@/components/auth/MfaSetup'
import { CreditCard, Clock, CalendarCheck, Receipt, HandCoins, PaperPlaneTilt, ArrowRight, Copy } from '@phosphor-icons/react'

interface SubscriptionInfo {
  status: string
  starts_at: string
  ends_at: string | null
  plan_name: string
  plan_price: number
  billing_cycle: string
}

interface PaymentRow {
  id: string
  amount: number
  payment_date: string
  method: string
  notes: string | null
  status?: string
}

const METHOD_LABELS: Record<string, string> = {
  cash: 'Efectivo',
  transfer: 'Transferencia',
  deposit: 'Depósito',
  other: 'Otro',
}

export default function AccountContent({ showHeader = true }: { showHeader?: boolean }) {
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null)
  const [payments, setPayments] = useState<PaymentRow[]>([])
  const [paymentInfo, setPaymentInfo] = useState<{ bank_name: string; account_name: string; account_number: string; payment_phone: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [payModal, setPayModal] = useState(false)
  const [payMethod, setPayMethod] = useState('transfer')
  const [payNotes, setPayNotes] = useState('')
  const [sending, setSending] = useState(false)
  const [payError, setPayError] = useState('')
  const [paySuccess, setPaySuccess] = useState(false)
  const [copied, setCopied] = useState(false)
  const [upgradeModal, setUpgradeModal] = useState(false)
  const [upgradePlan, setUpgradePlan] = useState('')
  const [upgrading, setUpgrading] = useState(false)
  const [upgradeError, setUpgradeError] = useState('')
  const [plans, setPlans] = useState<{ id: string; name: string; price: number; billing_cycle: string }[]>([])
  const supabase = createClient()

  const load = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const [subRes, payRes, plansRes, payInfo] = await Promise.all([
        supabase
          .from('subscriptions')
          .select('status, starts_at, ends_at, plan:plans(name, price, billing_cycle)')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('subscription_payments')
          .select('id, amount, payment_date, method, notes, status')
          .eq('user_id', user.id)
          .order('payment_date', { ascending: false })
          .limit(50),
        supabase.from('plans').select('id, name, price, billing_cycle').eq('is_active', true).order('price'),
        supabase.from('platform_config').select('bank_name, account_name, account_number, payment_phone').eq('id', '00000000-0000-0000-0000-000000000001').maybeSingle(),
      ])

      if (subRes.data) {
        const plan = Array.isArray(subRes.data.plan) ? subRes.data.plan[0] : subRes.data.plan
        setSubscription({
          status: subRes.data.status,
          starts_at: subRes.data.starts_at,
          ends_at: subRes.data.ends_at,
          plan_name: plan?.name || '—',
          plan_price: Number(plan?.price || 0),
          billing_cycle: plan?.billing_cycle || 'monthly',
        })
      }
      setPayments((payRes.data || []) as PaymentRow[])
      setPaymentInfo(payInfo.data as { bank_name: string; account_name: string; account_number: string; payment_phone: string } | null)
      setPlans((plansRes.data || []) as { id: string; name: string; price: number; billing_cycle: string }[])
    } catch {
      // Sin acción: se muestra estado vacío
    }
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  async function handlePay() {
    setSending(true)
    setPayError('')
    setPaySuccess(false)
    try {
      const res = await fetch('/api/subscription/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ method: payMethod, notes: payNotes || null }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Error al crear la solicitud')
      setPaySuccess(true)
      setTimeout(async () => {
        setPayModal(false)
        setPaySuccess(false)
        setPayNotes('')
        load()
      }, 1500)
    } catch (err) {
      setPayError(err instanceof Error ? err.message : 'Error de conexión')
    }
    setSending(false)
  }

  async function copyTransferData() {
    const phone = paymentInfo?.payment_phone || ''
    const bank = paymentInfo?.bank_name || ''
    const accountHolder = paymentInfo?.account_name || ''
    const accountNumber = paymentInfo?.account_number || ''
    const text = [
      'Datos para pagar tu suscripción:',
      `Plan: ${subscription?.plan_name || ''} (RD$${formatNumber(subscription?.plan_price || 0)})`,
    ]
    if (accountHolder) text.push(`A nombre de: ${accountHolder}`)
    if (bank) text.push(`Banco: ${bank}`)
    if (accountNumber) text.push(`Número de cuenta: ${accountNumber}`)
    if (phone) text.push(`Contacto: ${phone}`)
    text.push('Realiza el pago y confirma tu solicitud. Te activaremos la suscripción.')
    try {
      await navigator.clipboard.writeText(text.join('\n'))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Sin portapapeles: no es bloqueante
    }
  }

  async function copyUpgradeData() {
    const phone = paymentInfo?.payment_phone || ''
    const bank = paymentInfo?.bank_name || ''
    const accountHolder = paymentInfo?.account_name || ''
    const accountNumber = paymentInfo?.account_number || ''
    const amount = upgradeEstimate?.amount ?? selectedPlan?.price ?? 0
    const text = [
      'Datos para pagar tu suscripción:',
      `Plan: ${selectedPlan?.name || ''} (RD$${formatNumber(amount)})`,
    ]
    if (accountHolder) text.push(`A nombre de: ${accountHolder}`)
    if (bank) text.push(`Banco: ${bank}`)
    if (accountNumber) text.push(`Número de cuenta: ${accountNumber}`)
    if (phone) text.push(`Contacto: ${phone}`)
    text.push('Realiza el pago y confirma tu solicitud. Te activaremos el nuevo plan.')
    try {
      await navigator.clipboard.writeText(text.join('\n'))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Sin portapapeles: no es bloqueante
    }
  }

  async function handleUpgrade() {
    if (!upgradePlan) return
    setUpgrading(true)
    setUpgradeError('')
    try {
      const res = await fetch('/api/subscription/upgrade-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ target_plan_id: upgradePlan }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Error al solicitar upgrade')
      setUpgradeModal(false)
      setUpgradePlan('')
      setUpgradeError('')
      load()
    } catch (err) {
      setUpgradeError(err instanceof Error ? err.message : 'Error de conexión')
    }
    setUpgrading(false)
  }

  if (loading) return <div className="text-center py-12 text-sm text-muted-foreground">Cargando...</div>

  const statusLabel: Record<string, { text: string; variant: 'active' | 'paid' | 'cancelled' | 'late' | 'default' }> = {
    trial: { text: 'Prueba', variant: 'default' },
    active: { text: 'Activo', variant: 'paid' },
    expired: { text: 'Vencido', variant: 'late' },
    cancelled: { text: 'Cancelado', variant: 'cancelled' },
  }

  const sub = subscription
  const statusInfo = sub ? (statusLabel[sub.status] || { text: sub.status, variant: 'default' as const }) : null
  const isFreePlan = (sub?.plan_price ?? 0) <= 0
  const subInGoodState = sub?.status === 'trial' || sub?.status === 'active'
  const showStatusBadge = !!statusInfo && !(isFreePlan && subInGoodState)
  const daysLeft = sub?.ends_at
    ? Math.max(0, Math.ceil((new Date(sub.ends_at).getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
    : null

  // Estimación del monto a pagar (diferencia prorrateada) para el plan seleccionado
  const selectedPlan = plans.find(p => p.id === upgradePlan) || null
  const upgradeEstimate = sub && selectedPlan
    ? computeUpgradeAmount({
        status: sub.status,
        currentPrice: sub.plan_price,
        currentCycle: sub.billing_cycle,
        endsAt: sub.ends_at,
        targetPrice: selectedPlan.price,
        targetCycle: selectedPlan.billing_cycle,
      })
    : null

  return (
    <div className="space-y-6">
      {showHeader && <PageHeader title="Mi plan" description="Estado de tu suscripción" />}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-primary" />
              Tu plan actual
            </h3>
            {showStatusBadge && statusInfo && <Badge variant={statusInfo.variant}>{statusInfo.text}</Badge>}
          </div>

          {sub ? (
            <div className="mt-4 space-y-4">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-foreground">{sub.plan_name}</span>
                {!isFreePlan && (
                  <span className="text-sm text-muted-foreground">
                    RD${formatNumber(sub.plan_price)} / {sub.billing_cycle === 'yearly' ? 'año' : 'mes'}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="flex items-start gap-3 p-3 rounded-xl border border-border">
                  <CalendarCheck className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Inicio</p>
                    <p className="text-sm font-medium text-foreground">{formatDate(sub.starts_at)}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-xl border border-border">
                  <Clock className="h-5 w-5 text-warning shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Vencimiento</p>
                    <p className="text-sm font-medium text-foreground">
                      {sub.ends_at ? formatDate(sub.ends_at) : '—'}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-xl border border-border">
                  <Receipt className="h-5 w-5 text-success shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Días restantes</p>
                    <p className="text-sm font-medium text-foreground">
                      {daysLeft !== null ? `${daysLeft} día${daysLeft === 1 ? '' : 's'}` : '—'}
                    </p>
                  </div>
                </div>
              </div>

              {sub.ends_at && (() => {
                const diff = new Date(sub.ends_at!).getTime() - Date.now()
                if (diff < 0) {
                  return (
                    <Alert variant="danger">
                      Tu plan venció el {formatDate(sub.ends_at!)}. Contacta al administrador para renovar tu mensualidad.
                    </Alert>
                  )
                }
                if (diff <= 7 * 24 * 60 * 60 * 1000) {
                  return (
                    <Alert variant="warning">
                      Tu plan vence pronto. Contacta al administrador para renovar tu mensualidad.
                    </Alert>
                  )
                }
                return null
              })()}

              {sub.plan_price > 0 && (
                <div className="pt-2">
                  <Button onClick={() => { setPayMethod('transfer'); setPayNotes(''); setPayError(''); setPaySuccess(false); setPayModal(true) }} className="w-full sm:w-auto">
                    <HandCoins className="h-4 w-4 mr-1" /> Pagar / Renovar
                  </Button>
                </div>
              )}

              {plans.some(p => Number(p.price) > (sub.plan_price || 0)) && (
                <div className="pt-4 border-t border-border">
                  <p className="text-sm text-muted-foreground mb-2">
                    {sub.plan_price > 0 ? '¿Quieres pasar a un plan superior?' : '¿Quieres más funcionalidades?'}
                  </p>
                  <div className="space-y-2">
                    {plans
                      .filter(p => Number(p.price) > (sub.plan_price || 0))
                      .map(p => (
                        <label
                          key={p.id}
                          className="flex items-center justify-between p-3 rounded-xl border border-border cursor-pointer hover:bg-muted/50"
                        >
                          <div>
                            <p className="font-medium text-foreground">{p.name}</p>
                            <p className="text-sm text-muted-foreground">RD${formatNumber(p.price)} / {p.billing_cycle === 'yearly' ? 'año' : 'mes'}</p>
                          </div>
                          <input
                            type="radio"
                            name="upgradePlan"
                            value={p.id}
                            checked={upgradePlan === p.id}
                            onChange={e => setUpgradePlan(e.target.value)}
                            className="h-4 w-4 accent-primary"
                          />
                        </label>
                      ))}
                    {upgradePlan && (
                      <Button onClick={() => { setUpgradeError(''); setUpgradeModal(true) }} className="w-full">
                        <ArrowRight className="h-4 w-4 mr-1" /> Solicitar cambio a {plans.find(p => p.id === upgradePlan)?.name || ''}
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground mt-4">No tienes una suscripción activa.</p>
          )}
        </Card>

        <Card>
          <h3 className="text-base font-semibold text-foreground mb-4">Historial de pagos</h3>
          {payments.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Aún no hay pagos registrados</p>
          ) : (
            <div className="space-y-3">
              {payments.map(p => (
                <div key={p.id} className="flex items-center justify-between p-3 rounded-xl border border-border">
                  <div className="min-w-0">
                    <p className="font-medium text-sm text-foreground">RD${formatNumber(p.amount)}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(p.payment_date)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {p.status === 'pending' && <Badge variant="late">Pendiente</Badge>}
                    {p.status === 'confirmed' && <Badge variant="paid">Confirmado</Badge>}
                    {p.status === 'rejected' && <Badge variant="cancelled">Rechazado</Badge>}
                    <Badge variant="default">{METHOD_LABELS[p.method] || p.method}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card className="lg:col-span-3">
        <ChangePasswordForm />
      </Card>

      <Card className="lg:col-span-3">
        <MfaSetup />
      </Card>

      <Modal open={payModal} onClose={() => { setPayModal(false); setPayError('') }} title="Pagar / Renovar">
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 rounded-xl border border-border">
            <div>
              <p className="text-sm text-muted-foreground">Plan</p>
              <p className="font-semibold text-foreground">{subscription?.plan_name || ''}</p>
              <p className="text-sm text-muted-foreground">
                RD${formatNumber(subscription?.plan_price || 0)} / {subscription?.billing_cycle === 'yearly' ? 'año' : 'mes'}
              </p>
            </div>
            <HandCoins className="h-6 w-6 text-primary" />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Método de pago</label>
            <Select
              value={payMethod}
              onChange={e => setPayMethod(e.target.value)}
              options={Object.entries(METHOD_LABELS).map(([v, l]) => ({ value: v, label: l }))}
            />
          </div>

          <Button variant="secondary" onClick={copyTransferData} className="w-full">
            <Copy className="h-4 w-4 mr-1" /> {copied ? '¡Copiado!' : 'Copiar datos de transferencia'}
          </Button>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Nota (opcional)</label>
            <Textarea
              value={payNotes}
              onChange={e => setPayNotes(e.target.value)}
              placeholder="Ej: transferencia realizada el 06/08..."
              rows={3}
            />
          </div>

          {payError && <Alert variant="danger">{payError}</Alert>}
          {paySuccess && <Alert variant="success">
              Solicitud enviada. El administrador la confirmará próximamente.
            </Alert>}

          <p className="text-sm text-muted-foreground">
            Se creará una solicitud de pago. Realiza la transferencia o el depósito y el administrador confirmará para renovar tu suscripción.
          </p>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => { setPayModal(false); setPayError('') }} disabled={sending}>Cancelar</Button>
            <Button onClick={handlePay} loading={sending}>
              <PaperPlaneTilt className="h-4 w-4 mr-1" /> Enviar solicitud
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={upgradeModal} onClose={() => { setUpgradeModal(false); setUpgradeError('') }} title={`Solicitar cambio a ${plans.find(p => p.id === upgradePlan)?.name || 'plan'}`}>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Se descuenta el valor del tiempo restante de tu ciclo actual, así que pagarás la <strong>diferencia</strong>. Reconcilia el pago y el administrador lo confirmará para activar el plan.
          </p>
          <div className="p-4 rounded-xl border border-border bg-muted/40">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Plan {selectedPlan?.name || ''} (valor)</span>
              <span className="font-semibold text-foreground">RD${formatNumber(selectedPlan?.price || 0)}</span>
            </div>
            {upgradeEstimate?.prorated && upgradeEstimate.creditedValue > 0 && (
              <div className="flex items-center justify-between text-sm mt-1">
                <span className="text-muted-foreground">Descuento por tu ciclo actual</span>
                <span className="font-semibold text-success">- RD${formatNumber(upgradeEstimate.creditedValue)}</span>
              </div>
            )}
            <div className="flex items-center justify-between text-sm mt-2 pt-2 border-t border-border">
              <span className="font-medium text-foreground">Total a pagar</span>
              <span className="text-lg font-bold text-primary">RD${formatPlanAmount(upgradeEstimate?.amount ?? selectedPlan?.price ?? 0)}</span>
            </div>
            {upgradeEstimate?.prorated && sub?.ends_at && (
              <p className="text-xs text-muted-foreground mt-2">
                Tu vencimiento actual ({formatDate(sub.ends_at)}) se conserva; solo pagas la diferencia para activar el plan nuevo ahora.
              </p>
            )}
          </div>
          {upgradeError && <Alert variant="danger">{upgradeError}</Alert>}
          <div className="flex items-center justify-between p-4 rounded-xl border border-border">
            <div>
              <p className="text-sm text-muted-foreground">Plan solicitado</p>
              <p className="font-semibold text-foreground">{plans.find(p => p.id === upgradePlan)?.name || ''}</p>
              <p className="text-sm text-muted-foreground">RD${formatNumber(plans.find(p => p.id === upgradePlan)?.price || 0)} / {plans.find(p => p.id === upgradePlan)?.billing_cycle === 'yearly' ? 'año' : 'mes'}</p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={copyUpgradeData}>
              <Copy className="h-4 w-4 mr-1" /> {copied ? '¡Copiado!' : 'Copiar datos de transferencia'}
            </Button>
            <Button variant="ghost" onClick={() => { setUpgradeModal(false); setUpgradeError('') }}>Cancelar</Button>
            <Button onClick={handleUpgrade} loading={upgrading}>
              <ArrowRight className="h-4 w-4 mr-1" /> Enviar solicitud
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
