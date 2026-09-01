import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sqlPath = path.join(
  __dirname,
  '..',
  'supabase',
  'migrations',
  '20260901000000_contact_submissions_and_modules.sql'
);
const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!url) {
  console.error('DATABASE_URL missing');
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();
await client.query(fs.readFileSync(sqlPath, 'utf8'));

const extra = await client.query(`
  SELECT json_build_object(
    'contact_submissions', to_regclass('public.contact_submissions') IS NOT NULL,
    'upsert_customer_from_order', EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='upsert_customer_from_order'),
    'reduce_stock_on_order', EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='reduce_stock_on_order'),
    'store_modules', (SELECT count(*) FROM store_modules),
    'admins', (SELECT json_agg(email) FROM profiles WHERE role::text='admin')
  ) AS report
`);
console.log(JSON.stringify(extra.rows[0].report, null, 2));
await client.end();
