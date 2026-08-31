#!/usr/bin/env bash
set -euo pipefail

TOKEN=$(tr -d '\r\n' </tmp/abbyglow-coolify.token)
BASE="http://127.0.0.1:8000/api/v1"
AUTH="Authorization: Bearer ${TOKEN}"
SERVER_UUID="d11ltfeuj6qtltuts2lx8f7l"

echo "==> Create Coolify project abbyglow"
PROJECT_JSON=$(curl -sS -X POST "$BASE/projects" \
  -H "$AUTH" -H "Content-Type: application/json" -H "Accept: application/json" \
  -d '{"name":"abbyglow","description":"AbbyGlow Essentials storefront Accra plain Postgres (isolated, not Anael)"}')
echo "$PROJECT_JSON"
PROJECT_UUID=$(echo "$PROJECT_JSON" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("uuid",""))')
if [[ -z "$PROJECT_UUID" ]]; then
  # maybe already exists — find it
  PROJECT_UUID=$(curl -sS -H "$AUTH" -H "Accept: application/json" "$BASE/projects" \
    | python3 -c 'import sys,json; ps=json.load(sys.stdin); print(next((p["uuid"] for p in ps if p.get("name")=="abbyglow"), ""))')
fi
echo "PROJECT_UUID=$PROJECT_UUID"
test -n "$PROJECT_UUID"

echo "==> Create public application abbyglow-staging"
APP_JSON=$(curl -sS -X POST "$BASE/applications/public" \
  -H "$AUTH" -H "Content-Type: application/json" -H "Accept: application/json" \
  -d "{
    \"project_uuid\": \"$PROJECT_UUID\",
    \"server_uuid\": \"$SERVER_UUID\",
    \"environment_name\": \"production\",
    \"git_repository\": \"https://github.com/your-org/abbyglow-essentials\",
    \"git_branch\": \"staging/plain-postgres\",
    \"build_pack\": \"nixpacks\",
    \"ports_exposes\": \"3000\",
    \"name\": \"abbyglow-staging\",
    \"description\": \"AbbyGlow Essentials staging (no Anael linkage)\",
    \"instant_deploy\": false
  }")
echo "$APP_JSON"
APP_UUID=$(echo "$APP_JSON" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("uuid") or d.get("application_uuid") or "")')
echo "APP_UUID=$APP_UUID"
test -n "$APP_UUID"
echo "$APP_UUID" >/tmp/abbyglow-app.uuid

echo "==> Set FQDN"
curl -sS -X PATCH "$BASE/applications/$APP_UUID" \
  -H "$AUTH" -H "Content-Type: application/json" -H "Accept: application/json" \
  -d "{\"fqdn\":\"https://abbyglow-staging.169-58-8-203.sslip.io\",\"name\":\"abbyglow-staging\"}"
echo

# Load DB secret
# shellcheck disable=SC1091
source /data/fleet/secrets/store_abbyglow.env
DB_URL="postgres://store_abbyglow:${STORE_PASS}@fleet-pgbouncer:6432/store_abbyglow"
APP_URL="https://abbyglow-staging.169-58-8-203.sslip.io"
JWT=$(openssl rand -hex 32)
STORAGE_SIGN=$(openssl rand -hex 32)
CRON=$(openssl rand -hex 24)
ANON=$(openssl rand -hex 16)
SERVICE=$(openssl rand -hex 32)

echo "==> Set environment variables"
# Coolify bulk env update endpoint variants
ENV_PAYLOAD=$(python3 - <<PY
import json
envs = [
  {"key":"NODE_ENV","value":"production","is_preview":False,"is_literal":True},
  {"key":"PORT","value":"3000","is_preview":False,"is_literal":True},
  {"key":"NEXT_PUBLIC_APP_URL","value":"$APP_URL","is_preview":False,"is_literal":True},
  {"key":"NEXT_PUBLIC_USE_PLAIN_PG","value":"true","is_preview":False,"is_literal":True},
  {"key":"DATABASE_URL","value":"$DB_URL","is_preview":False,"is_literal":True,"is_shown_once":False},
  {"key":"NEXT_PUBLIC_SUPABASE_URL","value":"$APP_URL","is_preview":False,"is_literal":True},
  {"key":"NEXT_PUBLIC_SUPABASE_ANON_KEY","value":"$ANON","is_preview":False,"is_literal":True},
  {"key":"SUPABASE_SERVICE_ROLE_KEY","value":"$SERVICE","is_preview":False,"is_literal":True},
  {"key":"AUTH_JWT_SECRET","value":"$JWT","is_preview":False,"is_literal":True},
  {"key":"STORAGE_ROOT","value":"/data/abbyglow/storage","is_preview":False,"is_literal":True},
  {"key":"STORAGE_PUBLIC_URL","value":"$APP_URL","is_preview":False,"is_literal":True},
  {"key":"STORAGE_SIGNING_SECRET","value":"$STORAGE_SIGN","is_preview":False,"is_literal":True},
  {"key":"CRON_SECRET","value":"$CRON","is_preview":False,"is_literal":True},
  {"key":"NEXT_PUBLIC_WHATSAPP_NUMBER","value":"","is_preview":False,"is_literal":True},
  {"key":"MOOLRE_SMS_SENDER_ID","value":"AbbyGlow","is_preview":False,"is_literal":True},
  {"key":"EMAIL_FROM","value":"AbbyGlow Essentials <noreply@example.com>","is_preview":False,"is_literal":True},
]
print(json.dumps({"data": envs}))
PY
)

for path in \
  "$BASE/applications/$APP_UUID/envs/bulk" \
  "$BASE/applications/$APP_UUID/environment-variables" \
  "$BASE/applications/$APP_UUID/envs"; do
  CODE=$(curl -sS -o /tmp/abbyglow-env-resp.json -w "%{http_code}" -X PATCH "$path" \
    -H "$AUTH" -H "Content-Type: application/json" -H "Accept: application/json" \
    -d "$ENV_PAYLOAD" || true)
  echo "TRY $path -> $CODE"
  head -c 300 /tmp/abbyglow-env-resp.json; echo
  if [[ "$CODE" == "200" || "$CODE" == "201" ]]; then
    break
  fi
  CODE=$(curl -sS -o /tmp/abbyglow-env-resp.json -w "%{http_code}" -X POST "$path" \
    -H "$AUTH" -H "Content-Type: application/json" -H "Accept: application/json" \
    -d "$ENV_PAYLOAD" || true)
  echo "POST $path -> $CODE"
  head -c 300 /tmp/abbyglow-env-resp.json; echo
  if [[ "$CODE" == "200" || "$CODE" == "201" ]]; then
    break
  fi
done

echo "==> Trigger deploy"
curl -sS -X POST "$BASE/deploy" \
  -H "$AUTH" -H "Content-Type: application/json" -H "Accept: application/json" \
  -d "{\"uuid\":\"$APP_UUID\",\"force\":true}" || \
curl -sS -X GET "$BASE/applications/$APP_UUID/start" -H "$AUTH" -H "Accept: application/json" || true
echo
echo "DONE APP=$APP_UUID URL=$APP_URL"
