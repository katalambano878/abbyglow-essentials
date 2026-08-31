import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { checkRateLimit, getClientIdentifier } from '@/lib/rate-limit';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Guest-safe order lookup that replaces open /rest/v1/orders reads.
 *
 * Modes:
 *   track   — requires orderNumber + email (case-insensitive match)
 *   pay     — requires orderId (uuid or order_number); returns payment fields only
 *   success — requires orderNumber; returns limited confirmation fields
 */
export async function POST(req: Request) {
  try {
    const clientId = getClientIdentifier(req);
    const rl = checkRateLimit(`order-lookup:${clientId}`, {
      maxRequests: 20,
      windowSeconds: 60,
    });
    if (!rl.success) {
      return NextResponse.json(
        { success: false, message: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const mode = String(body.mode || '').toLowerCase();

    if (mode === 'track') {
      return handleTrack(body);
    }
    if (mode === 'pay') {
      return handlePay(body);
    }
    if (mode === 'success') {
      return handleSuccess(body);
    }

    return NextResponse.json({ success: false, message: 'Invalid mode' }, { status: 400 });
  } catch (err: any) {
    console.error('[OrderLookup] error:', err?.message ?? err);
    return NextResponse.json({ success: false, message: 'Lookup failed' }, { status: 500 });
  }
}

async function handleTrack(body: { orderNumber?: string; email?: string }) {
  const orderNumber = String(body.orderNumber || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  if (!orderNumber || !email) {
    return NextResponse.json(
      { success: false, message: 'Order number and email are required' },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from('orders')
    .select(`
      id,
      order_number,
      status,
      payment_status,
      payment_plan,
      amount_due_now,
      amount_paid,
      balance_due,
      total,
      email,
      created_at,
      shipping_address,
      metadata,
      order_items (
        id,
        product_name,
        variant_name,
        quantity,
        unit_price,
        metadata,
        products (
          product_images (url)
        )
      )
    `)
    .eq('order_number', orderNumber)
    .single();

  if (error || !data) {
    return NextResponse.json(
      { success: false, message: 'Order not found. Please check your order number and try again.' },
      { status: 404 }
    );
  }

  if (String(data.email || '').toLowerCase() !== email) {
    return NextResponse.json(
      {
        success: false,
        message:
          'The email address does not match this order. Please use the email you placed the order with.',
      },
      { status: 403 }
    );
  }

  return NextResponse.json({ success: true, order: data });
}

async function handlePay(body: { orderId?: string }) {
  const orderId = String(body.orderId || '').trim();
  if (!orderId) {
    return NextResponse.json({ success: false, message: 'Missing orderId' }, { status: 400 });
  }

  const select =
    'id, order_number, total, currency, subtotal, shipping_total, discount_total, payment_status, payment_plan, amount_due_now, amount_paid, balance_due, payment_provider, email, phone, shipping_address, created_at, metadata';

  let data: Record<string, unknown> | null = null;
  let error: { message?: string } | null = null;

  if (UUID_REGEX.test(orderId)) {
    const result = await supabaseAdmin.from('orders').select(select).eq('id', orderId).single();
    data = result.data;
    error = result.error;
  } else {
    const result = await supabaseAdmin
      .from('orders')
      .select(select)
      .eq('order_number', orderId)
      .single();
    data = result.data;
    error = result.error;
  }

  if (error || !data) {
    return NextResponse.json({ success: false, message: 'Order not found' }, { status: 404 });
  }

  // Do not expose full PII to anyone who only knows the order id/number.
  const safe = {
    id: data.id,
    order_number: data.order_number,
    total: data.total,
    currency: data.currency,
    subtotal: data.subtotal,
    shipping_total: data.shipping_total,
    discount_total: data.discount_total,
    payment_status: data.payment_status,
    payment_plan: data.payment_plan,
    amount_due_now: data.amount_due_now,
    amount_paid: data.amount_paid,
    balance_due: data.balance_due,
    payment_provider: data.payment_provider,
    email: maskEmail(String(data.email || '')),
    phone: maskPhone(String(data.phone || '')),
    shipping_address: data.shipping_address
      ? { city: (data.shipping_address as any)?.city, region: (data.shipping_address as any)?.region }
      : null,
    created_at: data.created_at,
    metadata: {
      moolre_external_ref: (data.metadata as any)?.moolre_external_ref || null,
      hubtel_client_reference: (data.metadata as any)?.hubtel_client_reference || null,
      payment_gateway: (data.metadata as any)?.payment_gateway || null,
      first_name: (data.metadata as any)?.first_name || null,
    },
  };

  return NextResponse.json({ success: true, order: safe });
}

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return '***';
  return `${digits.slice(0, 3)}****${digits.slice(-3)}`;
}

async function handleSuccess(body: { orderNumber?: string; email?: string }) {
  const orderNumber = String(body.orderNumber || '').trim();
  if (!orderNumber) {
    return NextResponse.json({ success: false, message: 'Missing orderNumber' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('orders')
    .select(
      `
      id,
      order_number,
      status,
      payment_status,
      payment_plan,
      amount_due_now,
      amount_paid,
      balance_due,
      total,
      currency,
      subtotal,
      shipping_total,
      email,
      phone,
      created_at,
      shipping_address,
      metadata,
      order_items (
        id,
        product_name,
        variant_name,
        quantity,
        unit_price,
        metadata
      )
    `
    )
    .eq('order_number', orderNumber)
    .single();

  if (error || !data) {
    return NextResponse.json({ success: false, message: 'Order not found' }, { status: 404 });
  }

  const email = String(body.email || '').trim().toLowerCase();
  if (email && String(data.email || '').toLowerCase() !== email) {
    return NextResponse.json({ success: false, message: 'Order not found' }, { status: 404 });
  }

  // Strip full email from response unless caller proved ownership
  const safe = {
    ...data,
    email: email ? data.email : maskEmail(String(data.email || '')),
  };

  return NextResponse.json({ success: true, order: safe });
}

function maskEmail(email: string): string {
  const [user, domain] = email.split('@');
  if (!user || !domain) return '***';
  const visible = user.slice(0, Math.min(2, user.length));
  return `${visible}***@${domain}`;
}
