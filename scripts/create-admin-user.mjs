/**
 * Create an admin user in Supabase Auth and set role in profiles.
 * Uses SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL from .env.local.
 *
 * Usage:
 *   node scripts/create-admin-user.mjs <email> <password>
 * Or set env vars and run:
 *   CREATE_ADMIN_EMAIL=admin@example.com CREATE_ADMIN_PASSWORD=yourpassword node scripts/create-admin-user.mjs
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env.local');
  const altPath = path.join(__dirname, '..', '.env');
  const p = fs.existsSync(envPath) ? envPath : fs.existsSync(altPath) ? altPath : null;
  if (!p) return {};
  return Object.fromEntries(
    fs
      .readFileSync(p, 'utf-8')
      .split('\n')
      .filter((l) => /^[A-Z_]+=/.test(l.trim()))
      .map((l) => {
        const eq = l.indexOf('=');
        const key = l.slice(0, eq).trim();
        let val = l.slice(eq + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        return [key, val];
      })
  );
}

const env = { ...process.env, ...loadEnv() };
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

const email = process.argv[2] || env.CREATE_ADMIN_EMAIL;
const password = process.argv[3] || env.CREATE_ADMIN_PASSWORD;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

if (!email || !password) {
  console.error('Usage: node scripts/create-admin-user.mjs <email> <password>');
  console.error('   Or set CREATE_ADMIN_EMAIL and CREATE_ADMIN_PASSWORD in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  try {
    const { data: user, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (createError) {
      if (createError.message?.includes('already been registered')) {
        console.log('User already exists. Updating profile to admin...');
        const { data: profile, error: fetchErr } = await supabase
          .from('profiles')
          .select('id')
          .eq('email', email)
          .single();

        if (fetchErr || !profile) {
          console.error('Could not find profile for that email:', fetchErr?.message || 'Not found');
          process.exit(1);
        }

        const { error: updateError } = await supabase
          .from('profiles')
          .update({ role: 'admin' })
          .eq('id', profile.id);

        if (updateError) {
          console.error('Failed to update profile:', updateError.message);
          process.exit(1);
        }
        console.log('Profile updated. Admin user:', email);
        return;
      }
      console.error('Failed to create user:', createError.message);
      process.exit(1);
    }

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ role: 'admin' })
      .eq('id', user.user.id);

    if (updateError) {
      console.error('User created but failed to set admin role:', updateError.message);
      console.log('User id:', user.user.id, '- you can set role manually in Supabase Dashboard.');
      process.exit(1);
    }

    console.log('Admin user created successfully.');
    console.log('  Email:', email);
    console.log('  Login at: /admin/login');
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

main();
