import { supabaseAdmin } from '@/lib/supabase-admin';
import { fetchWithTimeout } from '@/lib/fetch-timeout';
import { recordPaymentAttempt } from '@/lib/payments/audit';
import { getChargeableAmount, type ChargePurpose } from '@/lib/payments/chargeable';
import { purposeForPlan, type PaymentPlan } from '@/lib/payments/plans';
import { isMoolreConfigured } from '@/lib/payments/gateways';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function initiateMoolrePayment(input: {
  orderId: string;
  customerEmail?: string;
  purpose?: ChargePurpose;
  baseUrl: string;
}): Promise<{ success: true; url: string; reference?: string; amount: number } | { success: false; message: string; status?: number }> {
  if (!isMoolreConfigured()) {
    return { success: false, message: 'Moolre payment gateway temporarily unavailable', status: 503 };
  }

  let orderQuery = supabaseAdmin
    .from('orders')
    .select('id, order_number, total, email, payment_status, payment_plan, amount_due_now, amount_paid, balance_due, metadata');

  if (UUID_REGEX.test(input.orderId)) {
    orderQuery = orderQuery.eq('id', input.orderId);
  } else {
    orderQuery = orderQuery.eq('order_number', input.orderId);
  }

  const { data: order, error: orderError } = await orderQuery.single();
  if (orderError || !order) {
    return { success: false, message: 'Order not found', status: 404 };
  }

  const charge = getChargeableAmount(order, input.purpose || 'checkout');
  if (charge.error || charge.amount <= 0) {
    return { success: false, message: charge.error || 'Nothing to charge', status: 400 };
  }

  const orderRef = order.order_number || input.orderId;
  const uniqueRef = `${orderRef}-R${Date.now()}`;
  const plan = (order.payment_plan || 'full') as PaymentPlan;
  const purpose = purposeForPlan(plan, charge.kind === 'balance');

  const payload = {
    type: 1,
    amount: charge.amount.toString(),
    email: process.env.MOOLRE_MERCHANT_EMAIL || 'admin@example.com',
    externalref: uniqueRef,
    callback: `${input.baseUrl}/api/payment/moolre/callback`,
    redirect: `${input.baseUrl}/order-success?order=${orderRef}&payment_success=true`,
    reusable: '0',
    currency: 'GHS',
    accountnumber: process.env.MOOLRE_ACCOUNT_NUMBER,
    metadata: {
      customer_email: input.customerEmail || order.email,
      original_order_number: orderRef,
      purpose,
      charge_kind: charge.kind,
    },
  };

  let response: Response;
  try {
    response = await fetchWithTimeout(
      'https://api.moolre.com/embed/link',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-USER': process.env.MOOLRE_API_USER!,
          'X-API-PUBKEY': process.env.MOOLRE_API_PUBKEY!,
        },
        body: JSON.stringify(payload),
      },
      20000
    );
  } catch (err: any) {
    console.error('[Moolre] initiate timeout:', err?.message || err);
    return { success: false, message: 'Payment gateway timeout. Please try again.', status: 504 };
  }

  const result = await response.json().catch(() => ({}));
  if (result.status !== 1 || !result.data?.authorization_url) {
    return { success: false, message: result.message || 'Failed to generate payment link', status: 400 };
  }

  await supabaseAdmin
    .from('orders')
    .update({
      metadata: {
        ...(order.metadata || {}),
        payment_method: 'moolre',
        payment_gateway: 'moolre',
        moolre_external_ref: uniqueRef,
        last_charge_purpose: purpose,
        last_charge_amount: charge.amount,
      },
      payment_method: 'moolre',
      payment_provider: 'moolre',
    })
    .eq('id', order.id);

  await recordPaymentAttempt({
    orderId: order.id,
    orderNumber: orderRef,
    gateway: 'moolre',
    internalReference: uniqueRef,
    amountExpected: charge.amount,
    currency: 'GHS',
    purpose,
    initiationPayload: {
      callback: payload.callback,
      redirect: payload.redirect,
      externalref: uniqueRef,
      purpose,
    },
  });

  return {
    success: true,
    url: result.data.authorization_url,
    reference: result.data.reference,
    amount: charge.amount,
  };
}
