import { DEPOSIT_PERCENT } from '@/lib/payments/plans';

/** Per-product availability: Available (in Ghana stock) vs Pre-order. */

export const DEFAULT_PREORDER_SHIPPING =
  process.env.NEXT_PUBLIC_PREORDER_SHIPPING_NOTE?.trim() ||
  `Pre-order — ships when stock arrives. Pay in full or ${DEPOSIT_PERCENT}% now at checkout.`;

export type ProductMetadata = {
  is_preorder?: boolean;
  preorder_shipping?: string | null;
  [key: string]: unknown;
} | null | undefined;

/** Explicit admin toggle only — available products are not treated as pre-order. */
export function isPreorderProduct(metadata?: ProductMetadata): boolean {
  return metadata?.is_preorder === true;
}

export function getPreorderShippingNote(metadata?: ProductMetadata): string | null {
  if (!isPreorderProduct(metadata)) return null;
  const custom =
    typeof metadata?.preorder_shipping === 'string' ? metadata.preorder_shipping.trim() : '';
  return custom || DEFAULT_PREORDER_SHIPPING;
}

export function normalizeProductMetadata(
  metadata: ProductMetadata,
  opts: { isPreorder: boolean; preorderShipping?: string }
): Record<string, unknown> {
  const base =
    metadata && typeof metadata === 'object' && !Array.isArray(metadata)
      ? { ...metadata }
      : {};

  if (!opts.isPreorder) {
    return {
      ...base,
      is_preorder: false,
      preorder_shipping: null,
    };
  }

  const note = (opts.preorderShipping ?? String(base.preorder_shipping ?? '')).trim();
  return {
    ...base,
    is_preorder: true,
    preorder_shipping: note || DEFAULT_PREORDER_SHIPPING,
  };
}
