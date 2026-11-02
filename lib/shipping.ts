/**
 * Single source of truth for delivery methods and pricing. The storefront
 * cart, checkout page, POS, server checkout, admin screens and emails all use
 * these helpers, so every screen shows the same number that is charged.
 *
 * Fees are set by the admin under Admin → Delivery Fees (stored in
 * `store_settings.delivery_rates`). The env vars below are only the fallback
 * used before an admin has saved fees:
 *   NEXT_PUBLIC_DELIVERY_FEE                flat Accra doorstep fee in GHS
 *   NEXT_PUBLIC_OUTSIDE_ACCRA_DELIVERY_FEE  flat fee for delivery outside Accra
 *   NEXT_PUBLIC_FREE_DELIVERY_THRESHOLD     subtotal at/above which delivery is free (0 = never)
 */

export type DeliveryMethod = 'pickup' | 'delivery' | 'outside_accra';

export const DELIVERY_METHODS: DeliveryMethod[] = ['pickup', 'delivery', 'outside_accra'];

export interface DeliveryRates {
  /** Doorstep delivery within Accra */
  accra: number;
  /** Doorstep delivery outside Accra */
  outsideAccra: number;
  /** Order subtotal (after discounts) at/above which delivery is free; 0 disables */
  freeThreshold: number;
}

function readNumber(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : fallback;
}

export const DEFAULT_DELIVERY_RATES: DeliveryRates = {
  accra: readNumber(process.env.NEXT_PUBLIC_DELIVERY_FEE, 25),
  outsideAccra: readNumber(process.env.NEXT_PUBLIC_OUTSIDE_ACCRA_DELIVERY_FEE, 50),
  freeThreshold: readNumber(process.env.NEXT_PUBLIC_FREE_DELIVERY_THRESHOLD, 0),
};

/** Kept for screens that only need to know whether delivery can cost anything. */
export const DELIVERY_FEE = DEFAULT_DELIVERY_RATES.accra;
export const FREE_DELIVERY_THRESHOLD = DEFAULT_DELIVERY_RATES.freeThreshold;

/** Accepts the stored JSON (snake or camel case) or a partial object and fills gaps from the defaults. */
export function normalizeDeliveryRates(raw: unknown): DeliveryRates {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    accra: readNumber(r.accra ?? r.delivery ?? r.accra_fee, DEFAULT_DELIVERY_RATES.accra),
    outsideAccra: readNumber(r.outsideAccra ?? r.outside_accra, DEFAULT_DELIVERY_RATES.outsideAccra),
    freeThreshold: readNumber(r.freeThreshold ?? r.free_threshold, DEFAULT_DELIVERY_RATES.freeThreshold),
  };
}

/** Maps anything stored on an order (incl. the old POS value `doorstep`) to a known method. */
export function parseDeliveryMethod(value: unknown): DeliveryMethod {
  const v = String(value ?? '').toLowerCase().replace(/[\s-]+/g, '_');
  if (v === 'outside_accra' || v === 'outsideaccra' || v === 'courier') return 'outside_accra';
  if (v === 'delivery' || v === 'doorstep' || v === 'doorstep_delivery' || v === 'home_delivery') return 'delivery';
  return 'pickup';
}

export function isDeliveryMethod(method: unknown): boolean {
  return parseDeliveryMethod(method) !== 'pickup';
}

export function deliveryMethodLabel(method: unknown): string {
  switch (parseDeliveryMethod(method)) {
    case 'delivery':
      return 'Doorstep Delivery';
    case 'outside_accra':
      return 'Outside Accra Delivery';
    default:
      return 'Store Pickup';
  }
}

/** Short description shown under each option at checkout / POS. */
export function deliveryMethodHint(method: DeliveryMethod): string {
  switch (method) {
    case 'delivery':
      return 'Rider delivery within Accra';
    case 'outside_accra':
      return 'Courier delivery to any other region in Ghana';
    default:
      return 'Pick up from our store — ready in 24 hours';
  }
}

/** Delivery cost for a subtotal (after discounts) and method. */
export function computeShipping(
  subtotal: number,
  method: DeliveryMethod,
  rates: DeliveryRates = DEFAULT_DELIVERY_RATES
): number {
  const parsed = parseDeliveryMethod(method);
  if (parsed === 'pickup') return 0;
  const fee = parsed === 'outside_accra' ? rates.outsideAccra : rates.accra;
  if (fee <= 0) return 0;
  if (rates.freeThreshold > 0 && subtotal >= rates.freeThreshold) return 0;
  return Math.round(fee * 100) / 100;
}

export function shippingLabel(amount: number, method: DeliveryMethod): string {
  if (parseDeliveryMethod(method) === 'pickup') return 'Free store pickup';
  return amount > 0 ? `GH₵ ${amount.toFixed(2)}` : 'Free delivery';
}

/** Where an order came from: the online store or the in-store POS. */
export type OrderChannel = 'web' | 'pos';

export function orderChannel(order: { metadata?: any } | null | undefined): OrderChannel {
  const meta = order?.metadata || {};
  if (meta.channel === 'pos' || meta.checkout_source === 'pos' || meta.pos_sale === true) return 'pos';
  return 'web';
}

export function orderChannelLabel(order: { metadata?: any } | null | undefined): string {
  return orderChannel(order) === 'pos' ? 'POS' : 'Web';
}
