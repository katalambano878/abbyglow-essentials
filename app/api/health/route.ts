import { NextResponse } from 'next/server';
import { isPlainPostgres } from '@/lib/db/mode';
import { collectEnvChecks } from '@/lib/env';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Public health check — no secrets exposed.
 */
export async function GET() {
  const checks: Record<string, string> = {
    app: 'ok',
    mode: isPlainPostgres() ? 'plain_postgres' : 'supabase_hosted',
    database: 'unknown',
    payment_moolre: process.env.MOOLRE_API_USER && process.env.MOOLRE_API_PUBKEY && process.env.MOOLRE_ACCOUNT_NUMBER
      ? 'configured'
      : 'missing',
    sms_moolre: process.env.MOOLRE_SMS_API_KEY || process.env.MOOLRE_API_KEY ? 'configured' : 'missing',
    callback_secret: process.env.MOOLRE_CALLBACK_SECRET ? 'configured' : 'missing',
    auth_jwt: process.env.AUTH_JWT_SECRET || process.env.JWT_SECRET || process.env.SUPABASE_JWT_SECRET
      ? 'configured'
      : 'missing',
    payment_hubtel:
      process.env.HUBTEL_CLIENT_ID &&
      process.env.HUBTEL_CLIENT_SECRET &&
      process.env.HUBTEL_MERCHANT_ACCOUNT_NUMBER
        ? 'configured'
        : 'missing',
    hubtel_callback_secret: process.env.HUBTEL_CALLBACK_SECRET ? 'configured' : 'missing',
    paystack: 'not_implemented',
  };

  let schemaStatus: 'ok' | 'degraded' | 'unknown' = 'unknown';
  if (isPlainPostgres()) {
    try {
      const { query } = await import('@/lib/db/pool');
      await query('SELECT 1 AS ok');
      checks.database = 'ok';

      // Required-table presence only — no row data, hosts, or credentials.
      const required = [
        'profiles',
        'products',
        'orders',
        'order_items',
        'payment_attempts',
        'callback_events',
        'sms_attempts',
        'categories',
        'customers',
      ];
      const { rows } = await query<{ missing: number }>(
        `SELECT COUNT(*)::int AS missing
         FROM unnest($1::text[]) AS t(name)
         WHERE to_regclass('public.' || name) IS NULL`,
        [required]
      );
      const missing = rows[0]?.missing ?? required.length;
      schemaStatus = missing === 0 ? 'ok' : 'degraded';
      checks.schema = schemaStatus;

      const { rows: helperRows } = await query<{ ok: boolean }>(
        `SELECT (
           EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='auth' AND p.proname='uid')
           AND EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='auth' AND p.proname='role')
           AND EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='mark_order_paid')
           AND EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='apply_order_payment')
           AND EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='claim_order_confirmation')
         ) AS ok`
      );
      checks.db_helpers = helperRows[0]?.ok ? 'ok' : 'degraded';
    } catch {
      checks.database = 'error';
      checks.schema = 'unknown';
    }
  } else {
    checks.database = process.env.NEXT_PUBLIC_SUPABASE_URL ? 'supabase_url_set' : 'missing';
  }

  const env = collectEnvChecks().map((c) => ({
    key: c.key,
    status: c.ok ? 'ok' : c.required ? 'missing_required' : 'missing_optional',
  }));

  const healthy =
    checks.app === 'ok' &&
    checks.database !== 'error' &&
    schemaStatus !== 'degraded' &&
    checks.db_helpers !== 'degraded';
  const statusLabel = !healthy
    ? 'unhealthy'
    : checks.payment_moolre === 'missing' || checks.callback_secret === 'missing'
      ? 'degraded'
      : 'healthy';

  return NextResponse.json(
    {
      ok: healthy,
      status: statusLabel,
      timestamp: new Date().toISOString(),
      checks,
      env,
    },
    { status: healthy ? 200 : 503 }
  );
}
