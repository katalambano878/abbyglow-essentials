#!/usr/bin/env bash
set -uo pipefail
printf '%s\n' PSAbt67t6NLU7I1oISVu | sudo -S true
NAME=$(sudo docker ps --format '{{.Names}}' | grep -i ctbyds | head -1)
echo "NAME=$NAME"
echo "== networks =="
sudo docker inspect "$NAME" --format '{{json .NetworkSettings.Networks}}' | python3 -m json.tool | head -80
echo "== labels (traefik) =="
sudo docker inspect "$NAME" --format '{{range $k,$v := .Config.Labels}}{{println $k "=" $v}}{{end}}' | grep -i traefik | head -40
echo "== compare healthy app networks =="
HEALTHY=$(sudo docker ps --format '{{.Names}}' | grep -i anaelcosmetics-staging | head -1 || true)
echo "HEALTHY=$HEALTHY"
if [[ -n "$HEALTHY" ]]; then
  sudo docker inspect "$HEALTHY" --format '{{json .NetworkSettings.Networks}}' | python3 -m json.tool | head -40
  sudo docker inspect "$HEALTHY" --format '{{range $k,$v := .Config.Labels}}{{println $k "=" $v}}{{end}}' | grep -i traefik | head -20
fi

# Ensure attached to coolify network
if ! sudo docker inspect "$NAME" --format '{{json .NetworkSettings.Networks}}' | grep -q coolify; then
  echo "== connecting to coolify network =="
  sudo docker network connect coolify "$NAME" || true
fi

echo "== restart coolify-proxy =="
sudo docker restart coolify-proxy
sleep 8
echo "== public health =="
curl -skS -m 20 https://abbyglow-staging.169-58-8-203.sslip.io/api/health || true
echo
curl -sS -m 20 http://abbyglow-staging.169-58-8-203.sslip.io/api/health || true
echo
