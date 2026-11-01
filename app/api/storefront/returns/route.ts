import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { checkRateLimit, getClientIdentifier } from '@/lib/rate-limit';
import { verifyAccessToken } from '@/lib/db/auth';
import { isPlainPostgres } from '@/lib/db/mode';
import { sendEmail, emailLayout } from '@/lib/notifications';
import { escapeHtml } from '@/lib/sanitize';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RETURN_WINDOW_DAYS = 14;

type ReturnLine = { orderItemId: string; quantity: number; reason?: string; condition?: string };

/**
 * Guest-safe return request. Ownership is proven with the order number + the
 * email used at checkout (or a signed-in customer's token), the items are
 * checked against the order, and the rows are written with the admin client.
 */
export async function POST(req: Request) {
  try {
    const rl = checkRateLimit(`returns:${getClientIdentifier(req)}`, { maxRequests: 10, windowSeconds: 60 * 10 });
    if (!rl.success) {
      return NextResponse.json({ success: false, message: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    const body = await req.json().catch(() => ({}));
    const orderNumber = String(body.orderNumber || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const reason = String(body.reason || '').trim().slice(0, 200);
    const description = String(body.description || '').trim().slice(0, 2000);
    const lines: ReturnLine[] = Array.isArray(body.items) ? body.items : [];

    if (!orderNumber || !reason || lines.length === 0) {
      return NextResponse.json({ success: false, message: 'Order number, a reason and at least one item are required' }, { status: 400 });
    }

    let userId: string | null = null;
    let tokenEmail: string | null = null;
    const auth = req.headers.get('authorization') || '';
    const m = auth.match(/^Bearer\s+(.+)$/i);
    if (m?.[1] && isPlainPostgres()) {
      const verified = await verifyAccessToken(m[1]);
      if (verified) {
        userId = verified.userId;
        tokenEmail = typeof verified.payload.email === 'string' ? verified.payload.email.toLowerCase() : null;
      }
    }

    const { data: order } = await supabaseAdmin
      .from('orders')
      .select('id, order_number, user_id, email, status, payment_status, created_at, updated_at, metadata, order_items(id, product_name, variant_name, quantity)')
      .eq('order_number', orderNumber)
      .maybeSingle();

    if (!order) {
      return NextResponse.json({ success: false, message: 'Order not found' }, { status: 404 });
    }

    const orderEmail = String(order.email || '').toLowerCase();
    const owns =
      (userId && order.user_id === userId) ||
      (email && orderEmail === email) ||
      (tokenEmail && orderEmail === tokenEmail);
    if (!owns) {
      return NextResponse.json({ success: false, message: 'Order not found' }, { status: 404 });
    }

    if (!['paid', 'partially_paid'].includes(String(order.payment_status))) {
      return NextResponse.json({ success: false, message: 'Only paid orders can be returned' }, { status: 400 });
    }
    if (['cancelled', 'refunded'].includes(String(order.status))) {
      return NextResponse.json({ success: false, message: 'This order has already been closed' }, { status: 400 });
    }
    const deliveredAt = new Date(order.updated_at || order.created_at).getTime();
    if (order.status === 'delivered' && Date.now() - deliveredAt > RETURN_WINDOW_DAYS * 24 * 3600 * 1000) {
      return NextResponse.json(
        { success: false, message: `Returns are accepted within ${RETURN_WINDOW_DAYS} days of delivery` },
        { status: 400 }
      );
    }

    const { data: existing } = await supabaseAdmin
      .from('return_requests')
      .select('id, status')
      .eq('order_id', order.id)
      .in('status', ['pending', 'approved', 'processing'])
      .limit(1);
    if (existing && existing.length > 0) {
      return NextResponse.json(
        { success: false, message: 'A return request for this order is already in progress', requestId: existing[0].id },
        { status: 409 }
      );
    }

    const orderItems = (order.order_items || []) as Array<{ id: string; product_name: string; variant_name: string | null; quantity: number }>;
    const itemRows: Array<{ order_item_id: string; quantity: number; reason: string | null; condition: string | null }> = [];
    for (const line of lines) {
      const itemId = String(line.orderItemId || '');
      const qty = Math.floor(Number(line.quantity) || 0);
      const item = UUID_RE.test(itemId) ? orderItems.find((i) => i.id === itemId) : undefined;
      if (!item || qty < 1 || qty > Number(item.quantity)) {
        return NextResponse.json({ success: false, message: 'One of the selected items does not belong to this order' }, { status: 400 });
      }
      itemRows.push({
        order_item_id: item.id,
        quantity: qty,
        reason: line.reason ? String(line.reason).slice(0, 200) : null,
        condition: line.condition ? String(line.condition).slice(0, 100) : null,
      });
    }

    const { data: request, error: reqError } = await supabaseAdmin
      .from('return_requests')
      .insert({
        order_id: order.id,
        user_id: order.user_id || userId,
        status: 'pending',
        reason,
        description: description || null,
      })
      .select('id, status, created_at')
      .single();

    if (reqError || !request) {
      console.error('[Returns] insert failed:', reqError?.message);
      return NextResponse.json({ success: false, message: 'Could not create the return request' }, { status: 500 });
    }

    const { error: itemsError } = await supabaseAdmin
      .from('return_items')
      .insert(itemRows.map((row) => ({ ...row, return_request_id: request.id })));
    if (itemsError) {
      console.error('[Returns] items insert failed:', itemsError.message);
      await supabaseAdmin.from('return_requests').delete().eq('id', request.id);
      return NextResponse.json({ success: false, message: 'Could not save the return items' }, { status: 500 });
    }

    const summary = itemRows
      .map((row) => {
        const item = orderItems.find((i) => i.id === row.order_item_id)!;
        return `${row.quantity} × ${item.product_name}${item.variant_name ? ` (${item.variant_name})` : ''}`;
      })
      .join(', ');

    void Promise.all([
      sendEmail({
        to: order.email,
        subject: `Return request received — order #${order.order_number}`,
        html: emailLayout(
          `<h2 style="margin:0 0 12px;color:#111827;font-size:22px;">We received your return request</h2>
<p style="color:#374151;font-size:14px;line-height:1.7;">Order <strong>#${escapeHtml(order.order_number)}</strong> — ${escapeHtml(summary)}.</p>
<p style="color:#374151;font-size:14px;line-height:1.7;">Reason: ${escapeHtml(reason)}</p>
<p style="color:#374151;font-size:14px;line-height:1.7;">Our team will review it and reply by email within 2 business days with the next steps. Please keep the items in their original condition until then.</p>
<p style="color:#9ca3af;font-size:12px;">Reference: ${escapeHtml(request.id)}</p>`,
          'Return request received'
        ),
      }),
      sendEmail({
        to: process.env.ADMIN_EMAIL || 'admin@abbyglow.shop',
        subject: `Return request — order #${order.order_number}`,
        html: emailLayout(
          `<h2 style="margin:0 0 12px;color:#111827;font-size:20px;">New return request</h2>
<p style="color:#374151;font-size:14px;">Order #${escapeHtml(order.order_number)} (${escapeHtml(order.email)})</p>
<p style="color:#374151;font-size:14px;">Items: ${escapeHtml(summary)}</p>
<p style="color:#374151;font-size:14px;">Reason: ${escapeHtml(reason)}</p>
${description ? `<p style="color:#374151;font-size:14px;">${escapeHtml(description)}</p>` : ''}
<p style="color:#9ca3af;font-size:12px;">Request id: ${escapeHtml(request.id)}</p>`,
          'New return request'
        ),
      }),
    ]).catch((err) => console.error('[Returns] notification failed:', err));

    return NextResponse.json({
      success: true,
      request: { id: request.id, status: request.status, created_at: request.created_at, order_number: order.order_number },
    });
  } catch (err: any) {
    console.error('[Returns] error:', err?.message || err);
    return NextResponse.json({ success: false, message: 'Return request failed' }, { status: 500 });
  }
}

/** Confirmation page lookup: id + order number (both are needed; the id alone is not shown anywhere public). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = String(url.searchParams.get('id') || '');
  const orderNumber = String(url.searchParams.get('order') || '');
  if (!UUID_RE.test(id) || !orderNumber) {
    return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  }
  const { data } = await supabaseAdmin
    .from('return_requests')
    .select('id, status, reason, created_at, orders(order_number, email), return_items(quantity, reason, order_items(product_name, variant_name))')
    .eq('id', id)
    .maybeSingle();
  if (!data || (data as any).orders?.order_number !== orderNumber) {
    return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  }
  const row = data as any;
  return NextResponse.json({
    success: true,
    request: {
      id: row.id,
      status: row.status,
      reason: row.reason,
      created_at: row.created_at,
      order_number: row.orders?.order_number,
      items: (row.return_items || []).map((ri: any) => ({
        quantity: ri.quantity,
        reason: ri.reason,
        product_name: ri.order_items?.product_name,
        variant_name: ri.order_items?.variant_name,
      })),
    },
  });
}
