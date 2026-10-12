import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Download, Lock, Printer } from "lucide-react";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { PageHeader } from "@/components/app-shell";
import { CollectionsChart } from "@/components/collections-chart";
import { Button } from "@/components/ui/button";
import { reportsBlocked, useEntitlements } from "@/lib/entitlements";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Money } from "@/components/money";
import { useAllInstallments, useAllPayments, useLoans } from "@/lib/db";
import { csvDownload } from "@/lib/actions";
import { formatDate, rd, todaySD } from "@/lib/finance";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({
    meta: [
      { title: "Reportes | Gestor de Prestamos" },
      { name: "description", content: "Ingresos, cartera y morosidad por rango de fechas, con exportación." },
      { property: "og:title", content: "Reportes | Gestor de Prestamos" },
      { property: "og:description", content: "Resultados de tu cartera por rango de fechas." },
    ],
  }),
  component: ReportsGate,
});

function ReportsGate() {
  const { data: ent } = useEntitlements();
  if (ent && reportsBlocked(ent.planName, ent.isAdmin)) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-secondary">
          <Lock className="size-7 text-muted-foreground" />
        </div>
        <h1 className="font-display text-xl font-bold">Reportes no incluidos en tu plan</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Tu plan <strong>Básico</strong> no incluye reportes. Mejora a <strong>Pro</strong> para
          desbloquearlos, o contacta al administrador.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Button asChild variant="accent">
            <Link to="/pricing">Ver planes</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link to="/dashboard">Volver al panel</Link>
          </Button>
        </div>
      </div>
    );
  }
  return <Reports />;
}

