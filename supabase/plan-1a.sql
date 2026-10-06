-- PLAN CORTESÍA "1A"
-- Plan sin costo con los beneficios de Pro (clientes ilimitados + reportes
-- avanzados), oculto de la página pública de precios (is_active = false).
--
-- Por qué price = 0 y NO el plan Pro de pago:
--   - reports/page.tsx:24      advancedReports = (price === 0 || max_clients === null) -> sí
--   - plan-limits.sql trigger  price = 0 -> sin límite de clientes
--   - admin_usage_stats (MRR)  suma subscriptions.status='active' × plans.price -> 0
--   - AdminOverview.tsx:89     payingUsers exige plan_price > 0 -> excluido
-- Así los beneficios de Pro entran, pero no suman ingreso.
--
-- Idempotente: se puede aplicar varias veces sin duplicar.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM plans WHERE name = '1A') THEN
    INSERT INTO plans (name, price, currency, billing_cycle, description, features, max_clients, is_active)
    VALUES (
      '1A',
      0,
      'DOP',
      'monthly',
      'Plan 1A',
      '["Clientes ilimitados","Reportes avanzados","Soporte prioritario"]'::jsonb,
      NULL,
      false
    );
  END IF;
END $$;

-- Asegura las propiedades aunque el plan ya exista (por si se creó a mano desde el panel).
UPDATE plans
SET price = 0,
    max_clients = NULL,
    is_active = false,
    features = '["Clientes ilimitados","Reportes avanzados","Soporte prioritario"]'::jsonb,
    description = 'Plan 1A'
WHERE name = '1A';