#!/usr/bin/env bash
set -euo pipefail
APP=$(sudo docker ps --format '{{.Names}}' | grep -iE 'abbyglow' | head -1)
echo "APP=$APP"
sudo docker cp /tmp/abbyglow-live-db-audit.mjs "$APP:/app/scripts/abbyglow-live-db-audit.mjs"
sudo docker exec -w /app "$APP" node scripts/abbyglow-live-db-audit.mjs > /tmp/abbyglow-db-audit.json
python3 - <<'PY'
import json
d=json.load(open('/tmp/abbyglow-db-audit.json'))
print('== DB ==', d.get('db'))
print('== VERSION ==', (d.get('version') or '')[:90])
print('== TABLES ==', d.get('table_count'))
print('== MISSING REQUIRED ==', d.get('missing_required'))
print('== HELPERS ==', d.get('helpers'))
print('== COUNTS ==')
for k,v in (d.get('counts') or {}).items():
    print(f'  {k}: {v}')
print('== INTEGRITY ==')
for k,v in (d.get('integrity') or {}).items():
    print(f'  {k}: {v}')
print('== PRODUCT COLS ==', [c['column_name'] for c in d.get('productCols') or []])
print('== PRODUCT ROWS ==', len(d.get('productRows') or []))
for r in (d.get('productRows') or [])[:8]:
    print(' ', {k:r.get(k) for k in ('id','name','status','sku','category_id')})
print('== RLS enabled ==', sum(1 for x in d.get('rls') or [] if x.get('rls')))
print('== ENUMS ==', sorted(set(e['typname'] for e in d.get('enums') or [])))
print('== MIGRATIONS ==', d.get('migrations'))
print('== ORDER COLS sample ==', [c['column_name'] for c in d.get('orderCols') or []][:40])
print('== PAYMENT COLS ==', [c['column_name'] for c in d.get('paymentCols') or []])
PY
# Also probe REST products with and without embeds
ANON=$(sudo docker exec "$APP" printenv NEXT_PUBLIC_SUPABASE_ANON_KEY)
URL=$(sudo docker exec "$APP" printenv NEXT_PUBLIC_APP_URL)
echo "== REST products bare =="
curl -sS "$URL/rest/v1/products?select=id,name,status&limit=3" -H "apikey: $ANON" -H "Authorization: Bearer $ANON" | head -c 800; echo
echo "== REST products embed =="
curl -sS "$URL/rest/v1/products?select=*%2Ccategories(name)%2Cproduct_variants(count)%2Cproduct_images(url,position)&order=created_at.desc&limit=3" \
  -H "apikey: $ANON" -H "Authorization: Bearer $ANON" | head -c 1200; echo
echo "== health =="
curl -sS "$URL/api/health" | head -c 900; echo
