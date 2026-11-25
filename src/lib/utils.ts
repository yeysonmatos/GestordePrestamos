import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function cleanAmount(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function formatNumber(amount: number): string {
  return new Intl.NumberFormat('es-DO', {
    style: 'decimal',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatCurrency(amount: number, currency: string = 'DOP'): string {
  return new Intl.NumberFormat('es-DO', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatDate(date: string | Date, fmt: string = 'dd/MM/yyyy'): string {
  const d = typeof date === 'string' ? parseISO(date) : date
  return format(d, fmt, { locale: es })
}

export function formatDateShort(date: string | Date): string {
  return formatDate(date, 'dd/MM/yyyy')
}

export function formatDateFull(date: string | Date): string {
  return formatDate(date, "d 'de' MMMM 'de' yyyy")
}

export const APP_TIME_ZONE = 'America/Santo_Domingo'

let cachedFormat: Intl.DateTimeFormat | null = null
function getLocalFormat(): Intl.DateTimeFormat {
  if (!cachedFormat) {
    cachedFormat = new Intl.DateTimeFormat('en-CA', {
      timeZone: APP_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
  }
  return cachedFormat
}

export function getLocalDate(date: Date = new Date()): string {
  return getLocalFormat().format(date)
}

/** Días calendario entre dos fechas 'yyyy-MM-dd' (b - a), operación determinística (sin zona horaria). */
export function daysBetweenDateStrings(a: string, b: string): number {
  const parse = (s: string) => {
    const [y, m, d] = s.split('-').map(Number)
    return Date.UTC(y, (m || 1) - 1, d || 1)
  }
  return Math.round((parse(b) - parse(a)) / 86400000)
}

/** Primer día del mes siguiente a 'yyyy-MM' (ej. '2026-07' → '2026-08-01'), determinístico. */
export function firstOfNextMonth(month: string): string {
  const y = Number(month.slice(0, 4))
  const m = Number(month.slice(5, 7))
  const next = new Date(Date.UTC(y, m, 1))
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-01`
}

/** Primer día del mes actual en RD, desplazado `monthsBack` meses hacia atrás (determinístico). */
export function getLocalMonthStart(monthsBack = 0): string {
  const today = getLocalDate()
  const y = Number(today.slice(0, 4))
  const m = Number(today.slice(5, 7))
  const total = y * 12 + (m - 1) - monthsBack
  const ty = Math.floor(total / 12)
  const tm = (total % 12) + 1
  return `${ty}-${String(tm).padStart(2, '0')}-01`
}

export function buildMonthlySeries(
  points: { month: string; income: number; loans: number }[],
  maxMonths: number = Infinity,
): { month: string; income: number; loans: number }[] {
  if (points.length === 0) return []

  const map: Record<string, { income: number; loans: number }> = {}
  let minMonth = points[0].month
  let maxMonth = points[0].month
  for (const p of points) {
    if (!map[p.month]) map[p.month] = { income: 0, loans: 0 }
    map[p.month].income += p.income
    map[p.month].loans += p.loans
    if (p.month < minMonth) minMonth = p.month
    if (p.month > maxMonth) maxMonth = p.month
  }

  const all: string[] = []
  const [sy, sm] = minMonth.split('-').map(Number)
  const [ey, em] = maxMonth.split('-').map(Number)
  let y = sy
  let m = sm
  while (y < ey || (y === ey && m <= em)) {
    all.push(`${y}-${String(m).padStart(2, '0')}`)
    m++
    if (m > 12) { m = 1; y++ }
  }

  return all.slice(-maxMonths).map(month => ({
    month,
    income: map[month]?.income || 0,
    loans: map[month]?.loans || 0,
  }))
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export function getTrustLevelColor(level: string): string {
  switch (level) {
    case 'high': return 'text-green-600 bg-green-100'
    case 'medium': return 'text-yellow-600 bg-yellow-100'
    case 'low': return 'text-red-600 bg-red-100'
    default: return 'text-gray-600 bg-gray-100'
  }
}

export function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    active: 'Activo',
    inactive: 'Inactivo',
    paid: 'Pagado',
    late: 'Atrasado',
    late_1_30: 'Mora 1-30d',
    late_31_60: 'Mora 31-60d',
    late_61_90: 'Mora 61-90d',
    cancelled: 'Cancelado',
    pending: 'Pendiente',
    high: 'Alto',
    medium: 'Medio',
    low: 'Bajo',
  }
  return labels[status] || status
}

export function lateStatusLabel(status: string, lateDays: number = 0): string {
  if (!['late', 'late_1_30', 'late_31_60', 'late_61_90'].includes(status)) return getStatusLabel(status)
  return `Atrs ${Math.max(0, lateDays)}d`
}

/**
 * El N° de documento del cliente es opcional. Vacío o un relleno sin valor
 * (solo ceros, guiones o espacios, p. ej. "000000000") se guarda como null.
 */
export function normalizeDocument(value: string | null | undefined): string | null {
  const v = (value ?? '').trim()
  if (!v || /^[0\s-]+$/.test(v)) return null
  return v
}
