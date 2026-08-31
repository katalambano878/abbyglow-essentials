#!/usr/bin/env bash
# Build a local .env.local snippet with DATABASE_URL rewritten for SSH tunnel.
set -euo pipefail
if [[ -n "${SUDO_PASS:-}" ]]; then
  printf '%s\n' "$SUDO_PASS" | sudo -S -v >/dev/null 2>&1
fi
set -a
# shellcheck disable=SC1090
source <(sudo cat /data/fleet/secrets/store_abbyglow.env)
set +a

RAW="${DATABASE_URL:-}"
if [[ -z "$RAW" && -n "${STORE_PASS:-}" ]]; then
  RAW="postgresql://store_abbyglow:${STORE_PASS}@127.0.0.1:5432/store_abbyglow"
fi

# Rewrite host:port for local SSH tunnel (localhost:15432 -> fleet-postgres)
TUNNELED=$(python3 - <<'PY' "$RAW"
import sys, urllib.parse
u = urllib.parse.urlparse(sys.argv[1])
# force local tunnel endpoint
host = "127.0.0.1"
port = 15432
netloc = u.username or ""
if u.password:
    netloc += ":" + urllib.parse.quote(u.password, safe="")
netloc += f"@{host}:{port}"
print(urllib.parse.urlunparse((u.scheme, netloc, u.path, "", "", "")))
PY
)

echo "DATABASE_URL=$TUNNELED"
echo "PG_HOST_HINT=use_ssh_tunnel_15432"
