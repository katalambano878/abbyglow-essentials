#!/usr/bin/env bash
set -euo pipefail

# Extract Coolify API token (cursor-agent) — printed only to local stdout for this script
TOKEN=$(docker exec coolify-db psql -U coolify -d coolify -tAc \
  "SELECT token FROM personal_access_tokens WHERE name='cursor-agent' ORDER BY id DESC LIMIT 1;")
TOKEN=$(echo "$TOKEN" | tr -d '[:space:]')
if [[ -z "$TOKEN" ]]; then
  echo "No Coolify API token found"
  exit 1
fi

BASE="http://127.0.0.1:8000/api/v1"
AUTH="Authorization: Bearer $TOKEN"

echo "==> Teams / projects / servers"
curl -sS -H "$AUTH" -H "Accept: application/json" "$BASE/teams" | head -c 2000; echo
curl -sS -H "$AUTH" -H "Accept: application/json" "$BASE/projects" | head -c 3000; echo
curl -sS -H "$AUTH" -H "Accept: application/json" "$BASE/servers" | head -c 2000; echo

echo "==> GitHub apps / sources"
curl -sS -H "$AUTH" -H "Accept: application/json" "$BASE/github-apps" 2>/dev/null | head -c 2000; echo
curl -sS -H "$AUTH" -H "Accept: application/json" "$BASE/sources" 2>/dev/null | head -c 2000; echo

echo "==> Anael staging application detail (template reference only)"
curl -sS -H "$AUTH" -H "Accept: application/json" \
  "$BASE/applications/gsf8hcd0qw2cy1q4lbua0jgh" 2>/dev/null | head -c 4000; echo
