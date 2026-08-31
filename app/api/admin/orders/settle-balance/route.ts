import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { applyOrderPayment } from '@/lib/payments/apply-payment';
import { verifyAccessToken } from '@/lib/db/auth';
import { isPlainPostgres } from '@/lib/db/mode';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function requireStaff(req: Request): Promise<{ ok: true; userId: string } | { ok: false; status: number; message: string }> {
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
  return { ok: true, userId: verified.userId };
}

/** Admin records cash/MoMo/bank balance collection for a partially paid order. */
export async function POST(req: Request) {
  try {
    const staff = await requireStaff(req);
    if (!staff.ok) {
      return NextResponse.json({ success: false, message: staff.message }, { status: staff.status });
    }

    const body = await req.json().catch(() => ({}));
    const orderNumber = String(body.orderNumber || '').trim();
    const method = String(body.method || 'cash').trim().toLowerCase();
    const note = String(body.note || '').trim();

    if (!orderNumber) {
      return NextResponse.json({ success: false, message: 'Missing orderNumber' }, { status: 400 });
    }

    const { data: order, error } = await supabaseAdmin
      .from('orders')
      .select('id, order_number, payment_status, total, amount_paid, balance_due')
      .eq('order_number', orderNumber)
      .single();

    if (error || !order) {
      return NextResponse.json({ success: false, message: 'Order not found' }, { status: 404 });
    }

    if (order.payment_status === 'paid') {
      return NextResponse.json({ success: true, message: 'Already paid', order });
    }

    const balance = Number(order.balance_due ?? Math.max(0, Number(order.total) - Number(order.amount_paid || 0)));
    if (balance <= 0.01) {
      return NextResponse.json({ success: false, message: 'No balance due' }, { status: 400 });
    }

    const amount =
      body.amount != null && Number.isFinite(Number(body.amount))
        ? Math.min(balance, Math.max(0.01, Number(body.amount)))
        : balance;

    const gatewayRef = `admin-${method}-${staff.userId.slice(0, 8)}-${Date.now()}`;
    const { order: updated, error: applyError } = await applyOrderPayment({
      orderNumber,
      amount,
      gateway: `admin_${method}`,
      gatewayRef,
      kind: 'admin_settle',
    });

    if (applyError || !updated) {
      return NextResponse.json({ success: false, message: applyError || 'Settle failed' }, { status: 500 });
    }

    if (note) {
      const prevNotes = String((updated as any).notes || '');
      await supabaseAdmin
        .from('orders')
        .update({
          notes: [prevNotes, `Balance settle (${method}): ${note}`].filter(Boolean).join('\n'),
          metadata: {
            ...((updated as any).metadata || {}),
            balance_settle_note: note,
            balance_settle_method: method,
            balance_settled_by: staff.userId,
          },
        })
        .eq('id', updated.id);
    }

    return NextResponse.json({ success: true, order: updated });
  } catch (err: any) {
    console.error('[settle-balance]', err?.message || err);
    return NextResponse.json({ success: false, message: 'Internal error' }, { status: 500 });
  }
}
