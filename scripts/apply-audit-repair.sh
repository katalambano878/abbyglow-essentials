#!/usr/bin/env bash
set -euo pipefail
APP=$(sudo docker ps --format '{{.Names}}' | grep -iE 'abbyglow' | head -1)
echo "APP=$APP"
sudo docker cp /tmp/20260803230000_audit_repair_order_payment_events.sql "$APP:/tmp/repair.sql"
sudo docker exec -w /app "$APP" node -e "
const fs=require('fs'); const {Client}=require('pg');
(async()=>{
  const c=new Client({connectionString:process.env.DATABASE_URL});
  await c.connect();
  const sql=fs.readFileSync('/tmp/repair.sql','utf8');
  await c.query(sql);
  const t=await c.query(\"SELECT to_regclass('public.order_payment_events') AS t\");
  const m=await c.query('SELECT id, notes FROM schema_migrations ORDER BY id');
  const idx=await c.query(\"SELECT indexname FROM pg_indexes WHERE tablename='products' AND indexname LIKE 'idx_products%' ORDER BY 1\");
  console.log('order_payment_events', t.rows[0]);
  console.log('migrations', m.rows.map(r=>r.id));
  console.log('product indexes', idx.rows.map(r=>r.indexname));
  await c.end();
})().catch(e=>{console.error(e); process.exit(1)});
"
