#!/usr/bin/env node
/**
 * Mark every product as pre-order and set default shipping note where missing.
 * Usage: node scripts/backfill-preorder-products.mjs
 * Reads DATABASE_URL from .env.dburl or DATABASE_URL env.
 */
import pg from 'pg';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

function loadDbUrl() {
  const dburlFile = resolve(root, '.env.dburl');
  if (existsSync(dburlFile)) {
    const raw = readFileSync(dburlFile, 'utf8').trim();
    const line = raw
      .split('\n')
      .map((l) => l.trim())
      .find(Boolean);
    if (line) {
      if (line.startsWith('DATABASE_URL=')) return line.replace(/^DATABASE_URL=/, '').trim();
      if (line.startsWith('postgresql://') || line.startsWith('postgres://')) return line;
    }
  }
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  throw new Error('Set DATABASE_URL or create .env.dburl');
}

const DEFAULT_NOTE =
  process.env.NEXT_PUBLIC_PREORDER_SHIPPING_NOTE?.trim() ||
  'Pre-order — ships when stock arrives. Pay in full or 50% now at checkout.';

const client = new pg.Client({ connectionString: loadDbUrl() });
await client.connect();

const { rows } = await client.query(
  `SELECT id, name, metadata FROM products ORDER BY created_at`
);

let updated = 0;
for (const row of rows) {
  const meta = row.metadata && typeof row.metadata === 'object' ? { ...row.metadata } : {};
  if (meta.is_preorder === false) continue;

  const note =
    typeof meta.preorder_shipping === 'string' && meta.preorder_shipping.trim()
      ? meta.preorder_shipping.trim()
      : DEFAULT_NOTE;

  const needsUpdate = meta.is_preorder !== true || meta.preorder_shipping !== note;
  if (!needsUpdate) continue;

  meta.is_preorder = true;
  meta.preorder_shipping = note;

  await client.query(`UPDATE products SET metadata = $1::jsonb WHERE id = $2`, [
    JSON.stringify(meta),
    row.id,
  ]);
  updated++;
  console.log('updated', row.name);
}

console.log(`Done. ${updated}/${rows.length} products set to pre-order.`);
await client.end();
