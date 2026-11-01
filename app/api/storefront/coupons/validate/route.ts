import { NextResponse } from 'next/server';
import { checkRateLimit, getClientIdentifier } from '@/lib/rate-limit';
import { validateCoupon } from '@/lib/coupons';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Preview a coupon against a subtotal. The authoritative application happens in checkout. */
export async function POST(req: Request) {
  const rl = checkRateLimit(`coupon-validate:${getClientIdentifier(req)}`, {
    maxRequests: 20,
    windowSeconds: 60,
  });
  if (!rl.success) {
    return NextResponse.json({ success: false, message: 'Too many attempts. Try again shortly.' }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const subtotal = Number(body.subtotal);
  if (!Number.isFinite(subtotal) || subtotal < 0) {
    return NextResponse.json({ success: false, message: 'Invalid subtotal' }, { status: 400 });
  }

  const result = await validateCoupon(body.code, subtotal, {
    email: typeof body.email === 'string' ? body.email : null,
  });
  if (!result.ok) {
    return NextResponse.json({ success: false, message: result.message }, { status: 200 });
  }
  return NextResponse.json({
    success: true,
    code: result.coupon.code,
    description: result.coupon.description,
    type: result.coupon.type,
    discount: result.discount,
    freeShipping: result.freeShipping,
  });
}
