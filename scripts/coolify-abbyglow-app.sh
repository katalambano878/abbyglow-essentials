#!/usr/bin/env bash
set -euo pipefail
TOKEN=$(cat /tmp/abbyglow-coolify.token | tr -d '\r\n')
BASE="http://127.0.0.1:8000/api/v1"
AUTH="Authorization: Bearer ${TOKEN}"

echo "==> auth check /teams"
curl -sS -H "$AUTH" -H "Accept: application/json" "$BASE/teams"
echo
echo "==> projects"
curl -sS -H "$AUTH" -H "Accept: application/json" "$BASE/projects"
echo
echo "==> servers"
curl -sS -H "$AUTH" -H "Accept: application/json" "$BASE/servers"
echo
echo "==> github apps"
curl -sS -H "$AUTH" -H "Accept: application/json" "$BASE/github-apps" || true
echo
echo "==> private-github-app create endpoint probe"
# Show anael app for destination/source ids
docker exec coolify-db psql -U coolify -d coolify -c \
  "SELECT uuid,name,git_repository,git_branch,destination_id,source_id,server_id,environment_id FROM applications WHERE name='anaelcosmetics-staging';"
