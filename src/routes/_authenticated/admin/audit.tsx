import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Download, FileText, Search } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app-shell";
import { AuditRowItem } from "@/components/admin/shared";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAdminAudit, type AuditRow } from "@/lib/admin";
import { ACTION_LABELS, ENTITY_LABELS, actionLabel, detailsSummary, entityOptions } from "@/lib/audit-ui";
import { buildCsv, downloadCsv } from "@/lib/csv";
import { formatDateTime } from "@/lib/finance";

const PAGE_SIZE = 50;

export const Route = createFileRoute("/_authenticated/admin/audit")({
  component: AdminAudit,
});

function AdminAudit() {
  const [q, setQ] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [userFilter, setUserFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [entityFilter, setEntityFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [loaded, setLoaded] = useState<AuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [users, setUsers] = useState<{ id: string; label: string }[]>([]);

  const filters = {
    limit,
    ...(userFilter ? { user: userFilter } : {}),
    ...(actionFilter ? { action: actionFilter } : {}),
    ...(entityFilter ? { entity: entityFilter } : {}),
    ...(q ? { q } : {}),
    ...(fromDate ? { from: fromDate } : {}),
    ...(toDate ? { to: toDate } : {}),
  };

  const { data, isLoading, error: loadError, isFetching } = useAdminAudit(filters);

  useEffect(() => {
    if (!data) return;
    setLoaded(data.rows);
    setTotal(data.total);
    setUsers(data.users);
  }, [data]);

  const hasFilters = !!(q || userFilter || actionFilter || entityFilter || fromDate || toDate);

  function clearFilters() {
    setQ("");
    setSearchInput("");
    setUserFilter("");
    setActionFilter("");
    setEntityFilter("");
    setFromDate("");
    setToDate("");
    setLimit(PAGE_SIZE);
  }

  function exportarCsv() {
    if (!loaded.length) {
      toast.error("No hay eventos cargados para exportar");
      return;
    }
    const csv = buildCsv(
      ["Fecha", "Usuario", "Evento", "Entidad", "Detalle"],
      loaded.map((l) => [
        formatDateTime(l.created_at),
        l.user_name,
        actionLabel(l.action),
        (l.entity_type && ENTITY_LABELS[l.entity_type]) || l.entity_type || "",
        detailsSummary(l.entity_type ?? "", l.details),
      ]),
    );
    downloadCsv(`auditoria-${new Date().toISOString().slice(0, 10)}.csv`, csv);
    toast.success("CSV descargado");
  }

  return (
    <>
      <PageHeader
        title="Auditoría"
        subtitle="Actividad de todos los suscriptores de la plataforma"
        action={
          <Button variant="secondary" onClick={exportarCsv}>
            <Download className="mr-1 size-4" /> Exportar CSV
          </Button>
        }
      />

      {loadError && <Alert variant="destructive">{loadError.message}</Alert>}

      <div className="mb-4 flex flex-wrap items-end gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-11 pl-9"
            placeholder="Buscar por usuario, acción o entidad (Enter)..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") setQ(searchInput.trim());
            }}
          />
        </div>
        <Select value={userFilter || "all"} onValueChange={(v) => setUserFilter(v === "all" ? "" : v)}>
          <SelectTrigger className="h-11 w-[170px]">
            <SelectValue placeholder="Todos los usuarios" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los usuarios</SelectItem>
            {users.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={actionFilter || "all"} onValueChange={(v) => setActionFilter(v === "all" ? "" : v)}>
          <SelectTrigger className="h-11 w-[170px]">
            <SelectValue placeholder="Toda acción" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toda acción</SelectItem>
            {Object.keys(ACTION_LABELS).map((a) => (
              <SelectItem key={a} value={a}>
                {ACTION_LABELS[a]?.label ?? a}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={entityFilter || "all"} onValueChange={(v) => setEntityFilter(v === "all" ? "" : v)}>
          <SelectTrigger className="h-11 w-[160px]">
            <SelectValue placeholder="Toda entidad" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toda entidad</SelectItem>
            {entityOptions().map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Desde</Label>
          <Input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="h-11 min-w-0"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Hasta</Label>
          <Input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="h-11 min-w-0"
          />
        </div>
        {hasFilters && (
          <button
            onClick={clearFilters}
            className="min-h-11 px-3 text-sm text-muted-foreground hover:text-foreground"
          >
            Limpiar
          </button>
        )}
      </div>

      {isLoading ? (
        <p className="p-4 text-sm text-muted-foreground">Cargando auditoría…</p>
      ) : loaded.length === 0 ? (
        <div className="rounded-xl border bg-card py-12 text-center">
          <FileText className="mx-auto mb-3 size-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Sin eventos para los filtros seleccionados.</p>
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border bg-card">
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <FileText className="size-4 text-muted-foreground" />
              <p className="font-display text-sm font-semibold">Últimas acciones de la plataforma</p>
              <span className="ml-auto text-xs text-muted-foreground">{total} evento{total === 1 ? "" : "s"}</span>
            </div>
            <ul className="divide-y divide-border">
              {loaded.map((l) => (
                <AuditRowItem key={l.id} row={l} />
              ))}
            </ul>
          </div>
          {loaded.length < total && (
            <div className="flex justify-center">
              <Button variant="ghost" disabled={isFetching} onClick={() => setLimit((v) => v + PAGE_SIZE)}>
                Cargar más
              </Button>
            </div>
          )}
        </>
      )}
    </>
  );
}
