import { NextResponse } from 'next/server';
import { checkRateLimit, getClientIdentifier, RATE_LIMITS } from '@/lib/rate-limit';
import { initiateHubtelPayment } from '@/lib/payments/hubtel';
import type { ChargePurpose } from '@/lib/payments/chargeable';

export async function POST(req: Request) {
  try {
    const clientId = getClientIdentifier(req);
    const rateLimitResult = checkRateLimit(`payment:${clientId}`, RATE_LIMITS.payment);
    if (!rateLimitResult.success) {
      return NextResponse.json({ success: false, message: 'Too many requests' }, { status: 429 });
    }

    const body = await req.json();
    const { orderId, customerEmail, customerPhone, customerName, purpose } = body;
    if (!orderId || typeof orderId !== 'string') {
      return NextResponse.json({ success: false, message: 'Missing or invalid orderId' }, { status: 400 });
    }

    const requestUrl = new URL(req.url);
    const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || requestUrl.origin).replace(/\/+$/, '');

    const result = await initiateHubtelPayment({
      orderId,
      customerEmail,
      customerPhone,
      customerName,
      purpose: (purpose === 'balance' ? 'balance' : 'checkout') as ChargePurpose,
      baseUrl,
    });

    if (!result.success) {
      return NextResponse.json({ success: false, message: result.message }, { status: result.status || 400 });
    }

    return NextResponse.json({
      success: true,
      url: result.url,
      reference: result.reference,
      amount: result.amount,
    });
  } catch (error: any) {
    console.error('[Hubtel] initiate error:', error?.message || error);
    return NextResponse.json({ success: false, message: 'Internal Server Error' }, { status: 500 });
  }
}
