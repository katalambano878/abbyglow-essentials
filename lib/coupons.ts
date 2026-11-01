import { supabaseAdmin } from '@/lib/supabase-admin';
import { query } from '@/lib/db/pool';
import { isPlainPostgres } from '@/lib/db/mode';

/**
 * Server-side coupon validation. Coupons live in the `coupons` table, which is
 * staff-only through the REST shim; customers only ever see the result of
 * validating a single code here.
 */

export type CouponRow = {
  id: string;
  code: string;
  description: string | null;
  type: 'percentage' | 'fixed_amount' | 'free_shipping';
  value: number;
  minimum_purchase: number | null;
  maximum_discount: number | null;
  usage_limit: number | null;
  usage_count: number | null;
  per_user_limit: number | null;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean | null;
};

export type CouponResult =
  | { ok: true; coupon: CouponRow; discount: number; freeShipping: boolean }
  | { ok: false; message: string };

export const COUPON_CODE_RE = /^[A-Z0-9_-]{3,32}$/;

export function normalizeCouponCode(value: unknown): string {
  return String(value || '').trim().toUpperCase();
}

/**
 * Validate a code against the subtotal (before shipping) and return the
 * discount it yields. Never throws; callers get a message to show the customer.
 */
export async function validateCoupon(
  rawCode: unknown,
  subtotal: number,
  opts: { email?: string | null } = {}
): Promise<CouponResult> {
  const code = normalizeCouponCode(rawCode);
  if (!COUPON_CODE_RE.test(code)) {
    return { ok: false, message: 'Enter a valid coupon code.' };
  }

  const { data, error } = await supabaseAdmin
    .from('coupons')
    .select(
      'id, code, description, type, value, minimum_purchase, maximum_discount, usage_limit, usage_count, per_user_limit, start_date, end_date, is_active'
    )
    .ilike('code', code)
    .maybeSingle();

  if (error || !data) {
    return { ok: false, message: 'That coupon code is not valid.' };
  }
  const coupon = data as CouponRow;

  if (coupon.is_active === false) {
    return { ok: false, message: 'That coupon is no longer active.' };
  }
  const now = Date.now();
  if (coupon.start_date && new Date(coupon.start_date).getTime() > now) {
    return { ok: false, message: 'That coupon is not active yet.' };
  }
  if (coupon.end_date && new Date(coupon.end_date).getTime() < now) {
    return { ok: false, message: 'That coupon has expired.' };
  }
  if (
    coupon.usage_limit != null &&
    coupon.usage_limit > 0 &&
    Number(coupon.usage_count || 0) >= coupon.usage_limit
  ) {
    return { ok: false, message: 'That coupon has reached its usage limit.' };
  }
  const minimum = Number(coupon.minimum_purchase || 0);
  if (minimum > 0 && subtotal < minimum) {
    return {
      ok: false,
      message: `Add GH₵ ${(minimum - subtotal).toFixed(2)} more to use this coupon (minimum GH₵ ${minimum.toFixed(2)}).`,
    };
  }

  if (opts.email && coupon.per_user_limit != null && coupon.per_user_limit > 0 && isPlainPostgres()) {
    try {
      const { rows } = await query<{ c: number }>(
        `SELECT count(*)::int AS c FROM orders
          WHERE lower(email) = $1
            AND metadata->>'coupon_code' = $2
            AND payment_status::text IN ('paid', 'partially_paid')`,
        [opts.email.toLowerCase(), coupon.code]
      );
      if ((rows[0]?.c || 0) >= coupon.per_user_limit) {
        return { ok: false, message: 'You have already used this coupon.' };
      }
    } catch {
      // Counting failures must not block checkout.
    }
  }

  let discount = 0;
  let freeShipping = false;
  const value = Number(coupon.value || 0);
  if (coupon.type === 'percentage') {
    discount = (subtotal * Math.min(Math.max(value, 0), 100)) / 100;
    if (coupon.maximum_discount != null && coupon.maximum_discount > 0) {
      discount = Math.min(discount, Number(coupon.maximum_discount));
    }
  } else if (coupon.type === 'fixed_amount') {
    discount = Math.max(0, value);
  } else if (coupon.type === 'free_shipping') {
    freeShipping = true;
  }
  discount = Math.min(Math.round(discount * 100) / 100, subtotal);

  return { ok: true, coupon, discount, freeShipping };
}

/** Count a redemption (best effort; called after the order row exists). */
export async function recordCouponUse(couponId: string): Promise<void> {
  try {
    const { data } = await supabaseAdmin
      .from('coupons')
      .select('usage_count')
      .eq('id', couponId)
      .maybeSingle();
    await supabaseAdmin
      .from('coupons')
      .update({ usage_count: Number(data?.usage_count || 0) + 1 })
      .eq('id', couponId);
  } catch (err) {
    console.error('[coupons] recordCouponUse failed:', err);
  }
}
