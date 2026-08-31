import fs from 'fs';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';

const email = (process.argv[2] || 'admin@example.com').trim().toLowerCase();
const password = process.argv[3] || 'admin123';

function loadDbUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const dburl = new URL('../.env.dburl', import.meta.url);
  const local = new URL('../.env.local', import.meta.url);
  for (const p of [dburl, local]) {
    const path = fs.existsSync(p) ? p : null;
    if (!path) continue;
    const text = fs.readFileSync(path, 'utf8');
    const m = text.match(/^DATABASE_URL=(.+)$/m) || text.match(/^(postgresql:\/\/\S+)/m);
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  }
  throw new Error('DATABASE_URL not found');
}

const client = new pg.Client({ connectionString: loadDbUrl() });
await client.connect();

const hash = bcrypt.hashSync(password, 10);
const existing = await client.query(
  `SELECT id FROM auth.users WHERE lower(email) = $1 LIMIT 1`,
  [email]
);

let id = existing.rows[0]?.id;
if (!id) {
  id = randomUUID();
  await client.query(
    `INSERT INTO auth.users (
       id, instance_id, aud, role, email, encrypted_password,
       email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
       created_at, updated_at, confirmation_token, recovery_token,
       email_change_token_new, email_change
     ) VALUES (
       $1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       $2, $3, now(), '{"provider":"email","providers":["email"]}'::jsonb,
       '{"full_name":"Admin"}'::jsonb,
       now(), now(), '', '', '', ''
     )`,
    [id, email, hash]
  );
  console.log('Created auth user', email);
} else {
  await client.query(
    `UPDATE auth.users
     SET encrypted_password = $1,
         email_confirmed_at = COALESCE(email_confirmed_at, now()),
         updated_at = now()
     WHERE id = $2`,
    [hash, id]
  );
  console.log('Updated password for', email);
}

await client.query(
  `INSERT INTO profiles (id, email, full_name, role, created_at, updated_at)
   VALUES ($1, $2, 'Admin', 'admin', now(), now())
   ON CONFLICT (id) DO UPDATE
     SET role = 'admin', email = EXCLUDED.email, updated_at = now()`,
  [id, email]
);

const check = await client.query(
  `SELECT u.email, p.role, (u.email_confirmed_at IS NOT NULL) AS confirmed
   FROM auth.users u JOIN profiles p ON p.id = u.id
   WHERE u.id = $1`,
  [id]
);
console.log(check.rows[0]);
await client.end();
