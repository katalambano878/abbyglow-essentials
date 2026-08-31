#!/usr/bin/env bash
# Rewrite product storage files that were saved as raw multipart bodies.
set -euo pipefail
APP=$(sudo docker ps --format '{{.Names}}' | grep -iE 'abbyglow' | head -1)
sudo docker exec -w /app "$APP" node <<'NODE'
const fs = require('fs');
const path = require('path');

const ROOT = process.env.STORAGE_ROOT || '/data/abbyglow/storage';
const productsDir = path.join(ROOT, 'products');
if (!fs.existsSync(productsDir)) {
  console.log('No products dir');
  process.exit(0);
}

function unwrapMultipartIfNeeded(bytes, contentType, objectPath) {
  const head = bytes.subarray(0, 240).toString('latin1');
  const looksMultipart =
    contentType.toLowerCase().startsWith('multipart/') ||
    head.includes('WebKitFormBoundary') ||
    head.startsWith('------');
  if (!looksMultipart) return null;

  const text = bytes.toString('latin1');
  const withFilename =
    /Content-Disposition:[\s\S]*?filename="([^"]+)"[\s\S]*?\r?\nContent-Type:\s*([^\r\n]+)\r?\n\r?\n/i.exec(text);
  const imageOnly = withFilename
    ? null
    : /Content-Type:\s*(image\/[^\r\n]+)\r?\n\r?\n/i.exec(text);
  const match = withFilename || imageOnly;
  if (!match) return null;

  const ctype = (withFilename ? withFilename[2] : imageOnly[1]).trim();
  const start = match.index + match[0].length;
  let end = text.indexOf('\r\n------', start);
  if (end < 0) end = text.length;
  let body = bytes.subarray(start, end);
  if (body.length >= 2 && body[body.length - 2] === 0x0d && body[body.length - 1] === 0x0a) {
    body = body.subarray(0, body.length - 2);
  }
  return { bytes: body, contentType: ctype };
}

let fixed = 0;
for (const name of fs.readdirSync(productsDir)) {
  if (name.endsWith('.meta.json') || name.endsWith('.multipart.bak')) continue;
  const full = path.join(productsDir, name);
  if (!fs.statSync(full).isFile()) continue;
  let contentType = 'application/octet-stream';
  try {
    const meta = JSON.parse(fs.readFileSync(full + '.meta.json', 'utf8'));
    if (meta.contentType) contentType = meta.contentType;
  } catch {}
  const raw = fs.readFileSync(full);
  const unwrapped = unwrapMultipartIfNeeded(raw, contentType, name);
  if (unwrapped && unwrapped.bytes.length > 0 && unwrapped.bytes.length !== raw.length) {
    fs.copyFileSync(full, full + '.multipart.bak');
    fs.writeFileSync(full, unwrapped.bytes);
    fs.writeFileSync(full + '.meta.json', JSON.stringify({ contentType: unwrapped.contentType }));
    fixed++;
    console.log('fixed', name, raw.length, '->', unwrapped.bytes.length);
  }
}
console.log('done, fixed', fixed, 'files');
NODE
