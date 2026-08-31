import { createClient as createSupabaseJsClient } from '@supabase/supabase-js';
import { isPlainPostgres } from './db/mode';
import { createClient as createPgClient } from './db/supabase-compat';

/**
 * Server-side admin client.
 * - Plain Postgres (DATABASE_URL set): in-process pg compat + auth/storage shims
 * - Otherwise: hosted Supabase service-role client
 *
 * ONLY use in API routes / server actions — never in client components.
 * Lazily initialized so `next build` can collect page data without env.
 */

function createAdminClient() {
  if (isPlainPostgres()) {
    return createPgClient();
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL (or set DATABASE_URL for plain Postgres)');
  }
  if (!supabaseServiceKey) {
    console.error('CRITICAL: Missing SUPABASE_SERVICE_ROLE_KEY — admin operations will fail');
  }

  return createSupabaseJsClient(supabaseUrl, supabaseServiceKey || '', {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

let _admin: ReturnType<typeof createAdminClient> | null = null;

function getAdmin() {
  if (!_admin) {
    _admin = createAdminClient();
  }
  return _admin;
}

export const supabaseAdmin: any = new Proxy(
  {},
  {
    get(_target, prop, receiver) {
      const client = getAdmin() as any;
      const value = Reflect.get(client, prop, receiver);
      return typeof value === 'function' ? value.bind(client) : value;
    },
  }
);
