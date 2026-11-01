/**
 * Single source of truth for delivery pricing. The storefront cart, checkout
 * page, server checkout and emails all use these helpers, so every screen shows
 * the same number that is actually charged.
 *
 * Configure with env vars (public, so the browser can preview the fee):
 *   NEXT_PUBLIC_DELIVERY_FEE            flat delivery fee in GHS (default 0 = free)
 *   NEXT_PUBLIC_FREE_DELIVERY_THRESHOLD subtotal at/above which delivery is free (default 0 = always free)
 */

export type DeliveryMethod = 'pickup' | 'delivery';

export const DELIVERY_METHODS: DeliveryMethod[] = ['pickup', 'delivery'];

function readNumber(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export const DELIVERY_FEE = readNumber(process.env.NEXT_PUBLIC_DELIVERY_FEE, 0);
export const FREE_DELIVERY_THRESHOLD = readNumber(process.env.NEXT_PUBLIC_FREE_DELIVERY_THRESHOLD, 0);

export function parseDeliveryMethod(value: unknown): DeliveryMethod {
  return value === 'delivery' ? 'delivery' : 'pickup';
}

/** Delivery cost for a subtotal (after discounts) and method. */
export function computeShipping(subtotal: number, method: DeliveryMethod): number {
  if (method !== 'delivery') return 0;
  if (DELIVERY_FEE <= 0) return 0;
  if (FREE_DELIVERY_THRESHOLD > 0 && subtotal >= FREE_DELIVERY_THRESHOLD) return 0;
  return Math.round(DELIVERY_FEE * 100) / 100;
}

export function shippingLabel(amount: number, method: DeliveryMethod): string {
  if (method === 'pickup') return 'Free store pickup';
  return amount > 0 ? `GH₵ ${amount.toFixed(2)}` : 'Free delivery';
}
