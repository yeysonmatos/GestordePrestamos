-- admin-full.sql
-- Poderes de administración del SaaS vía RLS para el panel /admin.
-- GP ejercía estas operaciones desde rutas API con service role; al ser el
-- Lovable una app puramente cliente, el admin (is_admin()) opera vía RLS.
-- Aditivo: no modifica políticas existentes.

-- subscription_payments:
--   - INSERT: el admin registra un pago (siempre pendiente, monto > 0)
--   - UPDATE: el admin confirma/rechaza (resuelve la suscripción en código)
--   - DELETE: el admin elimina pagos espurios
DROP POLICY IF EXISTS admin_payments_insert ON public.subscription_payments;
CREATE POLICY admin_payments_insert ON public.subscription_payments
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() AND amount > 0 AND status = 'pending');

DROP POLICY IF EXISTS admin_payments_update ON public.subscription_payments;
CREATE POLICY admin_payments_update ON public.subscription_payments
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS admin_payments_delete ON public.subscription_payments;
CREATE POLICY admin_payments_delete ON public.subscription_payments
  FOR DELETE TO authenticated
  USING (public.is_admin());

-- audit_logs: el admin escribe la auditoría de la plataforma.
DROP POLICY IF EXISTS admin_audit_insert ON public.audit_logs;
CREATE POLICY admin_audit_insert ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

-- Índice para el listado de pagos (orden + filtro por estado).
CREATE INDEX IF NOT EXISTS idx_sub_payments_user_status
  ON public.subscription_payments (user_id, status);
CREATE INDEX IF NOT EXISTS idx_sub_payments_created
  ON public.subscription_payments (created_at DESC);