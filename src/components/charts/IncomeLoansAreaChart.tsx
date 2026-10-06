'use client'

import { useMemo } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { formatCurrency, formatNumber } from '@/lib/utils'

export interface IncomeLoansPoint {
  month: string
  income: number
  loans: number
}

interface Props {
  data: IncomeLoansPoint[]
}

function formatAxisValue(value: number): string {
  if (Math.abs(value) >= 1000) {
    const k = value / 1000
    return `${Number.isInteger(k) ? k : k.toFixed(1)}k`
  }
  return formatNumber(value)
}

const NICE_STEPS = [1, 2, 2.5, 5, 10]

function niceAxisTicks(maxValue: number, targetTicks: number = 4): number[] {
  if (!Number.isFinite(maxValue) || maxValue <= 0) return [0, 250, 500, 750, 1000]
  const roughStep = maxValue / targetTicks
  const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)))
  const normalized = roughStep / magnitude
  const step = (NICE_STEPS.find(s => s >= normalized) ?? 10) * magnitude
  const top = step * Math.ceil(maxValue / step)
  const count = Math.round(top / step)
  return Array.from({ length: count + 1 }, (_, i) => i * step)
}

export default function IncomeLoansAreaChart({ data }: Props) {
  const axisTicks = useMemo(() => {
    const max = data.reduce((acc, d) => Math.max(acc, d.income + d.loans), 0)
    return niceAxisTicks(max)
  }, [data])

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data}>
        <defs>
          <linearGradient id="incomeFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22C55E" stopOpacity={0.25} />
            <stop offset="100%" stopColor="#22C55E" stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="loansFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#F59E0B" stopOpacity={0.25} />
            <stop offset="100%" stopColor="#F59E0B" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="month" />
        <YAxis
          domain={[0, axisTicks[axisTicks.length - 1]]}
          ticks={axisTicks}
          tickFormatter={formatAxisValue}
          width={48}
        />
        <Tooltip formatter={(value: any) => formatCurrency(Number(value))} />
        <Area
          type="monotone"
          dataKey="income"
          name="Ingresos"
          stroke="#22C55E"
          strokeWidth={2}
          fill="url(#incomeFill)"
          stackId="1"
        />
        <Area
          type="monotone"
          dataKey="loans"
          name="Prestado"
          stroke="#F59E0B"
          strokeWidth={2}
          fill="url(#loansFill)"
          stackId="1"
        />
        <Legend
          verticalAlign="bottom"
          height={24}
          iconType="plainline"
          formatter={(value: string) => (
            <span className="text-xs text-muted-foreground">{value}</span>
          )}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}