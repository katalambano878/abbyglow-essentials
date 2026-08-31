import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendOrderConfirmation } from '@/lib/notifications';
import { checkRateLimit, getClientIdentifier, RATE_LIMITS } from '@/lib/rate-limit';
import {
  claimOrderConfirmation,
  markCallbackProcessed,
  recordCallbackEvent,
  updatePaymentAttemptStatus,
} from '@/lib/payments/audit';
import { applyOrderPayment } from '@/lib/payments/apply-payment';
import { mapHubtelStatus } from '@/lib/payments/hubtel';
import { query } from '@/lib/db/pool';
import { isPlainPostgres } from '@/lib/db/mode';

/**
 * Hubtel Online Checkout callback.
 * Typical fields: ClientReference / clientReference, Status / ResponseCode, Amount, TransactionId
 */
export async function POST(req: Request) {
  console.log('[Hubtel Callback] POST', new Date().toISOString());

  try {
    const clientId = getClientIdentifier(req);
    const rl = checkRateLimit(`hubtel-callback:${clientId}`, RATE_LIMITS.callback);
    if (!rl.success) {
      return NextResponse.json({ success: false, message: 'Too many requests' }, { status: 429 });
    }

    let body: any = {};
    try {
      const contentType = req.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        body = await req.json();
      } else {
        const raw = await req.text();
        try {
          body = JSON.parse(raw);
        } catch {
          body = Object.fromEntries(new URLSearchParams(raw).entries());
        }
      }
    } catch {
      return NextResponse.json({ success: false, message: 'Invalid body' }, { status: 400 });
    }

    // Optional shared secret header / body field
    const expectedSecret = process.env.HUBTEL_CALLBACK_SECRET;
    let signatureStatus: 'valid' | 'invalid' | 'missing' | 'unknown' = 'unknown';
    if (expectedSecret) {
      const provided =
        req.headers.get('x-hubtel-secret') ||
        body.secret ||
        body.Secret ||
        '';
      if (provided !== expectedSecret) {
        signatureStatus = 'invalid';
        await recordCallbackEvent({
          gateway: 'hubtel',
          payload: { keys: Object.keys(body) },
          signatureStatus: 'invalid',
        });
        return NextResponse.json({ success: false, message: 'Invalid callback signature' }, { status: 403 });
      }
      signatureStatus = 'valid';
    } else if (process.env.NODE_ENV === 'production') {
      console.warn('[Hubtel Callback] HUBTEL_CALLBACK_SECRET not set');
      signatureStatus = 'missing';
    }

    const data = body.Data || body.data || body;
    const rawRef =
      data.ClientReference ||
      data.clientReference ||
      body.ClientReference ||
      body.clientReference;
    const merchantOrderRef = rawRef ? String(rawRef).replace(/-H\d+$/, '') : null;
    const gatewayRef = String(
      data.TransactionId ||
        data.transactionId ||
        data.ExternalTransactionId ||
        data.externalTransactionId ||
        rawRef ||
        'hubtel'
    );
    const statusRaw =
      data.Status ||
      data.status ||
      body.ResponseCode ||
      body.responseCode ||
      data.ResponseCode;
    const normalized = mapHubtelStatus(statusRaw);
    const callbackAmount = parseFloat(
      String(data.Amount ?? data.amount ?? data.AmountPaid ?? data.amountPaid ?? '')
    );

    if (!merchantOrderRef) {
      return NextResponse.json({ success: false, message: 'Missing client reference' }, { status: 400 });
    }

    const { isDuplicate, eventId } = await recordCallbackEvent({
      gateway: 'hubtel',
      externalEventId: gatewayRef,
      reference: String(rawRef || merchantOrderRef),
      payload: {
        status: statusRaw,
        clientReference: rawRef,
        amount: callbackAmount,
        transactionId: gatewayRef,
      },
      signatureStatus,
    });
    if (isDuplicate) {
      return NextResponse.json({ success: true, message: 'Duplicate callback ignored' });
    }

    if (normalized !== 'successful') {
      await updatePaymentAttemptStatus({
        internalReference: String(rawRef || merchantOrderRef),
        gatewayReference: gatewayRef,
        status: 'failed',
        failureReason: String(statusRaw || 'failed'),
      });
      await markCallbackProcessed(eventId, 'processed', 'not successful');
      return NextResponse.json({ success: false, message: 'Payment not successful' });
    }

    if (!Number.isFinite(callbackAmount)) {
      await markCallbackProcessed(eventId, 'failed', 'missing amount');
      return NextResponse.json({ success: false, message: 'Missing amount' }, { status: 400 });
    }

    const { data: existingOrder, error } = await supabaseAdmin
      .from('orders')
      .select('id, order_number, payment_status, total, amount_due_now, amount_paid, balance_due, metadata, email')
      .eq('order_number', merchantOrderRef)
      .single();

    if (error || !existingOrder) {
      await markCallbackProcessed(eventId, 'failed', 'order not found');
      return NextResponse.json({ success: false, message: 'Order not found' }, { status: 404 });
    }

    if (existingOrder.payment_status === 'paid') {
      await markCallbackProcessed(eventId, 'ignored', 'already paid');
      return NextResponse.json({ success: true, message: 'Already paid' });
    }

    let expectedAmount = Number(existingOrder.amount_due_now ?? existingOrder.total);
    if (Number(existingOrder.amount_paid || 0) > 0) {
      expectedAmount = Number(existingOrder.balance_due ?? 0);
    }
    if (isPlainPostgres() && rawRef) {
      try {
        const { rows } = await query<{ amount_expected: string }>(
          `SELECT amount_expected FROM payment_attempts WHERE internal_reference = $1 LIMIT 1`,
          [String(rawRef)]
        );
        if (rows[0]?.amount_expected != null) {
          expectedAmount = Number(rows[0].amount_expected);
        }
      } catch { /* ignore */ }
    }

    if (Math.abs(callbackAmount - expectedAmount) > 0.01) {
      await updatePaymentAttemptStatus({
        internalReference: String(rawRef || merchantOrderRef),
        gatewayReference: gatewayRef,
        status: 'failed',
        failureReason: 'amount_mismatch',
      });
      await markCallbackProcessed(eventId, 'failed', 'amount mismatch');
      return NextResponse.json({ success: false, message: 'Amount mismatch' }, { status: 400 });
    }

    const payKind = Number(existingOrder.amount_paid || 0) > 0 ? 'balance' : 'checkout';
    const { order: orderJson, error: applyError } = await applyOrderPayment({
      orderNumber: merchantOrderRef,
      amount: callbackAmount,
      gateway: 'hubtel',
      gatewayRef,
      kind: payKind,
    });

    if (applyError || !orderJson) {
      await markCallbackProcessed(eventId, 'failed', applyError || 'rpc failed');
      return NextResponse.json({ success: false, message: 'Database update failed' }, { status: 500 });
    }

    await updatePaymentAttemptStatus({
      internalReference: String(rawRef || merchantOrderRef),
      gatewayReference: gatewayRef,
      status: 'successful',
      amountPaid: callbackAmount,
    });

    const shouldNotify = await claimOrderConfirmation(orderJson.id);
    if (shouldNotify) {
      try {
        await sendOrderConfirmation(orderJson);
      } catch (e: any) {
        console.error('[Hubtel Callback] notify failed:', e?.message);
      }
    }

    await markCallbackProcessed(eventId, 'processed');
    return NextResponse.json({ success: true, message: 'Payment applied' });
  } catch (err: any) {
    console.error('[Hubtel Callback]', err?.message || err);
    return NextResponse.json({ success: false, message: 'Internal error' }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ message: 'Hubtel callback ready', timestamp: new Date().toISOString() });
}
