#!/usr/bin/env bash
set -euo pipefail
echo "==> Coolify tokens (names only)"
docker exec coolify-db psql -U coolify -d coolify -tAc \
  "SELECT id, name, left(token,8) FROM personal_access_tokens LIMIT 10;" || true

echo "==> Sample app row columns"
docker exec coolify-db psql -U coolify -d coolify -tAc \
  "SELECT column_name FROM information_schema.columns WHERE table_name='applications' ORDER BY ordinal_position;" | head -40

echo "==> Existing staging apps"
docker exec coolify-db psql -U coolify -d coolify -tAc \
  "SELECT name, uuid, git_repository, git_branch FROM applications WHERE name ILIKE '%staging%' ORDER BY name;" | head -30
