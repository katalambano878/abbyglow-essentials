import { NextResponse } from 'next/server';
import { checkRateLimit, getClientIdentifier } from '@/lib/rate-limit';
import { isPlainPostgres } from '@/lib/db/mode';
import { query } from '@/lib/db/pool';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

let tableReady = false;

async function ensureTable() {
  if (tableReady) return;
  await query(`
    CREATE TABLE IF NOT EXISTS public.newsletter_subscribers (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      email text NOT NULL UNIQUE,
      source text,
      subscribed_at timestamptz NOT NULL DEFAULT now(),
      unsubscribed_at timestamptz
    )
  `);
  tableReady = true;
}

/** Newsletter sign-up from the footer / blog forms. */
export async function POST(req: Request) {
  if (!isPlainPostgres()) {
    return NextResponse.json({ success: false, message: 'Newsletter is not available right now' }, { status: 503 });
  }
  const rl = checkRateLimit(`newsletter:${getClientIdentifier(req)}`, { maxRequests: 5, windowSeconds: 60 * 10 });
  if (!rl.success) {
    return NextResponse.json({ success: false, message: 'Too many attempts. Please try again later.' }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const email = String(body.email || '').trim().toLowerCase();
  const source = String(body.source || 'website').slice(0, 40);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return NextResponse.json({ success: false, message: 'Enter a valid email address' }, { status: 400 });
  }

  try {
    await ensureTable();
    await query(
      `INSERT INTO public.newsletter_subscribers (email, source)
       VALUES ($1, $2)
       ON CONFLICT (email) DO UPDATE SET unsubscribed_at = NULL`,
      [email, source]
    );
    return NextResponse.json({ success: true, message: 'You are on the list!' });
  } catch (err: any) {
    console.error('[Newsletter] subscribe failed:', err?.message || err);
    return NextResponse.json({ success: false, message: 'Could not subscribe right now. Please try again.' }, { status: 500 });
  }
}
