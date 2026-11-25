#!/bin/bash
# Pruebas SQL contra un PostgreSQL local (no toca producción).
# Requiere un servidor PostgreSQL 16 accesible; por defecto:
#   PGHOST=/var/tmp/pgtest PGPORT=5499 PGUSER=postgres
# Uso: bash supabase/tests/run.sh
set -u
cd "$(dirname "$0")/../.."
export PGHOST="${PGHOST:-/var/tmp/pgtest}" PGPORT="${PGPORT:-5499}" PGUSER="${PGUSER:-postgres}"
DB=gp_test
P="psql -q -X"
$P -c "DROP DATABASE IF EXISTS $DB" -c "CREATE DATABASE $DB" postgres >/dev/null
$P -d $DB -f supabase/tests/supabase-stub.sql >/dev/null 2>&1

# Esquema base + migraciones en el orden en que se aplicaron en producción.
FILES="schema admin-schema tickets support-tickets-type tickets-attachments admin-stats
business-payment-fields cascade-guard client-stats-fix client-status-auto delete-loan-reason
delete-preserve-payments email-notify fix-auth-users fix-rls-recursion onboarding payment-requests
plan-limits plan-limits-fix platform-config post-delete-review security-guards settings-defaults
settings-personal soft-delete-loans sub-payment-target-plan audit-reconcile client-status-fix2
security-hardening security-hardening2 backup-restore-transactional timezone-rd loan-stats
trial-14-days plan-1a atomic-operations trial-abuse-guard"
for pass in 1 2; do
  for f in $FILES; do $P -d $DB -f supabase/$f.sql >/dev/null 2>&1; done
done
# Errores esperados del entorno local: pg_cron y buckets de Storage no existen.

FAILS=0
for t in supabase/tests/*.test.sql; do
  echo "== $(basename "$t")"
  OUT=$($P -d $DB -f "$t" 2>&1)
  echo "$OUT" | grep -E "^ *(OK|FALLA)"
  FAILS=$((FAILS + $(echo "$OUT" | grep -c "FALLA")))
done
echo "Fallas: $FAILS"
[ "$FAILS" -eq 0 ]
