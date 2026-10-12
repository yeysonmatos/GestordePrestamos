import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Ban, CalendarPlus, Check, Mail, ShieldOff, X } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app-shell";
import { Money } from "@/components/money";
import {
  AuditRowItem,
  Dato,
  invalidateAdminQueries,
  PaymentStatusBadge,
  RegistrarPagoButton,
} from "@/components/admin/shared";
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
import {
  assignPlan,
  confirmPayment,
  ESTADOS_PLAN,
  ESTADO_LABEL,
  extendSubscriptionDays,
  PAGO_METHOD_LABEL,
  PAGO_STATUS_LABEL,
  PLANES,
  PLAN_LABEL,
  rejectPayment,
  resendRecovery,
  setUserAccess,
  subscriptionHistory,
  useAdminAudit,
  useAdminPlans,
  useAdminData,
  useAdminPayments,
} from "@/lib/admin";
import { formatDate, formatDateTime } from "@/lib/finance";
import { useProfile } from "@/lib/db";

export const Route = createFileRoute("/_authenticated/admin/users/$id")({
  component: AdminUserDetail,
});

function AdminUserDetail() {
  const { id } = Route.useParams();
  const queryClient = useQueryClient();
  const { data: profile } = useProfile();
  const { data, isLoading } = useAdminData();
  const { data: pagos } = useAdminPayments();
  const { data: plans } = useAdminPlans();
  const { data: audit } = useAdminAudit({ limit: 200 });

  const negocio = (data?.negocios ?? []).find((n) => n.id === id);
  const [plan, setPlan] = useState<string | null>(null);
  const [estado, setEstado] = useState<string | null>(null);

  const [dias, setDias] = useState("30");
  const [extending, setExtending] = useState(false);
  const [histKey, setHistKey] = useState(0);
  const [historial, setHistorial] = useState<
    { id: string; plan_name: string; status: string; starts_at: string | null; ends_at: string | null }[]
  >([]);

  useEffect(() => {
    subscriptionHistory(id)
      .then(setHistorial)
      .catch(() => {});
  }, [id, histKey]);

  const misPagos = (pagos?.items ?? []).filter((p) => p.user_id === id);
  const miAudit = (audit?.rows ?? []).filter((l) => l.user_id === id);
  const isSelf = profile?.id === id;

  const guardar = useMutation({
    mutationFn: async () => {
      if (!negocio) return;
      await assignPlan(id, plan ?? negocio.plan_display, estado ?? negocio.plan_status);
    },
    onSuccess: () => {
      toast.success("Plan actualizado");
      invalidateAdminQueries(queryClient);
      setHistKey((k) => k + 1);
    },
  });

  const acceso = useMutation({
    mutationFn: async (blocked: boolean) => {
      await setUserAccess(id, blocked);
    },
    onSuccess: (_v, blocked) => {
      toast.success(blocked ? "Acceso bloqueado" : "Acceso restaurado");
      invalidateAdminQueries(queryClient);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Cargando…</p>;
  if (!negocio) {
    return (
      <div className="surface mx-auto mt-10 max-w-md p-8 text-center">
        <p className="font-display text-lg font-bold">Negocio no encontrado</p>
        <Button asChild variant="secondary" className="mt-4">
          <Link to="/admin/users">
            <ArrowLeft className="size-4" /> Volver a usuarios
          </Link>
        </Button>
      </div>
    );
  }

  const cambiado =
    (plan ?? negocio.plan_display) !== negocio.plan_display || (estado ?? negocio.plan_status) !== negocio.plan_status;

  const confirmar = (pid: string) => {
    confirmPayment(pid)
      .then(() => {
        toast.success("Pago confirmado y suscripción actualizada");
        invalidateAdminQueries(queryClient);
        setHistKey((k) => k + 1);
      })
      .catch((e: Error) => toast.error(e.message));
  };
  const rechazar = (pid: string) => {
    rejectPayment(pid)
      .then(() => {
        toast.success("Pago rechazado");
        invalidateAdminQueries(queryClient);
      })
      .catch((e: Error) => toast.error(e.message));
  };

  async function extender() {
    const n = Math.max(1, Math.floor(Number(dias) || 30));
    setExtending(true);
    try {
      const r = await extendSubscriptionDays(id, n);
      toast.success(`Suscripción extendida ${n} días (vence ${String(r.ends_at).slice(0, 10)})`);
      invalidateAdminQueries(queryClient);
      setHistKey((k) => k + 1);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al extender");
    }
    setExtending(false);
  }

  function reenviarAcceso() {
    if (!confirm("¿Reenviar al cliente un correo para que defina su contraseña?")) return;
    resendRecovery(id)
      .then(() => toast.success("Correo de acceso reenviado"))
      .catch((e: Error) => toast.error(e.message));
  }

  return (
    <>
      <PageHeader
        title={negocio.business_name}
        subtitle={`${negocio.owner_name || "Sin dueño"}${negocio.phone ? ` · ${negocio.phone}` : ""} · Cliente desde ${formatDate(negocio.created_at.slice(0, 10))}`}
        action={
          <Button asChild variant="secondary" size="sm">
            <Link to="/admin/users">
              <ArrowLeft className="size-4" /> Usuarios
            </Link>
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Dato label="Plan" value={`${PLAN_LABEL[negocio.plan] ?? negocio.plan_display} · ${ESTADO_LABEL[negocio.plan_status] ?? negocio.plan_status}`} />
        <Dato
          label="Vence"
          value={negocio.plan_renews_at ? formatDate(negocio.plan_renews_at.slice(0, 10)) : "—"}
        />
        <Dato label="Deudores / Préstamos" value={`${negocio.clientes} / ${negocio.prestamosActivos} activos`} />
        <Dato label="Capital colocado" money={negocio.capital} />
      </div>

      <div className="surface mt-3 flex flex-wrap items-end gap-3 p-4">
        <div className="space-y-1.5">
          <Label className="text-xs">Plan</Label>
          <Select value={plan ?? negocio.plan_display} onValueChange={setPlan}>
            <SelectTrigger className="h-10 w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(plans ?? []).map((p) => (
                <SelectItem key={p.id} value={p.name}>
                  {p.name}
                  {p.is_active ? "" : " · oculto"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Estado</Label>
          <Select value={estado ?? negocio.plan_status} onValueChange={setEstado}>
            <SelectTrigger className="h-10 w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ESTADOS_PLAN.map((e) => (
                <SelectItem key={e} value={e}>
                  {ESTADO_LABEL[e] ?? e}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button variant="accent" disabled={!cambiado || guardar.isPending} onClick={() => guardar.mutate()}>
          Guardar cambios
        </Button>
        {!isSelf && (
          <Button
            variant={negocio.blocked ? "secondary" : "destructive"}
            disabled={acceso.isPending}
            onClick={() => acceso.mutate(!negocio.blocked)}
          >
            {negocio.blocked ? <ShieldOff className="size-4" /> : <Ban className="size-4" />}
            {negocio.blocked ? "Desbloquear acceso" : "Bloquear acceso"}
          </Button>
        )}
        <RegistrarPagoButton negocios={data?.negocios ?? []} presetUserId={id} label="Registrar pago" />
      </div>

      <div className="surface mt-3 flex flex-wrap items-end gap-3 p-4">
        <div className="space-y-1.5">
          <Label className="text-xs">Extender suscripción (días)</Label>
          <Input
            type="number"
            min={1}
            className="h-10 w-28"
            value={dias}
            onChange={(e) => setDias(e.target.value)}
          />
        </div>
        <Button variant="secondary" disabled={extending} onClick={extender}>
          <CalendarPlus className="mr-1 size-4" /> {extending ? "Extendiendo…" : "Extender"}
        </Button>
        <Button variant="ghost" className="text-muted-foreground" onClick={reenviarAcceso}>
          <Mail className="mr-1 size-4" /> Reenviar correo de acceso
        </Button>
      </div>

      <div className="surface mt-3 p-4">
        <p className="font-display text-sm font-semibold">Historial de pagos ({misPagos.length})</p>
        {!misPagos.length && (
          <p className="mt-2 text-sm text-muted-foreground">Este negocio no tiene pagos registrados.</p>
        )}
        <ul className="mt-2 divide-y divide-border">
          {misPagos.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div className="text-sm">
                <Money value={p.amount} className="num font-bold" />
                <span className="ml-2 text-xs text-muted-foreground">
                  {formatDate(p.payment_date)} · {PAGO_METHOD_LABEL[p.method] ?? p.method}
                  {p.plan_name ? ` · ${p.plan_name}` : ""}
                  {p.notes ? ` · ${p.notes}` : ""}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <PaymentStatusBadge status={p.status} label={PAGO_STATUS_LABEL[p.status] ?? p.status} />
                {p.status === "pending" && (
                  <>
                    <Button size="sm" variant="accent" onClick={() => confirmar(p.id)}>
                      <Check className="size-4" /> Confirmar
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => rechazar(p.id)}>
                      <X className="size-4" /> Rechazar
                    </Button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="surface mt-3 overflow-hidden">
        <p className="border-b border-border px-4 py-3 font-display text-sm font-semibold">
          Historial de planes ({historial.length})
        </p>
        {!historial.length ? (
          <p className="p-4 text-sm text-muted-foreground">Sin suscripciones registradas.</p>
        ) : (
          <ul className="divide-y divide-border">
            {historial.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
                <span className="font-medium">
                  {s.plan_name}
                  <span className="ml-2 text-xs text-muted-foreground">
                    {{ trial: "Prueba", active: "Activa", expired: "Vencida", cancelled: "Cancelada" }[s.status] ?? s.status}
                  </span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatDate(s.starts_at ? s.starts_at.slice(0, 10) : null)} →{" "}
                  {s.ends_at ? formatDate(s.ends_at.slice(0, 10)) : "—"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="surface mt-3 overflow-hidden">
        <p className="border-b border-border px-4 py-3 font-display text-sm font-semibold">
          Actividad del negocio ({miAudit.length})
        </p>
        {!miAudit.length && (
          <p className="p-4 text-sm text-muted-foreground">Sin eventos de auditoría.</p>
        )}
        <ul className="divide-y divide-border">
          {miAudit.slice(0, 40).map((l) => (
            <AuditRowItem key={l.id} row={l} />
          ))}
        </ul>
        {miAudit.length > 40 && (
          <p className="px-4 py-3 text-xs text-muted-foreground">
            Mostrando 40 de {miAudit.length}. Ver todos en{" "}
            <Link to="/admin/audit" className="underline">
              Auditoría
            </Link>{" "}
            · {formatDateTime(miAudit[0]?.created_at)}.
          </p>
        )}
      </div>
    </>
  );
}

