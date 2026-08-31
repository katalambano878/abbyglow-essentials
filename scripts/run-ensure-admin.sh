#!/usr/bin/env bash
set -euo pipefail
APP=$(sudo docker ps --format '{{.Names}}' | grep -iE 'abbyglow' | head -1)
echo "APP=$APP"
if [ -z "$APP" ]; then
  echo "abbyglow container not found"
  exit 1
fi
EMAIL="${1:-admin@example.com}"
PASS="${2:-}"
if [ -z "$PASS" ]; then
  echo "Usage: $0 <email> <password>"
  exit 1
fi
sudo docker cp /tmp/ensure-admin-user.mjs "$APP:/app/scripts/ensure-admin-user.mjs"
sudo docker exec -w /app "$APP" node scripts/ensure-admin-user.mjs "$EMAIL" "$PASS"
