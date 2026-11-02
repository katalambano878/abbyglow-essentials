import { supabaseAdmin } from '@/lib/supabase-admin';
import { verifyAccessToken } from '@/lib/db/auth';
import { isPlainPostgres } from '@/lib/db/mode';

export type StaffCheck =
  | { ok: true; userId: string; role: string }
  | { ok: false; status: number; message: string };

/** Verifies the Bearer token on an admin API request and that the profile is staff/admin. */
export async function requireStaff(req: Request): Promise<StaffCheck> {
  const auth = req.headers.get('authorization') || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m?.[1] || !isPlainPostgres()) {
    return { ok: false, status: 401, message: 'Unauthorized' };
  }
  const verified = await verifyAccessToken(m[1]);
  if (!verified) {
    return { ok: false, status: 401, message: 'Unauthorized' };
  }

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', verified.userId)
    .maybeSingle();

  const role = String(profile?.role || '').toLowerCase();
  if (!['admin', 'staff', 'super_admin'].includes(role)) {
    return { ok: false, status: 403, message: 'Forbidden' };
  }
  return { ok: true, userId: verified.userId, role };
}
