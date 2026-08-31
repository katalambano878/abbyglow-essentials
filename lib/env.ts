/**
 * Startup / health env validation — never logs secret values.
 */

export type EnvCheck = { key: string; ok: boolean; required: boolean; public?: boolean };

const REQUIRED_PLAIN_PG = [
  'DATABASE_URL',
  'AUTH_JWT_SECRET',
  'NEXT_PUBLIC_APP_URL',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
] as const;

const REQUIRED_PAYMENTS_PROD = [
  'MOOLRE_API_USER',
  'MOOLRE_API_PUBKEY',
  'MOOLRE_ACCOUNT_NUMBER',
  'MOOLRE_CALLBACK_SECRET',
] as const;

export function isPlainPostgresEnv(): boolean {
  return !!(process.env.DATABASE_URL || process.env.POSTGRES_URL);
}

export function collectEnvChecks(): EnvCheck[] {
  const checks: EnvCheck[] = [];
  const present = (key: string) => {
    const v = process.env[key];
    return typeof v === 'string' && v.trim().length > 0;
  };

  if (isPlainPostgresEnv()) {
    for (const key of REQUIRED_PLAIN_PG) {
      // AUTH_JWT_SECRET may also be JWT_SECRET / SUPABASE_JWT_SECRET
      if (key === 'AUTH_JWT_SECRET') {
        checks.push({
          key: 'AUTH_JWT_SECRET|JWT_SECRET|SUPABASE_JWT_SECRET',
          ok: present('AUTH_JWT_SECRET') || present('JWT_SECRET') || present('SUPABASE_JWT_SECRET'),
          required: process.env.NODE_ENV === 'production',
        });
        continue;
      }
      checks.push({
        key,
        ok: present(key) || (key === 'DATABASE_URL' && present('POSTGRES_URL')),
        required: true,
        public: key.startsWith('NEXT_PUBLIC_'),
      });
    }
    checks.push({
      key: 'STORAGE_ROOT',
      ok: present('STORAGE_ROOT'),
      required: false,
    });
  }

  const prod = process.env.NODE_ENV === 'production';
  for (const key of REQUIRED_PAYMENTS_PROD) {
    checks.push({ key, ok: present(key), required: prod });
  }

  checks.push({
    key: 'MOOLRE_SMS_API_KEY|MOOLRE_API_KEY',
    ok: present('MOOLRE_SMS_API_KEY') || present('MOOLRE_API_KEY'),
    required: false,
  });
  checks.push({ key: 'RESEND_API_KEY', ok: present('RESEND_API_KEY'), required: false });

  return checks;
}

/** Throws in production when critical plain-PG vars are missing. */
export function assertCriticalEnv(): void {
  if (process.env.NODE_ENV !== 'production') return;
  if (!isPlainPostgresEnv()) return;
  const missing = collectEnvChecks().filter((c) => c.required && !c.ok);
  if (missing.length) {
    throw new Error(
      `Missing required environment variables: ${missing.map((m) => m.key).join(', ')}`
    );
  }
}
