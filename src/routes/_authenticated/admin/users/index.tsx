import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Building2, Download, Search, Users, Wallet } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app-shell";
import { Kpi } from "@/components/admin/shared";
import { NegocioCard } from "@/components/admin/negocio-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PLANES, PLAN_LABEL, PLAN_PRECIO, useAdminData } from "@/lib/admin";
import { buildCsv, downloadCsv } from "@/lib/csv";

export const Route = createFileRoute("/_authenticated/admin/users/")({
  component: AdminUsers,
});

function AdminUsers() {
  const { data, isLoading } = useAdminData();
  const [q, setQ] = useState("");
  const [plan, setPlan] = useState("todos");
  const [estado, setEstado] = useState("todos");

  const negocios = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (data?.negocios ?? []).filter((n) => {
      const okPlan = plan === "todos" || n.plan === plan;
      const okEstado =
        estado === "todos" ||
        (estado === "bloqueado" ? n.blocked : !n.blocked && n.plan_status === estado);
      const okTexto =
        !term ||
        n.business_name.toLowerCase().includes(term) ||
        (n.owner_name ?? "").toLowerCase().includes(term) ||
        (n.phone ?? "").includes(term);
      return okPlan && okEstado && okTexto;
    });
  }, [data, q, plan, estado]);

  const kpis = useMemo(() => {
    const ns = data?.negocios ?? [];
    return {
      negocios: ns.length,
      activos: ns.filter((n) => n.plan_status !== "suspendido" && !n.blocked).length,
      mrr: ns
        .filter((n) => n.plan_status === "activo" && !n.blocked)
        .reduce((s, n) => s + (PLAN_PRECIO[n.plan] ?? 0), 0),
      bloqueados: ns.filter((n) => n.blocked).length,
    };
  }, [data]);

  function exportarCsv() {
    if (!negocios.length) {
      toast.error("No hay filas para exportar");
      return;
    }
    const csv = buildCsv(
      ["Negocio", "Dueño", "Teléfono", "Plan", "Estado", "Vence", "Clientes", "Préstamos (activos/total)", "Capital", "Cobrado"],
      negocios.map((n) => [
        n.business_name,
        n.owner_name ?? "",
        n.phone ?? "",
        PLAN_LABEL[n.plan] ?? n.plan,
        n.blocked ? "Bloqueado" : n.plan_status,
        n.plan_renews_at ? n.plan_renews_at.slice(0, 10) : "",
        n.clientes,
        `${n.prestamosActivos}/${n.prestamos}`,
        Math.round(n.capital),
        Math.round(n.cobrado),
      ]),
    );
    downloadCsv(`suscriptores-${new Date().toISOString().slice(0, 10)}.csv`, csv);
    toast.success("CSV descargado");
  }

  return (
    <>
      <PageHeader
        title="Usuarios"
        subtitle="Suscriptores de tu plataforma: plan, estado y acceso"
        action={
          <Button variant="secondary" onClick={exportarCsv}>
            <Download className="mr-1 size-4" /> Exportar CSV
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Suscriptores" value={String(kpis.negocios)} hint={`${kpis.activos} activos`} icon={Building2} />
        <Kpi label="Ingreso mensual estimado" money={kpis.mrr} hint="Según plan asignado" icon={Wallet} />
        <Kpi label="Bloqueados" value={String(kpis.bloqueados)} hint="Sin acceso" icon={Users} />
        <Kpi label="Deudores registrados" value={String(data?.totalClientes ?? 0)} hint="En toda la plataforma" icon={Users} />
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-11 pl-9"
            placeholder="Buscar suscriptor, dueño o teléfono"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <Select value={plan} onValueChange={setPlan}>
          <SelectTrigger className="h-11 w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los planes</SelectItem>
            {PLANES.map((p) => (
              <SelectItem key={p} value={p}>
                {PLAN_LABEL[p]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={estado} onValueChange={setEstado}>
          <SelectTrigger className="h-11 w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los estados</SelectItem>
            <SelectItem value="activo">Activos</SelectItem>
            <SelectItem value="prueba">En prueba</SelectItem>
            <SelectItem value="suspendido">Suspendidos</SelectItem>
            <SelectItem value="bloqueado">Bloqueados</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="mt-4 space-y-3">
        {isLoading && <p className="text-sm text-muted-foreground">Cargando negocios…</p>}
        {!isLoading && !negocios.length && (
          <p className="text-sm text-muted-foreground">No hay suscriptores con esos filtros.</p>
        )}
        {negocios.map((n) => (
          <NegocioCard key={n.id} negocio={n} />
        ))}
      </div>
    </>
  );
}
