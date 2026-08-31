import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendOrderConfirmation } from '@/lib/notifications';
import { checkRateLimit, getClientIdentifier, RATE_LIMITS } from '@/lib/rate-limit';
import { fetchWithTimeout } from '@/lib/fetch-timeout';
import { applyOrderPayment } from '@/lib/payments/apply-payment';
import { claimOrderConfirmation } from '@/lib/payments/audit';
import { query } from '@/lib/db/pool';
import { isPlainPostgres } from '@/lib/db/mode';

/**
 * Payment verification endpoint (Moolre).
 * SECURITY: Only trust Moolre API — never client redirect flags.
 */
export async function POST(req: Request) {
    try {
        const clientId = getClientIdentifier(req);
        const rateLimitResult = checkRateLimit(`verify:${clientId}`, RATE_LIMITS.payment);

        if (!rateLimitResult.success) {
            return NextResponse.json(
                { success: false, message: 'Too many requests' },
                { status: 429 }
            );
        }

        const { orderNumber } = await req.json();

        if (!orderNumber || typeof orderNumber !== 'string') {
            return NextResponse.json({ success: false, message: 'Missing or invalid orderNumber' }, { status: 400 });
        }

        if (!/^ORD-\d+-\d+$/.test(orderNumber)) {
            return NextResponse.json({ success: false, message: 'Invalid order number format' }, { status: 400 });
        }

        const { data: order, error: fetchError } = await supabaseAdmin
            .from('orders')
            .select('id, order_number, payment_status, status, total, amount_due_now, amount_paid, balance_due, email, phone, shipping_address, metadata')
            .eq('order_number', orderNumber)
            .single();

        if (fetchError || !order) {
            return NextResponse.json({ success: false, message: 'Order not found' }, { status: 404 });
        }

        if (order.payment_status === 'paid') {
            return NextResponse.json({
                success: true,
                status: order.status,
                payment_status: order.payment_status,
                message: 'Order already paid'
            });
        }

        const gateway = order.metadata?.payment_gateway || order.metadata?.payment_method;
        if (gateway && gateway !== 'moolre') {
            return NextResponse.json({
                success: false,
                message: 'This order does not use Moolre payment'
            }, { status: 400 });
        }

        if (!process.env.MOOLRE_API_USER || !process.env.MOOLRE_API_PUBKEY || !process.env.MOOLRE_ACCOUNT_NUMBER) {
            return NextResponse.json({
                success: false,
                status: order.status,
                payment_status: order.payment_status,
                message: 'Payment verification unavailable'
            }, { status: 503 });
        }

        const refCandidates: string[] = Array.from(new Set([
            order.metadata?.moolre_external_ref,
            orderNumber,
        ].filter(Boolean))) as string[];

        let verifiedAmount: number | null = null;
        let gatewayRef = 'moolre-api-verify';

        for (const ref of refCandidates) {
            try {
                const checkResponse = await fetchWithTimeout('https://api.moolre.com/open/transact/status', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-API-USER': process.env.MOOLRE_API_USER!,
                        'X-API-PUBKEY': process.env.MOOLRE_API_PUBKEY!
                    },
                    body: JSON.stringify({
                        type: 1,
                        idtype: 1,
                        id: ref,
                        accountnumber: process.env.MOOLRE_ACCOUNT_NUMBER
                    })
                }, 15000);

                const checkResult = await checkResponse.json().catch(() => ({}));
                const data = checkResult?.data || {};
                const txStatus = data.txstatus ?? data.txtstatus;
                const isSuccess = checkResult?.status === 1 && (txStatus === 1 || txStatus === '1');

                if (!isSuccess) continue;
                if (data.amount === undefined || data.amount === null) continue;

                const paidAmount = parseFloat(String(data.amount));
                let expectedAmount = Number(order.amount_due_now ?? order.total);
                if (Number(order.amount_paid || 0) > 0) {
                    expectedAmount = Number(order.balance_due ?? (Number(order.total) - Number(order.amount_paid)));
                }
                if (isPlainPostgres()) {
                    try {
                        const { rows } = await query<{ amount_expected: string }>(
                            `SELECT amount_expected FROM payment_attempts
                             WHERE internal_reference = $1 LIMIT 1`,
                            [ref]
                        );
                        if (rows[0]?.amount_expected != null) {
                            expectedAmount = Number(rows[0].amount_expected);
                        }
                    } catch { /* ignore */ }
                }

                if (!Number.isFinite(paidAmount) || Math.abs(paidAmount - expectedAmount) > 0.01) {
                    console.error('[Verify] AMOUNT MISMATCH! Expected:', expectedAmount, 'Got:', paidAmount);
                    continue;
                }
                verifiedAmount = paidAmount;
                gatewayRef = String(data.transactionid || data.thirdpartyref || ref);
                break;
            } catch (moolreError: any) {
                console.warn('[Verify] Moolre API check failed for', ref, ':', moolreError.message);
            }
        }

        if (verifiedAmount == null) {
            return NextResponse.json({
                success: false,
                status: order.status,
                payment_status: order.payment_status,
                message: 'Payment not yet confirmed by payment provider'
            });
        }

        const payKind = Number(order.amount_paid || 0) > 0 ? 'balance' : 'checkout';
        const { order: orderJson, error: updateError } = await applyOrderPayment({
            orderNumber,
            amount: verifiedAmount,
            gateway: 'moolre',
            gatewayRef,
            kind: payKind,
        });

        if (updateError) {
            return NextResponse.json({ success: false, message: 'Failed to update order' }, { status: 500 });
        }

        if (orderJson?.email) {
            try {
                await supabaseAdmin.rpc('update_customer_stats', {
                    p_customer_email: orderJson.email,
                    p_order_total: orderJson.amount_paid || orderJson.total
                });
            } catch { /* non-fatal */ }
        }

        const shouldNotify = orderJson?.id ? await claimOrderConfirmation(orderJson.id) : false;
        if (shouldNotify && orderJson) {
            try {
                await sendOrderConfirmation(orderJson);
            } catch { /* non-fatal */ }
        }

        return NextResponse.json({
            success: true,
            status: orderJson?.status || 'processing',
            payment_status: orderJson?.payment_status || 'partially_paid',
            amount_paid: orderJson?.amount_paid,
            balance_due: orderJson?.balance_due,
            message: 'Payment verified and order updated'
        });

    } catch (error: any) {
        console.error('[Verify] Error:', error.message);
        return NextResponse.json({ success: false, message: 'Internal error' }, { status: 500 });
    }
}
