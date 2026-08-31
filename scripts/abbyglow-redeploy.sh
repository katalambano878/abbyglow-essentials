#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' PSAbt67t6NLU7I1oISVu | sudo -S true
TOKEN=$(tr -d '\r\n' </tmp/abbyglow-coolify.token)
APP_UUID=$(tr -d '\r\n' </tmp/abbyglow-app.uuid)
BASE="http://127.0.0.1:8000/api/v1"
DOMAIN="https://abbyglow-staging.169-58-8-203.sslip.io"

# Ensure domains field is set (this regenerates traefik host on next deploy)
curl -sS -X PATCH "$BASE/applications/$APP_UUID" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -H "Accept: application/json" \
  -d "{\"domains\":\"$DOMAIN\"}"
echo

sudo docker exec coolify-db psql -U coolify -d coolify -c \
  "UPDATE applications SET fqdn='$DOMAIN' WHERE uuid='$APP_UUID'; SELECT name,fqdn FROM applications WHERE uuid='$APP_UUID';"

echo "==> force deploy"
curl -sS -X POST "$BASE/deploy" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -H "Accept: application/json" \
  -d "{\"uuid\":\"$APP_UUID\",\"force\":true}"
echo

echo "==> wait for deploy + verify friendly domain"
for i in $(seq 1 30); do
  CODE=$(curl -skS -o /dev/null -w '%{http_code}' -m 15 "$DOMAIN/api/health" || echo "000")
  echo "[$i] $DOMAIN/api/health -> $CODE"
  if [[ "$CODE" == "200" ]]; then
    curl -skS -m 20 "$DOMAIN/api/health"
    echo
    echo "DEPLOY OK"
    exit 0
  fi
  sleep 15
done
echo "Timed out waiting for $DOMAIN to respond"
exit 1
