#!/usr/bin/env bash
set -euo pipefail
if [[ -n "${SUDO_PASS:-}" ]]; then
  printf '%s\n' "$SUDO_PASS" | sudo -S -v >/dev/null 2>&1
fi
set -a
# shellcheck disable=SC1090
source <(sudo cat /data/fleet/secrets/store_abbyglow.env)
set +a
if command -v node >/dev/null 2>&1; then
  node /home/tay/db-schema-smoke.mjs
else
  echo "node missing — falling back to psql checks"
  sudo docker exec -e PGPASSWORD="$STORE_PASS" fleet-postgres \
    psql -U store_abbyglow -d store_abbyglow -v ON_ERROR_STOP=1 -c "
SELECT 'payment_attempts' AS obj, to_regclass('public.payment_attempts') IS NOT NULL AS ok
UNION ALL SELECT 'auth.role', EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='auth' AND p.proname='role')
UNION ALL SELECT 'mark_order_paid', EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='mark_order_paid')
UNION ALL SELECT 'schema_migrations', to_regclass('public.schema_migrations') IS NOT NULL;
"
fi
