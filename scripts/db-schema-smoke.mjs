/**
 * Schema smoke tests for store_abbyglow / local DATABASE_URL.
 * Usage: node --env-file=.env.local scripts/db-schema-smoke.mjs
 *        DATABASE_URL=... node scripts/db-schema-smoke.mjs
 */
import pg from 'pg';

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!url) {
  console.error('FAIL: DATABASE_URL not set');
  process.exit(2);
}

const requiredTables = [
  'profiles',
  'products',
  'orders',
  'order_items',
  'payment_attempts',
  'callback_events',
  'sms_attempts',
  'categories',
  'customers',
  'product_variants',
  'product_images',
  'store_modules',
];

const requiredHelpers = [
  ['auth', 'uid'],
  ['auth', 'role'],
  ['public', 'mark_order_paid'],
  ['public', 'claim_order_confirmation'],
];

const client = new pg.Client({ connectionString: url });
let failed = 0;

function ok(msg) {
  console.log(`OK  ${msg}`);
}
function bad(msg) {
  console.error(`FAIL ${msg}`);
  failed += 1;
}

try {
  await client.connect();
  const ver = await client.query('SELECT version()');
  ok(`connected (${String(ver.rows[0].version).split(',')[0]})`);

  for (const t of requiredTables) {
    const r = await client.query(`SELECT to_regclass($1) IS NOT NULL AS e`, [`public.${t}`]);
    if (r.rows[0].e) ok(`table public.${t}`);
    else bad(`missing table public.${t}`);
  }

  for (const [schema, name] of requiredHelpers) {
    const r = await client.query(
      `SELECT EXISTS(
         SELECT 1 FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = $1 AND p.proname = $2
       ) AS e`,
      [schema, name]
    );
    if (r.rows[0].e) ok(`function ${schema}.${name}`);
    else bad(`missing function ${schema}.${name}`);
  }

  const idx = await client.query(
    `SELECT COUNT(*)::int AS c FROM pg_indexes
     WHERE schemaname='public' AND indexname='idx_callback_events_dedupe'`
  );
  if (idx.rows[0].c === 1) ok('callback dedupe index');
  else bad('missing idx_callback_events_dedupe');

  const uq = await client.query(
    `SELECT COUNT(*)::int AS c FROM pg_indexes
     WHERE schemaname='public' AND indexname='payment_attempts_internal_reference_key'`
  );
  if (uq.rows[0].c === 1) ok('payment internal_reference unique');
  else bad('missing payment_attempts_internal_reference_key');

  // Idempotency: insert+conflict on payment_attempts (rolled back)
  await client.query('BEGIN');
  try {
    await client.query(
      `INSERT INTO payment_attempts (
         order_number, gateway, internal_reference, amount_expected, currency, status
       ) VALUES ('SMOKE-TEST', 'moolre', 'SMOKE-REF-1', 1, 'GHS', 'pending')
       ON CONFLICT (internal_reference) DO NOTHING`
    );
    const again = await client.query(
      `INSERT INTO payment_attempts (
         order_number, gateway, internal_reference, amount_expected, currency, status
       ) VALUES ('SMOKE-TEST', 'moolre', 'SMOKE-REF-1', 1, 'GHS', 'pending')
       ON CONFLICT (internal_reference) DO NOTHING
       RETURNING id`
    );
    if (again.rowCount === 0) ok('payment attempt unique conflict');
    else bad('payment attempt unique conflict did not fire');
  } finally {
    await client.query('ROLLBACK');
  }

  console.log(failed === 0 ? '\nSCHEMA SMOKE PASSED' : `\nSCHEMA SMOKE FAILED (${failed})`);
  process.exit(failed === 0 ? 0 : 1);
} catch (err) {
  console.error('FAIL unexpected:', err.message);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
