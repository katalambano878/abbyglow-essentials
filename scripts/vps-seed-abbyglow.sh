#!/usr/bin/env bash
set -euo pipefail
source /data/fleet/secrets/store_abbyglow.env
export DATABASE_URL="postgresql://store_abbyglow:${STORE_PASS}@fleet-postgres:5432/store_abbyglow"
docker run --rm --network coolify \
  -e DATABASE_URL \
  -v /home/tay/abbyglow-setup:/app \
  -w /app \
  node:20-alpine \
  sh -c 'npm install pg --silent && node seed-abbyglow-products.mjs'
