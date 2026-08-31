import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const env = fs.readFileSync(path.join(root, '.env.local'), 'utf8');
const m = env.match(/^DATABASE_URL=(.+)$/m);
if (!m) throw new Error('DATABASE_URL missing in .env.local');

const files = [
  'supabase/migrations/20260803140000_part_payment_plans.sql',
  'supabase/migrations/20260803140100_apply_order_payment.sql',
];

const client = new pg.Client({
  connectionString: m[1].trim(),
  connectionTimeoutMillis: 20000,
});

await client.connect();
console.log('db', (await client.query('SELECT current_database()')).rows[0]);

for (const rel of files) {
  const sql = fs.readFileSync(path.join(root, rel), 'utf8');
  // Each file in its own implicit transaction (autocommit) so enum commits first
  await client.query(sql);
  console.log('applied', rel);
}

const cols = await client.query(`
  SELECT column_name
  FROM information_schema.columns
  WHERE table_name = 'orders'
    AND column_name IN ('payment_plan','amount_due_now','amount_paid','balance_due')
  ORDER BY 1
`);
console.log('columns', cols.rows);

const fn = await client.query(`
  SELECT EXISTS(
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'apply_order_payment'
  ) AS ok
`);
console.log('apply_order_payment', fn.rows[0]);

const enumVal = await client.query(`
  SELECT e.enumlabel
  FROM pg_enum e
  JOIN pg_type t ON e.enumtypid = t.oid
  WHERE t.typname = 'payment_status'
  ORDER BY e.enumsortorder
`);
console.log('payment_status values', enumVal.rows.map((r) => r.enumlabel));

await client.end();
