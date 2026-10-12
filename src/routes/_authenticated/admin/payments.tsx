import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, CheckCircle2, ChevronLeft, ChevronRight, Download, History, MoreHorizontal, Tag, Wallet, X } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app-shell";
import { Money } from "@/components/money";
import {
  Kpi,
  PaymentStatusBadge,
  RegistrarPagoButton,
  invalidateAdminQueries,
} from "@/components/admin/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  adminPaymentsExport,
  confirmPayment,
  PAGO_METHOD_LABEL,
  PAGO_STATUS_LABEL,
  rejectPayment,
  useAdminData,
  useAdminPayments,
  type AdminPayment,
} from "@/lib/admin";
import { buildCsv, downloadCsv } from "@/lib/csv";
import { formatDate } from "@/lib/finance";

const PAGE_SIZE = 20;

export const Route = createFileRoute("/_authenticated/admin/payments")({
  component: AdminPayments,
});

function PaymentCard({ pago }: { pago: AdminPayment }) {
  const queryClient = useQueryClient();

  const confirmar = () => {
    confirmPayment(pago.id)
      .then(() => {
        toast.success("Pago confirmado y suscripción actualizada");
        invalidateAdminQueries(queryClient);
      })
      .catch((e: Error) => toast.error(e.message));
  };

  const rechazar = () => {
    rejectPayment(pago.id)
      .then(() => {
        toast.success("Pago rechazado");
        invalidateAdminQueries(queryClient);
      })
      .catch((e: Error) => toast.error(e.message));
  };

  return (
    <div className="surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-display text-base font-semibold">
            <Link to="/admin/users/$id" params={{ id: pago.user_id }} className="hover:underline">
              {pago.business_name}
            </Link>
            {pago.plan_name && (
              <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 align-middle text-[11px] font-normal text-muted-foreground">
                <Tag className="size-3" /> {pago.plan_name}
              </span>
            )}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {formatDate(pago.payment_date)} · {PAGO_METHOD_LABEL[pago.method] ?? pago.method}
            {pago.notes ? ` · ${pago.notes}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Money value={pago.amount} className="font-display text-base font-bold" />
          <PaymentStatusBadge
            status={pago.status}
            label={PAGO_STATUS_LABEL[pago.status] ?? pago.status}
          />
          {pago.status === "pending" && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label="Acciones del pago"
                  className="size-11 p-0 text-muted-foreground hover:text-foreground"
                >
                  <MoreHorizontal className="size-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem className="text-success focus:text-success" onSelect={confirmar}>
                  <Check className="mr-2 size-4" /> Confirmar pago
                </DropdownMenuItem>
                <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={rechazar}>
                  <X className="mr-2 size-4" /> Rechazar pago
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </div>
  );
}

function AdminPayments() {
  const { data: adminData } = useAdminData();
  const [month, setMonth] = useState("");
  const [method, setMethod] = useState("");
  const [userId, setUserId] = useState("");
  const [status, setStatus] = useState("todas");
  const [page, setPage] = useState(1);

  const filtrosServer = {
    ...(month ? { month } : {}),
    ...(method ? { method } : {}),
    ...(userId ? { user_id: userId } : {}),
    ...(status !== "todas" ? { status } : {}),
    page,
    page_size: PAGE_SIZE,
  };

  const { data, isLoading } = useAdminPayments(filtrosServer);
  const negocios = adminData?.negocios ?? [];

  // Pendientes primero, luego por fecha (como GP)
  const items = useMemo(() => {
    const list = [...(data?.items ?? [])];
    return list.sort(
      (a, b) => (a.status === "pending" ? 0 : 1) - (b.status === "pending" ? 0 : 1),
    );
  }, [data]);

  const counts = data?.counts ?? { pending: 0, confirmed: 0, rejected: 0 };
  const total = data?.total ?? 0;
  const totalRows = data?.total_rows ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const hayFiltros = !!(month || method || userId || status !== "todas");

  function cambiarFiltro(fn: () => void) {
    fn();
    setPage(1);
  }

  async function exportar() {
    try {
      const rows = await adminPaymentsExport({
        ...(month ? { month } : {}),
        ...(method ? { method } : {}),
        ...(userId ? { user_id: userId } : {}),
        ...(status !== "todas" ? { status } : {}),
      });
      if (!rows.length) {
        toast.error("No hay pagos con esos filtros");
        return;
      }
      const csv = buildCsv(
        ["Negocio", "Plan", "Monto", "Estado", "Método", "Fecha", "Notas"],
        rows.map((p) => [
          p.business_name,
          p.plan_name,
          Math.round(p.amount),
          PAGO_STATUS_LABEL[p.status] ?? p.status,
          PAGO_METHOD_LABEL[p.method] ?? p.method,
          p.payment_date ? String(p.payment_date).slice(0, 10) : "",
          p.notes ?? "",
        ]),
      );
      downloadCsv(`pagos-suscripcion-${new Date().toISOString().slice(0, 10)}.csv`, csv);
      toast.success("CSV descargado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al exportar");
    }
  }

  return (
    <>
      <PageHeader
        title="Pagos"
        subtitle="Mensualidades de suscripción: registrar, confirmar o rechazar"
        action={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={exportar}>
              <Download className="mr-1 size-4" /> Exportar CSV
            </Button>
            <RegistrarPagoButton negocios={negocios} />
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Kpi label="Pendientes" value={String(counts.pending)} hint="Por confirmar" icon={History} />
        <Kpi label="Confirmados" value={String(counts.confirmed)} hint="Histórico" icon={CheckCircle2} />
        <Kpi label="Total cobrado (confirmado)" money={total} hint="Toda la plataforma" icon={Wallet} />
      </div>

      <div className="mt-5 flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Mes</Label>
          <Input type="month" className="h-11 min-w-0" value={month} onChange={(e) => cambiarFiltro(() => setMonth(e.target.value))} />
        </div>
        <Select value={method || "all"} onValueChange={(v) => cambiarFiltro(() => setMethod(v === "all" ? "" : v))}>
          <SelectTrigger className="h-11 w-40">
            <SelectValue placeholder="Todo método" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todo método</SelectItem>
            <SelectItem value="transfer">Transferencia</SelectItem>
            <SelectItem value="cash">Efectivo</SelectItem>
            <SelectItem value="deposit">Depósito</SelectItem>
            <SelectItem value="other">Otro</SelectItem>
          </SelectContent>
        </Select>
        <Select value={userId || "all"} onValueChange={(v) => cambiarFiltro(() => setUserId(v === "all" ? "" : v))}>
          <SelectTrigger className="h-11 w-48">
            <SelectValue placeholder="Todo suscriptor" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todo suscriptor</SelectItem>
            {negocios.map((n) => (
              <SelectItem key={n.id} value={n.id}>
                {n.business_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {hayFiltros && (
          <button
            onClick={() => cambiarFiltro(() => {
              setMonth("");
              setMethod("");
              setUserId("");
              setStatus("todas");
            })}
            className="min-h-11 px-3 text-sm text-muted-foreground hover:text-foreground"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {(["todas", "pending", "confirmed", "rejected"] as const).map((s) => (
          <Button
            key={s}
            variant={status === s ? "default" : "secondary"}
            size="sm"
            onClick={() => cambiarFiltro(() => setStatus(s))}
          >
            {s === "todas" ? "Todas" : PAGO_STATUS_LABEL[s]}
            {s !== "todas" && (
              <span className="ml-1 rounded-full bg-background/25 px-1.5 text-[11px]">{counts[s]}</span>
            )}
          </Button>
        ))}
      </div>

      <div className="mt-4 space-y-3">
        {isLoading && <p className="text-sm text-muted-foreground">Cargando pagos…</p>}
        {!isLoading && !items.length && (
          <p className="text-sm text-muted-foreground">No hay pagos con esos filtros.</p>
        )}
        {items.map((p) => (
          <PaymentCard key={p.id} pago={p} />
        ))}

        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-center gap-3">
            <Button
              variant="secondary"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((v) => Math.max(1, v - 1))}
            >
              <ChevronLeft className="size-4" /> Anterior
            </Button>
            <span className="text-sm text-muted-foreground">
              Página {page} de {totalPages} · {totalRows} pagos
            </span>
            <Button
              variant="secondary"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((v) => Math.min(totalPages, v + 1))}
            >
              Siguiente <ChevronRight className="size-4" />
            </Button>
          </div>
        )}
      </div>
    </>
  );
}
