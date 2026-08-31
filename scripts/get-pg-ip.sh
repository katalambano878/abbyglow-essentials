#!/usr/bin/env bash
set -euo pipefail
if [[ -n "${SUDO_PASS:-}" ]]; then
  printf '%s\n' "$SUDO_PASS" | sudo -S -v >/dev/null 2>&1
fi
sudo docker inspect -f '{{range.NetworkSettings.Networks}}{{.IPAddress}}{{end}}' fleet-postgres
