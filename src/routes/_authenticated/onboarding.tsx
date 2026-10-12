import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useProfile } from "@/lib/db";

export const Route = createFileRoute("/_authenticated/onboarding")({
  head: () => ({
    meta: [{ title: "Bienvenido | Gestor de Prestamos" }],
  }),
  component: Onboarding,
});

function Onboarding() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: profile } = useProfile();
  const [business, setBusiness] = useState(profile?.business_name === "Mi Negocio" ? "" : profile?.business_name ?? "");
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [saving, setSaving] = useState(false);

  async function continuar(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Sesión expirada. Vuelve a entrar.");
      const { error } = await supabase.from("settings").upsert(
        {
          user_id: auth.user.id,
          business_name: business.trim() || "Mi Negocio",
          business_phone: phone.trim() || null,
          onboarding_completed: true,
        },
        { onConflict: "user_id" },
      );
      if (error) throw new Error(error.message);
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      queryClient.invalidateQueries({ queryKey: ["entitlements"] });
      navigate({ to: "/dashboard", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No pudimos guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <img src="/gp-icon.png" alt="Gestor de Prestamos" className="mx-auto mb-3 size-14 rounded-xl object-cover" />
          <h1 className="font-display text-2xl font-bold">Bienvenido</h1>
          <p className="text-sm text-muted-foreground">Configuremos tu negocio</p>
        </div>

        <form
          onSubmit={continuar}
          className="space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm"
        >
          <div className="space-y-1.5">
            <Label htmlFor="negocio" className="text-sm text-muted-foreground">
              Nombre del negocio
            </Label>
            <Input
              id="negocio"
              value={business}
              onChange={(e) => setBusiness(e.target.value)}
              placeholder="Mi Negocio"
              className="h-11"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tel" className="text-sm text-muted-foreground">
              Teléfono
            </Label>
            <Input
              id="tel"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="809-555-1234"
              className="h-11"
            />
          </div>

          <Button type="submit" disabled={saving} variant="accent" className="h-11 w-full text-base">
            {saving ? "Guardando…" : "Continuar"} <ArrowRight className="ml-1 size-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
