import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  LayoutDashboard,
  Users,
  Banknote,
  HandCoins,
  CalendarDays,
  BarChart3,
  Settings,
  LogOut,
  Plus,

  CreditCard,
  AlertTriangle,
  MoreHorizontal,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/lib/db";
import { reportsBlocked, useEntitlements } from "@/lib/entitlements";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const NAV = [
  { to: "/dashboard", label: "Inicio", icon: LayoutDashboard },
  { to: "/collections", label: "Cobros", icon: HandCoins },
  { to: "/loans", label: "Préstamos", icon: Banknote },
  { to: "/clients", label: "Clientes", icon: Users },
  { to: "/calendar", label: "Calendario", icon: CalendarDays },
  { to: "/reports", label: "Reportes", icon: BarChart3 },
  { to: "/settings", label: "Ajustes", icon: Settings },
] as const;

const MOBILE_NAV = NAV.filter((n) =>
  ["/dashboard", "/collections", "/loans", "/clients", "/calendar"].includes(n.to),
);

// Opciones del panel "Más": Reportes, Ajustes, Mi plan y Cerrar sesión.
const MOBILE_EXTRA = NAV.filter((n) => ["/reports", "/settings"].includes(n.to));

export function AppShell({ children }: { children: React.ReactNode }) {
  const { data: profile } = useProfile();
  const { data: ent } = useEntitlements();
  const readOnly = ent?.readOnly ?? false;
  const hideReports = !!ent && reportsBlocked(ent.planName, ent.isAdmin);

  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [moreOpen, setMoreOpen] = useState(false);

  // El panel se cierra solo al cambiar de pantalla.
  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  const moreActive =
    pathname === "/reports" || pathname.startsWith("/reports/");

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar escritorio */}
      <aside className="no-print fixed inset-y-0 left-0 z-40 hidden w-64 flex-col bg-sidebar text-sidebar-foreground lg:flex">
        <div className="px-5 py-6">
          <p className="font-display text-lg font-bold text-sidebar-accent-foreground">
            Gestor de <span className="text-sidebar-primary">Prestamos</span>
          </p>
          <p className="mt-1 truncate text-xs text-sidebar-foreground/70">
            {profile?.business_name ?? "Mi Negocio"}
          </p>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {NAV.filter((n) => !(hideReports && n.to === "/reports")).map(({ to, label, icon: Icon }) => {
            const active = pathname === to || pathname.startsWith(`${to}/`);
            return (
              <Link
                key={to}
                to={to}
                className={cn(
                  "flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                )}
              >
                <Icon className="size-[18px]" />
                {label}
                {active && <span className="ml-auto h-5 w-1 rounded-full bg-sidebar-primary" />}
              </Link>
            );
          })}
        </nav>
        <div className="space-y-2 p-3">
          {!readOnly && (
            <Button asChild variant="accent" className="w-full">
              <Link to="/loans/new" search={{ client: undefined, edit: undefined }}>
                <Plus className="size-4" /> Nuevo préstamo
              </Link>
            </Button>
          )}
          <button
            onClick={signOut}
            className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-sm text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
          >
            <LogOut className="size-[18px]" /> Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Barra superior móvil */}
      <header className="no-print sticky top-0 z-30 flex items-center justify-between border-b border-border bg-background/90 px-4 py-3 backdrop-blur lg:hidden">
        <div>
          <p className="font-display text-sm font-bold">Gestor de Prestamos</p>
          <p className="truncate text-xs text-muted-foreground">
            {profile?.business_name ?? "Mi Negocio"}
          </p>
        </div>
        {!readOnly && (
          <Button size="sm" variant="accent" asChild>
            <Link to="/loans/new" search={{ client: undefined, edit: undefined }}>
              <Plus className="size-4" /> Préstamo
            </Link>
          </Button>
        )}
      </header>

      <main className="px-4 pb-28 pt-4 sm:px-6 lg:ml-64 lg:px-8 lg:pb-12 lg:pt-8">
        {readOnly && (
          <div className="no-print mb-4 flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>
              Tu suscripción venció: estás en <strong>modo lectura</strong>. Puedes cobrar y consultar,
              pero no crear préstamos ni clientes nuevos. Contacta al administrador para renovarla.
            </span>
          </div>
        )}
        {children}
      </main>

      {/* Panel "Más" móvil */}
      {moreOpen && (
        <>
          <button
            aria-label="Cerrar menú"
            onClick={() => setMoreOpen(false)}
            className="no-print fixed inset-0 z-40 bg-black/40 lg:hidden"
          />
          <div className="no-print fixed inset-x-0 bottom-[60px] z-50 px-3 pb-2 lg:hidden">
            <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-raised">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <p className="font-display text-sm font-semibold">Más opciones</p>
                <button
                  onClick={() => setMoreOpen(false)}
                  aria-label="Cerrar"
                  className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary"
                >
                  <X className="size-4" />
                </button>
              </div>
              <div className="p-2">
                {MOBILE_EXTRA.filter((n) => !(hideReports && n.to === "/reports")).map(({ to, label, icon: Icon }) => {
                  const active = pathname === to || pathname.startsWith(`${to}/`);
                  return (
                    <Link
                      key={to}
                      to={to}
                      className={cn(
                        "flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors",
                        active
                          ? "bg-secondary text-foreground"
                          : "text-muted-foreground hover:bg-secondary",
                      )}
                    >
                      <Icon className="size-5" />
                      {label}
                    </Link>
                  );
                })}
                <button
                  onClick={signOut}
                  className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
                >
                  <LogOut className="size-5" />
                  Cerrar sesión
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Navegación inferior móvil */}
      <nav className="no-print fixed inset-x-0 bottom-0 z-40 grid grid-cols-6 border-t border-border bg-card/95 backdrop-blur lg:hidden">
        {MOBILE_NAV.map(({ to, label, icon: Icon }) => {
          const active = pathname === to || pathname.startsWith(`${to}/`);
          return (
            <Link
              key={to}
              to={to}
              className={cn(
                "flex min-h-14 flex-col items-center justify-center gap-1 px-0.5 text-[11px] font-medium",
                active ? "text-accent-foreground" : "text-muted-foreground",
              )}
            >
              <Icon className={cn("size-5", active && "text-foreground")} />
              <span className="w-full truncate text-center leading-none">{label}</span>
            </Link>
          );
        })}
        <button
          onClick={() => setMoreOpen((v) => !v)}
          aria-expanded={moreOpen}
          className={cn(
            "flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] font-medium",
            moreActive || moreOpen ? "text-accent-foreground" : "text-muted-foreground",
          )}
        >
          <MoreHorizontal className={cn("size-5", (moreActive || moreOpen) && "text-foreground")} />
          <span className="w-full text-center leading-none">Más</span>
        </button>
      </nav>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-2xl font-bold sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {action && <div className="no-print flex gap-2">{action}</div>}
    </div>
  );
}





