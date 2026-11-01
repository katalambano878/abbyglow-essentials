import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { runPaymentReminders } from '@/lib/payments/reminders';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function authorized(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  const header = request.headers.get('authorization') || '';
  const expected = `Bearer ${cronSecret}`;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * External trigger for payment reminders (e.g. a host cron calling this URL
 * with `Authorization: Bearer $CRON_SECRET`). The app also runs the same job
 * on a timer in-process — see instrumentation.ts.
 */
export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const result = await runPaymentReminders();
    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    console.error('[Payment Reminders] Error:', error);
    return NextResponse.json({ error: 'Reminder run failed' }, { status: 500 });
  }
}
