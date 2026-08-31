import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendOrderConfirmation } from '@/lib/notifications';
import { checkRateLimit, getClientIdentifier, RATE_LIMITS } from '@/lib/rate-limit';
import { verifyHubtelTransaction } from '@/lib/payments/hubtel';
import { applyOrderPayment } from '@/lib/payments/apply-payment';
import { claimOrderConfirmation } from '@/lib/payments/audit';

export async function POST(req: Request) {
  try {
    const clientId = getClientIdentifier(req);
    const rl = checkRateLimit(`hubtel-verify:${clientId}`, RATE_LIMITS.payment);
    if (!rl.success) {
      return NextResponse.json({ success: false, message: 'Too many requests' }, { status: 429 });
    }

    const { orderNumber } = await req.json();
    if (!orderNumber || typeof orderNumber !== 'string' || !/^ORD-\d+-\d+$/.test(orderNumber)) {
      return NextResponse.json({ success: false, message: 'Invalid order number' }, { status: 400 });
    }

    const { data: order, error } = await supabaseAdmin
      .from('orders')
      .select('id, order_number, payment_status, status, total, amount_due_now, amount_paid, balance_due, metadata, email')
      .eq('order_number', orderNumber)
      .single();

    if (error || !order) {
      return NextResponse.json({ success: false, message: 'Order not found' }, { status: 404 });
    }

    if (order.payment_status === 'paid') {
      return NextResponse.json({
        success: true,
        payment_status: 'paid',
        status: order.status,
        message: 'Order already paid',
      });
    }

    const clientRef = order.metadata?.hubtel_client_reference;
    if (!clientRef) {
      return NextResponse.json({
        success: false,
        payment_status: order.payment_status,
        message: 'No Hubtel reference on order',
      });
    }

    const verified = await verifyHubtelTransaction(String(clientRef));
    if (!verified.success || verified.status !== 'successful') {
      return NextResponse.json({
        success: false,
        payment_status: order.payment_status,
        message: 'Payment not yet confirmed by Hubtel',
      });
    }

    const amount =
      verified.amount ??
      (Number(order.amount_paid || 0) > 0
        ? Number(order.balance_due)
        : Number(order.amount_due_now ?? order.total));

    if (!amount || amount <= 0) {
      return NextResponse.json({ success: false, message: 'Invalid verified amount' }, { status: 400 });
    }

    const payKind = Number(order.amount_paid || 0) > 0 ? 'balance' : 'checkout';
    const { order: orderJson, error: applyError } = await applyOrderPayment({
      orderNumber,
      amount,
      gateway: 'hubtel',
      gatewayRef: verified.gatewayRef || String(clientRef),
      kind: payKind,
    });

    if (applyError || !orderJson) {
      return NextResponse.json({ success: false, message: applyError || 'Update failed' }, { status: 500 });
    }

    const shouldNotify = await claimOrderConfirmation(orderJson.id);
    if (shouldNotify) {
      try {
        await sendOrderConfirmation(orderJson);
      } catch { /* non-fatal */ }
    }

    return NextResponse.json({
      success: true,
      payment_status: orderJson.payment_status,
      amount_paid: orderJson.amount_paid,
      balance_due: orderJson.balance_due,
      status: orderJson.status,
      message: 'Payment verified',
    });
  } catch (err: any) {
    console.error('[Hubtel verify]', err?.message || err);
    return NextResponse.json({ success: false, message: 'Internal error' }, { status: 500 });
  }
}
