import { describe, it, expect } from 'vitest'
import { renderTemplate, TEMPLATE_KEYS } from '../notify/templates'
import { retryDelayMs, claimableFilter, SENDING_LEASE_MS, STALE_AFTER_MS } from '../notify/queue'
import { isSmtpConfigured } from '../notify/smtp'

describe('notify/templates', () => {
  it('renderiza cada plantilla con asunto y HTML con botón de vuelta a la plataforma', () => {
    const cases: Array<[Parameters<typeof renderTemplate>[0]['key'], Record<string, unknown>]> = [
      ['new_ticket', { subject: 'Problema con login', priority: 'high' }],
      ['pay_request', { prestamistaName: 'Juan', plan: 'Básico', amount: 'RD$500' }],
      ['upgrade_request', { prestamistaName: 'Juan', targetPlan: 'Pro', amount: 'RD$500' }],
      ['ticket_replied', { subject: 'Problema con login', ticketId: 'abc-123' }],
      ['ticket_closed', { subject: 'Problema con login', ticketId: 'abc-123' }],
      ['payment_approved', { plan: 'Básico', amount: 'RD$500' }],
      ['plan_updated', { plan: 'Pro', endsAt: '2026-09-01' }],
      ['plan_expiring', { plan: 'Básico', days: 5, endsAt: '2026-08-20' }],
    ]
    for (const [key, data] of cases) {
      const { subject, html } = renderTemplate({ key, data })
      expect(subject.length).toBeGreaterThan(0)
      expect(html).toContain('https://')
      expect(html).toContain('No respondas a este correo')
      expect(html.length).toBeGreaterThan(100)
    }
  })

  it('plan_expiring vencido usa su propio asunto y no menciona días', () => {
    const { subject, html } = renderTemplate({ key: 'plan_expiring', data: { expired: true } })
    expect(subject).toContain('vencido')
    expect(html).toContain('ha vencido')
  })

  it('lista todas las plantillas conocidas', () => {
    expect(TEMPLATE_KEYS).toContain('payment_approved')
    expect(TEMPLATE_KEYS).toContain('plan_expiring')
    expect(TEMPLATE_KEYS).toContain('ticket_replied')
  })
})

describe('notify/queue retryDelayMs', () => {
  it('aplica backoff creciente', () => {
    expect(retryDelayMs(1)).toBe(10 * 60 * 1000)
    expect(retryDelayMs(2)).toBe(60 * 60 * 1000)
    expect(retryDelayMs(3)).toBe(6 * 60 * 60 * 1000)
    expect(retryDelayMs(4)).toBe(24 * 60 * 60 * 1000)
  })
})

describe('notify/smtp isSmtpConfigured', () => {
  it('considera configurado solo si está enabled y con datos completos', () => {
    const ok: never = { enabled: true, host: 'smtp.gmail.com', port: 587, username: 'a', pass: 'b', from_email: 'a@b.com' } as never
    expect(isSmtpConfigured(ok)).toBe(true)
    expect(isSmtpConfigured({ enabled: false, host: 'x', port: 587, username: 'a', pass: 'b', from_email: 'a@b.com' } as never)).toBe(false)
    expect(isSmtpConfigured({ enabled: true, host: '', port: 587, username: 'a', pass: 'b', from_email: 'a@b.com' } as never)).toBe(false)
    expect(isSmtpConfigured(null)).toBe(false)
  })
})
describe('notify/queue claimableFilter', () => {
  const now = '2026-11-25T14:30:00.000Z'
  const filter = claimableFilter(now)

  it('toma en cola sin reintento o con reintento vencido', () => {
    expect(filter).toContain('and(status.eq.queued,next_retry_at.is.null)')
    expect(filter).toContain(`and(status.eq.queued,next_retry_at.lte."${now}")`)
  })

  it('recupera mensajes atascados en sending (sin reserva o con reserva vencida)', () => {
    expect(filter).toContain('and(status.eq.sending,next_retry_at.is.null)')
    expect(filter).toContain(`and(status.eq.sending,next_retry_at.lte."${now}")`)
  })

  it('nunca toma enviados ni fallidos', () => {
    expect(filter).not.toContain('sent')
    expect(filter).not.toContain('failed')
  })

  it('cita la fecha (contiene : y .) como exige PostgREST', () => {
    expect(filter).not.toMatch(/lte\.2026/)
  })

  it('la reserva dura menos que el primer reintento y el vencimiento es de 48 h', () => {
    expect(SENDING_LEASE_MS).toBeLessThanOrEqual(retryDelayMs(1))
    expect(STALE_AFTER_MS).toBe(48 * 60 * 60 * 1000)
  })
})
