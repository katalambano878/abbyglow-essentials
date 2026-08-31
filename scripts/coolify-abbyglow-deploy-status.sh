#!/usr/bin/env bash
set -euo pipefail
TOKEN=$(tr -d '\r\n' </tmp/abbyglow-coolify.token)
APP_UUID=$(tr -d '\r\n' </tmp/abbyglow-app.uuid)
BASE="http://127.0.0.1:8000/api/v1"

curl -sS -H "Authorization: Bearer $TOKEN" -H "Accept: application/json" \
  "$BASE/deployments/applications/$APP_UUID" > /tmp/abbyglow-deps.json
python3 - <<'PY'
import json
d=json.load(open("/tmp/abbyglow-deps.json"))
for dep in d.get("deployments",[])[:5]:
    print(dep.get("deployment_uuid"), dep.get("status"), dep.get("commit"), dep.get("updated_at"))
    logs=dep.get("logs")
    if logs:
        print(str(logs)[-3000:])
PY

echo "==> app status"
curl -sS -H "Authorization: Bearer $TOKEN" -H "Accept: application/json" \
  "$BASE/applications/$APP_UUID" > /tmp/abbyglow-app.json
python3 -c 'import json; d=json.load(open("/tmp/abbyglow-app.json")); print(d.get("status"), d.get("fqdn"), d.get("git_repository"), d.get("git_branch"))'

echo "==> containers"
docker ps -a --format '{{.Names}}\t{{.Status}}\t{{.Image}}' | grep -iE 'abbyglow|ctbyds' || echo '(none)'

echo "==> build jobs"
docker exec coolify-db psql -U coolify -d coolify -c \
  "SELECT deployment_uuid,status,updated_at FROM application_deployment_queues WHERE application_name='abbyglow-staging' ORDER BY id DESC LIMIT 5;"
