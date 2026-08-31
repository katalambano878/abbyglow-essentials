/**
 * Live DB audit for abbyglow — run inside app container with DATABASE_URL set.
 * node scripts/abbyglow-live-db-audit.mjs > /tmp/abbyglow-db-audit.json
 */
import pg from 'pg';

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

async function q(sql, params) {
  try {
    return await c.query(sql, params);
  } catch (e) {
    return { rows: [], error: e.message };
  }
}
async function one(sql, params) {
  const r = await q(sql, params);
  if (r.error) return { error: r.error };
  return r.rows[0] || {};
}

const ver = await q('SELECT version()');
const db = await one('SELECT current_database() AS db, inet_server_addr()::text AS host, current_user AS role');
const tables = await q(`
  SELECT n.nspname AS schema, c.relname AS table, c.relkind::text AS kind,
         COALESCE(s.n_live_tup, 0)::bigint AS est_rows
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
  WHERE n.nspname IN ('public','auth','storage') AND c.relkind IN ('r','v','m')
  ORDER BY 1,2`);
const cols = await q(`
  SELECT table_schema, table_name, column_name, data_type, udt_name, is_nullable, column_default
  FROM information_schema.columns
  WHERE table_schema IN ('public','auth','storage')
  ORDER BY 1,2,ordinal_position`);
const fks = await q(`
  SELECT tc.table_schema, tc.table_name, kcu.column_name,
         ccu.table_schema AS foreign_table_schema, ccu.table_name AS foreign_table_name,
         ccu.column_name AS foreign_column_name, rc.delete_rule, rc.update_rule
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
  JOIN information_schema.constraint_column_usage ccu
    ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
  JOIN information_schema.referential_constraints rc ON rc.constraint_name = tc.constraint_name
  WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema IN ('public','auth','storage')
  ORDER BY 1,2,3`);
const indexes = await q(`
  SELECT schemaname, tablename, indexname, indexdef
  FROM pg_indexes WHERE schemaname IN ('public','auth','storage') ORDER BY 1,2,3`);
const enums = await q(`
  SELECT t.typname, e.enumlabel FROM pg_type t
  JOIN pg_enum e ON t.oid = e.enumtypid
  JOIN pg_namespace n ON n.oid = t.typnamespace
  WHERE n.nspname = 'public' ORDER BY 1, e.enumsortorder`);
const rls = await q(`
  SELECT n.nspname AS schema, c.relname AS table, c.relrowsecurity AS rls, c.relforcerowsecurity AS force_rls
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind='r' ORDER BY 2`);
const extensions = await q(`SELECT extname, extversion FROM pg_extension ORDER BY 1`);
const checks = await q(`
  SELECT n.nspname AS schema, c.relname AS table, con.conname, pg_get_constraintdef(con.oid) AS def
  FROM pg_constraint con
  JOIN pg_class c ON c.oid = con.conrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE con.contype = 'c' AND n.nspname IN ('public','auth')
  ORDER BY 1,2,3`);
const uniques = await q(`
  SELECT n.nspname AS schema, c.relname AS table, con.conname, pg_get_constraintdef(con.oid) AS def
  FROM pg_constraint con
  JOIN pg_class c ON c.oid = con.conrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE con.contype IN ('u','p') AND n.nspname IN ('public','auth')
  ORDER BY 1,2,3`);

const counts = {
  products: await one(`SELECT count(*)::int AS n,
    count(*) FILTER (WHERE status::text='active')::int AS active FROM products`),
  categories: await one(`SELECT count(*)::int AS n FROM categories`),
  profiles: await one(`SELECT count(*)::int AS n,
    count(*) FILTER (WHERE role::text='admin')::int AS admins FROM profiles`),
  auth_users: await one(`SELECT count(*)::int AS n FROM auth.users WHERE deleted_at IS NULL`),
  orders: await one(`SELECT count(*)::int AS n FROM orders`),
  order_items: await one(`SELECT count(*)::int AS n FROM order_items`),
  payment_attempts: await one(`SELECT count(*)::int AS n FROM payment_attempts`),
  callback_events: await one(`SELECT count(*)::int AS n FROM callback_events`),
  sms_attempts: await one(`SELECT count(*)::int AS n FROM sms_attempts`),
  customers: await one(`SELECT count(*)::int AS n FROM customers`),
  coupons: await one(`SELECT count(*)::int AS n FROM coupons`),
  site_settings: await one(`SELECT count(*)::int AS n FROM site_settings`),
  product_images: await one(`SELECT count(*)::int AS n FROM product_images`),
  product_variants: await one(`SELECT count(*)::int AS n FROM product_variants`),
  order_payment_events: await one(`SELECT count(*)::int AS n FROM order_payment_events`),
  banners: await one(`SELECT count(*)::int AS n FROM banners`),
};

