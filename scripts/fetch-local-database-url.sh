#!/usr/bin/env bash
set -euo pipefail
if [[ -n "${SUDO_PASS:-}" ]]; then
  printf '%s\n' "$SUDO_PASS" | sudo -S -v >/dev/null 2>&1
fi
set -a
# shellcheck disable=SC1090
source <(sudo cat /data/fleet/secrets/store_abbyglow.env)
set +a
URL="${DATABASE_URL:-}"
if [[ -z "$URL" ]]; then
  URL="postgresql://store_abbyglow:${STORE_PASS}@127.0.0.1:5432/store_abbyglow"
fi
export U="$URL"
python3 - <<'PY'
import os, urllib.parse
u = urllib.parse.urlparse(os.environ["U"])
user = urllib.parse.quote(u.username or "", safe="")
pw = urllib.parse.quote(u.password or "", safe="")
auth = user + ((":" + pw) if pw else "")
path = u.path or "/store_abbyglow"
print(f"postgresql://{auth}@127.0.0.1:15432{path}")
PY
