import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowUpRight,
  Building2,
  CalendarPlus,
  HandCoins,
  MinusCircle,
  ShieldCheck,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { Money } from "@/components/money";
import { Kpi, invalidateAdminQueries } from "@/components/admin/shared";
import { Button } from "@/components/ui/button";
import { extendSubscriptionDays, PLAN_LABEL, useAdminData } from "@/lib/admin";
import { formatDate, MONTHS_ES } from "@/lib/finance";

export const Route = createFileRoute("/_authenticated/admin/")({
  component: AdminResumen,
});

function monthLabel(key: string): string {
  const parts = key.split("-").map(Number);
  const y = parts[0] ?? 2026;
  const m = parts[1] ?? 1;
  return MONTHS_ES[m - 1] ?? '';
}

function AdminResumen() {
  const { data, isLoading } = useAdminData();

  const stats = useMemo(() => {
    const ns = data?.negocios ?? [];
    const ps = data?.pagosStats;
    const activos = ns.filter((n) => n.plan_status !== "suspendido" && !n.blocked);
    const precio = (n: (typeof ns)[number]) => Number(n.plan_price || 0);
    const mrr = activos
      .filter((n) => n.plan_status === "activo")
      .reduce((s, n) => s + precio(n), 0);
    const conversion = ns.length && ps ? Math.round((ps.confirmadosUsers / ns.length) * 100) : 0;
    const porVencer = activos.filter((n) => {
      if (!n.plan_renews_at) return false;
      const diff = new Date(n.plan_renews_at).getTime() - Date.now();
      return diff <= 7 * 24 * 60 * 60 * 1000; // incluye ya vencidos (como GP)
    });
    const porPlan = new Map<string, number>();
    for (const n of ns) {
      const k = PLAN_LABEL[n.plan] ?? n.plan_display ?? n.plan;
      porPlan.set(k, (porPlan.get(k) ?? 0) + 1);
    }
    const porMes = (ps?.monthKeys ?? []).map((k) => ({
      key: k,
      label: monthLabel(k),
      total: ps?.byMonth[k] ?? 0,
    }));
    const maxMes = Math.max(1, ...porMes.map((x) => x.total));
    return {
      negocios: ns.length,
      activos: activos.length,
      pagan: activos.filter((n) => precio(n) > 0).length,
      mrr,
      totalCobrado: ps?.totalCobrado ?? 0,
      pendientes: ps?.counts.pending ?? 0,
      conversion,
      trial: ns.filter((n) => n.plan_status === "prueba").length,
      vencidos: ns.filter((n) => n.plan_status === "suspendido" || n.blocked).length,
      porVencer,
      porPlan: [...porPlan.entries()],
      porMes,
      maxMes,
      recientes: ps?.recientes ?? [],
    };
  }, [data]);

  return (
    <>
      <PageHeader title="Resumen" subtitle="Salud de tu plataforma SaaS" />

      {isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Suscriptores activos" value={String(stats.activos)} hint={`de ${stats.negocios} suscriptores`} icon={Users} />
        <Kpi label="Suscriptores que pagan" value={String(stats.pagan)} hint="Plan de pago activo" icon={ShieldCheck} />
        <Kpi label="Ingreso mensual (MRR)" money={stats.mrr} hint="Según planes activos" icon={Wallet} />
        <Kpi label="Total cobrado" money={stats.totalCobrado} hint="Suscripciones confirmadas" icon={HandCoins} />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Trial → Pago" value={`${stats.conversion}%`} hint="Suscriptores con al menos un pago" icon={ArrowUpRight} />
        <Kpi label="En prueba (trial)" value={String(stats.trial)} hint="Sin pagar todavía" icon={Wallet} />
        <Kpi label="Vencidas / bloqueados" value={String(stats.vencidos)} hint="Requieren atención" icon={MinusCircle} />
        <Kpi label="Pagos pendientes" value={String(stats.pendientes)} hint="Por confirmar" icon={TrendingUp} />
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <div className="surface p-4 lg:col-span-2">
          <p className="font-display text-sm font-semibold">Ingresos por mes</p>
          <p className="text-xs text-muted-foreground">Pagos de suscripción confirmados (últimos 6 meses)</p>
          <div className="mt-4 flex h-44 items-end gap-2">
            {stats.porMes.map((x) => (
              <div key={x.key} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                <span className="num text-[11px] font-semibold">
                  {x.total > 0 ? `${Math.round(x.total / 1000)}k` : "—"}
                </span>
                <div className="flex h-28 w-full items-end rounded-lg bg-secondary">
                  <div
                    className="w-full rounded-lg bg-primary/80"
                    style={{ height: `${Math.max(2, (x.total / stats.maxMes) * 100)}%` }}
                  />
                </div>
                <span className="text-[11px] capitalize text-muted-foreground">{x.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="surface p-4">
          <p className="font-display text-sm font-semibold">Usuarios por plan</p>
          <ul className="mt-3 space-y-2">
            {stats.porPlan.map(([plan, n]) => (
              <li key={plan} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <Building2 className="size-4 text-muted-foreground" />
                  {plan}
                </span>
                <span className="num font-bold">{n}</span>
              </li>
            ))}
            {!stats.porPlan.length && (
              <li className="text-sm text-muted-foreground">Sin suscriptores todavía.</li>
            )}
          </ul>

          {!!stats.porVencer.length && (
            <div className="mt-4 border-t border-border pt-3">
              <p className="font-display text-sm font-semibold">Por vencer (≤7 días)</p>
              <ul className="mt-2 space-y-1.5">
                {stats.porVencer.map((n) => (
                  <li key={n.id} className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span className="min-w-0 truncate">
                      <Link
                        to="/admin/users/$id"
                        params={{ id: n.id }}
                        className="font-semibold text-foreground hover:underline"
                      >
                        {n.business_name}
                      </Link>{" "}
                      · {expiringLabel(n.plan_renews_at)}
                    </span>
                    <ExtendButton userId={n.id} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      <div className="surface mt-3 p-4">
        <p className="font-display text-sm font-semibold">Últimos pagos</p>
        {!stats.recientes.length && (
          <p className="mt-2 text-sm text-muted-foreground">Sin pagos registrados.</p>
        )}
        <ul className="mt-2 divide-y divide-border">
          {stats.recientes.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className="min-w-0 truncate">
                {p.business_name}
                <span className="ml-2 text-xs text-muted-foreground">
                  {formatDate(p.payment_date)} · {p.status === "confirmed" ? "confirmado" : p.status}
                </span>
              </span>
              <Money value={p.amount} className="num shrink-0 font-bold" />
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}




function expiringLabel(endsAt: string | null): string {
  if (!endsAt) return "—";
  const days = Math.ceil((new Date(endsAt).getTime() - Date.now()) / 86400000);
  const fecha = endsAt.slice(0, 10).split("-").reverse().join("/");
  return days <= 0 ? `venció el ${fecha}` : `vence en ${days} día${days === 1 ? "" : "s"} (${fecha})`;
}

function ExtendButton({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="sm"
      variant="secondary"
      className="h-8 shrink-0 gap-1 px-2 text-[11px]"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        extendSubscriptionDays(userId, 30)
          .then(() => {
            toast.success("Suscripción extendida 30 días");
            invalidateAdminQueries(queryClient);
          })
          .catch((e: Error) => toast.error(e.message))
          .finally(() => setBusy(false));
      }}
    >
      <CalendarPlus className="size-3.5" /> +30d
    </Button>
  );
}
