#!/usr/bin/env bash
set -euo pipefail
APP=$(sudo docker ps --format '{{.Names}}' | grep -iE 'abbyglow' | head -1)
sudo docker exec -w /app "$APP" node <<'NODE'
const { Client } = require('pg');
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const p = await c.query(`
    SELECT p.id, p.name, p.slug FROM products p
    WHERE p.name ILIKE '%single sofa%' OR p.slug ILIKE '%sofa%' LIMIT 3`);
  console.log('products', p.rows);
  if (p.rows[0]) {
    const imgs = await c.query(
      `SELECT id, url, position FROM product_images WHERE product_id = $1 ORDER BY position`,
      [p.rows[0].id]
    );
    console.log('images', imgs.rows);
  }
  const sample = await c.query(`SELECT url FROM product_images ORDER BY created_at DESC LIMIT 5`);
  console.log('recent urls', sample.rows);
  console.log('STORAGE_ROOT', process.env.STORAGE_ROOT);
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
NODE

echo "== storage files =="
APP=$(sudo docker ps --format '{{.Names}}' | grep -iE 'abbyglow' | head -1)
STORAGE=$(sudo docker exec "$APP" printenv STORAGE_ROOT)
echo "STORAGE_ROOT=$STORAGE"
sudo docker exec "$APP" sh -c 'ls -la "$STORAGE_ROOT" 2>/dev/null | head -20; find "$STORAGE_ROOT" -type f 2>/dev/null | head -15'

echo "== test first image url =="
URL=$(sudo docker exec -w /app "$APP" node -e "const {Client}=require('pg');(async()=>{const c=new Client({connectionString:process.env.DATABASE_URL});await c.connect();const r=await c.query('SELECT url FROM product_images ORDER BY created_at DESC LIMIT 1');console.log(r.rows[0]?.url||'');await c.end();})();")
if [ -n "$URL" ]; then
  echo "url=$URL"
  curl -sS -o /dev/null -w 'http_code=%{http_code} type=%{content_type} size=%{size_download}\n' "$URL"
  curl -sS "$URL" | head -c 200 | xxd | head -5
fi
