import { useMemo } from "react";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { rd } from "@/lib/finance";

export type MesCobro = {
  mes: string; // YYYY-MM
  capital: number;
  interes: number;
  mora: number;
};

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function etiquetaMes(key: string) {
  const [y, m] = key.split("-");
  const idx = Number(m ?? 1) - 1;
  return `${MESES[idx] ?? m} ${String(y ?? "").slice(2)}`;
}

function compacto(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return String(Math.round(n));
}

const SERIES = [
  { key: "capital", label: "Capital", color: "var(--color-primary)" },
  { key: "interes", label: "Interés", color: "var(--color-accent)" },
  { key: "mora", label: "Mora", color: "var(--color-destructive)" },
] as const;

export function CollectionsChart({ data }: { data: MesCobro[] }) {
  const rows = useMemo(
    () =>
      data.map((d) => ({
        ...d,
        label: etiquetaMes(d.mes),
        total: d.capital + d.interes + d.mora,
      })),
    [data],
  );

  const total = rows.reduce((s, r) => s + r.total, 0);
  const promedio = rows.length ? total / rows.length : 0;
  const mejor = rows.reduce<(typeof rows)[number] | null>(
    (best, r) => (!best || r.total > best.total ? r : best),
    null,
  );

  if (!rows.length) {
    return (
      <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-dashed border-border text-center">
        <p className="text-sm font-medium">Sin cobros en este rango</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Ajusta las fechas o registra un pago para ver la gráfica.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        {SERIES.map((s) => (
          <span key={s.key} className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="size-2.5 rounded-full" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
        <span className="ml-auto text-xs text-muted-foreground">
          Promedio mensual <strong className="num text-foreground">{rd(promedio)}</strong>
          {mejor && (
            <>
              {" · "}Mejor mes <strong className="text-foreground">{mejor.label}</strong>
            </>
          )}
        </span>
      </div>

      <div className="mt-4 h-72">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} barGap={0}>
            <defs>
              <linearGradient id="grad-total" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.22} />
                <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--color-border)" strokeDasharray="2 6" vertical={false} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
              dy={6}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={44}
              tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
              tickFormatter={compacto}
            />
            <Tooltip
              cursor={{ fill: "var(--color-muted)", opacity: 0.35 }}
              content={<ChartTooltip />}
            />
            <Area
              type="monotone"
              dataKey="total"
              stroke="var(--color-primary)"
              strokeWidth={2}
              fill="url(#grad-total)"
              dot={false}
              activeDot={{ r: 4 }}
            />
            <Bar dataKey="capital" stackId="a" fill="var(--color-primary)" maxBarSize={34} />
            <Bar dataKey="interes" stackId="a" fill="var(--color-accent)" maxBarSize={34} />
            <Bar
              dataKey="mora"
              stackId="a"
              fill="var(--color-destructive)"
              maxBarSize={34}
              radius={[6, 6, 0, 0]}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { payload: MesCobro & { label: string; total: number } }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div className="rounded-xl border border-border bg-card p-3 shadow-lg">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="num font-display text-lg font-bold">{rd(d.total)}</p>
      <div className="mt-2 space-y-1">
        {SERIES.map((s) => (
          <div key={s.key} className="flex items-center gap-2 text-xs">
            <span className="size-2 rounded-full" style={{ background: s.color }} />
            <span className="text-muted-foreground">{s.label}</span>
            <span className="num ml-auto font-medium">{rd(d[s.key])}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