function Reports() {
  const { data: payments = [] } = useAllPayments();
  const { data: installments = [] } = useAllInstallments();
  const { data: loans = [] } = useLoans();
  const today = todaySD();
  const [desde, setDesde] = useState(`${today.slice(0, 4)}-01-01`);
  const [hasta, setHasta] = useState(today);

  const inRange = useMemo(
    () =>
      payments.filter((p) => {
        const d = p.paid_at.slice(0, 10);
        return d >= desde && d <= hasta;
      }),
    [payments, desde, hasta],
  );

  const totals = useMemo(() => {
    const cobrado = inRange.reduce((s, p) => s + Number(p.amount), 0);
    const interes = inRange.reduce((s, p) => s + Number(p.interest_portion), 0);
    const capital = inRange.reduce((s, p) => s + Number(p.principal_portion), 0);
    const mora = inRange.reduce((s, p) => s + Number(p.late_fee), 0);
    return { cobrado, interes, capital, mora };
  }, [inRange]);

  const cartera = useMemo(() => {
    // Fotografía de la cartera al cierre del rango (hasta), no solo "hoy".
    const lateRef = hasta < today ? hasta : today;
    let alDia = 0;
    let vencido = 0;
    const aging = { d1_30: 0, d31_60: 0, d61_90: 0, d90plus: 0 };
    for (const i of installments) {
      if (i.loan?.status !== "en_curso") continue;
      const due = i.due_date.slice(0, 10);
      if (due > hasta) continue; // aún no existía al cierre del rango
      const pending = Number(i.total_amount) - Number(i.paid_amount);
      if (pending <= 0) continue;
      if (due >= lateRef) {
        alDia += pending;
        continue;
      }
      vencido += pending;
      const days = Math.floor((Date.parse(lateRef) - Date.parse(due)) / 86400000);
      if (days <= 30) aging.d1_30 += pending;
      else if (days <= 60) aging.d31_60 += pending;
      else if (days <= 90) aging.d61_90 += pending;
      else aging.d90plus += pending;
    }
    const total = alDia + vencido;
    return { alDia, vencido, total, tasa: total ? (vencido / total) * 100 : 0, aging };
  }, [installments, hasta, today]);

  const porMes = useMemo(() => {
    const map = new Map<string, { mes: string; capital: number; interes: number; mora: number }>();
    for (const p of inRange) {
      const key = p.paid_at.slice(0, 7);
      const cur = map.get(key) ?? { mes: key, capital: 0, interes: 0, mora: 0 };
      cur.capital += Number(p.principal_portion);
      cur.interes += Number(p.interest_portion);
      cur.mora += Number(p.late_fee);
      map.set(key, cur);
    }
    return [...map.values()].sort((a, b) => a.mes.localeCompare(b.mes));
  }, [inRange]);

  const pie = [
    { name: "Al día", value: Math.round(cartera.alDia) },
    { name: "1-30 días", value: Math.round(cartera.aging.d1_30) },
    { name: "31-60 días", value: Math.round(cartera.aging.d31_60) },
    { name: "61-90 días", value: Math.round(cartera.aging.d61_90) },
    { name: "90+ días", value: Math.round(cartera.aging.d90plus) },
  ].filter((s) => s.value > 0);
  const PIE_COLOR: Record<string, string> = {
    "Al día": "var(--color-success)",
    "1-30 días": "var(--color-warning)",
    "31-60 días": "#f97316",
    "61-90 días": "var(--color-destructive)",
    "90+ días": "#7f1d1d",
  };

  function exportar() {
    const rows: (string | number)[][] = [
      ["Fecha", "Tipo", "Método", "Monto", "Capital", "Interés", "Mora"],
      ...inRange.map((p) => [
        p.paid_at.slice(0, 10),
        p.kind,
        p.method,
        Number(p.amount),
        Number(p.principal_portion),
        Number(p.interest_portion),
        Number(p.late_fee),
      ]),
    ];
    csvDownload("reporte-cobros", rows);
  }

  return (
    <>
      <PageHeader
        title="Reportes"
        subtitle={`${formatDate(desde)} — ${formatDate(hasta)}`}
        action={
          <>
            <Button variant="secondary" onClick={exportar}>
              <Download className="size-4" /> Exportar CSV
            </Button>
            <Button variant="secondary" onClick={() => window.print()}>
              <Printer className="size-4" /> Imprimir
            </Button>
          </>
        }
      />

        <div className="no-print mb-4 grid w-full grid-cols-1 gap-3 sm:grid-cols-2 lg:max-w-md">
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="desde">Desde</Label>
          <Input id="desde" type="date" className="h-11 w-full min-w-0" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </div>
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="hasta">Hasta</Label>
          <Input id="hasta" type="date" className="h-11 w-full min-w-0" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card label="Cobrado" value={totals.cobrado} />
        <Card label="Ganancia (interés)" value={totals.interes} tone="success" />
        <Card label="Capital recuperado" value={totals.capital} />
        <Card label="Mora cobrada" value={totals.mora} tone="danger" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="surface p-5 lg:col-span-2">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-display text-base font-semibold">Cobros por mes</h2>
            <Money value={totals.cobrado} className="font-display text-sm font-bold" />
          </div>
          <CollectionsChart data={porMes} />
        </div>

        <div className="surface p-5">
          <h2 className="font-display text-base font-semibold">Estado de la cartera</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Morosidad {cartera.tasa.toFixed(1)}% sobre {rd(cartera.total)}
          </p>
          <div className="mt-2 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pie} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80}>
                  {pie.map((s) => (
                    <Cell key={s.name} fill={PIE_COLOR[s.name]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => rd(v)} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 space-y-1 text-xs">
            {(
              [
                ["1-30 días", cartera.aging.d1_30],
                ["31-60 días", cartera.aging.d31_60],
                ["61-90 días", cartera.aging.d61_90],
                ["Más de 90 días", cartera.aging.d90plus],
              ] as const
            ).map(([label, v]) => (
              <div key={label} className="flex items-center justify-between">
                <span className="text-muted-foreground">{label}</span>
                <Money value={v} className="font-semibold" />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="surface mt-4 p-5">
        <h2 className="font-display text-base font-semibold">Resumen de préstamos</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Mini
            label="En curso"
            value={loans.filter((l) => l.status === "en_curso" && String(l.start_date).slice(0, 10) <= hasta).length}
          />
          <Mini
            label="Pagados"
            value={loans.filter((l) => l.status === "pagado" && String(l.start_date).slice(0, 10) <= hasta).length}
          />
          <Mini label="Archivados" value={loans.filter((l) => l.status === "archivado").length} />
        </div>
      </div>
    </>
  );
}

function Card({ label, value, tone }: { label: string; value: number; tone?: "success" | "danger" }) {
  const color = tone === "success" ? "text-success" : tone === "danger" ? "text-destructive" : "";
  return (
    <div className="surface p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <Money value={value} className={`mt-1 block font-display text-lg font-bold ${color}`} />
    </div>
  );
}

function Mini({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-secondary p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="num font-display text-xl font-bold">{value}</p>
    </div>
  );
}
