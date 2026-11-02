/**
 * Single source of truth for delivery methods. The storefront, POS, server
 * checkout, admin screens and emails all use these helpers.
 *
 * Store pickup is free. Doorstep delivery (Accra) and Outside Accra delivery
 * come at a fee that the store agrees with the customer after the order is
 * placed, so the online checkout charges the goods only and marks the order
 * as "delivery fee to be confirmed". The POS enters the agreed fee directly.
 */

export type DeliveryMethod = 'pickup' | 'delivery' | 'outside_accra';

export const DELIVERY_METHODS: DeliveryMethod[] = ['pickup', 'delivery', 'outside_accra'];

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

/** Text shown to the customer about the fee for a method. */
export const FEE_TO_CONFIRM_TEXT = 'Fee confirmed with you by our team after you order';

/**
 * What the online checkout charges for delivery: nothing up front. The fee is
 * agreed with the customer by the admin, so the goods total is what is paid now.
 */
export function computeShipping(_subtotal: number, _method: DeliveryMethod): number {
  return 0;
}

/** Label for the delivery line in totals. `amount` is the recorded fee, if any. */
export function shippingLabel(amount: number, method: DeliveryMethod): string {
  if (parseDeliveryMethod(method) === 'pickup') return 'Free store pickup';
  if (amount > 0) return `GH₵ ${amount.toFixed(2)}`;
  return 'Fee to be confirmed';
}

/** True when the order is a delivery order whose fee has not been recorded. */
export function deliveryFeePending(order: {
  shipping_method?: string | null;
  shipping_total?: number | string | null;
  metadata?: any;
}): boolean {
  if (!isDeliveryMethod(order.shipping_method || order.metadata?.delivery_method)) return false;
  if (order.metadata?.coupon_free_shipping === true) return false;
  return Number(order.shipping_total || 0) <= 0;
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
