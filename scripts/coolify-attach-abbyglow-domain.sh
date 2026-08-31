#!/usr/bin/env bash
set -euo pipefail
# Attach your-abbyglow-domain.example.com to abbyglow-staging and point public URL envs at it.

APP_UUID="${APP_UUID:?Set APP_UUID to the Coolify application uuid}"
DOMAIN_LIST="https://your-abbyglow-domain.example.com,https://www.your-abbyglow-domain.example.com,https://abbyglow-staging.169-58-8-203.sslip.io"
PRIMARY="https://your-abbyglow-domain.example.com"
BASE="http://127.0.0.1:8000/api/v1"

if [[ ! -f /tmp/abbyglow-coolify.token ]]; then
  echo "Missing /tmp/abbyglow-coolify.token — mint a Coolify token first"
  exit 1
fi
TOKEN=$(tr -d '\r\n' </tmp/abbyglow-coolify.token)
AUTH="Authorization: Bearer ${TOKEN}"

echo "==> Set FQDN on application $APP_UUID"
docker exec coolify-db psql -U coolify -d coolify -c \
  "UPDATE applications SET fqdn='$DOMAIN_LIST' WHERE uuid='$APP_UUID'; SELECT name, uuid, fqdn FROM applications WHERE uuid='$APP_UUID';"

CODE=$(curl -sS -o /tmp/abbyglow-dom.json -w "%{http_code}" -X PATCH "$BASE/applications/$APP_UUID" \
  -H "$AUTH" -H "Content-Type: application/json" -H "Accept: application/json" \
  -d "{\"fqdn\":\"$DOMAIN_LIST\"}" || true)
echo "PATCH fqdn HTTP $CODE"
head -c 300 /tmp/abbyglow-dom.json; echo

echo "==> Update public URL envs (does not touch payment secrets)"
curl -sS -X PATCH "$BASE/applications/$APP_UUID/envs/bulk" \
  -H "$AUTH" -H "Content-Type: application/json" -H "Accept: application/json" \
  -d "{\"data\":[
    {\"key\":\"NEXT_PUBLIC_APP_URL\",\"value\":\"$PRIMARY\",\"is_literal\":true,\"is_preview\":false},
    {\"key\":\"NEXT_PUBLIC_SUPABASE_URL\",\"value\":\"$PRIMARY\",\"is_literal\":true,\"is_preview\":false},
    {\"key\":\"STORAGE_PUBLIC_URL\",\"value\":\"$PRIMARY\",\"is_literal\":true,\"is_preview\":false}
  ]}"
echo

echo "==> Trigger redeploy"
curl -sS -X POST "$BASE/deploy" \
  -H "$AUTH" -H "Content-Type: application/json" -H "Accept: application/json" \
  -d "{\"uuid\":\"$APP_UUID\",\"force\":true}"
echo

echo "Done. Proxy/SSL may take a minute for Let's Encrypt."
