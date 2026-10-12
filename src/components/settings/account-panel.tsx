import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpRight,
  CalendarClock,
  CreditCard,
  KeyRound,
  Receipt,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Chip, Money } from "@/components/money";
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
import MfaSetup from "@/components/admin/MfaSetup";
import { useSubscription, useSubscriptionPayments } from "@/lib/db";
import { daysBetween, formatDate, rd, todaySD } from "@/lib/finance";
import { notifyAdminUpgradeRequest } from "@/lib/admin-fns";

const STATUS_META: Record<string, { label: string; tone: "neutral" | "success" | "danger" | "info" }> = {
  trial: { label: "Prueba", tone: "info" },
  active: { label: "Activo", tone: "success" },
  expired: { label: "Vencido", tone: "danger" },
  cancelled: { label: "Cancelado", tone: "neutral" },
};

const METHOD_LABEL: Record<string, string> = {
  cash: "Efectivo",
  transfer: "Transferencia",
  deposit: "Depósito",
  other: "Otro",
};

const SINGLETON = "00000000-0000-0000-0000-000000000001";

/** Contenido de "Mi plan": suscripción, pagos (reportar/upgrade) y seguridad. */
export function AccountPanel() {
  const queryClient = useQueryClient();
  const { data: sub, isLoading } = useSubscription();
  const { data: payments = [] } = useSubscriptionPayments();
  const [payOpen, setPayOpen] = useState(false);
  const [upOpen, setUpOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [payForm, setPayForm] = useState({ amount: "", method: "transfer", payment_date: todaySD(), notes: "" });
  const [upgradePlanId, setUpgradePlanId] = useState("");
  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");

  const { data: pcfg } = useQuery({
    queryKey: ["platform-config-public"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_config")
        .select("bank_name, account_name, account_number, payment_phone")
        .eq("id", SINGLETON)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data as { bank_name: string | null; account_name: string | null; account_number: string | null; payment_phone: string | null } | null;
    },
  });

  const { data: plans = [] } = useQuery({
    queryKey: ["public-plans"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("plans")
        .select("id, name, price, billing_cycle")
        .eq("is_active", true)
        .gt("price", 0)
        .order("price");
      if (error) throw new Error(error.message);
      return (data ?? []) as { id: string; name: string; price: number; billing_cycle: string }[];
    },
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Cargando…</p>;

  const meta = sub ? STATUS_META[sub.status] ?? { label: sub.status, tone: "neutral" as const } : null;
  const free = (sub?.plan_price ?? 0) <= 0;
  const today = todaySD();
  const daysLeft = sub?.ends_at ? Math.max(0, daysBetween(today, sub.ends_at.slice(0, 10))) : null;
  const expired = !!sub?.ends_at && daysLeft === 0 && sub.ends_at.slice(0, 10) < today;
  const upgradeOptions = plans.filter((p) => p.id !== sub?.plan_id && Number(p.price) > (sub?.plan_price ?? 0));

  function copy(text: string, label: string) {
    navigator.clipboard.writeText(text).then(
      () => toast.success(`${label} copiado`),
      () => toast.error("No se pudo copiar"),
    );
  }

  function abrirPago() {
    setPayForm({
      amount: String(sub?.plan_price ?? ""),
      method: "transfer",
      payment_date: todaySD(),
      notes: "",
    });
    setPayOpen(true);
  }

  async function reportarPago() {
    if (!sub) return;
    const amount = Number(payForm.amount);
    if (!amount || amount <= 0) {
      toast.error("Monto inválido");
      return;
    }
    setBusy(true);
    try {
      const { data: me } = await supabase.auth.getUser();
      if (!me.user) throw new Error("Sesión expirada");
      const { error } = await supabase.from("subscription_payments").insert({
        user_id: me.user.id,
        subscription_id: sub.id,
        amount,
        method: payForm.method,
        payment_date: payForm.payment_date || todaySD(),
        notes: payForm.notes.trim() || null,
        status: "pending",
      });
      if (error) throw new Error(error.message);
      toast.success("Pago reportado. El administrador lo confirmará en breve.");
      setPayOpen(false);
      queryClient.invalidateQueries({ queryKey: ["subscription-payments"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No pudimos registrar el pago");
    } finally {
      setBusy(false);
    }
  }

  async function solicitarUpgrade() {
    if (!sub || !upgradePlanId) return;
    const plan = plans.find((p) => p.id === upgradePlanId);
    if (!plan) return;
    setBusy(true);
    try {
      const { data: me } = await supabase.auth.getUser();
      if (!me.user) throw new Error("Sesión expirada");
      const { data: created, error } = await supabase
        .from("subscription_payments")
        .insert({
          user_id: me.user.id,
          subscription_id: sub.id,
          amount: Number(plan.price),
          method: "transfer",
          payment_date: todaySD(),
          notes: `Solicitud de cambio al plan ${plan.name}`,
          status: "pending",
          target_plan_id: plan.id,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      notifyAdminUpgradeRequest({ data: { paymentId: created.id } }).catch(() => {});
      toast.success(`Solicitud enviada. Al confirmarse el pago pasarás a ${plan.name}.`);
      setUpOpen(false);
      setUpgradePlanId("");
      queryClient.invalidateQueries({ queryKey: ["subscription-payments"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No pudimos enviar la solicitud");
    } finally {
      setBusy(false);
    }
  }

  async function cambiarPassword() {
    if (pwd.length < 6) {
      toast.error("La nueva contraseña debe tener al menos 6 caracteres.");
      return;
    }
    if (pwd !== pwd2) {
      toast.error("Las contraseñas no coinciden.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pwd });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setPwd("");
    setPwd2("");
    toast.success("Contraseña actualizada.");
  }

  return (
    <div className="space-y-4">
      {sub && expired && (
        <div className="rounded-xl border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Tu plan venció el {formatDate(sub.ends_at)}. Reporta tu pago o contacta al administrador para renovar.
        </div>
      )}
      {sub && !expired && daysLeft !== null && daysLeft <= 3 && (
        <div className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning-foreground">
          Tu plan {sub.plan_name} vence en {daysLeft === 0 ? "hoy" : `${daysLeft} día${daysLeft === 1 ? "" : "s"}`}{" "}
          ({formatDate(sub.ends_at)}).
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="surface p-5 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-display text-base font-semibold">
              <CreditCard className="size-5 text-accent" /> Tu plan actual
            </h2>
            {meta && sub && !(free && (sub.status === "trial" || sub.status === "active")) && (
              <Chip tone={meta.tone}>{meta.label}</Chip>
            )}
          </div>

          {sub ? (
            <div className="mt-4 space-y-4">
              <div className="flex items-baseline gap-2">
                <span className="font-display text-2xl font-bold">{sub.plan_name}</span>
                {!free && (
                  <span className="text-sm text-muted-foreground">
                    {rd(sub.plan_price)} / {sub.billing_cycle === "yearly" ? "año" : "mes"}
                  </span>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-border p-3">
                  <p className="text-xs text-muted-foreground">Inicio</p>
                  <p className="mt-0.5 text-sm font-medium">{formatDate(sub.starts_at)}</p>
                </div>
                <div className="rounded-xl border border-border p-3">
                  <p className="text-xs text-muted-foreground">Vencimiento</p>
                  <p className="mt-0.5 text-sm font-medium">{formatDate(sub.ends_at)}</p>
                </div>
                <div className="rounded-xl border border-border p-3">
                  <p className="text-xs text-muted-foreground">Días restantes</p>
                  <p className="mt-0.5 text-sm font-medium">
                    {daysLeft === null ? "-" : `${daysLeft} día${daysLeft === 1 ? "" : "s"}`}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button variant="accent" size="sm" className="min-h-11" onClick={abrirPago}>
                  <Wallet className="mr-1 size-4" /> Reportar pago
                </Button>
                {upgradeOptions.length > 0 && (
                  <Button variant="secondary" size="sm" className="min-h-11" onClick={() => setUpOpen(true)}>
                    <ArrowUpRight className="mr-1 size-4" /> Cambiar de plan
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">No tienes una suscripción activa.</p>
          )}
        </div>

        <div className="surface p-5">
          <h2 className="flex items-center gap-2 font-display text-base font-semibold">
            <Receipt className="size-5 text-accent" /> Historial de pagos
          </h2>
          {payments.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Aún no hay pagos registrados.</p>
          ) : (
            <ul className="mt-3 max-h-80 divide-y divide-border overflow-y-auto">
              {payments.map((p) => {
                const pStatus =
                  p.status === "pending"
                    ? { label: "Pendiente", tone: "neutral" as const }
                    : p.status === "confirmed"
                      ? { label: "Confirmado", tone: "success" as const }
                      : { label: "Rechazado", tone: "danger" as const };
                return (
                  <li key={p.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <Money value={p.amount} className="text-sm font-semibold" />
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <CalendarClock className="size-3.5" />
                        {formatDate(p.payment_date)} · {METHOD_LABEL[p.method] ?? p.method}
                      </p>
                    </div>
                    <Chip tone={pStatus.tone}>{pStatus.label}</Chip>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <div className="surface p-5">
        <h2 className="flex items-center gap-2 font-display text-base font-semibold">
          <ShieldCheck className="size-5 text-accent" /> Seguridad
        </h2>
        <div className="mt-4 grid gap-6 lg:grid-cols-2">
          <div className="space-y-3">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <KeyRound className="size-4 text-muted-foreground" /> Cambiar contraseña
            </p>
            <div className="space-y-1.5">
              <Label>Nueva contraseña</Label>
              <Input
                type="password"
                autoComplete="new-password"
                className="h-11"
                value={pwd}
                onChange={(e) => setPwd(e.target.value)}
                placeholder="Mínimo 6 caracteres"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Repetir nueva contraseña</Label>
              <Input
                type="password"
                autoComplete="new-password"
                className="h-11"
                value={pwd2}
                onChange={(e) => setPwd2(e.target.value)}
              />
            </div>
            <Button variant="secondary" disabled={busy || !pwd} onClick={cambiarPassword}>
              Actualizar contraseña
            </Button>
          </div>
          <div>
            <MfaSetup />
          </div>
        </div>
      </div>

      {/* Diálogo: reportar pago */}
      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reportar pago de suscripción</DialogTitle>
            <DialogDescription>
              Haz la transferencia o depósito a la cuenta del administrador y reporta el pago con tu
              referencia. Queda pendiente hasta confirmación.
            </DialogDescription>
          </DialogHeader>
          {pcfg ? (
            <div className="space-y-1.5 rounded-xl border border-border bg-secondary/40 p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Banco</span>
                <span className="font-semibold">{pcfg.bank_name || "—"}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Titular</span>
                <span>{pcfg.account_name || "—"}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Cuenta</span>
                <span className="num">{pcfg.account_number || "—"}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Teléfono de cobro</span>
                <span>{pcfg.payment_phone || "—"}</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="mt-1 w-full"
                onClick={() =>
                  copy(
                    `Banco: ${pcfg.bank_name ?? ""}\nTitular: ${pcfg.account_name ?? ""}\nCuenta: ${pcfg.account_number ?? ""}\nTeléfono: ${pcfg.payment_phone ?? ""}`,
                    "Datos de pago",
                  )
                }
              >
                Copiar datos
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">El administrador aún no publica su cuenta de cobro.</p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Monto</Label>
              <Input
                className="h-11"
                inputMode="decimal"
                value={payForm.amount}
                onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Fecha del pago</Label>
              <Input
                type="date"
                className="h-11 min-w-0"
                value={payForm.payment_date}
                onChange={(e) => setPayForm({ ...payForm, payment_date: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Método</Label>
              <Select value={payForm.method} onValueChange={(v) => setPayForm({ ...payForm, method: v })}>
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="transfer">Transferencia</SelectItem>
                  <SelectItem value="deposit">Depósito</SelectItem>
                  <SelectItem value="cash">Efectivo</SelectItem>
                  <SelectItem value="other">Otro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Referencia / notas</Label>
              <Input
                className="h-11"
                value={payForm.notes}
                onChange={(e) => setPayForm({ ...payForm, notes: e.target.value })}
                placeholder="N° de depósito, referencia…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setPayOpen(false)}>
              Cancelar
            </Button>
            <Button variant="accent" disabled={busy} onClick={reportarPago}>
              {busy ? "Enviando…" : "Reportar pago"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo: cambio de plan */}
      <Dialog open={upOpen} onOpenChange={setUpOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cambiar de plan</DialogTitle>
            <DialogDescription>
              Elige el plan al que quieres subir. Se creará una solicitud de pago; al confirmarla, tu
              plan cambia y conservas los días ya pagados.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Nuevo plan</Label>
            <Select value={upgradePlanId} onValueChange={setUpgradePlanId}>
              <SelectTrigger className="h-11">
                <SelectValue placeholder="Elige un plan" />
              </SelectTrigger>
              <SelectContent>
                {upgradeOptions.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} · {rd(p.price)}/{p.billing_cycle === "yearly" ? "año" : "mes"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setUpOpen(false)}>
              Cancelar
            </Button>
            <Button variant="accent" disabled={busy || !upgradePlanId} onClick={solicitarUpgrade}>
              {busy ? "Enviando…" : "Solicitar cambio"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

