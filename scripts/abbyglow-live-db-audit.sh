#!/usr/bin/env bash
# Full live Postgres inventory for store_abbyglow (no secrets printed)
set -euo pipefail
APP=$(sudo docker ps --format '{{.Names}}' | grep -iE 'abbyglow' | head -1)
echo "APP=$APP"
OUT=/tmp/abbyglow-db-audit.json
sudo docker exec -w /app "$APP" node <<'NODE' > "$OUT"
const { Client } = require('pg');
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const ver = await c.query('SELECT version()');
  const db = await c.query('SELECT current_database() AS db, inet_server_addr() AS host, current_user AS role');
  const tables = await c.query(`
    SELECT n.nspname AS schema, c.relname AS table, c.relkind,
           COALESCE(s.n_live_tup, 0)::bigint AS est_rows
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
    WHERE n.nspname IN ('public','auth','storage')
      AND c.relkind IN ('r','v','m')
    ORDER BY n.nspname, c.relname`);
  const cols = await c.query(`
    SELECT table_schema, table_name, column_name, data_type, udt_name, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema IN ('public','auth','storage')
    ORDER BY table_schema, table_name, ordinal_position`);
  const fks = await c.query(`
    SELECT tc.table_schema, tc.table_name, kcu.column_name,
           ccu.table_schema AS foreign_table_schema,
           ccu.table_name AS foreign_table_name,
           ccu.column_name AS foreign_column_name,
           rc.delete_rule, rc.update_rule
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
    JOIN information_schema.referential_constraints rc
      ON rc.constraint_name = tc.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema IN ('public','auth','storage')
    ORDER BY 1,2,3`);
  const indexes = await c.query(`
    SELECT schemaname, tablename, indexname, indexdef
    FROM pg_indexes
    WHERE schemaname IN ('public','auth','storage')
    ORDER BY 1,2,3`);
  const enums = await c.query(`
    SELECT t.typname, e.enumlabel
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
    ORDER BY 1, e.enumsortorder`);
  const rls = await c.query(`
    SELECT n.nspname, c.relname, c.relrowsecurity, c.relforcerowsecurity
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r'
    ORDER BY 2`);
  const extensions = await c.query(`SELECT extname, extversion FROM pg_extension ORDER BY 1`);

  // Core counts
  const countSql = async (sql) => {
    try { return (await c.query(sql)).rows[0]; }
    catch (e) { return { error: e.message }; }
  };
  const counts = {
    products: await countSql('SELECT count(*)::int AS n, count(*) FILTER (WHERE status = \'active\')::int AS active, count(*) FILTER (WHERE deleted_at IS NOT NULL)::int AS deleted FROM products'),
    categories: await countSql('SELECT count(*)::int AS n FROM categories'),
    profiles: await countSql('SELECT count(*)::int AS n, count(*) FILTER (WHERE role::text=\'admin\')::int AS admins FROM profiles'),
    auth_users: await countSql('SELECT count(*)::int AS n FROM auth.users WHERE deleted_at IS NULL'),
    orders: await countSql('SELECT count(*)::int AS n FROM orders'),
    order_items: await countSql('SELECT count(*)::int AS n FROM order_items'),
    payment_attempts: await countSql('SELECT count(*)::int AS n FROM payment_attempts'),
    callback_events: await countSql('SELECT count(*)::int AS n FROM callback_events'),
    sms_attempts: await countSql('SELECT count(*)::int AS n FROM sms_attempts'),
    customers: await countSql('SELECT count(*)::int AS n FROM customers'),
    coupons: await countSql('SELECT count(*)::int AS n FROM coupons'),
    site_settings: await countSql('SELECT count(*)::int AS n FROM site_settings'),
  };

  // Product sample + schema peek
  const productCols = await c.query(`
    SELECT column_name, data_type, udt_name, is_nullable
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='products'
    ORDER BY ordinal_position`);
  const productSample = await countSql(`
    SELECT id::text, name, status::text, sku, stock_quantity, created_at
    FROM products ORDER BY created_at DESC NULLS LAST LIMIT 5`);
  // if countSql style fails for multi-row, do proper:
  let productRows = [];
  try {
    productRows = (await c.query(`
      SELECT id::text, name, status::text, sku, stock_quantity, created_at, metadata
      FROM products ORDER BY created_at DESC NULLS LAST LIMIT 8`)).rows;
  } catch (e) { productRows = [{ error: e.message }]; }

  // Orphans / integrity
  const integrity = {
    profiles_missing_auth: await countSql(`SELECT count(*)::int AS n FROM profiles p LEFT JOIN auth.users u ON u.id=p.id WHERE u.id IS NULL`),
    auth_missing_profile: await countSql(`SELECT count(*)::int AS n FROM auth.users u LEFT JOIN profiles p ON p.id=u.id WHERE p.id IS NULL AND u.deleted_at IS NULL`),
    order_items_orphan_product: await countSql(`SELECT count(*)::int AS n FROM order_items oi LEFT JOIN products p ON p.id=oi.product_id WHERE oi.product_id IS NOT NULL AND p.id IS NULL`),
    payments_orphan_order: await countSql(`SELECT count(*)::int AS n FROM payment_attempts pa LEFT JOIN orders o ON o.id=pa.order_id WHERE pa.order_id IS NOT NULL AND o.id IS NULL`),
    products_null_name: await countSql(`SELECT count(*)::int AS n FROM products WHERE name IS NULL OR trim(name)=''`),
    products_dup_slug: await countSql(`SELECT count(*)::int AS n FROM (SELECT slug FROM products WHERE slug IS NOT NULL GROUP BY slug HAVING count(*)>1) t`),
    products_dup_sku: await countSql(`SELECT count(*)::int AS n FROM (SELECT sku FROM products WHERE sku IS NOT NULL GROUP BY sku HAVING count(*)>1) t`),
  };

  // Required tables from app
  const required = [
    'products','categories','profiles','orders','order_items','customers','coupons',
    'payment_attempts','callback_events','sms_attempts','site_settings','banners',
    'pages','product_images','product_variants','inventory_movements','reviews',
    'addresses','carts','cart_items','notifications','store_modules','cms_content',
    'navigation_menus','navigation_items','part_payment_plans','payment_audit_logs'
  ];
  const existing = new Set(tables.rows.filter(r => r.schema==='public').map(r => r.table));
  const missing_required = required.filter(t => !existing.has(t));
  const present_required = required.filter(t => existing.has(t));

  // schema_migrations if any
  let migrations = [];
  try {
    migrations = (await c.query(`SELECT * FROM supabase_migrations.schema_migrations ORDER BY version`)).rows;
  } catch {
    try {
      migrations = (await c.query(`SELECT * FROM schema_migrations ORDER BY version`)).rows;
    } catch (e) {
      migrations = [{ error: e.message }];
    }
  }

  console.log(JSON.stringify({
    version: ver.rows[0].version,
    db: db.rows[0],
    table_count: tables.rows.length,
    tables: tables.rows,
    column_count: cols.rows.length,
    columns: cols.rows,
    fks: fks.rows,
    index_count: indexes.rows.length,
    indexes: indexes.rows,
    enums: enums.rows,
    rls: rls.rows,
    extensions: extensions.rows,
    counts,
    productCols: productCols.rows,
    productRows,
    integrity,
    missing_required,
    present_required,
    migrations,
  }, null, 2));
  await c.end();
})().catch(e => { console.error(JSON.stringify({ fatal: e.message, stack: e.stack })); process.exit(1); });
NODE
echo "WROTE $OUT bytes=$(wc -c < "$OUT")"
# Compact summary to stdout
python3 - <<'PY'
import json
d=json.load(open('/tmp/abbyglow-db-audit.json'))
print('== DB ==', d.get('db'))
print('== VERSION ==', d.get('version','')[:80])
print('== TABLES ==', d.get('table_count'))
print('== MISSING REQUIRED ==', d.get('missing_required'))
print('== COUNTS ==')
for k,v in (d.get('counts') or {}).items():
    print(f'  {k}: {v}')
print('== INTEGRITY ==')
for k,v in (d.get('integrity') or {}).items():
    print(f'  {k}: {v}')
print('== PRODUCT COLS ==', [c['column_name'] for c in d.get('productCols') or []])
print('== PRODUCT ROWS ==', len(d.get('productRows') or []))
for r in (d.get('productRows') or [])[:5]:
    print(' ', r)
print('== RLS enabled ==', sum(1 for x in d.get('rls') or [] if x.get('relrowsecurity')))
print('== ENUMS ==', sorted(set(e['typname'] for e in d.get('enums') or [])))
print('== MIGRATIONS ==', len(d.get('migrations') or []), 'sample=', (d.get('migrations') or [])[:3])
PY
