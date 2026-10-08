import { cn } from '@/lib/utils'

type BadgeVariant = 'active' | 'paid' | 'cancelled' | 'default' | 'late' | 'late_1_30' | 'late_31_60' | 'late_61_90' | 'success' | 'info'

interface BadgeProps {
  variant: BadgeVariant
  children: React.ReactNode
}

const styles: Record<BadgeVariant, string> = {
  active: 'bg-warning-light text-warning',
  paid: 'bg-success-light text-success',
  late: 'bg-red-100 text-destructive',
  late_1_30: 'bg-amber-50 text-amber-700',
  late_31_60: 'bg-orange-50 text-orange-700',
  late_61_90: 'bg-red-50 text-red-700',
  cancelled: 'bg-muted text-muted-foreground',
  success: 'bg-emerald-50 text-emerald-700',
  info: 'bg-primary/10 text-primary',
  default: 'bg-primary-light text-primary',
}

export default function Badge({ variant, children }: BadgeProps) {
  return (
    <span className={cn(
      'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
      styles[variant]
    )}>
      {children}
    </span>
  )
}
