import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Entitlements = {
  readOnly: boolean;
  planName: string | null;
  isAdmin: boolean;
};

/**
 * Estado de acceso del usuario logueado (client + RLS de su propia suscripción).
 * readOnly = suscripción vencida/cancelada/prueba expirada (modo lectura, como GP).
 * Los administradores nunca entran en modo lectura.
 */
export async function fetchEntitlements(): Promise<Entitlements> {
  const { data } = await supabase.auth.getUser();
  const uid = data.user?.id;
  if (!uid) return { readOnly: false, planName: null, isAdmin: false };

  const [roleRes, subRes] = await Promise.all([
    supabase.from("app_users").select("role").eq("id", uid).maybeSingle(),
    supabase
      .from("subscriptions")
      .select("status, ends_at, plan:plans(name)")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const sub = subRes.data as
    | { status: string; ends_at: string | null; plan?: { name: string } | { name: string }[] | null }
    | null;
  const planName =
    (Array.isArray(sub?.plan) ? sub?.plan[0]?.name ?? null : sub?.plan?.name ?? null) ?? null;

  let readOnly = false;
  if (sub) {
    if (sub.status === "cancelled" || sub.status === "expired") readOnly = true;
    else if (sub.ends_at && new Date(sub.ends_at).getTime() < Date.now()) readOnly = true;
  }
  const isAdmin = roleRes.data?.role === "admin";
  return { readOnly: readOnly && !isAdmin, planName, isAdmin };
}

export function useEntitlements() {
  return useQuery({
    queryKey: ["entitlements"],
    queryFn: fetchEntitlements,
    staleTime: 60_000,
  });
}

/** Básico no ve Reportes (como GP). Trial, Pro y demás planes mantienen acceso. */
export function reportsBlocked(planName: string | null | undefined, isAdmin: boolean): boolean {
  if (isAdmin) return false;
  return /^b[aá]sico$/i.test((planName ?? "").trim());
}
