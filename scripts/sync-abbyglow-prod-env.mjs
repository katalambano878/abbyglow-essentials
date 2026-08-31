#!/usr/bin/env node
/**
 * Sync AbbyGlow production Coolify env from .env.local, then redeploy.
 * Usage: node scripts/sync-abbyglow-prod-env.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(root, '.env.local');

function parseEnv(text) {
  const out = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

const KEYS = [
  'RESEND_API_KEY',
  'ADMIN_EMAIL',
  'EMAIL_FROM',
  'NEXT_PUBLIC_CONTACT_PHONE',
  'NEXT_PUBLIC_INSTAGRAM_URL',
  'NEXT_PUBLIC_TIKTOK_URL',
  'NEXT_PUBLIC_FACEBOOK_URL',
  'NEXT_PUBLIC_WHATSAPP_NUMBER',
  'MOOLRE_API_USER',
  'MOOLRE_API_PUBKEY',
  'MOOLRE_ACCOUNT_NUMBER',
  'MOOLRE_MERCHANT_EMAIL',
  'MOOLRE_CALLBACK_SECRET',
  'MOOLRE_SMS_API_KEY',
  'MOOLRE_SMS_SENDER_ID',
];

const env = parseEnv(readFileSync(envPath, 'utf8'));
const payload = {};
for (const key of KEYS) {
  if (env[key]) payload[key] = env[key];
}

const remotePy = `#!/usr/bin/env python3
import json, subprocess, urllib.request

uuid = "bf344to4rf4m2zklkijhg4eo"
want = json.loads(${JSON.stringify(JSON.stringify(payload))})
token = subprocess.check_output(["sudo", "cat", "/data/fleet/secrets/coolify-api.token"], text=True).strip()

def bulk_update():
    body = json.dumps({
        "data": [
            {"key": k, "value": v, "is_literal": True, "is_preview": False, "is_shown_once": False}
            for k, v in want.items()
        ]
    }).encode()
    req = urllib.request.Request(
        f"http://127.0.0.1:8000/api/v1/applications/{uuid}/envs/bulk",
        data=body,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        method="PATCH",
    )
    with urllib.request.urlopen(req) as r:
        print("bulk", r.status)

def fetch_envs():
    req = urllib.request.Request(
        f"http://127.0.0.1:8000/api/v1/applications/{uuid}/envs",
        headers={"Authorization": f"Bearer {token}"},
    )
    data = json.load(urllib.request.urlopen(req))
    return data.get("data") or data.get("envs") or data

try:
    bulk_update()
except Exception as ex:
    print("bulk failed:", ex)
    envs = fetch_envs()
    by = {e.get("key"): e for e in envs if isinstance(e, dict)}
    for k, v in want.items():
        e = by.get(k)
        body = json.dumps({"key": k, "value": v, "is_literal": True, "is_preview": False, "is_shown_once": False}).encode()
        if e and e.get("uuid"):
            url = f"http://127.0.0.1:8000/api/v1/applications/{uuid}/envs/{e['uuid']}"
            method = "PATCH"
        else:
            url = f"http://127.0.0.1:8000/api/v1/applications/{uuid}/envs"
            method = "POST"
        req = urllib.request.Request(
            url,
            data=body,
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            method=method,
        )
        with urllib.request.urlopen(req) as r:
            print(k, method, r.status)

for k in sorted(want):
    if "KEY" in k or "SECRET" in k or k.startswith("MOOLRE_"):
        print(k, "= (set)")
    else:
        print(k, "=", want[k])
`;

const tmpRemote = path.join(root, 'scripts', '.sync-abbyglow-prod-env.remote.py');
writeFileSync(tmpRemote, remotePy, 'utf8');

console.log('Syncing', Object.keys(payload).length, 'env vars to abbyglow-app...');
const scp = spawnSync('scp', [tmpRemote, 'big-vps:/tmp/sync-abbyglow-prod-env.py'], { stdio: 'inherit' });
if (scp.status !== 0) process.exit(scp.status ?? 1);

const ssh = spawnSync('ssh', ['big-vps', 'python3 /tmp/sync-abbyglow-prod-env.py && sudo fleet deploy abbyglow-app'], {
  stdio: 'inherit',
});
process.exit(ssh.status ?? 1);
