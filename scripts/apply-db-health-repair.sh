#!/usr/bin/env bash
set -euo pipefail
if [[ -n "${SUDO_PASS:-}" ]]; then
  printf '%s\n' "$SUDO_PASS" | sudo -S -v >/dev/null 2>&1
else
  sudo -v
fi
set -a
# shellcheck disable=SC1090
source <(sudo cat /data/fleet/secrets/store_abbyglow.env)
set +a
: "${STORE_PASS:?missing}"

SQL_FILE="${1:-/home/tay/abbyglow-db-health-repair.sql}"
sudo docker exec -i -e PGPASSWORD="$STORE_PASS" fleet-postgres \
  psql -U store_abbyglow -d store_abbyglow -v ON_ERROR_STOP=1 < "$SQL_FILE"
echo APPLY_OK
sudo docker exec -e PGPASSWORD="$STORE_PASS" fleet-postgres \
  psql -U store_abbyglow -d store_abbyglow -tAc \
  "SELECT 'auth.role='||EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='auth' AND p.proname='role');
   SELECT 'storage.buckets='||EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='storage' AND table_name='buckets');
   SELECT 'migrations='||count(*) FROM schema_migrations;
   SELECT 'protect_trigger='||EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='trg_protect_successful_payment_attempt');"
