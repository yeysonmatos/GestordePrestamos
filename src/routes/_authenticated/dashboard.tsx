import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle, ArrowUpRight, CalendarClock, Users, Wallet } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { Money } from "@/components/money";

import { Button } from "@/components/ui/button";
import { useDashboardSummary, useSubscription } from "@/lib/db";
import { useEntitlements } from "@/lib/entitlements";
import { formatDate, rd, todaySD, daysBetween, MONTHS_ES } from "@/lib/finance";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Inicio | Gestor de Prestamos" },
      {
        name: "description",
        content: "Resumen de tu cartera: capital, cobros del día y morosidad.",
      },
      { property: "og:title", content: "Inicio | Gestor de Prestamos" },
      { property: "og:description", content: "Resumen diario de tu cartera de préstamos." },
    ],
  }),
  component: Dashboard,
});

function Kpi({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "accent" | "success" | "danger";
}) {
  const bar =
    tone === "accent"
      ? "bg-accent"
      : tone === "success"
        ? "bg-success"
        : tone === "danger"
          ? "bg-destructive"
          : "bg-primary";
  return (
    <div className="surface relative overflow-hidden p-4">
      <span className={`absolute inset-y-0 left-0 w-1 ${bar}`} />
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="num mt-2 font-display text-xl font-bold sm:text-2xl">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Dashboard() {
  const { data: __ent } = useEntitlements();
  const __readOnly = __ent?.readOnly ?? false;
  // Todo el resumen lo calcula la base en UNA sola llamada (RPC dashboard_summary):
  // antes esta pantalla descargaba todos los préstamos, clientes, cuotas y pagos
  // del usuario y calculaba en el navegador (lento con historial grande).
  const { data: summary } = useDashboardSummary();
  const { data: sub } = useSubscription();
  const today = todaySD();

  const subExpired = !!sub?.ends_at && daysBetween(today, sub.ends_at.slice(0, 10)) < 0;
  const subDaysLeft = sub?.ends_at
    ? Math.max(0, daysBetween(today, sub.ends_at.slice(0, 10)))
    : null;
  const subExpiringSoon =
    !!sub && !subExpired && subDaysLeft !== null && sub.status !== "cancelled" && subDaysLeft <= 3;

  const stats = {
    capitalPrestado: Number(summary?.capital_prestado ?? 0),
    capitalRecuperado: Number(summary?.capital_recuperado ?? 0),
    interesGanado: Number(summary?.interes_ganado ?? 0),
    porCobrar: Number(summary?.por_cobrar ?? 0),
    enMora: Number(summary?.en_mora ?? 0),
    vencidasCount: Number(summary?.vencidas_count ?? 0),
    clientesMorosos: Number(summary?.clientes_morosos ?? 0),
    cobroHoy: Number(summary?.cobro_hoy ?? 0),
    hoyCount: Number(summary?.hoy_count ?? 0),
    proximos: summary?.proximos ?? [],
    activos: Number(summary?.activos ?? 0),
    clientesActivos: Number(summary?.clientes_activos ?? 0),
    loansTotal: Number(summary?.loans_total ?? 0),
  };

  const chartData = useMemo(
    () =>
      (summary?.meses ?? []).map((m) => ({
        key: m.key,
        label: MONTHS_ES[Number(m.key.slice(5, 7)) - 1] ?? "",
        ingresos: Number(m.ingresos ?? 0),
        prestado: Number(m.prestado ?? 0),
      })),
    [summary],
  );

  return (
    <>
      <PageHeader
        title="Resumen"
        subtitle={`Hoy, ${formatDate(today)} · Santo Domingo`}
        action={
          <Button asChild variant="accent">
            <Link to="/collections">Ir a cobros</Link>
          </Button>
        }
      />

      {sub && subExpired && (
        <div className="mb-4 rounded-xl border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Tu plan {sub.plan_name} venció el {formatDate(sub.ends_at)}. Contacta al administrador
          para renovar tu mensualidad.
          <Link to="/account" className="ml-2 font-semibold underline">
            Ver mi plan
          </Link>
        </div>
      )}
      {sub && subExpiringSoon && (
        <div className="mb-4 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning-foreground">
          Tu plan {sub.plan_name} vence en{" "}
          {subDaysLeft === 0 ? "hoy" : `${subDaysLeft} día${subDaysLeft === 1 ? "" : "s"}`} (
          {formatDate(sub.ends_at)}). Contacta al administrador para renovar y evitar la suspensión.
          <Link to="/account" className="ml-2 font-semibold underline">
            Ver mi plan
          </Link>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label="Capital prestado"
          value={rd(stats.capitalPrestado)}
          hint={`${stats.activos} préstamos en curso`}
        />
        <Kpi
          label="Capital recuperado"
          value={rd(stats.capitalRecuperado)}
          tone="success"
          hint="Cuotas + Abonos"
        />
        <Kpi
          label="Intereses + mora"
          value={rd(stats.interesGanado)}
          tone="accent"
          hint="Ganancia cobrada"
        />
        <Kpi
          label="Vencidos"
          value={rd(stats.enMora)}
          tone="danger"
          hint={`${stats.clientesMorosos} clientes atrasados`}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="surface flex items-center gap-4 p-4">
          <div className="rounded-xl bg-accent/15 p-3">
            <CalendarClock className="size-5 text-accent-foreground" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Cobros de hoy</p>
            <p className="num font-display text-lg font-bold">{rd(stats.cobroHoy)}</p>
            <p className="text-xs text-muted-foreground">{stats.hoyCount} cuotas</p>
          </div>
        </div>
        <div className="surface flex items-center gap-4 p-4">
          <div className="rounded-xl bg-destructive/12 p-3">
            <AlertTriangle className="size-5 text-destructive" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Cobros vencidos</p>
            <p className="num font-display text-lg font-bold">{stats.vencidasCount}</p>
            <p className="text-xs text-muted-foreground">Requieren gestión</p>
          </div>
        </div>
        <div className="surface flex items-center gap-4 p-4">
          <div className="rounded-xl bg-info/12 p-3">
            <Users className="size-5 text-info" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Clientes activos
            </p>
            <p className="num font-display text-lg font-bold">{stats.clientesActivos}</p>
            <p className="text-xs text-muted-foreground">
              Capital por cobrar {rd(stats.porCobrar)}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <div className="surface p-4 lg:col-span-3">
          <h2 className="font-display text-base font-semibold">Ingresos vs. préstamos otorgados</h2>
          <p className="mb-4 text-xs text-muted-foreground">Últimos 6 meses</p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ left: -12, right: 8, top: 8 }}>
                <defs>
                  <linearGradient id="gIngresos" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-success)" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="var(--color-success)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gPrestado" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-accent)" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="var(--color-accent)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--color-border)"
                  vertical={false}
                />
                <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                  tickFormatter={(v: number) =>
                    v >= 1000
                      ? `${(v / 1000).toFixed(v >= 100000 ? 0 : 1).replace(/\.0$/, "")}k`
                      : `${v}`
                  }
                />
                <Tooltip
                  formatter={(v: number) => rd(v)}
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid var(--color-border)",
                    background: "var(--color-card)",
                  }}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                <Area
                  type="monotone"
                  name="Ingresos"
                  dataKey="ingresos"
                  stroke="var(--color-success)"
                  fill="url(#gIngresos)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  name="Prestado"
                  dataKey="prestado"
                  stroke="var(--color-accent)"
                  fill="url(#gPrestado)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="surface p-4 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-base font-semibold">Próximos pagos</h2>
            <Link to="/calendar" className="text-xs font-semibold text-muted-foreground underline">
              Ver calendario
            </Link>
          </div>
          {stats.proximos.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No hay cuotas en los próximos 7 días.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {stats.proximos.map((i) => (
                <li
                  key={`${i.loan_id}-${i.number}`}
                  className="flex items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{i.client_name ?? "Cliente"}</p>
                    <p className="text-xs text-muted-foreground">
                      Cuota {i.number} · {formatDate(i.due_date)}
                    </p>
                  </div>
                  <Money value={Number(i.pending)} className="text-sm font-semibold" />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {stats.loansTotal === 0 && (
        <div className="surface mt-4 flex flex-col items-center gap-3 p-10 text-center">
          <Wallet className="size-8 text-accent" />
          <h2 className="font-display text-lg font-semibold">Aún no tienes préstamos</h2>
          <p className="max-w-sm text-sm text-muted-foreground">
            Registra tu primer cliente y crea un préstamo para ver aquí tus cobros y ganancias.
          </p>
          {!__readOnly && (
            <Button asChild variant="accent">
              <Link to="/clients/new">
                Agregar cliente <ArrowUpRight className="size-4" />
              </Link>
            </Button>
          )}
        </div>
      )}
    </>
  );
}
