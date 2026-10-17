import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/lib/audit";
import { useClients, useSubscription } from "@/lib/db";

export const Route = createFileRoute("/_authenticated/clients/new")({
  beforeLoad: async () => {
    const { fetchEntitlements } = await import("@/lib/entitlements");
    const e = await fetchEntitlements();
    if (e.readOnly) throw redirect({ to: "/clients" });
  },
  head: () => ({
    meta: [
      { title: "Nuevo cliente | Gestor de Prestamos" },
      { name: "description", content: "Registra un nuevo cliente prestatario." },
      { property: "og:title", content: "Nuevo cliente | Gestor de Prestamos" },
      { property: "og:description", content: "Registra un nuevo cliente prestatario." },
    ],
  }),
  component: NewClient,
});

function NewClient() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: clients = [] } = useClients();
  const { data: sub } = useSubscription();
  const limite = sub && sub.plan_price > 0 ? (sub.plan_max_clients ?? null) : null;
  const limiteAlcanzado = !!limite && clients.length >= limite;
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    full_name: "",
    cedula: "",
    phone: "",
    email: "",
    address: "",
    notes: "",
  });

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (limiteAlcanzado) {
      toast.error(`Tu plan permite máximo ${limite} clientes. Mejora de plan para agregar más.`);
      return;
    }
    setSaving(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("clients")
        .insert({
          user_id: auth.user!.id,
          name: form.full_name,
          document: form.cedula || null,
          phone: form.phone || null,
          whatsapp: form.phone || null,
          email: form.email || null,
          address: form.address || null,
          notes: form.notes || null,
          status: "active",
        })
        .select()
        .single();
      if (error) throw error;
      await logAudit({
        userId: auth.user!.id,
        action: "client.created",
        entityType: "client",
        entityId: data.id,
        details: { name: form.full_name, phone: form.phone || null },
      });
      await queryClient.invalidateQueries();
      toast.success("Cliente guardado");
      navigate({ to: "/clients/$id", params: { id: data.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader title="Nuevo cliente" subtitle="Datos básicos para poder prestarle" />

      {limiteAlcanzado && (
        <Alert className="mb-4 max-w-2xl border-warning/40 bg-warning/10">
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
      <form onSubmit={submit} className="surface max-w-2xl space-y-4 p-5">
        <div className="space-y-1.5">
          <Label htmlFor="full_name">Nombre completo *</Label>
          <Input
            id="full_name"
            required
            className="h-11"
            value={form.full_name}
            onChange={set("full_name")}
            placeholder="Juan Pérez Martínez"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="cedula">Cédula</Label>
            <Input
              id="cedula"
              className="h-11"
              value={form.cedula}
              onChange={set("cedula")}
              placeholder="001-0000000-0"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone">Teléfono / WhatsApp</Label>
            <Input
              id="phone"
              className="h-11"
              value={form.phone}
              onChange={set("phone")}
              placeholder="809-000-0000"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">Correo</Label>
          <Input
            id="email"
            type="email"
            className="h-11"
            value={form.email}
            onChange={set("email")}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="address">Dirección</Label>
          <Input id="address" className="h-11" value={form.address} onChange={set("address")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="notes">Notas</Label>
          <Textarea id="notes" rows={3} value={form.notes} onChange={set("notes")} />
        </div>
        <div className="flex gap-2 pt-2">
          <Button type="submit" variant="accent" disabled={saving || limiteAlcanzado}>
            {saving ? "Guardando…" : "Guardar cliente"}
          </Button>
          <Button type="button" variant="secondary" onClick={() => navigate({ to: "/clients" })}>
            Cancelar
          </Button>
        </div>
      </form>
    </>
  );
}
