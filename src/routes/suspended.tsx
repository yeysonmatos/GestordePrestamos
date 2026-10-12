import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Ban, LogOut } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/suspended")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Cuenta suspendida | Gestor de Prestamos" }],
  }),
  component: Suspended,
});

function Suspended() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [checking, setChecking] = useState(true);

  // Si el acceso fue restaurado, se devuelve al panel.
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        if (alive) void navigate({ to: "/auth", replace: true });
        return;
      }
      const { data: au } = await supabase
        .from("app_users")
        .select("status")
        .eq("id", data.user.id)
        .maybeSingle();
      if (alive && au && au.status !== "blocked") {
        void navigate({ to: "/dashboard", replace: true });
      }
      if (alive) setChecking(false);
    })().catch(() => setChecking(false));
    return () => {
      alive = false;
    };
  }, [navigate]);

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 text-sm text-muted-foreground">
        Verificando tu cuenta…
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md p-8 text-center">
        <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-destructive/10">
          <Ban className="size-7 text-destructive" />
        </div>
        <h1 className="font-display text-xl font-bold">Cuenta suspendida</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Tu acceso fue suspendido por el administrador de la plataforma. Los datos de tus préstamos siguen
          guardados y no se perderán.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Para reactivarla, contacta al administrador de <strong>Gestor de Prestamos</strong>.
        </p>
        <Button variant="secondary" className="mt-6 w-full min-h-11" onClick={signOut}>
          <LogOut className="mr-2 size-4" /> Cerrar sesión
        </Button>
      </Card>
    </div>
  );
}


