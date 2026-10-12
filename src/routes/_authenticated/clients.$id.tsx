import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MessageCircle, Plus, ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Chip, Money } from "@/components/money";
import { supabase } from "@/integrations/supabase/client";
import {
  useAllInstallments,
  useClient,
  useClientPayments,
  useLoans,
  useProfile,
} from "@/lib/db";
import { useEntitlements } from "@/lib/entitlements";
import { formatDate, installmentStatus, LOAN_STATUS_LABEL, rd } from "@/lib/finance";
import { getPaymentLabel } from "@/lib/payment-labels";
import { whatsappLink } from "@/lib/actions";
import { buildClientMessage } from "@/lib/messages";

export const Route = createFileRoute("/_authenticated/clients/$id")({
  head: () => ({
    meta: [
      { title: "Perfil del cliente | Gestor de Prestamos" },
      { name: "description", content: "Perfil del cliente, sus préstamos, pagos y datos de contacto." },
      { property: "og:title", content: "Perfil del cliente | Gestor de Prestamos" },
      { property: "og:description", content: "Perfil del cliente y sus préstamos." },
    ],
  }),
  component: ClientDetail,
});

function trustChip(score: number) {
  if (score >= 75) return { tone: "success" as const, label: `Confianza alta (${score}%)` };
  if (score >= 40) return { tone: "info" as const, label: `Confianza media (${score}%)` };
  return { tone: "danger" as const, label: `Confianza baja (${score}%)` };
}

