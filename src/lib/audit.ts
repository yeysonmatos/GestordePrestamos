import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

/**
 * Registra una entrada de auditoría del usuario logueado.
 * La RLS de `audit_logs` permite insertar filas propias (`auth.uid() = user_id`).
 * Nunca lanza: si falla solo avisa por consola (no debe romper la operación).
 */
export async function logAudit(opts: {
  action: string;
  entityType: string;
  entityId?: string | null;
  details?: Record<string, unknown> | null;
  /** Si el llamador ya conoce el id del usuario, se evita releer la sesión. */
  userId?: string;
}): Promise<void> {
  try {
    let uid = opts.userId;
    if (!uid) {
      const { data } = await supabase.auth.getSession();
      uid = data.session?.user?.id;
    }
    if (!uid) return;

    const { error } = await supabase.from("audit_logs").insert({
      user_id: uid,
      action: opts.action,
      entity_type: opts.entityType,
      entity_id: opts.entityId ?? null,
      details: (opts.details ?? null) as unknown as Json,
    });
    if (error) console.warn("[audit]", opts.action, error.message);
  } catch (err) {
    console.warn("[audit]", opts.action, err);
  }
}
