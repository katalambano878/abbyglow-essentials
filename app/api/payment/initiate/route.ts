import { NextResponse } from 'next/server';
import { checkRateLimit, getClientIdentifier, RATE_LIMITS } from '@/lib/rate-limit';
import { parseGateway, isGatewayConfigured } from '@/lib/payments/gateways';
import { initiateMoolrePayment } from '@/lib/payments/moolre';
import { initiateHubtelPayment } from '@/lib/payments/hubtel';
import type { ChargePurpose } from '@/lib/payments/chargeable';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const clientId = getClientIdentifier(req);
    const rateLimitResult = checkRateLimit(`payment:${clientId}`, RATE_LIMITS.payment);
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { success: false, message: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const orderId = body.orderId;
    const gateway = parseGateway(body.gateway);
    const purpose = (body.purpose === 'balance' ? 'balance' : 'checkout') as ChargePurpose;

    if (!orderId || typeof orderId !== 'string') {
      return NextResponse.json({ success: false, message: 'Missing or invalid orderId' }, { status: 400 });
    }
    if (!gateway) {
      return NextResponse.json({ success: false, message: 'Invalid payment gateway' }, { status: 400 });
    }
    if (!isGatewayConfigured(gateway)) {
      return NextResponse.json({ success: false, message: `${gateway} is not configured` }, { status: 503 });
    }

    const requestUrl = new URL(req.url);
    const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || requestUrl.origin).replace(/\/+$/, '');

    if (gateway === 'moolre') {
      const result = await initiateMoolrePayment({
        orderId,
        customerEmail: body.customerEmail,
        purpose,
        baseUrl,
      });
      if (!result.success) {
        return NextResponse.json(
          { success: false, message: result.message },
          { status: result.status || 400 }
        );
      }
      return NextResponse.json({
        success: true,
        gateway: 'moolre',
        url: result.url,
        reference: result.reference,
        amount: result.amount,
      });
    }

    const result = await initiateHubtelPayment({
      orderId,
      customerEmail: body.customerEmail,
      customerPhone: body.customerPhone,
      customerName: body.customerName,
      purpose,
      baseUrl,
    });
    if (!result.success) {
      return NextResponse.json(
        { success: false, message: result.message },
        { status: result.status || 400 }
      );
    }
    return NextResponse.json({
      success: true,
      gateway: 'hubtel',
      url: result.url,
      reference: result.reference,
      amount: result.amount,
    });
  } catch (error: any) {
    console.error('[Payment initiate]', error?.message || error);
    return NextResponse.json({ success: false, message: 'Internal Server Error' }, { status: 500 });
  }
}
