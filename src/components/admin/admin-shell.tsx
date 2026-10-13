import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  CreditCard,
  FileText,
  HandCoins,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  MoreHorizontal,
  ShieldCheck,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { usePendingPayments, usePendingSupport } from "@/lib/admin";

const MAIN_NAV = [
  { to: "/admin", label: "Resumen", icon: LayoutDashboard, exact: true },
  { to: "/admin/users", label: "Usuarios", icon: Users, exact: false },
  { to: "/admin/payments", label: "Pagos", icon: HandCoins, exact: false },
  { to: "/admin/support", label: "Soporte", icon: LifeBuoy, exact: false },
] as const;

const MORE_NAV = [
  { to: "/admin/audit", label: "Auditorías", icon: FileText, exact: false },
  { to: "/admin/plans", label: "Planes", icon: CreditCard, exact: false },
  { to: "/admin/payment-config", label: "Datos de pago", icon: Wallet, exact: false },
  { to: "/admin/comunicaciones", label: "Comunicaciones", icon: Bell, exact: false },
  { to: "/admin/seguridad", label: "Seguridad", icon: ShieldCheck, exact: false },
] as const;

const MENU = [...MAIN_NAV, ...MORE_NAV];

function isActive(pathname: string, to: string, exact: boolean) {
  if (exact) return pathname === to;
  return pathname === to || pathname.startsWith(`${to}/`);
}

/**
 * Shell propio del sistema de administración (SaaS).
 * Escritorio: sidebar "GP Admin". Móvil: barra inferior con 5 tabs + "Más",
 * mismo patrón de navegación que la app de préstamos.
 */
export function AdminShell({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data: pendingCount } = usePendingPayments();
  const { data: pendingSupport } = usePendingSupport();
  const [moreOpen, setMoreOpen] = useState(false);

  /** Contador para el badge rojo de cada seccion del menu. */
  function badgeFor(to: string): number {
    if (to === "/admin/payments") return pendingCount ?? 0;
    if (to === "/admin/support") return pendingSupport ?? 0;
    return 0;
  }

  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const moreActive = MORE_NAV.some((n) => isActive(pathname, n.to, n.exact));

  const sidebar = (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="border-b border-sidebar-border/60 p-5">
        <Link to="/admin" className="flex items-center gap-3">
          <span className="font-display text-lg font-bold tracking-tight text-sidebar-accent-foreground">
            GP Admin
          </span>
        </Link>
        <p className="mt-1 text-xs text-sidebar-foreground/70">Gestión de suscriptores del SaaS</p>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
        {MENU.map(({ to, label, icon: Icon, exact }) => {
          const active = isActive(pathname, to, exact);
          return (
            <Link
              key={to}
              to={to}
              className={cn(
                "relative flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
              )}
            >
              {active && (
                <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-sidebar-primary" />
              )}
              <Icon className="size-[18px] shrink-0" />
              {label}
              {badgeFor(to) > 0 && (
                <span className="ml-auto min-w-5 rounded-full bg-destructive px-1.5 py-0.5 text-center text-[10px] font-bold leading-none text-white">
                  {badgeFor(to)}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-sidebar-border/60 p-3">
        <button
          onClick={signOut}
          className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-destructive/10 hover:text-destructive"
        >
          <LogOut className="size-[18px] shrink-0" />
          Cerrar sesión
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar escritorio */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 lg:block">{sidebar}</aside>

      {/* Header móvil */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background/90 px-4 backdrop-blur lg:hidden">
        <div>
          <p className="font-display text-sm font-bold">GP Admin</p>
          <p className="text-xs text-muted-foreground">Gestión de suscriptores del SaaS</p>
        </div>
      </header>

      <main className="px-4 pb-28 pt-4 sm:px-6 lg:ml-64 lg:px-8 lg:pb-12 lg:pt-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>

      {/* Panel "Más" móvil */}
      {moreOpen && (
        <>
          <button
            aria-label="Cerrar menú"
            onClick={() => setMoreOpen(false)}
            className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          />
          <div className="fixed inset-x-0 bottom-[60px] z-50 px-3 pb-2 lg:hidden">
            <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-lg">
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
                {MORE_NAV.map(({ to, label, icon: Icon }) => {
                  const active = isActive(pathname, to, false);
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
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-border bg-card/95 backdrop-blur lg:hidden">
        {MAIN_NAV.map(({ to, label, icon: Icon }) => {
          const active = isActive(pathname, to, to === "/admin");
          return (
            <Link
              key={to}
              to={to}
              className={cn(
                "flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] font-medium",
                active ? "text-accent-foreground" : "text-muted-foreground",
              )}
            >
              <span className="relative">
                <Icon className={cn("size-5", active && "text-foreground")} />
                {badgeFor(to) > 0 && (
                  <span className="absolute -right-2.5 -top-1.5 min-w-4 rounded-full bg-destructive px-1 text-center text-[9px] font-bold leading-4 text-white">
                    {badgeFor(to)}
                  </span>
                )}
              </span>
              <span className="w-full truncate px-0.5 text-center leading-none">{label}</span>
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
          Más
        </button>
      </nav>
    </div>
  );
}
