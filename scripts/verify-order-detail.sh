#!/usr/bin/env bash
set -euo pipefail
APP=$(sudo docker ps --format '{{.Names}}' | grep -iE 'abbyglow' | head -1)
ANON=$(sudo docker exec "$APP" printenv NEXT_PUBLIC_SUPABASE_ANON_KEY)
URL=$(sudo docker exec "$APP" printenv NEXT_PUBLIC_APP_URL)
OID=$(sudo docker exec -w /app "$APP" node -e "
const {Client}=require('pg');
(async()=>{
  const c=new Client({connectionString:process.env.DATABASE_URL});
  await c.connect();
  const r=await c.query('SELECT id::text FROM orders ORDER BY created_at DESC LIMIT 1');
  console.log(r.rows[0]?.id||'');
  await c.end();
})().catch(()=>process.exit(1));
")
echo "order_id=$OID"
if [ -z "$OID" ]; then echo "No orders in DB"; exit 0; fi
echo "== nested order detail =="
curl -sS "$URL/rest/v1/orders?select=id,order_number,order_items(id,product_name,products(product_images(url)))&id=eq.$OID" \
  -H "apikey: $ANON" -H "Authorization: Bearer $ANON" | head -c 1500
echo