function ClientDetail() {
  const { data: __ent } = useEntitlements();
  const __readOnly = __ent?.readOnly ?? false;
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: client, isLoading } = useClient(id);
  const { data: loans = [] } = useLoans();
  const { data: installments = [] } = useAllInstallments();
  const { data: pagos = [] } = useClientPayments(id);
  const { data: profile } = useProfile();
  const mine = useMemo(() => {
    const list = loans.filter((l) => l.client_id === id);
    return [...list].sort((a, b) => {
      const ap = a.status === "pagado" ? 1 : 0;
      const bp = b.status === "pagado" ? 1 : 0;
      if (ap !== bp) return ap - bp;
      return b.created_at.localeCompare(a.created_at);
    });
  }, [loans, id]);

  const [form, setForm] = useState({
    full_name: "",
    cedula: "",
    phone: "",
    email: "",
    address: "",
    notes: "",
    active: true,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (client)
      setForm({
        full_name: client.full_name,
        cedula: client.cedula ?? "",
        phone: client.phone ?? "",
        email: client.email ?? "",
        address: client.address ?? "",
        notes: client.notes ?? "",
        active: client.active,
      });
  }, [client]);

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save() {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("clients")
        .update({
          name: form.full_name,
          document: form.cedula || null,
          phone: form.phone || null,
          whatsapp: form.phone || null,
          email: form.email || null,
          address: form.address || null,
          notes: form.notes || null,
          status: form.active ? "active" : "inactive",
        })
        .eq("id", id);
      if (error) throw error;
      await queryClient.invalidateQueries();
      toast.success("Cliente actualizado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  if (isLoading) return <p className="text-sm text-muted-foreground">Cargando…</p>;
  if (!client) return <p className="text-sm text-muted-foreground">Cliente no encontrado.</p>;

  const capital = mine.reduce((s, l) => s + Number(l.principal), 0);
  const proxima = installments
    .filter((i) => i.loan?.client?.id === id && installmentStatus(i) !== "pagada")
    .sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
  const nextDue =
    proxima?.due_date ??
    (mine.some((l) => l.open_ended && l.status === "en_curso")
      ? mine
          .filter((l) => l.open_ended && l.status === "en_curso")
          .sort((a, b) => a.first_payment_date.localeCompare(b.first_payment_date))[0]
          ?.first_payment_date
      : null);
  const balance = Number(client.balance) || mine.reduce((s, l) => s + Number(l.remaining_amount), 0);
  const msg = buildClientMessage({
    clientName: client.full_name,
    businessName: profile?.business_name,
    balance,
    nextDue,
  });
  const waNumber = client.whatsapp || client.phone;
  const tc = trustChip(client.trust_score);

  return (
    <>
      <PageHeader
        title={client.full_name}
        subtitle={`${mine.length} préstamos · ${rd(capital)} prestados · ${client.phone ?? "sin teléfono"}`}
        action={
          <>
            {waNumber && (
              <Button asChild variant="secondary">
                <a href={whatsappLink(waNumber, msg)} target="_blank" rel="noreferrer">
                  <MessageCircle className="size-4" /> WhatsApp
                </a>
              </Button>
            )}
            {!__readOnly && (
              <Button asChild variant="accent">
                <Link to="/loans/new" search={{ client: id, edit: undefined }}>
                  <Plus className="size-4" /> Préstamo
                </Link>
              </Button>
            )}
          </>
        }
      />

      <div className="no-print mb-3">
        <Chip tone={tc.tone}>
          <ShieldAlert className="mr-1 size-3" /> {tc.label}
        </Chip>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="surface min-w-0 p-4">
          <p className="text-xs text-muted-foreground">Total prestado</p>
          <Money value={client.total_borrowed || capital} className="block truncate font-display text-base font-bold sm:text-lg" />
        </div>
        <div className="surface min-w-0 p-4">
          <p className="text-xs text-muted-foreground">Total pagado</p>
          <Money value={client.total_paid} className="block truncate font-display text-base font-bold text-success sm:text-lg" />
        </div>
        <div className="surface min-w-0 p-4">
          <p className="text-xs text-muted-foreground">Saldo por cobrar</p>
          <Money value={balance} className="block truncate font-display text-base font-bold text-destructive sm:text-lg" />
        </div>
        <div className="surface min-w-0 p-4">
          <p className="text-xs text-muted-foreground">Préstamos</p>
          <p className="truncate font-display text-base font-bold sm:text-lg">
            {mine.filter((l) => l.status === "en_curso").length} en curso ·{" "}
            {mine.filter((l) => l.status === "pagado").length} pagados
          </p>
        </div>
      </div>

      <Tabs defaultValue="prestamos">
        <TabsList className="flex w-full justify-start overflow-x-auto sm:inline-flex sm:w-auto">
          <TabsTrigger value="prestamos">Préstamos ({mine.length})</TabsTrigger>
          <TabsTrigger value="historial">Historial de pagos</TabsTrigger>
          <TabsTrigger value="datos">Datos</TabsTrigger>
        </TabsList>

        <TabsContent value="prestamos" className="mt-4">
          {mine.length === 0 ? (
            <div className="surface p-8 text-center text-sm text-muted-foreground">
              Este cliente no tiene préstamos todavía.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {mine.map((l) => (
                <Link
                  key={l.id}
                  to="/loans/$id"
                  params={{ id: l.id }}
                  className="surface block p-4 transition-shadow hover:shadow-[var(--shadow-raised)]"
                >
                  <div className="flex items-center justify-between">
                    <Money value={l.principal} className="font-display text-lg font-bold" />
                    <Chip
                      tone={l.status === "en_curso" ? "info" : l.status === "pagado" ? "success" : "neutral"}
                    >
                      {LOAN_STATUS_LABEL[l.status] ?? l.status}
                    </Chip>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {l.open_ended
                      ? `Abierto · ${l.interest_rate}%`
                      : `${l.term} cuotas ${l.frequency} · ${l.interest_rate}%`}{" "}
                    · inicio {formatDate(l.start_date)}
                  </p>
                  <p className="mt-1 text-xs">
                    {l.status === "pagado" ? (
                      <span className="font-semibold text-success">
                        Cobrado {rd(l.paid_amount)} · {formatDate(l.updated_at)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">
                        Por cobrar: <span className="font-semibold text-foreground">{rd(l.remaining_amount)}</span>
                      </span>
                    )}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="historial" className="mt-4">
          {pagos.length === 0 ? (
            <div className="surface p-8 text-center text-sm text-muted-foreground">
              Este cliente aún no tiene pagos registrados.
            </div>
          ) : (
            <div className="surface divide-y divide-border">
              {pagos.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      {getPaymentLabel(p, {
                        installmentNumber:
                          installments.find((x) => x.id === p.installment_id)?.number ?? null,
                      })}
                    </p>
                    <p className="text-xs text-muted-foreground">{formatDate(p.paid_at)}</p>
                  </div>
                  <Money value={p.amount} className="font-semibold text-success" />
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="datos" className="mt-4">
          <div className="surface max-w-2xl space-y-4 p-5">
            <div className="space-y-1.5">
              <Label htmlFor="full_name">Nombre completo</Label>
              <Input id="full_name" className="h-11" value={form.full_name} onChange={set("full_name")} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="cedula">Cédula</Label>
                <Input id="cedula" className="h-11" value={form.cedula} onChange={set("cedula")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone">Teléfono / WhatsApp</Label>
                <Input id="phone" className="h-11" value={form.phone} onChange={set("phone")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">Correo</Label>
                <Input id="email" type="email" className="h-11" value={form.email} onChange={set("email")} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="address">Dirección</Label>
              <Input id="address" className="h-11" value={form.address} onChange={set("address")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notes">Notas</Label>
              <Textarea id="notes" rows={3} value={form.notes} onChange={set("notes")} />
            </div>
            <div className="flex items-center justify-between rounded-xl bg-secondary px-4 py-3">
              <div>
                <p className="text-sm font-semibold">Cliente activo</p>
                <p className="text-xs text-muted-foreground">
                  Se marca solo al tener préstamos en curso. Para "jubilarlo", ponlo inactivo; sus préstamos e
                  historial se conservan siempre.
                </p>
              </div>
              <Switch
                checked={form.active}
                onCheckedChange={(v) => setForm((f) => ({ ...f, active: v }))}
              />
            </div>
            <div className="flex flex-wrap gap-2 pt-2">
              <Button variant="accent" onClick={save} disabled={saving} className="min-h-11">
                {saving ? "Guardando…" : "Guardar cambios"}
              </Button>
              <Button variant="ghost" onClick={() => navigate({ to: "/clients" })}>
                Volver
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </>
  );
}
