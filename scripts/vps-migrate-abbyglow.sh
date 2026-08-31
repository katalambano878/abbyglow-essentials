#!/usr/bin/env bash
set -euo pipefail
source /data/fleet/secrets/db-stack.env
source /data/fleet/secrets/store_abbyglow.env

MIG_DIR="${1:-$HOME/abbyglow-setup/migrations}"
BOOT="${2:-$HOME/abbyglow-setup/abbyglow-plain-pg-bootstrap.sql}"

echo "==> Bootstrap auth + extensions"
docker exec -i -e PGPASSWORD="$POSTGRES_SUPERPASS" fleet-postgres \
  psql -v ON_ERROR_STOP=1 -U postgres -d store_abbyglow < "$BOOT"

echo "==> Apply migrations from $MIG_DIR"
for f in "$MIG_DIR"/*.sql; do
  echo "---- $(basename "$f")"
  docker exec -i -e PGPASSWORD="$STORE_PASS" fleet-postgres \
    psql -v ON_ERROR_STOP=0 -U store_abbyglow -d store_abbyglow < "$f" | tail -n 3
done

echo "==> Table count"
docker exec -e PGPASSWORD="$STORE_PASS" fleet-postgres \
  psql -U store_abbyglow -d store_abbyglow -tAc \
  "SELECT count(*) FROM pg_tables WHERE schemaname='public';"
