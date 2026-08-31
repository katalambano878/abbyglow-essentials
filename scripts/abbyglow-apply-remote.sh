#!/usr/bin/env bash
set -euo pipefail
source /data/fleet/secrets/store_abbyglow.env

echo "Bootstrapping extensions..."
docker exec -i -e PGPASSWORD="$STORE_PASS" fleet-postgres \
  psql -v ON_ERROR_STOP=1 -U postgres -d store_abbyglow < /home/tay/abbyglow-bootstrap.sql

echo "Applying migrations..."
for f in /home/tay/abbyglow-migrations/*.sql; do
  echo "---- $(basename "$f")"
  docker exec -i -e PGPASSWORD="$STORE_PASS" fleet-postgres \
    psql -v ON_ERROR_STOP=1 -U store_abbyglow -d store_abbyglow < "$f"
done

echo "Tables:"
docker exec -e PGPASSWORD="$STORE_PASS" fleet-postgres \
  psql -U store_abbyglow -d store_abbyglow -c '\dt'

echo "DONE store_abbyglow ready"
