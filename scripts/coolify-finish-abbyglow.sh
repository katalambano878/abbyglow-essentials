#!/usr/bin/env bash
set -euo pipefail
TOKEN=$(tr -d '\r\n' </tmp/abbyglow-coolify.token)
BASE="http://127.0.0.1:8000/api/v1"
AUTH="Authorization: Bearer ${TOKEN}"
APP_UUID=$(tr -d '\r\n' </tmp/abbyglow-app.uuid)
DOMAIN="https://abbyglow-staging.169-58-8-203.sslip.io"

echo "==> Update domains via API"
for payload in \
  "{\"domains\":\"$DOMAIN\"}" \
  "{\"fqdn\":\"$DOMAIN\"}" \
  "{\"domain\":\"$DOMAIN\"}"; do
  CODE=$(curl -sS -o /tmp/abbyglow-dom.json -w "%{http_code}" -X PATCH "$BASE/applications/$APP_UUID" \
    -H "$AUTH" -H "Content-Type: application/json" -H "Accept: application/json" \
    -d "$payload" || true)
  echo "payload=$payload code=$CODE"
  head -c 200 /tmp/abbyglow-dom.json; echo
done

echo "==> Force domain in DB if needed"
docker exec coolify-db psql -U coolify -d coolify -c \
  "UPDATE applications SET fqdn='$DOMAIN', name='abbyglow-staging' WHERE uuid='$APP_UUID'; SELECT name,uuid,fqdn,git_repository,git_branch FROM applications WHERE uuid='$APP_UUID';"

echo "==> Add persistent storage mount for uploads"
# Create storage via API
curl -sS -X POST "$BASE/applications/$APP_UUID/storages" \
  -H "$AUTH" -H "Content-Type: application/json" -H "Accept: application/json" \
  -d '{"name":"abbyglow-storage","host_path":"/data/abbyglow/storage","mount_path":"/data/abbyglow/storage","is_directory":true}' || true
echo

echo "==> Update APP URL envs to match domain"
curl -sS -X PATCH "$BASE/applications/$APP_UUID/envs/bulk" \
  -H "$AUTH" -H "Content-Type: application/json" -H "Accept: application/json" \
  -d "{\"data\":[
    {\"key\":\"NEXT_PUBLIC_APP_URL\",\"value\":\"$DOMAIN\",\"is_literal\":true,\"is_preview\":false},
    {\"key\":\"NEXT_PUBLIC_SUPABASE_URL\",\"value\":\"$DOMAIN\",\"is_literal\":true,\"is_preview\":false},
    {\"key\":\"STORAGE_PUBLIC_URL\",\"value\":\"$DOMAIN\",\"is_literal\":true,\"is_preview\":false},
    {\"key\":\"STORAGE_ROOT\",\"value\":\"/data/abbyglow/storage\",\"is_literal\":true,\"is_preview\":false}
  ]}"
echo

echo "==> Redeploy"
curl -sS -X POST "$BASE/deploy" \
  -H "$AUTH" -H "Content-Type: application/json" -H "Accept: application/json" \
  -d "{\"uuid\":\"$APP_UUID\",\"force\":true}"
echo

echo "==> fleet apps | abbyglow"
# wait a bit then show
sleep 5
docker exec coolify-db psql -U coolify -d coolify -c \
  "SELECT name,uuid,fqdn,git_repository,git_branch,status FROM applications WHERE name ILIKE '%abbyglow%' OR git_repository ILIKE '%abbyglow%';"
