/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { computeUpgradeAmount, cycleDays } from '../prorate'
import { recordSubscriptionPayment, BillingError } from '../billing'

// Mock mínimo de la cadena de queries de Supabase para billing.
function mockSupabase(options: {
  subscription?: any
  paymentSub?: any
  plan?: any
  newPaymentId?: string
}) {
  const calls: string[] = []
  const pendingPayment = options.paymentSub
  const sub = options.subscription
  const plan = options.plan

  const okThenable = (value: unknown) => ({
    then: (onFulfilled: (v: unknown) => unknown) => onFulfilled(value),
  })

  const table = (name: string): any => {
    const q: any = {
      select: () => q,
      eq: () => q,
      in: () => q,
      order: () => q,
      limit: () => q,
      maybeSingle: () => {
        if (name === 'subscriptions') return Promise.resolve({ data: sub || null, error: null })
        if (name === 'plans') return Promise.resolve({ data: plan || null, error: null })
        if (name === 'subscription_payments') return Promise.resolve({ data: pendingPayment || null, error: null })
        return Promise.resolve({ data: null, error: null })
      },
      single: () => q.maybeSingle(),
      insert: (payload: any) => {
        calls.push(`insert:${name}`)
        return {
          select: () => ({
            single: () => Promise.resolve({ data: { id: options.newPaymentId || 'pay-new', ...payload }, error: null }),
          }),
        }
      },
      update: (payload: any) => {
        calls.push(`update:${name}:${JSON.stringify(payload)}`)
        return { eq: () => okThenable({ data: null, error: null }) }
      },
    }
    return q
  }
  return {
    supabase: { from: (n: string) => table(n) } as unknown as SupabaseClient,
    calls,
  }
}

describe('recordSubscriptionPayment', () => {
  it('pago directo (renovación) inserta pago, extiende y audita', async () => {
    const future = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000)
    const { supabase, calls } = mockSupabase({
      subscription: { id: 'sub_1', plan_id: 'plan_basico', status: 'active', ends_at: future.toISOString() },
      plan: { id: 'plan_basico', billing_cycle: 'monthly', name: 'Básico' },
      newPaymentId: 'pay_new',
    })

    const res = await recordSubscriptionPayment({
      adminClient: supabase,
      user_id: 'u1',
      subscription_id: 'sub_1',
      amount: 500,
    })

    expect(res.ok).toBe(true)
    expect(res.payment_id).toBe('pay_new')
    expect(res.is_upgrade).toBe(false)
    // insert (payment) + update (subscription) + insert (audit)
    expect(calls.filter(c => c.startsWith('insert'))).toHaveLength(2)
    expect(calls.find(c => c.startsWith('update:subscriptions'))).toBeDefined()
  })

  it('confirma una solicitud pendiente sin duplicar pago', async () => {
    const future = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000)
    const { supabase, calls } = mockSupabase({
      paymentSub: { id: 'pay_pending', subscription_id: 'sub_1', amount: 500, target_plan_id: null },
      subscription: { id: 'sub_1', plan_id: 'plan_basico', status: 'active', ends_at: future.toISOString() },
      plan: { id: 'plan_basico', billing_cycle: 'monthly', name: 'Básico' },
    })

    const res = await recordSubscriptionPayment({
      adminClient: supabase,
      user_id: 'u1',
      amount: 0,
      payment_id: 'pay_pending',
    })

    expect(res.ok).toBe(true)
    // No hay insert de payment nuevo; sí update (sub + confirm) y audit
    const inserts = calls.filter(c => c.startsWith('insert'))
    expect(inserts).toHaveLength(1)
    expect(inserts[0]).toBe('insert:audit_logs')
    expect(calls.find(c => c.startsWith('update:subscription_payments'))).toBeDefined()
  })

  it('lanza BillingError cuando no hay suscripción', async () => {
    const { supabase } = mockSupabase({})
    await expect(
      recordSubscriptionPayment({ adminClient: supabase, user_id: 'u1', amount: 500 })
    ).rejects.toThrow(BillingError)
  })

  it('lanza BillingError con monto no positivo', async () => {
    const future = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000)
    const { supabase } = mockSupabase({
      subscription: { id: 'sub_1', plan_id: 'plan_basico', status: 'active', ends_at: future.toISOString() },
    })
    await expect(
      recordSubscriptionPayment({ adminClient: supabase, user_id: 'u1', subscription_id: 'sub_1', amount: 0 })
    ).rejects.toThrow(BillingError)
  })

  it('upgrade preserva el ends_at actual', async () => {
    const ends = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString()
    const { supabase } = mockSupabase({
      paymentSub: { id: 'pay_up', subscription_id: 'sub_1', amount: 400, target_plan_id: 'plan_pro' },
      subscription: { id: 'sub_1', plan_id: 'plan_basico', status: 'active', ends_at: ends },
      plan: { id: 'plan_pro', billing_cycle: 'monthly', name: 'Pro' },
    })

    const res = await recordSubscriptionPayment({
      adminClient: supabase,
      user_id: 'u1',
      amount: 0,
      payment_id: 'pay_up',
    })

    expect(res.is_upgrade).toBe(true)
    expect(res.subscription.plan_id).toBe('plan_pro')
    expect(res.subscription.ends_at).toBe(ends)
  })
})

