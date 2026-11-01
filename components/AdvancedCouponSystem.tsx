'use client';

import { useState } from 'react';

/** Coupon preview as returned by POST /api/storefront/coupons/validate. */
export interface AppliedCoupon {
  code: string;
  description: string | null;
  type: 'percentage' | 'fixed_amount' | 'free_shipping' | string;
  /** Absolute discount in GHS for the subtotal it was validated against */
  discount: number;
  freeShipping: boolean;
}

export const COUPON_STORAGE_KEY = 'abbyglow_coupon';

export function readStoredCouponCode(): string {
  if (typeof window === 'undefined') return '';
  try {
    return (localStorage.getItem(COUPON_STORAGE_KEY) || '').trim().toUpperCase();
  } catch {
    return '';
  }
}

export function storeCouponCode(code: string) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(COUPON_STORAGE_KEY, code.trim().toUpperCase());
  } catch {
    /* storage unavailable */
  }
}

export function clearStoredCouponCode() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(COUPON_STORAGE_KEY);
  } catch {
    /* storage unavailable */
  }
}

export type CouponPreviewResult =
  | { success: true; coupon: AppliedCoupon }
  | { success: false; message: string };

/** Preview a coupon against a subtotal. The final discount is computed by checkout. */
export async function previewCoupon(code: string, subtotal: number, email?: string): Promise<CouponPreviewResult> {
  const clean = code.trim().toUpperCase();
  if (!clean) return { success: false, message: 'Enter a coupon code' };
  try {
    const res = await fetch('/api/storefront/coupons/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: clean, subtotal, email: email || undefined }),
    });
    const data = await res.json().catch(() => null);
    if (!data) return { success: false, message: 'Could not check that code. Please try again.' };
    if (!data.success) return { success: false, message: data.message || 'Invalid coupon code' };
    return {
      success: true,
      coupon: {
        code: String(data.code || clean),
        description: data.description ?? null,
        type: data.type,
        discount: Number(data.discount) || 0,
        freeShipping: Boolean(data.freeShipping),
      },
    };
  } catch {
    return { success: false, message: 'Could not check that code. Please try again.' };
  }
}

interface AdvancedCouponSystemProps {
  subtotal: number;
  email?: string;
  onApply: (coupon: AppliedCoupon) => void;
  onRemove: () => void;
  appliedCoupon: AppliedCoupon | null;
  /** Message from the parent (e.g. a stored code that stopped being valid) */
  notice?: string;
  compact?: boolean;
}

export default function AdvancedCouponSystem({
  subtotal,
  email,
  onApply,
  onRemove,
  appliedCoupon,
  notice,
  compact = false,
}: AdvancedCouponSystemProps) {
  const [couponCode, setCouponCode] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  const handleApply = async () => {
    const code = couponCode.trim().toUpperCase();
    if (!code) {
      setError('Enter a coupon code');
      return;
    }
    setError('');
    setChecking(true);
    const result = await previewCoupon(code, subtotal, email);
    setChecking(false);
    if (!result.success) {
      setError(result.message);
      return;
    }
    storeCouponCode(result.coupon.code);
    onApply(result.coupon);
    setCouponCode('');
  };

  const handleRemove = () => {
    clearStoredCouponCode();
    setError('');
    onRemove();
  };

  const discountLabel = appliedCoupon
    ? appliedCoupon.freeShipping && appliedCoupon.discount <= 0
      ? 'Free delivery'
      : `-GH₵${appliedCoupon.discount.toFixed(2)}`
    : '';

  return (
    <div className={compact ? 'space-y-3' : 'space-y-4'}>
      {!appliedCoupon ? (
        <div>
          <label htmlFor="coupon-code" className="block text-sm font-semibold text-gray-900 mb-2">
            Have a coupon code?
          </label>
          <div className="flex space-x-2">
            <input
              id="coupon-code"
              type="text"
              value={couponCode}
              autoComplete="off"
              onChange={(e) => {
                setCouponCode(e.target.value.toUpperCase());
                setError('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleApply();
                }
              }}
              placeholder="Enter code"
              className={`flex-1 min-w-0 px-4 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-brand focus:border-brand text-sm ${compact ? 'py-2.5' : 'py-3'}`}
            />
            <button
              type="button"
              onClick={handleApply}
              disabled={checking}
              className={`bg-brand-accent hover:bg-brand-accentDark text-white px-6 rounded-lg font-semibold transition-colors whitespace-nowrap disabled:opacity-60 ${compact ? 'py-2.5' : 'py-3'}`}
            >
              {checking ? 'Checking…' : 'Apply'}
            </button>
          </div>
          {(error || notice) && (
            <p className={`text-sm mt-2 flex items-center ${error ? 'text-red-600' : 'text-amber-700'}`}>
              <i className="ri-error-warning-line mr-1"></i>
              {error || notice}
            </p>
          )}
        </div>
      ) : (
        <div className="bg-brand-soft border-2 border-brand/30 rounded-lg p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center space-x-2 mb-1">
                <i className="ri-price-tag-3-fill text-brand"></i>
                <span className="font-bold text-brand">{appliedCoupon.code}</span>
                <span className="text-sm font-semibold text-brand">{discountLabel}</span>
              </div>
              {appliedCoupon.description && (
                <p className="text-sm text-brand truncate">{appliedCoupon.description}</p>
              )}
            </div>
            <button
              type="button"
              onClick={handleRemove}
              aria-label="Remove coupon"
              className="w-8 h-8 flex items-center justify-center text-brand hover:text-brand-dark transition-colors shrink-0"
            >
              <i className="ri-close-line text-xl"></i>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
