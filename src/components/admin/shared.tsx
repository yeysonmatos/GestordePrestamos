import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ListChecks, Plus, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { Money } from "@/components/money";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  PAGO_METHOD_LABEL,
  registerPayment,
  useAdminPlans,
  type AdminNegocio,
  type AuditRow,
} from "@/lib/admin";
import { formatDateTime, rd, todaySD } from "@/lib/finance";
import { actionLabel, detailsSummary, detailsFacts, ENTITY_LABELS } from "@/lib/audit-ui";

/* ===================== Etiquetas de auditoría ===================== */

export { actionLabel as auditActionLabel };

/* ===================== KPI / Dato ===================== */

export function Kpi({
  label,
  value,
  money,
  hint,
  icon: Icon,
}: {
  label: string;
  value?: string;
  money?: number;
  hint?: string;
  icon: LucideIcon;
}) {
  return (
    <div className="surface p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <Icon className="size-4 text-muted-foreground" />
      </div>
      {money !== undefined ? (
        <Money value={money} className="mt-1 block font-display text-xl font-bold" />
      ) : (
        <p className="num mt-1 font-display text-xl font-bold">{value}</p>
      )}
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function Dato({ label, value, money }: { label: string; value?: string; money?: number }) {
  return (
    <div className="rounded-xl bg-secondary p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      {money !== undefined ? (
        <Money value={money} className="num font-display text-base font-bold" />
      ) : (
        <p className="num font-display text-base font-bold">{value}</p>
      )}
    </div>
  );
}

/* ===================== Badge de estado de pago ===================== */

export function PaymentStatusBadge({ status, label }: { status: string; label: string }) {
  return (
    <span
      className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
        status === "confirmed"
          ? "border-success/25 bg-success/12 text-success"
          : status === "rejected"
            ? "border-destructive/25 bg-destructive/12 text-destructive"
            : "border-warning/30 bg-warning/12 text-warning-foreground"
      }`}
    >
      {label}
    </span>
  );
}

/* ===================== Fila de auditoría ===================== */

export function AuditRowItem({ row }: { row: AuditRow }) {
  const [open, setOpen] = useState(false);
  const label = actionLabel(row.action);
  const summary = detailsSummary(row.entity_type ?? "", row.details);
  const facts = detailsFacts(row.entity_type ?? "", row.details);
  return (
    <li>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-secondary"
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{label}</p>
          <p className="truncate text-xs text-muted-foreground">
            {row.user_name} · {formatDateTime(row.created_at)}
          </p>
          {summary && <p className="mt-0.5 truncate text-xs">{summary}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
          <ListChecks className="size-3.5" />
          <span>detalle</span>
        </div>
      </button>
      {open && (
        <div className="border-t border-border bg-secondary/40 px-4 py-3">
          <dl className="grid gap-1.5 text-xs sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Acción</dt>
              <dd className="font-medium">{label}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Entidad</dt>
              <dd className="font-medium">
                {(row.entity_type && ENTITY_LABELS[row.entity_type]) || row.entity_type || "—"}
              </dd>
            </div>
          </dl>
          {facts.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs">
              {facts.map((f, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="mt-1 size-1 shrink-0 rounded-full bg-primary" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

/* ===================== Diálogo: registrar pago ===================== */

export function invalidateAdminQueries(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ["admin-payments"] });
  queryClient.invalidateQueries({ queryKey: ["admin-audit"] });
  queryClient.invalidateQueries({ queryKey: ["admin-data"] });
  queryClient.invalidateQueries({ queryKey: ["admin-plans"] });
  queryClient.invalidateQueries({ queryKey: ["admin-pending-count"] });
}

export function RegistrarPagoButton({
  negocios,
  presetUserId,
  label = "Registrar pago",
  renderTrigger,
  open: controlledOpen,
  onOpenChange,
}: {
  negocios: AdminNegocio[];
  presetUserId?: string;
  label?: string;
  renderTrigger?: (open: () => void) => React.ReactNode;
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { data: plans } = useAdminPlans();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const [form, setForm] = useState({
    user_id: presetUserId ?? "",
    amount: "699",
    method: "transfer",
    payment_date: todaySD(),
    notes: "",
    plan_id: "",
  });

  const registrar = useMutation({
    mutationFn: async () => {
      const amount = Number(form.amount);
      if (!form.user_id) throw new Error("Elige el negocio");
      if (!amount || amount <= 0) throw new Error("Monto inválido");
      await registerPayment({
        userId: form.user_id,
        amount,
        method: form.method,
        paymentDate: form.payment_date || todaySD(),
        ...(form.notes ? { notes: form.notes } : {}),
        planId: form.plan_id || null,
      });
    },
    onSuccess: () => {
      toast.success("Pago registrado (pendiente de confirmar)");
      setOpen(false);
      setForm((f) => ({ ...f, amount: "699", notes: "", plan_id: "" }));
      invalidateAdminQueries(queryClient);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      {renderTrigger ? (
        renderTrigger(() => setOpen(true))
      ) : (
        <Button variant="accent" onClick={() => setOpen(true)}>
          <Plus className="size-4" /> {label}
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar pago de suscripción</DialogTitle>
            <DialogDescription>
              El pago queda pendiente hasta que lo confirmes. Puedes elegir un plan de destino para un
              upgrade.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Negocio</Label>
              <Select
                value={form.user_id}
                onValueChange={(v) => setForm({ ...form, user_id: v })}
                disabled={!!presetUserId}
              >
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Elige el negocio" />
                </SelectTrigger>
                <SelectContent>
                  {negocios.map((n) => (
                    <SelectItem key={n.id} value={n.id}>
                      {n.business_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Monto</Label>
                <Input
                  className="h-11"
                  inputMode="numeric"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Método</Label>
                <Select value={form.method} onValueChange={(v) => setForm({ ...form, method: v })}>
                  <SelectTrigger className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(PAGO_METHOD_LABEL).map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Fecha del pago</Label>
              <Input
                type="date"
                className="h-11"
                value={form.payment_date}
                onChange={(e) => setForm({ ...form, payment_date: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Plan destino (opcional, upgrade)</Label>
              <Select value={form.plan_id} onValueChange={(v) => setForm({ ...form, plan_id: v })}>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Mantener plan actual" />
                </SelectTrigger>
                <SelectContent>
                  {(plans ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} · RD$ {rd(p.price)}/mes
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Notas</Label>
              <Input
                className="h-11"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="N° de depósito, referencia…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button variant="accent" disabled={registrar.isPending} onClick={() => registrar.mutate()}>
              {registrar.isPending ? "Guardando…" : "Registrar pago"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}



