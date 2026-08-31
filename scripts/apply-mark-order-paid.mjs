/**
 * Apply mark_order_paid idempotent migration against DATABASE_URL.
 * Usage: node scripts/apply-mark-order-paid.mjs
 */
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
  '20260730000000_mark_order_paid_idempotent.sql'
);

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!connectionString) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const sql = fs.readFileSync(sqlPath, 'utf8');
const client = new pg.Client({
  connectionString,
  ssl: process.env.PGSSL === 'require' ? { rejectUnauthorized: false } : undefined,
});

await client.connect();
try {
  await client.query(sql);
  console.log('Applied mark_order_paid idempotent migration');
} finally {
  await client.end();
}
