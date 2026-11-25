-- ============================================================
-- 25 Nov 2026 — Cierra la ejecución anónima de las RPC de cobro.
-- (APLICADO en producción vía Supabase MCP.)
--
-- process_installment_payment / process_cascade_payment tenían EXECUTE
-- para PUBLIC (=> anon). Su guarda "IF p_user_id <> auth.uid()" no detiene
-- una llamada sin sesión: auth.uid() es NULL, la comparación da NULL y no
-- entra al IF ⇒ con el UUID de un usuario y de un préstamo se podían
-- registrar pagos ajenos sin iniciar sesión.
-- La app siempre las llama con sesión (authenticated) ⇒ sin impacto.
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.process_installment_payment(
  uuid, uuid, uuid, numeric, boolean, date, text, text, numeric, integer
) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.process_cascade_payment(
  uuid, uuid, numeric, boolean, date, text, text, numeric, integer
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_installment_payment(
  uuid, uuid, uuid, numeric, boolean, date, text, text, numeric, integer
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.process_cascade_payment(
  uuid, uuid, numeric, boolean, date, text, text, numeric, integer
) TO authenticated, service_role;
