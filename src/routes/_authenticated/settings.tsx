import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { LogOut } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app-shell";
import { AccountPanel } from "@/components/settings/account-panel";
import { ExportPanel } from "@/components/settings/export-panel";
import { SupportPanel } from "@/components/settings/support-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/lib/audit";
import { useProfile } from "@/lib/db";

type Tab = "ajustes" | "plan" | "soporte" | "exportar";

function tabFromUrl(): Tab {
  const t = new URLSearchParams(window.location.search).get("tab");
  return t === "plan" || t === "soporte" || t === "exportar" ? t : "ajustes";
}

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Ajustes | Gestor de Prestamos" },
      {
        name: "description",
        content: "Datos de tu negocio, tu plan y soporte en Gestor de Prestamos.",
      },
      { property: "og:title", content: "Ajustes | Gestor de Prestamos" },
      { property: "og:description", content: "Datos de tu negocio, tu plan y soporte." },
    ],
  }),
  component: Settings,
});

function Settings() {
  const { data: profile } = useProfile();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>(tabFromUrl);
  const [form, setForm] = useState({
    business_name: "",
    owner_name: "",
    phone: "",
    default_late_fee_rate: "",
    grace_days: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile) {
      setForm({
        business_name: profile.business_name ?? "",
        owner_name: profile.owner_name ?? "",
        phone: profile.phone ?? "",
        default_late_fee_rate: profile.default_late_fee_rate
          ? String(profile.default_late_fee_rate)
          : "",
        grace_days: profile.grace_days ? String(profile.grace_days) : "",
      });
    }
  }, [profile]);

  function cambiarTab(v: string) {
    const next = (v === "plan" || v === "soporte" || v === "exportar" ? v : "ajustes") as Tab;
    setTab(next);
    window.history.replaceState({}, "", next === "ajustes" ? "/settings" : `/settings?tab=${next}`);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase.from("settings").upsert(
      {
        user_id: profile?.id ?? "",
        business_name: form.business_name || "Mi Negocio",
        personal_name: form.owner_name || null,
        business_phone: form.phone || null,
        late_interest_rate: Number(form.default_late_fee_rate) || 0,
        grace_days: Number(form.grace_days) || 0,
      },
      { onConflict: "user_id" },
    );
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    // Auditoría: solo los ajustes que cambiaron.
    const nextVals: Record<string, unknown> = {
      business_name: form.business_name || "Mi Negocio",
      personal_name: form.owner_name || null,
      business_phone: form.phone || null,
      late_interest_rate: Number(form.default_late_fee_rate) || 0,
      grace_days: Number(form.grace_days) || 0,
    };
    const prevVals: Record<string, unknown> = {
      business_name: profile?.business_name ?? "",
      personal_name: profile?.owner_name ?? null,
      business_phone: profile?.phone ?? null,
      late_interest_rate: profile?.default_late_fee_rate ?? 0,
      grace_days: profile?.grace_days ?? 0,
    };
    const changed: Record<string, unknown> = {};
    const was: Record<string, unknown> = {};
    for (const k of Object.keys(nextVals)) {
      if (String(nextVals[k] ?? "") !== String(prevVals[k] ?? "")) {
        changed[k] = nextVals[k];
        was[k] = prevVals[k];
      }
    }
    if (Object.keys(changed).length > 0) {
      await logAudit({
        action: "settings.updated",
        entityType: "settings",
        entityId: profile?.id ?? null,
        details: { ...changed, __previous: was },
      });
    }
    await queryClient.invalidateQueries();
    toast.success("Ajustes guardados");
  }

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <>
      <PageHeader title="Ajustes" subtitle="Tu negocio, tu plan y tu soporte" />

      <Tabs value={tab} onValueChange={cambiarTab}>
        <TabsList className="w-full max-w-md justify-start">
          <TabsTrigger value="ajustes">Ajustes</TabsTrigger>
          <TabsTrigger value="plan">Mi Plan</TabsTrigger>
          <TabsTrigger value="soporte">Soporte</TabsTrigger>
          <TabsTrigger value="exportar">Exportar</TabsTrigger>
        </TabsList>

        <TabsContent value="ajustes" className="mt-4 space-y-4">
          <form onSubmit={save} className="surface max-w-xl space-y-4 p-5">
            <div className="space-y-1.5">
              <Label htmlFor="negocio">Nombre del negocio</Label>
              <Input
                id="negocio"
                className="h-11"
                value={form.business_name}
                onChange={(e) => setForm({ ...form, business_name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dueno">Nombre del dueño</Label>
              <Input
                id="dueno"
                className="h-11"
                value={form.owner_name}
                onChange={(e) => setForm({ ...form, owner_name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tel">Teléfono</Label>
              <Input
                id="tel"
                className="h-11"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="809-000-0000"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mora">Mora por defecto (% diaria)</Label>
              <Input
                id="mora"
                inputMode="decimal"
                className="h-11"
                placeholder="0"
                value={form.default_late_fee_rate}
                onChange={(e) => setForm({ ...form, default_late_fee_rate: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gracia">Días de gracia antes de cobrar mora</Label>
              <Input
                id="gracia"
                inputMode="numeric"
                className="h-11"
                placeholder="0"
                value={form.grace_days}
                onChange={(e) => setForm({ ...form, grace_days: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Ej. 3: la cuota vencida empieza a generar mora a partir del día 4. Se aplica en
                Cobros y en el detalle del préstamo.
              </p>
            </div>
            <Button type="submit" variant="accent" disabled={saving}>
              {saving ? "Guardando…" : "Guardar cambios"}
            </Button>
          </form>

          <div className="surface mt-4 flex max-w-xl items-center justify-between p-5">
            <div>
              <p className="font-display text-sm font-semibold">Cerrar sesión</p>
              <p className="text-xs text-muted-foreground">
                Saldrás de tu cuenta en este dispositivo.
              </p>
            </div>
            <Button variant="secondary" onClick={signOut}>
              <LogOut className="size-4" /> Salir
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="plan" className="mt-4">
          <AccountPanel />
        </TabsContent>

        <TabsContent value="soporte" className="mt-4">
          <SupportPanel />
        </TabsContent>

        <TabsContent value="exportar" className="mt-4">
          <ExportPanel />
        </TabsContent>
      </Tabs>
    </>
  );
}
