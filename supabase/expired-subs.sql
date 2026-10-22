-- ============================================================
-- expired-subs.sql — Suscripciones VENCIDAS (para el resumen diario al admin)
--
-- RPC public.expired_subscriptions(): lista, por cada usuario cliente, SOLO su
-- suscripcion VIGENTE (la mas reciente, igual que la app) y devuelve las que estan
-- vencidas/canceladas. Cubre TODOS los planes (Trial, Basico, Pro, ...), no solo
-- trial como hacia el aviso viejo.
--
-- Datos que trae para redactar el cobro: negocio, correo/telfono de contacto,
-- plan y precio, cuantos dias hace que vencio, prestamos activos y clientes.
--
-- Solo la puede llamar el sistema (service_role/postgres): contiene correos de
-- otros usuarios. REVOKE a anon/authenticated + GRANT a service_role.
-- Idempotente (CREATE OR REPLACE). Se aplica con scripts/exec-expired-subs.mjs
-- ============================================================

CREATE OR REPLACE FUNCTION public.expired_subscriptions()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $function$
  WITH ultimas AS (
    -- la suscripcion vigente de cada cliente = la mas reciente (misma regla que
    -- useSubscription/entitlements en la app; evita denunciar planes viejos ya
    -- reemplazados al cambiar de plan)
    SELECT DISTINCT ON (s.user_id) s.user_id, s.status, s.ends_at, s.plan_id
    FROM public.subscriptions s
    WHERE s.user_id IN (SELECT id FROM public.app_users WHERE role <> 'admin')
    ORDER BY s.user_id, s.created_at DESC, s.id DESC
  ),
  vencidas AS (
    SELECT * FROM ultimas
    WHERE status IN ('expired', 'cancelled')
       OR (
         ends_at IS NOT NULL
         AND (ends_at AT TIME ZONE 'America/Santo_Domingo')::date < public.today_rd()
       )
  )
  SELECT COALESCE(
    jsonb_agg(t.row_json ORDER BY t.ends_at ASC NULLS LAST),
    '[]'::jsonb
  )
  FROM (
    SELECT
      v.ends_at,
      jsonb_build_object(
        'user_id',       v.user_id,
        'email',         (SELECT u.email FROM auth.users u WHERE u.id = v.user_id),
        'business_name', st.business_name,
        'business_phone', st.business_phone,
        'business_email', st.business_email,
        'plan_name',     COALESCE(p.name, '?'),
        'plan_price',    COALESCE(p.price, 0),
        'status',        v.status,
        'ends_at',       v.ends_at,
        'dias',          CASE
                           WHEN v.ends_at IS NOT NULL
                           THEN (public.today_rd() - (v.ends_at AT TIME ZONE 'America/Santo_Domingo')::date)
                         END,
        'loans',         (SELECT COUNT(*) FROM public.loans l
                           WHERE l.user_id = v.user_id AND l.deleted_at IS NULL
                             AND l.status IN ('active','late','late_1_30','late_31_60','late_61_90')),
        'clients',       (SELECT COUNT(*) FROM public.clients c WHERE c.user_id = v.user_id)
      ) AS row_json
    FROM vencidas v
    LEFT JOIN public.settings st ON st.user_id = v.user_id
    LEFT JOIN public.plans p ON p.id = v.plan_id
  ) t;
$function$;

-- Solo el sistema puede ver los correos de otros usuarios.
REVOKE ALL ON FUNCTION public.expired_subscriptions() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expired_subscriptions() TO service_role;
