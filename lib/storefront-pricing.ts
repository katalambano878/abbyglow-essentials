/** Toggle sale UI site-wide. Set NEXT_PUBLIC_SHOW_SALE_PRICING=true when running promotions. */
export const SHOW_SALE_PRICING = process.env.NEXT_PUBLIC_SHOW_SALE_PRICING === 'true';

export function displayCompareAtPrice(
  compareAt: number | null | undefined,
  price: number
): number | undefined {
  if (!SHOW_SALE_PRICING || compareAt == null || compareAt <= price) return undefined;
  return compareAt;
}

export function displayDiscountPercent(
  compareAt: number | null | undefined,
  price: number
): number {
  if (!SHOW_SALE_PRICING || compareAt == null || compareAt <= price) return 0;
  return Math.round((1 - price / compareAt) * 100);
}
