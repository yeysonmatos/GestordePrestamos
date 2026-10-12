import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Banknote, Plus, Search } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Chip, Money } from "@/components/money";
import { useAllInstallments, useLoans } from "@/lib/db";
import { useEntitlements } from "@/lib/entitlements";
import {
  daysBetween,
  formatDate,
  installmentStatus,
  LOAN_STATUS_LABEL,
  rd,
  todaySD,
  FREQUENCIES,
} from "@/lib/finance";

export const Route = createFileRoute("/_authenticated/loans/")({
  head: () => ({
    meta: [
      { title: "Préstamos | Gestor de Prestamos" },
      { name: "description", content: "Todos tus préstamos con filtros por estado, tipo y frecuencia." },
      { property: "og:title", content: "Préstamos | Gestor de Prestamos" },
      { property: "og:description", content: "Cartera completa de préstamos." },
    ],
  }),
  component: LoansPage,
});

function LoansPage() {
  const { data: __ent } = useEntitlements();
  const __readOnly = __ent?.readOnly ?? false;
  const { data: loans = [], isLoading } = useLoans();
  const { data: installments = [] } = useAllInstallments();
  const [status, setStatus] = useState("en_curso");
  const [freq, setFreq] = useState("todas");
  const [type, setType] = useState("todos");
  const [q, setQ] = useState("");

  const balances = useMemo(() => {
    const hoy = todaySD();
    const map = new Map<string, { pendiente: number; vencidas: number; dias: number }>();
    for (const i of installments) {
      const cur = map.get(i.loan_id) ?? { pendiente: 0, vencidas: 0, dias: 0 };
      cur.pendiente += Math.max(Number(i.total_amount) - Number(i.paid_amount), 0);
      if (installmentStatus(i) === "vencida") {
        cur.vencidas += 1;
        cur.dias = Math.max(cur.dias, daysBetween(i.due_date, hoy));
      }
      map.set(i.loan_id, cur);
    }
    return map;
  }, [installments]);

  const rows = loans
    .filter((l) => (status === "todos" ? true : l.status === status))
    .filter((l) => (freq === "todas" ? true : l.frequency === freq))
    .filter((l) => (type === "todos" ? true : l.loan_type === type))
    .filter((l) => {
      const term = q.trim().toLowerCase();
      if (!term) return true;
      return (
        (l.client?.full_name ?? "").toLowerCase().includes(term) ||
        (l.client?.phone ?? "").includes(term) ||
        (l.loan_id ?? "").toLowerCase().includes(term)
      );
    });

  return (
    <>
      <PageHeader
        title="Préstamos"
        subtitle={`${rows.length} de ${loans.length}`}
        action={
          __readOnly ? undefined : (
            <Button asChild variant="accent">
              <Link to="/loans/new" search={{ client: undefined, edit: undefined }}>
                <Plus className="size-4" /> Nuevo préstamo
              </Link>
            </Button>
          )
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative sm:col-span-2 lg:col-span-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por cliente, teléfono o N° de préstamo"
            className="h-11 pl-9"
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-11">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los estados</SelectItem>
            <SelectItem value="en_curso">En curso</SelectItem>
            <SelectItem value="pagado">Pagados</SelectItem>
            <SelectItem value="archivado">Archivados</SelectItem>
          </SelectContent>
        </Select>
        <Select value={freq} onValueChange={setFreq}>
          <SelectTrigger className="h-11">
            <SelectValue placeholder="Frecuencia" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Toda frecuencia</SelectItem>
            {FREQUENCIES.map((f) => (
              <SelectItem key={f.value} value={f.value}>
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="h-11">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todo tipo</SelectItem>
            <SelectItem value="cuota_fija">Cuota fija</SelectItem>
            <SelectItem value="solo_interes">Solo interés</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : rows.length === 0 ? (
        <div className="surface flex flex-col items-center gap-3 p-10 text-center">
          <Banknote className="size-8 text-accent" />
          <p className="font-display text-lg font-semibold">No hay préstamos con estos filtros</p>
          {!__readOnly && (
            <Button asChild variant="accent">
              <Link to="/loans/new" search={{ client: undefined, edit: undefined }}>Crear préstamo</Link>
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          {rows.map((l) => {
            const b = balances.get(l.id) ?? { pendiente: 0, vencidas: 0, dias: 0 };
            return (
              <Link
                key={l.id}
                to="/loans/$id"
                params={{ id: l.id }}
                className="surface block p-4 transition-shadow hover:shadow-[var(--shadow-raised)]"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-display text-base font-semibold">
                      {l.client?.full_name ?? "Cliente"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {l.open_ended
                        ? `Abierto · ${l.interest_rate}%`
                        : `${l.term} cuotas ${l.frequency} · ${l.interest_rate}%`}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Chip
                      tone={l.status === "en_curso" ? "info" : l.status === "pagado" ? "success" : "neutral"}
                    >
                      {LOAN_STATUS_LABEL[l.status] ?? l.status}
                    </Chip>
                    {b.dias > 0 && <Chip tone="danger">Atrasado {b.dias}d</Chip>}
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <p className="text-muted-foreground">Capital</p>
                    <Money value={l.principal} className="font-semibold" />
                  </div>
                  <div>
                    <p className="text-muted-foreground">Por cobrar</p>
                    <Money value={l.open_ended ? l.remaining_amount : b.pendiente} className="font-semibold" />
                  </div>
                  <div>
                    <p className="text-muted-foreground">Inicio</p>
                    <p className="font-semibold">{formatDate(l.start_date)}</p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
