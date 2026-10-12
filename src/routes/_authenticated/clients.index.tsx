import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, Search, UserRound } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Chip } from "@/components/money";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useClients, useLoans, useSubscription } from "@/lib/db";
import { useEntitlements } from "@/lib/entitlements";
import { rd } from "@/lib/finance";

export const Route = createFileRoute("/_authenticated/clients/")({
  head: () => ({
    meta: [
      { title: "Clientes | Gestor de Prestamos" },
      { name: "description", content: "Listado de clientes con su cartera y estado." },
      { property: "og:title", content: "Clientes | Gestor de Prestamos" },
      { property: "og:description", content: "Administra tus clientes prestatarios." },
    ],
  }),
  component: ClientsPage,
});

const FILTERS = ["Todos", "Activos", "Inactivos"] as const;

function ClientsPage() {
  const { data: __ent } = useEntitlements();
  const __readOnly = __ent?.readOnly ?? false;
  const { data: clients = [], isLoading } = useClients();
  const { data: loans = [] } = useLoans();
  const { data: sub } = useSubscription();
  const limite = sub && sub.plan_price > 0 ? (sub.plan_max_clients ?? null) : null;
  const limiteAlcanzado = !!limite && clients.length >= limite;
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("Todos");
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    const byClient = new Map<string, { count: number; balance: number }>();
    for (const l of loans) {
      if (l.status === "archivado") continue;
      const cur = byClient.get(l.client_id) ?? { count: 0, balance: 0 };
      cur.count += 1;
      cur.balance += Number(l.principal);
      byClient.set(l.client_id, cur);
    }
    return clients
      .filter((c) =>
        filter === "Todos" ? true : filter === "Activos" ? c.active : !c.active,
      )
      .filter((c) => {
        const term = q.trim().toLowerCase();
        if (!term) return true;
        return (
          c.full_name.toLowerCase().includes(term) ||
          (c.cedula ?? "").toLowerCase().includes(term) ||
          (c.phone ?? "").includes(term)
        );
      })
      .map((c) => ({ ...c, stats: byClient.get(c.id) ?? { count: 0, balance: 0 } }));
  }, [clients, loans, filter, q]);

  return (
    <>
      <PageHeader
        title="Clientes"
        subtitle={`${clients.length} registrados`}
        action={
          __readOnly ? undefined : (
            <Button asChild variant={limiteAlcanzado ? "outline" : "accent"}>
              <Link to="/clients/new">
                <Plus className="size-4" /> Nuevo cliente
              </Link>
            </Button>
          )
        }
      />

      {limiteAlcanzado && (
        <Alert className="mb-4 border-warning/40 bg-warning/10">
          <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
            <span>
              Tu plan <strong>{sub?.plan_name}</strong> permite máximo <strong>{limite}</strong>{" "}
              clientes y ya tienes {clients.length}.
            </span>
            <Button asChild size="sm" variant="accent">
              <Link to="/pricing">Ver planes</Link>
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nombre, cédula o teléfono"
            className="h-11 pl-9"
          />
        </div>
        <div className="flex gap-2">
          {FILTERS.map((f) => (
            <Button
              key={f}
              size="sm"
              variant={filter === f ? "default" : "secondary"}
              onClick={() => setFilter(f)}
            >
              {f}
            </Button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : rows.length === 0 ? (
        <div className="surface flex flex-col items-center gap-3 p-10 text-center">
          <UserRound className="size-8 text-accent" />
          <p className="font-display text-lg font-semibold">Sin clientes todavía</p>
          {!__readOnly && (
            <Button asChild variant="accent">
              <Link to="/clients/new">Agregar el primero</Link>
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((c) => (
            <Link
              key={c.id}
              to="/clients/$id"
              params={{ id: c.id }}
              className="surface block p-4 transition-shadow hover:shadow-[var(--shadow-raised)]"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-display text-base font-semibold">{c.full_name}</p>
                  <p className="text-xs text-muted-foreground">{c.phone || "Sin teléfono"}</p>
                </div>
                <Chip tone={c.active ? "success" : "neutral"}>{c.active ? "Activo" : "Inactivo"}</Chip>
              </div>
              <div className="mt-4 flex items-end justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Préstamos</p>
                  <p className="num font-semibold">{c.stats.count}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Capital prestado</p>
                  <p className="num font-semibold">{rd(c.stats.balance)}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
