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
import { mapMoolreStatus } from '@/lib/payments/status';
import { applyOrderPayment } from '@/lib/payments/apply-payment';
import { query } from '@/lib/db/pool';
import { isPlainPostgres } from '@/lib/db/mode';

/**
 * Moolre Callback Payload Structure (from their actual API):
 * {
 *   "status": 1,
 *   "code": "P01",
 *   "message": "Transaction Successful",
 *   "data": {
 *     "txtstatus": 1,
 *     "amount": "2",
 *     "transactionid": "42252702",
 *     "externalref": "ORD-1770330034217-441-R...",
 *     ...
 *   },
 *   "secret": "...",
 *   "ts": "..."
 * }
 */

export async function POST(req: Request) {
    console.log('[Callback] POST received at', new Date().toISOString());

    try {
        const clientId = getClientIdentifier(req);
        const rateLimitResult = checkRateLimit(`callback:${clientId}`, RATE_LIMITS.callback);

        if (!rateLimitResult.success) {
            console.warn('[Callback] Rate limited:', clientId);
            return NextResponse.json({ success: false, message: 'Too many requests' }, { status: 429 });
        }

        let body: any = {};
        const contentType = req.headers.get('content-type') || '';

        try {
            if (contentType.includes('application/json')) {
                body = await req.json();
            } else if (contentType.includes('form')) {
                const formData = await req.formData();
                body = Object.fromEntries(formData.entries());
            } else {
                const rawText = await req.text();
                try {
                    body = JSON.parse(rawText);
                } catch {
                    try {
                        body = Object.fromEntries(new URLSearchParams(rawText).entries());
                    } catch {
                        console.warn('[Callback] Could not parse body');
                    }
                }
            }
        } catch {
            console.error('[Callback] Body parsing failed');
            return NextResponse.json({ success: false, message: 'Invalid Request Body' }, { status: 400 });
        }

        console.log('[Callback] Body keys:', Object.keys(body).join(', '));

        // ============================================================
        // SECURITY: Callback secret is mandatory in production
        // ============================================================
        const expectedSecret = process.env.MOOLRE_CALLBACK_SECRET;
        const isProd = process.env.NODE_ENV === 'production';
        let signatureStatus: 'valid' | 'invalid' | 'missing' | 'unknown' = 'unknown';
        if (!expectedSecret) {
            if (isProd) {
                console.error('[Callback] CRITICAL: MOOLRE_CALLBACK_SECRET not configured — rejecting');
                return NextResponse.json({ success: false, message: 'Callback not configured' }, { status: 503 });
            }
            console.warn('[Callback] WARNING: MOOLRE_CALLBACK_SECRET not configured (non-production)');
            signatureStatus = 'missing';
        } else if (!body.secret || body.secret !== expectedSecret) {
            console.error('[Callback] Secret mismatch or missing! Rejecting callback.');
            await recordCallbackEvent({
                payload: { keys: Object.keys(body) },
                signatureStatus: 'invalid',
                reference: String(body?.data?.externalref || body.externalref || ''),
            });
            return NextResponse.json({ success: false, message: 'Invalid callback signature' }, { status: 403 });
        } else {
            signatureStatus = 'valid';
        }

        const data = body.data || {};

        const rawExternalRef =
            data.externalref ||
            data.external_reference ||
            data.orderRef ||
            body.externalref ||
            body.orderRef ||
            body.external_reference;

        const merchantOrderRef = rawExternalRef
            ? String(rawExternalRef).replace(/-R\d+$/, '')
            : (data.metadata?.original_order_number || body.metadata?.original_order_number);

        const moolreReference =
            data.transactionid ||
            data.thirdpartyref ||
            body.reference ||
            'callback';

        const apiStatus = body.status;
        const txStatus = data.txtstatus ?? data.txstatus;
        const messageStr = String(body.message || '').toLowerCase();

        console.log('[Callback] Order ref:', merchantOrderRef,
            '| API status:', apiStatus,
            '| TX status:', txStatus,
            '| Message:', body.message,
            '| Moolre ref:', moolreReference);

        if (!merchantOrderRef) {
            console.error('[Callback] Missing order reference');
            return NextResponse.json({ success: false, message: 'Missing order reference' }, { status: 400 });
        }

        const { isDuplicate, eventId } = await recordCallbackEvent({
            externalEventId: String(moolreReference || ''),
            reference: String(rawExternalRef || merchantOrderRef),
            payload: {
                status: apiStatus,
                txtstatus: txStatus,
                externalref: rawExternalRef,
                transactionid: data.transactionid,
                amount: data.amount,
            },
            signatureStatus,
        });
        if (isDuplicate) {
            console.log('[Callback] Duplicate event ignored:', merchantOrderRef);
            return NextResponse.json({ success: true, message: 'Duplicate callback ignored' });
        }

        // Require BOTH API status and transaction status success.
        // Explicit failure always wins.
        const normalized = mapMoolreStatus(apiStatus, txStatus);
        const isSuccess = normalized === 'successful';

        if (isSuccess) {
            console.log(`[Callback] Payment SUCCESS for Order ${merchantOrderRef}`);

            const { data: existingOrder, error: fetchError } = await supabaseAdmin
                .from('orders')
                .select('id, order_number, payment_status, total, amount_due_now, amount_paid, balance_due, payment_plan, metadata')
                .eq('order_number', merchantOrderRef)
                .single();

            if (fetchError || !existingOrder) {
                console.error('[Callback] Order not found:', merchantOrderRef);
                return NextResponse.json({ success: false, message: 'Order not found' }, { status: 404 });
            }

            if (existingOrder.payment_status === 'paid') {
                console.log('[Callback] Order already paid, skipping:', merchantOrderRef);
                await updatePaymentAttemptStatus({
                    internalReference: String(rawExternalRef || merchantOrderRef),
                    gatewayReference: String(moolreReference),
                    status: 'successful',
                    amountPaid: Number(existingOrder.total),
                });
                await markCallbackProcessed(eventId, 'ignored', 'already paid');
                return NextResponse.json({ success: true, message: 'Order already processed' });
            }

            const callbackAmount = data.amount != null
                ? parseFloat(String(data.amount))
                : (body.amount != null ? parseFloat(String(body.amount)) : null);

            if (callbackAmount === null || !Number.isFinite(callbackAmount)) {
                console.error('[Callback] Missing amount — REJECTING. Order:', merchantOrderRef);
                await markCallbackProcessed(eventId, 'failed', 'missing amount');
                return NextResponse.json({
                    success: false,
                    message: 'Payment amount missing from callback'
                }, { status: 400 });
            }

            // Match against this attempt's expected amount (deposit or balance), not always full total
            let expectedAmount = Number(existingOrder.amount_due_now ?? existingOrder.total);
            if (isPlainPostgres() && rawExternalRef) {
                try {
                    const { rows } = await query<{ amount_expected: string }>(
                        `SELECT amount_expected FROM payment_attempts
                         WHERE internal_reference = $1 LIMIT 1`,
                        [String(rawExternalRef)]
                    );
                    if (rows[0]?.amount_expected != null) {
                        expectedAmount = Number(rows[0].amount_expected);
                    }
                } catch {
                    // fall through
                }
            }
            if (Number(existingOrder.amount_paid || 0) > 0 && existingOrder.balance_due != null) {
                expectedAmount = Number(existingOrder.balance_due);
            }

            if (Math.abs(callbackAmount - expectedAmount) > 0.01) {
                console.error('[Callback] AMOUNT MISMATCH — REJECTING! Expected:', expectedAmount, 'Got:', callbackAmount);
                await updatePaymentAttemptStatus({
                    internalReference: String(rawExternalRef || merchantOrderRef),
                    gatewayReference: String(moolreReference),
                    status: 'failed',
                    failureReason: 'amount_mismatch',
                });
                await markCallbackProcessed(eventId, 'failed', 'amount mismatch');
                return NextResponse.json({
                    success: false,
                    message: 'Payment amount does not match expected charge'
                }, { status: 400 });
            }

            const payKind = Number(existingOrder.amount_paid || 0) > 0 ? 'balance' : 'checkout';
            const { order: orderJson, error: updateError } = await applyOrderPayment({
                orderNumber: merchantOrderRef,
                amount: callbackAmount,
                gateway: 'moolre',
                gatewayRef: String(moolreReference),
                kind: payKind,
            });

            if (updateError) {
                console.error('[Callback] RPC Error:', updateError);
                return NextResponse.json({ success: false, message: 'Database update failed' }, { status: 500 });
            }

            if (!orderJson) {
                console.error('[Callback] Order not found after RPC:', merchantOrderRef);
                return NextResponse.json({ success: false, message: 'Order not found' }, { status: 404 });
            }

            console.log('[Callback] Order updated! ID:', orderJson.id, '| Status:', orderJson.status);

            await updatePaymentAttemptStatus({
                internalReference: String(rawExternalRef || merchantOrderRef),
                gatewayReference: String(moolreReference),
                status: 'successful',
                amountPaid: callbackAmount,
            });

            try {
                if (orderJson.email) {
                    await supabaseAdmin.rpc('update_customer_stats', {
                        p_customer_email: orderJson.email,
                        p_order_total: orderJson.total
                    });
                }
            } catch (statsError: any) {
                console.error('[Callback] Customer stats failed:', statsError.message);
            }

            // Atomic claim prevents double SMS/email when callback + verify race
            const shouldNotify = await claimOrderConfirmation(orderJson.id);
            if (shouldNotify) {
                try {
                    console.log('[Callback] Sending notifications for:', orderJson.order_number);
                    await sendOrderConfirmation(orderJson);
                    console.log('[Callback] Notifications sent!');
                } catch (notifyError: any) {
                    console.error('[Callback] Notification failed:', notifyError.message);
                }
            } else {
                console.log('[Callback] Notifications already claimed/sent, skipping');
            }

            await markCallbackProcessed(eventId, 'processed');
            return NextResponse.json({ success: true, message: 'Payment verified and Order Updated' });

        } else {
            console.log(`[Callback] Payment FAILED for ${merchantOrderRef} | Status: ${apiStatus} | TX: ${txStatus}`);

            // Merge failure info into metadata — do NOT wipe moolre_external_ref
            const { data: failOrder } = await supabaseAdmin
                .from('orders')
                .select('id, payment_status, metadata')
                .eq('order_number', merchantOrderRef)
                .maybeSingle();

            if (failOrder && failOrder.payment_status !== 'paid' && failOrder.payment_status !== 'partially_paid') {
                await supabaseAdmin
                    .from('orders')
                    .update({
                        payment_status: 'failed',
                        metadata: {
                            ...(failOrder.metadata || {}),
                            moolre_reference: moolreReference,
                            failure_reason: body.message || 'Payment failed',
                            last_callback_at: new Date().toISOString(),
                        }
                    })
                    .eq('order_number', merchantOrderRef)
                    .neq('payment_status', 'paid')
                    .neq('payment_status', 'partially_paid');
            }

            await updatePaymentAttemptStatus({
                internalReference: String(rawExternalRef || merchantOrderRef),
                gatewayReference: String(moolreReference),
                status: 'failed',
                failureReason: body.message || 'Payment failed',
            });
            await markCallbackProcessed(eventId, 'processed', 'payment not successful');

            return NextResponse.json({ success: false, message: 'Payment not successful' });
        }

    } catch (error: any) {
        console.error('[Callback] Critical Error:', error.message);
        return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
    }
}

export async function GET() {
    return NextResponse.json({ message: 'Moolre callback endpoint ready', timestamp: new Date().toISOString() });
}
