#!/usr/bin/env bash
set -euo pipefail
source /data/fleet/secrets/db-stack.env
source /data/fleet/secrets/store_abbyglow.env

echo "==> Resetting store_abbyglow (isolated AbbyGlow DB — not Anael)"
docker exec -e PGPASSWORD="$POSTGRES_SUPERPASS" fleet-postgres \
  psql -v ON_ERROR_STOP=1 -U postgres -d postgres <<SQL
SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'store_abbyglow' AND pid <> pg_backend_pid();
DROP DATABASE IF EXISTS store_abbyglow;
CREATE DATABASE store_abbyglow OWNER store_abbyglow;
REVOKE CONNECT ON DATABASE store_abbyglow FROM PUBLIC;
GRANT CONNECT ON DATABASE store_abbyglow TO store_abbyglow;
SQL

docker exec -e PGPASSWORD="$POSTGRES_SUPERPASS" fleet-postgres \
  psql -v ON_ERROR_STOP=1 -U postgres -d store_abbyglow <<SQL
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT ALL ON SCHEMA public TO store_abbyglow;
SQL

echo "==> Bootstrap auth + extensions"
docker exec -i -e PGPASSWORD="$POSTGRES_SUPERPASS" fleet-postgres \
  psql -v ON_ERROR_STOP=1 -U postgres -d store_abbyglow < /home/tay/abbyglow-plain-pg-bootstrap.sql

echo "==> Apply schema migrations as store_abbyglow"
for f in /home/tay/abbyglow-migrations/*.sql; do
  echo "---- $(basename "$f")"
  # Continue on RLS/policy noise; schema objects must succeed
  docker exec -i -e PGPASSWORD="$STORE_PASS" fleet-postgres \
    psql -v ON_ERROR_STOP=0 -U store_abbyglow -d store_abbyglow < "$f" | tail -n 5
done

echo "==> Verify core tables"
docker exec -e PGPASSWORD="$STORE_PASS" fleet-postgres \
  psql -U store_abbyglow -d store_abbyglow -c \
  "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY 1;"

echo "==> Verify auth.users"
docker exec -e PGPASSWORD="$STORE_PASS" fleet-postgres \
  psql -U store_abbyglow -d store_abbyglow -c \
  "SELECT count(*) AS auth_users FROM auth.users;"

echo "DONE"
