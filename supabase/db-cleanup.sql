-- ============================================================
-- 25 Nov 2026 — Limpieza tras la revisión de seguridad.
-- (APLICADO en producción vía Supabase MCP.)
--
-- 1) save_loan_with_schedule: se creó para la app Next.js vieja; la app
--    actual crea/edita préstamos con save_loan. Sin uso ⇒ se elimina.
-- 2) search_path fijo en 4 funciones que el revisor de Supabase marca como
--    "role mutable search_path". ALTER ... SET conserva los demás ajustes
--    (p. ej. TimeZone=UTC de today_rd).
-- ============================================================
DROP FUNCTION IF EXISTS public.save_loan_with_schedule(UUID, JSONB, JSONB);

ALTER FUNCTION public.calc_late_amount(numeric, integer, numeric) SET search_path = 'public';
ALTER FUNCTION public.calc_late_days(date, integer) SET search_path = 'public';
ALTER FUNCTION public.today_rd() SET search_path = 'public';
ALTER FUNCTION public.normalize_email(text) SET search_path = 'public';
