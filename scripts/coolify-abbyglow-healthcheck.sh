#!/usr/bin/env bash
set -euo pipefail
echo "==> containers"
docker ps --format '{{.Names}}\t{{.Status}}' | grep -iE 'abbyglow|ctbyds' || true
CID=$(docker ps -aq --filter name=abbyglow | head -1 || true)
if [[ -z "$CID" ]]; then
  CID=$(docker ps -aq | while read id; do docker inspect --format '{{.Name}}' "$id"; done | grep -i abbyglow | head -1 | sed 's#^/##')
fi
echo "CID=${CID:-none}"
if [[ -n "${CID:-}" ]]; then
  echo "==> logs"
  docker logs --tail 100 "$CID" 2>&1 || true
fi
echo "==> health"
curl -skS -m 20 "https://abbyglow-staging.169-58-8-203.sslip.io/api/health" || true
echo
curl -sS -m 20 "http://abbyglow-staging.169-58-8-203.sslip.io/api/health" || true
echo
echo "==> fleet"
sudo fleet app abbyglow-staging || true
sudo fleet apps | grep -i abbyglow || true
