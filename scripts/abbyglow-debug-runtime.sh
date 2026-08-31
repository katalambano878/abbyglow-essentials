#!/usr/bin/env bash
set -uo pipefail
printf '%s\n' PSAbt67t6NLU7I1oISVu | sudo -S true
echo "== containers =="
sudo docker ps -a | grep -i abbyglow || sudo docker ps -a | grep -i ctbyds || true
NAME=$(sudo docker ps -a --format '{{.Names}}' | grep -i ctbyds | head -1)
echo "NAME=$NAME"
if [[ -n "$NAME" ]]; then
  echo "== inspect ports =="
  sudo docker inspect "$NAME" --format '{{json .NetworkSettings.Ports}} {{.State.Status}}'
  echo "== logs =="
  sudo docker logs --tail 80 "$NAME" 2>&1 | tail -80
fi
echo "== curl local via container ip =="
IP=$(sudo docker inspect -f '{{range.NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$NAME" 2>/dev/null || true)
echo "IP=$IP"
if [[ -n "$IP" ]]; then
  curl -sS -m 10 "http://$IP:3000/api/health" || true
  echo
fi
echo "== public =="
curl -skS -m 15 https://abbyglow-staging.169-58-8-203.sslip.io/api/health || true
echo
