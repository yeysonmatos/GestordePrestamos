-- ============================================================
-- loan-balances.sql — Saldos por préstamo calculados en la base
--
-- RPC public.loan_balances(): devuelve, por cada préstamo del usuario, lo que la
-- pantalla "Préstamos" calculaba en el navegador recorriendo TODAS las cuotas:
--   * pendiente = suma de (monto de la cuota − lo pagado), sin negativos.
--   * vencidas  = cuántas cuotas están vencidas (vencidas de verdad, ver abajo).
--   * dias      = días de atraso de la cuota más antigua sin pagar.
--
-- Reglas EXACTAS (idénticas a src/lib/finance.ts -> installmentStatus):
--   * Una cuota está PAGADA cuando round2(monto − pagado) <= 0.009.
--   * Está VENCIDA cuando NO está pagada y due_date < hoy (el día del vencimiento
--     todavía NO cuenta como atraso).
--   * dias = hoy − due_date en días calendario.
--
-- Se incluyen TODAS las cuotas (igual que la consulta anterior, que no filtraba
-- préstamos archivados): así los números son idénticos a los de antes.
--
-- Guarda: solo el dueño (auth.uid()) o el sistema (postgres/service_role).
-- Idempotente (CREATE OR REPLACE). Se aplica con scripts/exec-loan-balances.mjs
-- ============================================================

CREATE OR REPLACE FUNCTION public.loan_balances(p_user_id UUID DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_today DATE := public.today_rd();
  v_uid UUID;
  v_balances JSONB;
BEGIN
  -- Guarda de seguridad: solo el dueño puede leer SUS saldos.
  IF auth.uid() IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = current_user AND rolsuper)
       AND current_user NOT IN ('postgres', 'service_role') THEN
      RETURN NULL;
    END IF;
  ELSIF auth.uid() <> p_user_id THEN
    RETURN NULL;
  END IF;

  -- Usuario efectivo: el que llama (p_user_id puede venir NULL desde la app).
  v_uid := COALESCE(p_user_id, auth.uid());

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'loan_id', t.loan_id,
           'pendiente', t.pendiente,
           'vencidas', t.vencidas,
           'dias', t.dias
         )), '[]'::jsonb)
    INTO v_balances
  FROM (
    SELECT
      i.loan_id,
      COALESCE(SUM(GREATEST(0, i.amount - COALESCE(i.paid_amount, 0))), 0) AS pendiente,
      COUNT(*) FILTER (
        WHERE ROUND(i.amount - COALESCE(i.paid_amount, 0), 2) > 0.009
          AND i.due_date < v_today
      ) AS vencidas,
      COALESCE(MAX(
        CASE
          WHEN ROUND(i.amount - COALESCE(i.paid_amount, 0), 2) > 0.009
               AND i.due_date < v_today
          THEN (v_today - i.due_date)
        END
      ), 0) AS dias
    FROM public.installments i
    JOIN public.loans l ON l.id = i.loan_id
    WHERE l.user_id = v_uid
    GROUP BY i.loan_id
  ) t;

  RETURN jsonb_build_object('balances', COALESCE(v_balances, '[]'::jsonb));
END;
$$;

REVOKE ALL ON FUNCTION public.loan_balances(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.loan_balances(UUID) TO authenticated, service_role;