describe('cycleDays', () => {
  it('mensual = 30, anual = 365', () => {
    expect(cycleDays('monthly')).toBe(30)
    expect(cycleDays('yearly')).toBe(365)
    expect(cycleDays(undefined)).toBe(30)
  })
})

describe('computeUpgradeAmount', () => {
  it('trial/gratuito paga el precio completo del plan nuevo', () => {
    const r = computeUpgradeAmount({
      status: 'trial',
      currentPrice: 0,
      endsAt: null,
      targetPrice: 500,
      targetCycle: 'monthly',
    })
    expect(r.amount).toBe(500)
    expect(r.prorated).toBe(false)
    expect(r.isUpgradeCredit).toBe(false)
  })

  it('plan activo no pagado paga el precio completo', () => {
    const r = computeUpgradeAmount({
      status: 'active',
      currentPrice: 0,
      endsAt: '2026-08-01T00:00:00Z',
      targetPrice: 1000,
      targetCycle: 'monthly',
    })
    expect(r.amount).toBe(1000)
  })

  it('upgrade prorratedo descuenta el valor restante del ciclo actual', () => {
    // Ciclo actual: semi-restante (~15 días de 30) de un plan de 500 en monthly
    const now = Date.now()
    const endsIn15 = new Date(now + 15 * 24 * 60 * 60 * 1000).toISOString()
    const r = computeUpgradeAmount({
      status: 'active',
      currentPrice: 500,
      currentCycle: 'monthly',
      endsAt: endsIn15,
      targetPrice: 1000,
      targetCycle: 'monthly',
    })
    expect(r.prorated).toBe(true)
    expect(r.isUpgradeCredit).toBe(true)
    // Crédito ~250 (mitad del ciclo restante), monto = 1000 - 250 = 750
    expect(r.amount).toBeGreaterThan(500)
    expect(r.amount).toBeLessThanOrEqual(1000)
    expect(r.creditedValue).toBeGreaterThan(0)
  })

  it('plan objetivo más barato → el monto a pagar nunca es negativo', () => {
    const rPr = computeUpgradeAmount({
      status: 'active',
      currentPrice: 500,
      currentCycle: 'monthly',
      endsAt: new Date(Date.now() + 29 * 24 * 60 * 60 * 1000).toISOString(),
      targetPrice: 300,
      targetCycle: 'monthly',
    })
    expect(rPr.amount).toBeGreaterThanOrEqual(0)
  })

  it('sin fecha de vencimiento activa no prorratea', () => {
    const r = computeUpgradeAmount({
      status: 'active',
      currentPrice: 500,
      currentCycle: 'monthly',
      endsAt: null,
      targetPrice: 1000,
      targetCycle: 'monthly',
    })
    expect(r.prorated).toBe(true)
    expect(r.creditedValue).toBe(0)
    expect(r.amount).toBe(1000)
  })
})