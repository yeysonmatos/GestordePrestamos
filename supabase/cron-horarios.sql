-- Horarios de los cron internos (pg_cron) — CORREGIDO 27 Oct 2026
--
-- Motivo: el revisor semanal (05:00 UTC = 1:00 AM RD) denunciaba "préstamo con cuotas
-- vencidas sin marcar como atrasado" porque el pintado de estados corría a las
-- 07:00 UTC (3:00 AM RD), DESPUÉS de la revisión. Con la cuota que vence ese mismo día,
-- el chequeo acertaba el síntoma pero no había nada roto: solo era carrera de horas.
--
-- Cambio: el pintado pasa a las 04:00 UTC = 00:00 RD, antes del revisor y justo cuando
-- la cuota cambia de día. Beneficio extra: el chip "Atrasado" aparece a medianoche y no
-- a las 3:00 AM.
--
-- Aplicado en producción con scripts/exec-cron-horarios.mjs (pg_cron 1.6.4).

SELECT cron.alter_job(job_id := 1, schedule := '0 4 * * *');

-- Estado esperado de los cron de la base:
--   jobid 1 | update-loan-statuses-daily | 0 4 * * *  (00:00 RD)
--   jobid 2 | cleanup-audit-logs-weekly   | 0 8 * * 0  (04:00 RD, domingos)
--   jobid 8 | recalc-client-stats-daily   | 0 9 * * *  (05:00 RD)
--
-- Vercel (vercel.json), en UTC:
--   /api/cron/backup             0 4 * * *   (00:00 RD)
--   /api/cron/reconcile          0 5 * * 0   (01:00 RD, domingos)
--   /api/cron/subscription-notify 0 8 * * *  (04:00 RD)
