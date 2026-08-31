import { supabaseAdmin } from '@/lib/supabase-admin';
import { fetchWithTimeout } from '@/lib/fetch-timeout';
import { recordPaymentAttempt } from '@/lib/payments/audit';
import { getChargeableAmount, type ChargePurpose } from '@/lib/payments/chargeable';
import { purposeForPlan, type PaymentPlan } from '@/lib/payments/plans';
import { isHubtelConfigured } from '@/lib/payments/gateways';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function hubtelAuthHeader(): string {
  const id = process.env.HUBTEL_CLIENT_ID || '';
  const secret = process.env.HUBTEL_CLIENT_SECRET || '';
  return `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`;
}

export function mapHubtelStatus(status: unknown): 'successful' | 'failed' | 'pending' {
  const s = String(status || '').toLowerCase();
  if (['success', 'successful', 'paid', 'completed', '0000'].includes(s)) return 'successful';
  if (['failed', 'fail', 'cancelled', 'canceled', 'expired'].includes(s)) return 'failed';
  // Hubtel often uses ResponseCode
  if (s === '0000') return 'successful';
  return 'pending';
}

export async function initiateHubtelPayment(input: {
  orderId: string;
  customerEmail?: string;
  customerPhone?: string;
  customerName?: string;
  purpose?: ChargePurpose;
  baseUrl: string;
}): Promise<{ success: true; url: string; reference: string; amount: number } | { success: false; message: string; status?: number }> {
  if (!isHubtelConfigured()) {
    return { success: false, message: 'Hubtel payment gateway temporarily unavailable', status: 503 };
  }

  let orderQuery = supabaseAdmin
    .from('orders')
    .select('id, order_number, total, email, phone, payment_status, payment_plan, amount_due_now, amount_paid, balance_due, shipping_address, metadata');

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
  const clientReference = `${orderRef}-H${Date.now()}`;
  const plan = (order.payment_plan || 'full') as PaymentPlan;
  const purpose = purposeForPlan(plan, charge.kind === 'balance');

  const addr = order.shipping_address || {};
  const payeeName =
    input.customerName ||
    [addr.firstName, addr.lastName].filter(Boolean).join(' ') ||
    'Customer';
  const payeePhone = String(input.customerPhone || order.phone || addr.phone || '').replace(/\D/g, '');

  const payload = {
    totalAmount: charge.amount,
    description: `AbbyGlow Essentials order ${orderRef} (${purpose})`,
    callbackUrl: `${input.baseUrl}/api/payment/hubtel/callback`,
    returnUrl: `${input.baseUrl}/order-success?order=${orderRef}&payment_success=true`,
    cancellationUrl: `${input.baseUrl}/pay/${order.id}?cancelled=1`,
    merchantAccountNumber: process.env.HUBTEL_MERCHANT_ACCOUNT_NUMBER,
    clientReference,
    payeeName,
    payeeEmail: input.customerEmail || order.email || '',
    payeeMobileNumber: payeePhone.startsWith('233') ? payeePhone : payeePhone,
  };

  const initiateUrl =
    process.env.HUBTEL_CHECKOUT_URL || 'https://payproxyapi.hubtel.com/items/initiate';

  let response: Response;
  try {
    response = await fetchWithTimeout(
      initiateUrl,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: hubtelAuthHeader(),
        },
        body: JSON.stringify(payload),
      },
      20000
    );
  } catch (err: any) {
    console.error('[Hubtel] initiate timeout:', err?.message || err);
    return { success: false, message: 'Payment gateway timeout. Please try again.', status: 504 };
  }

  const result = await response.json().catch(() => ({}));
  const checkoutUrl =
    result?.data?.checkoutUrl ||
    result?.data?.checkoutDirectUrl ||
    result?.checkoutUrl;
  const responseOk =
    result?.responseCode === '0000' ||
    result?.ResponseCode === '0000' ||
    result?.code === '200' ||
    Boolean(checkoutUrl);

  if (!responseOk || !checkoutUrl) {
    console.error('[Hubtel] initiate failed:', JSON.stringify(result).slice(0, 500));
    return {
      success: false,
      message: result?.message || result?.Message || 'Failed to generate Hubtel checkout',
      status: 400,
    };
  }

  await supabaseAdmin
    .from('orders')
    .update({
      metadata: {
        ...(order.metadata || {}),
        payment_method: 'hubtel',
        payment_gateway: 'hubtel',
        hubtel_client_reference: clientReference,
        last_charge_purpose: purpose,
        last_charge_amount: charge.amount,
      },
      payment_method: 'hubtel',
      payment_provider: 'hubtel',
    })
    .eq('id', order.id);

  await recordPaymentAttempt({
    orderId: order.id,
    orderNumber: orderRef,
    gateway: 'hubtel',
    internalReference: clientReference,
    amountExpected: charge.amount,
    currency: 'GHS',
    purpose,
    initiationPayload: {
      callbackUrl: payload.callbackUrl,
      returnUrl: payload.returnUrl,
      clientReference,
      purpose,
    },
  });

  return {
    success: true,
    url: checkoutUrl,
    reference: clientReference,
    amount: charge.amount,
  };
}

/** Status check against Hubtel transaction status API when available. */
export async function verifyHubtelTransaction(clientReference: string): Promise<{
  success: boolean;
  amount?: number;
  gatewayRef?: string;
  status: 'successful' | 'failed' | 'pending';
  raw?: unknown;
}> {
  if (!isHubtelConfigured()) {
    return { success: false, status: 'pending' };
  }

  const statusUrl =
    process.env.HUBTEL_STATUS_URL ||
    `https://api-txnstatus.hubtel.com/transactions/${encodeURIComponent(
      process.env.HUBTEL_MERCHANT_ACCOUNT_NUMBER || ''
    )}/status`;

  try {
    const response = await fetchWithTimeout(
      `${statusUrl}?clientReference=${encodeURIComponent(clientReference)}`,
      {
        method: 'GET',
        headers: {
          Authorization: hubtelAuthHeader(),
          'Content-Type': 'application/json',
        },
      },
      15000
    );
    const result = await response.json().catch(() => ({}));
    const data = result?.data || result?.Data || result;
    const status = mapHubtelStatus(
      data?.status || data?.Status || result?.responseCode || result?.ResponseCode
    );
    const amount = parseFloat(String(data?.amount ?? data?.Amount ?? data?.amountPaid ?? ''));
    return {
      success: status === 'successful',
      amount: Number.isFinite(amount) ? amount : undefined,
      gatewayRef: String(data?.transactionId || data?.TransactionId || data?.externalTransactionId || clientReference),
      status,
      raw: result,
    };
  } catch (err: any) {
    console.error('[Hubtel] verify failed:', err?.message || err);
    return { success: false, status: 'pending' };
  }
}
