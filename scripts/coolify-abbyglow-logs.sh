#!/usr/bin/env bash
set -euo pipefail
TOKEN=$(tr -d '\r\n' </tmp/abbyglow-coolify.token)
APP_UUID=$(tr -d '\r\n' </tmp/abbyglow-app.uuid)
BASE="http://127.0.0.1:8000/api/v1"

echo "==> latest deployments"
curl -sS -H "Authorization: Bearer $TOKEN" -H "Accept: application/json" \
  "$BASE/deployments/applications/$APP_UUID" | python3 -c 'import sys,json; d=json.load(sys.stdin);
items=d if isinstance(d,list) else d.get("deployments",d.get("data",[]));
print(type(d), str(d)[:500] if not isinstance(d,list) else "");
arr=items if isinstance(items,list) else [];
[print(i.get("uuid") or i.get("deployment_uuid"), i.get("status"), i.get("created_at")) for i in arr[:5]]'

echo "==> application logs endpoint"
curl -sS -H "Authorization: Bearer $TOKEN" -H "Accept: application/json" \
  "$BASE/applications/$APP_UUID/logs" | head -c 3000; echo

echo "==> docker containers abbyglow"
docker ps -a --format '{{.Names}}\t{{.Status}}' | grep -i abbyglow || true

CID=$(docker ps -aq --filter name=abbyglow | head -1)
if [[ -n "${CID:-}" ]]; then
  echo "==> logs $CID"
  docker logs --tail 120 "$CID" 2>&1 || true
fi

echo "==> deployment queue / recent coolify logs"
docker logs coolify --tail 80 2>&1 | grep -i abbyglow | tail -40 || true