const productCols = (await q(`
  SELECT column_name, data_type, udt_name, is_nullable, column_default
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='products' ORDER BY ordinal_position`)).rows;

const productRows = (await q(`
  SELECT id::text, name, status::text, sku, quantity, category_id::text,
         created_at
  FROM products ORDER BY created_at DESC NULLS LAST LIMIT 10`)).rows;

const integrity = {
  profiles_missing_auth: await one(`SELECT count(*)::int AS n FROM profiles p LEFT JOIN auth.users u ON u.id=p.id WHERE u.id IS NULL`),
  auth_missing_profile: await one(`SELECT count(*)::int AS n FROM auth.users u LEFT JOIN profiles p ON p.id=u.id WHERE p.id IS NULL AND u.deleted_at IS NULL`),
  order_items_orphan_product: await one(`SELECT count(*)::int AS n FROM order_items oi LEFT JOIN products p ON p.id=oi.product_id WHERE oi.product_id IS NOT NULL AND p.id IS NULL`),
  payments_orphan_order: await one(`SELECT count(*)::int AS n FROM payment_attempts pa LEFT JOIN orders o ON o.id=pa.order_id WHERE pa.order_id IS NOT NULL AND o.id IS NULL`),
  products_null_name: await one(`SELECT count(*)::int AS n FROM products WHERE name IS NULL OR btrim(name)=''`),
  products_dup_slug: await one(`SELECT count(*)::int AS n FROM (SELECT slug FROM products WHERE slug IS NOT NULL GROUP BY slug HAVING count(*)>1) t`),
  products_dup_sku: await one(`SELECT count(*)::int AS n FROM (SELECT sku FROM products WHERE sku IS NOT NULL GROUP BY sku HAVING count(*)>1) t`),
  products_bad_category: await one(`SELECT count(*)::int AS n FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.category_id IS NOT NULL AND c.id IS NULL`),
};

const required = [
  'products','categories','profiles','orders','order_items','customers','coupons',
  'payment_attempts','callback_events','sms_attempts','site_settings','banners',
  'pages','product_images','product_variants','reviews','addresses','cart_items',
  'notifications','store_modules','cms_content','navigation_menus','navigation_items',
  'order_payment_events','schema_migrations'
];
const existing = new Set(tables.rows.filter((r) => r.schema === 'public').map((r) => r.table));
const missing_required = required.filter((t) => !existing.has(t));

let migrations = (await q(`SELECT id, notes, applied_at FROM schema_migrations ORDER BY id`)).rows;
if (migrations.error) {
  migrations = (await q(`SELECT version FROM supabase_migrations.schema_migrations ORDER BY version`)).rows;
}

const helpers = {
  auth_uid: await one(`SELECT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='auth' AND p.proname='uid') AS e`),
  auth_role: await one(`SELECT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='auth' AND p.proname='role') AS e`),
  mark_order_paid: await one(`SELECT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='mark_order_paid') AS e`),
  claim_order_confirmation: await one(`SELECT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='claim_order_confirmation') AS e`),
  apply_order_payment: await one(`SELECT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='apply_order_payment') AS e`),
};

const paymentCols = (await q(`
  SELECT column_name, data_type, udt_name, is_nullable
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='payment_attempts' ORDER BY ordinal_position`)).rows;

const orderCols = (await q(`
  SELECT column_name, data_type, udt_name, is_nullable
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='orders' ORDER BY ordinal_position`)).rows;

console.log(JSON.stringify({
  version: ver.rows[0]?.version,
  db,
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
  checks: checks.rows,
  uniques: uniques.rows,
  counts,
  productCols,
  productRows,
  integrity,
  missing_required,
  present_required: required.filter((t) => existing.has(t)),
  migrations,
  helpers,
  paymentCols,
  orderCols,
}, null, 2));

await c.end();
