import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { AdminShell } from "@/components/admin/admin-shell";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/admin")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    const { data: row } = await supabase
      .from("app_users")
      .select("role")
      .eq("id", data.user.id)
      .maybeSingle();
    if (row?.role !== "admin") throw redirect({ to: "/dashboard" });
  },
  head: () => ({
    meta: [
      { title: "Administración SaaS | Gestor de Prestamos" },
      {
        name: "description",
        content:
          "Panel del administrador: suscriptores registrados, pagos de suscripción, planes y auditoría de la plataforma.",
      },
      { property: "og:title", content: "Administración SaaS | Gestor de Prestamos" },
        { property: "og:description", content: "Suscriptores, pagos, planes e ingresos de la plataforma." },
    ],
  }),
  component: () => (
    <AdminShell>
      <Outlet />
    </AdminShell>
  ),
});

