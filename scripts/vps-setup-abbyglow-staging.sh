#!/usr/bin/env bash
set -euo pipefail

echo "==> AbbyGlow staging VPS setup (isolated from anael)"

# Apply schema migrations into store_abbyglow using fleet-postgres
MIG_DIR="${1:-}"
if [[ -z "$MIG_DIR" || ! -d "$MIG_DIR" ]]; then
  echo "usage: $0 <migrations-dir>"
  exit 1
fi

# shellcheck disable=SC1091
source /data/fleet/secrets/store_abbyglow.env
# STORE_PASS from secrets file

echo "==> Applying migrations from $MIG_DIR"
for f in "$MIG_DIR"/*.sql; do
  echo "---- $(basename "$f")"
  docker exec -i -e PGPASSWORD="$STORE_PASS" fleet-postgres \
    psql -v ON_ERROR_STOP=1 -U store_abbyglow -d store_abbyglow < "$f"
done

echo "==> Ensuring storage exists"
mkdir -p /data/abbyglow/storage/{product-images,banners,categories,misc}
chown -R 1000:1000 /data/abbyglow || true
chmod -R 775 /data/abbyglow || true

echo "==> Listing tables"
docker exec -e PGPASSWORD="$STORE_PASS" fleet-postgres \
  psql -U store_abbyglow -d store_abbyglow -c '\dt'

echo "==> Done. DB=store_abbyglow STORAGE=/data/abbyglow/storage"
echo "    Coolify app must still be created in UI as abbyglow-staging"
echo "    Do NOT reuse anaelcosmetics-staging or store_anael*"
