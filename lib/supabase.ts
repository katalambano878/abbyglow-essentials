import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

/**
 * Browser / shared supabase-js client.
 * In plain-Postgres mode, NEXT_PUBLIC_SUPABASE_URL must be this app's origin
 * so requests hit /auth/v1, /rest/v1, and /storage/v1 shims.
 */
function createBrowserClient(): SupabaseClient {
  if (!supabaseUrl || !supabaseKey) {
    console.error(
      '[supabase] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY'
    );
  }
  return createClient(supabaseUrl || 'http://localhost', supabaseKey || 'anon');
}

export const supabase = createBrowserClient();
