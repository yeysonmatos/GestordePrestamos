import { cn } from "@/lib/utils";
import { rd } from "@/lib/finance";
import type { InstallmentStatus } from "@/lib/finance";
import { STATUS_LABEL } from "@/lib/finance";

export function Money({
  value,
  className,
  sign,
}: {
  value: number | null | undefined;
  className?: string;
  sign?: boolean;
}) {
  const n = Number(value ?? 0);
  return (
    <span className={cn("num tabular-nums", className)}>
      {sign && n > 0 ? "+" : ""}
      {rd(n)}
    </span>
  );
}

const chipStyles: Record<InstallmentStatus, string> = {
  pagada: "bg-success/12 text-success border-success/25",
  parcial: "bg-info/12 text-info border-info/25",
  vencida: "bg-destructive/12 text-destructive border-destructive/25",
  pendiente: "bg-muted text-muted-foreground border-border",
};

export function StatusChip({ status, className }: { status: InstallmentStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        chipStyles[status],
        className,
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

export function Chip({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: "neutral" | "accent" | "success" | "danger" | "info";
  className?: string;
}) {
  const tones = {
    neutral: "bg-muted text-muted-foreground border-border",
    accent: "bg-accent/15 text-accent-foreground border-accent/30",
    success: "bg-success/12 text-success border-success/25",
    danger: "bg-destructive/12 text-destructive border-destructive/25",
    info: "bg-info/12 text-info border-info/25",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
