import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth_/callback")({
  head: () => ({
    meta: [{ title: "Completando acceso | Gestor de Prestamos" }],
  }),
  component: AuthCallback,
});

// landing de OAuth (Google): supabase-js detecta el ?code= en la URL al
// inicializar y completa la sesión; aquí solo esperamos y dirigimos.
function AuthCallback() {
  const navigate = useNavigate();
  const [msg, setMsg] = useState("Completando acceso…");

  useEffect(() => {
    let done = false;

    async function route(sessionOk: boolean) {
      if (done) return;
      done = true;
      if (!sessionOk) {
        setMsg("No pudimos verificar tu cuenta. Volviendo al inicio…");
        setTimeout(() => navigate({ to: "/auth", replace: true }), 900);
        return;
      }
      let isAdmin = false;
      try {
        const { data } = await supabase.auth.getUser();
        if (data.user) {
          const { data: au } = await supabase
            .from("app_users")
            .select("role")
            .eq("id", data.user.id)
            .maybeSingle();
          isAdmin = au?.role === "admin";
        }
      } catch {
        // sin fila en app_users -> flujo normal de cliente
      }
      navigate({ to: isAdmin ? "/admin" : "/dashboard", replace: true });
    }

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) void route(true);
    });

    const trySession = async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) await route(true);
    };
    void trySession();
    const t1 = setTimeout(() => void trySession(), 1500);
    const t2 = setTimeout(() => void trySession(), 3500);
    const fail = setTimeout(() => void route(false), 8000);

    const q = new URLSearchParams(window.location.search);
    if (q.get("error") || q.get("error_description")) {
      clearTimeout(t1);
      clearTimeout(t2);
      void route(false);
    }

    return () => {
      sub.subscription.unsubscribe();
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(fail);
    };
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center">
        <div className="mx-auto size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="mt-4 text-sm text-muted-foreground">{msg}</p>
      </div>
    </div>
  );
}
