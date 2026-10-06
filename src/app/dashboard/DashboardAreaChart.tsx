'use client'

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { formatCurrency } from '@/lib/utils'

interface Props {
  data: { month: string; income: number; loans: number }[]
}

export default function DashboardAreaChart({ data }: Props) {
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
        <YAxis />
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