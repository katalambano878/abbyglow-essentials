#!/usr/bin/env bash
set -euo pipefail
docker exec coolify-db psql -U coolify -d coolify -c \
  "SELECT id, name, tokenable_type, length(token) AS len, left(token,20) AS prefix, created_at FROM personal_access_tokens ORDER BY id;"
echo "==== instance settings keys ===="
docker exec coolify-db psql -U coolify -d coolify -tAc \
  "SELECT column_name FROM information_schema.columns WHERE table_name='instance_settings' ORDER BY 1;"
echo "==== env inside coolify container (filtered) ===="
docker exec coolify printenv | grep -iE 'TOKEN|API|KEY|SECRET' | sed 's/=.*/=***/' | head -40
