import { createFileRoute, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });

    // Acceso bloqueado desde el panel admin → pantalla de suspensión
    const { data: au } = await supabase
      .from("app_users")
      .select("status")
      .eq("id", data.user.id)
      .maybeSingle();
    if (au?.status === "blocked") throw redirect({ to: "/suspended" });

    // Primer inicio: onboarding de negocio pendiente (no aplica al panel admin)
    const path = location.pathname;
    if (!path.startsWith("/admin") && !path.startsWith("/onboarding")) {
      const { data: set } = await supabase
        .from("settings")
        .select("onboarding_completed")
        .eq("user_id", data.user.id)
        .maybeSingle();
      if (set && set.onboarding_completed === false) throw redirect({ to: "/onboarding" });
    }

    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // /admin es un sistema aparte (AdminShell propio); no usa el AppShell de préstamos.
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    return <Outlet />;
  }
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}

