import { describe, it, expect } from 'vitest'
import { calculatePaymentAllocation } from '../payments'

describe('calculatePaymentAllocation', () => {
  it('asigna primero a mora y luego a cuota (C2/A1)', () => {
    const a = calculatePaymentAllocation(600, 500, 0, 0, 100, true, 10)
    expect(a.paidToLate).toBe(100)
    expect(a.paidToInstallment).toBe(500)
    expect(a.totalPaidOnInstallment).toBe(500)
    expect(a.newPaidLateAmount).toBe(100)
    expect(a.expectedTotal).toBe(600)
    expect(a.isNowFullyPaid).toBe(true)
  })

  it('pago menor a la mora va toda a mora', () => {
    const a = calculatePaymentAllocation(30, 500, 0, 0, 100, true, 10)
    expect(a.paidToLate).toBe(30)
    expect(a.paidToInstallment).toBe(0)
    expect(a.totalPaidOnInstallment).toBe(0)
    expect(a.isNowFullyPaid).toBe(false)
  })

  it('sin mora todo va a la cuota', () => {
    const a = calculatePaymentAllocation(200, 500, 0, 0, 100, false)
    expect(a.paidToLate).toBe(0)
    expect(a.paidToInstallment).toBe(200)
    expect(a.totalPaidOnInstallment).toBe(200)
  })

  it('nunca sobrepasa la cuota (C1)', () => {
    const a = calculatePaymentAllocation(99999, 500, 0, 0, 100, true, 10)
    expect(a.paidToInstallment).toBe(500)
    expect(a.totalPaidOnInstallment).toBe(500)
    expect(a.paidToLate).toBe(100)
    expect(a.isNowFullyPaid).toBe(true)
  })

  it('respeta pagos parciales previos', () => {
    const a = calculatePaymentAllocation(200, 500, 300, 0, 0, false)
    expect(a.expectedTotal).toBe(200)
    expect(a.paidToInstallment).toBe(200)
    expect(a.totalPaidOnInstallment).toBe(500)
    expect(a.isNowFullyPaid).toBe(true)
  })

  it('isNowFullyPaid usa expectedTotal incluyendo mora pendiente (A2)', () => {
    const a = calculatePaymentAllocation(100, 500, 400, 30, 100, true, 10)
    expect(a.pendingLateAmount).toBe(70)
    expect(a.expectedTotal).toBe(170)
    expect(a.isNowFullyPaid).toBe(false)
  })

  it('paidToLate nunca excede mora pendiente (A1)', () => {
    const a = calculatePaymentAllocation(99999, 500, 0, 80, 100, true, 10)
    expect(a.pendingLateAmount).toBe(20)
    expect(a.paidToLate).toBe(20)
    expect(a.newPaidLateAmount).toBe(100)
  })

  it('el excedente sobre lo debido se guarda como saldo a favor', () => {
    const a = calculatePaymentAllocation(700, 500, 0, 0, 100, true, 10)
    expect(a.paidToLate).toBe(100)
    expect(a.paidToInstallment).toBe(500)
    expect(a.surplus).toBe(100)
    expect(a.creditConsumed).toBe(0)
    expect(a.newPrepaidBalance).toBe(100)
  })

  it('el saldo a favor reduce automáticamente lo que se debe pagar', () => {
    const a = calculatePaymentAllocation(200, 500, 0, 0, 0, false, 0, 300)
    expect(a.expectedTotal).toBe(200)
    expect(a.creditConsumed).toBe(300)
    expect(a.totalPaidOnInstallment).toBe(500)
    expect(a.isNowFullyPaid).toBe(true)
    expect(a.newPrepaidBalance).toBe(0)
  })

  it('el crédito se consume primero en cuota y luego en mora', () => {
    const a = calculatePaymentAllocation(0, 500, 0, 0, 100, true, 10, 450)
    expect(a.creditConsumed).toBe(450)
    expect(a.totalPaidOnInstallment).toBe(450)
    expect(a.expectedTotal).toBe(150)
    expect(a.isNowFullyPaid).toBe(false)
    expect(a.newPrepaidBalance).toBe(0)
  })

  it('crédito consumido y excedente se recomponen', () => {
    const a = calculatePaymentAllocation(600, 500, 0, 0, 0, false, 0, 100)
    expect(a.creditConsumed).toBe(100)
    expect(a.totalPaidOnInstallment).toBe(500)
    expect(a.surplus).toBe(200)
    expect(a.newPrepaidBalance).toBe(200)
  })
})
