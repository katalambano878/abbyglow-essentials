'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import AdvancedCouponSystem, {
  type AppliedCoupon,
  clearStoredCouponCode,
  previewCoupon,
  readStoredCouponCode,
} from '@/components/AdvancedCouponSystem';
import { useCart } from '@/context/CartContext';
import PageHero from '@/components/PageHero';
import { usePageTitle } from '@/hooks/usePageTitle';

const PLACEHOLDER_IMAGE = '/images/placeholder-product.svg';

export default function CartPage() {
  usePageTitle('Shopping Cart');
  const { cart: cartItems, removeFromCart, updateQuantity, subtotal } = useCart();
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(null);
  const [couponNotice, setCouponNotice] = useState('');
  const lastValidatedSubtotal = useRef<number | null>(null);

  // Re-validate the stored / applied coupon whenever the subtotal changes, so the
  // discount shown always matches what checkout will compute.
  useEffect(() => {
    const code = appliedCoupon?.code || readStoredCouponCode();
    if (!code || subtotal <= 0) return;
    if (lastValidatedSubtotal.current === subtotal && appliedCoupon) return;
    let cancelled = false;
    (async () => {
      const result = await previewCoupon(code, subtotal);
      if (cancelled) return;
      lastValidatedSubtotal.current = subtotal;
      if (result.success) {
        setAppliedCoupon(result.coupon);
        setCouponNotice('');
      } else {
        setAppliedCoupon(null);
        clearStoredCouponCode();
        setCouponNotice(`Coupon ${code} removed: ${result.message}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [subtotal, appliedCoupon?.code]); // eslint-disable-line react-hooks/exhaustive-deps

  const applyCoupon = (coupon: AppliedCoupon) => {
    lastValidatedSubtotal.current = subtotal;
    setAppliedCoupon(coupon);
    setCouponNotice('');
  };

  const removeCoupon = () => {
    setAppliedCoupon(null);
    setCouponNotice('');
  };

  const couponDiscount = Math.min(appliedCoupon?.discount || 0, subtotal);
  const shippingText = 'Chosen at checkout';
  const total = Math.max(subtotal - couponDiscount, 0);

  return (
    <div className="min-h-screen bg-gray-50">
      <PageHero title="Cart" backgroundImage="/cart-hero.png" />
      <div className="py-12 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        {cartItems.length === 0 ? (
          <section className="py-20">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 text-center">
              <div className="w-24 h-24 flex items-center justify-center mx-auto mb-6 bg-gray-200 rounded-full">
                <i className="ri-shopping-cart-line text-5xl text-gray-400"></i>
              </div>
              <h2 className="text-3xl font-bold text-gray-900 mb-4">Your cart is empty</h2>
              <p className="text-gray-600 mb-8 text-lg">Looks like you haven&#39;t added anything to your cart yet</p>
              <Link href="/shop" className="inline-block bg-brand-accent hover:bg-brand-accentDark text-white px-8 py-4 rounded-lg font-semibold transition-colors whitespace-nowrap">
                Continue Shopping
              </Link>
            </div>
          </section>
        ) : (
          <section className="py-12">
            <div className="max-w-7xl mx-auto px-4 sm:px-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-6">
                  <div className="bg-white rounded-xl shadow-sm p-6 overflow-hidden">
                    <div className="flex items-center justify-between mb-6">
                      <h2 className="text-2xl font-bold text-gray-900">Cart Items ({cartItems.length})</h2>
                    </div>

                    <div className="space-y-6">
                      {cartItems.map((item) => (
                        <div key={`${item.id}-${item.variantId || item.variant || ''}`} className="flex flex-col sm:flex-row gap-4 sm:gap-6 pb-6 border-b border-gray-200 last:border-0 last:pb-0">
                          <Link href={`/product/${item.slug || item.id}`} className="relative w-full sm:w-32 h-48 sm:h-32 flex-shrink-0 bg-gray-100 rounded-lg overflow-hidden">
                            <Image src={item.image || PLACEHOLDER_IMAGE} alt={item.name} fill className="object-cover object-top" sizes="(max-width: 640px) 100vw, 128px" quality={70} />
                          </Link>

                          <div className="flex-1">
                            <div className="flex justify-between mb-2">
                              <Link href={`/product/${item.slug || item.id}`} className="text-lg font-semibold text-gray-900 hover:text-brand transition-colors line-clamp-2">
                                {item.name}
                              </Link>
                              <button
                                onClick={() => removeFromCart(item.id, item.variant)}
                                aria-label={`Remove ${item.name}`}
                                className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-red-600 transition-colors"
                              >
                                <i className="ri-close-line text-xl"></i>
                              </button>
                            </div>

                            <div className="text-sm text-gray-600 mb-3 space-y-1">
                              {item.variant && <p>Variant: {item.variant}</p>}
                              {item.isPreorder && (
                                <p className="text-brand-ink font-medium">
                                  <i className="ri-time-line mr-1"></i>Pre-order
                                </p>
                              )}
                            </div>

                            <div className="flex items-center justify-between flex-wrap gap-4">
                              <div className="flex items-baseline space-x-3">
                                <span className="text-xl font-bold text-gray-900">GH₵{item.price.toFixed(2)}</span>
                                {item.quantity > 1 && (
                                  <span className="text-sm text-gray-500">× {item.quantity} = GH₵{(item.price * item.quantity).toFixed(2)}</span>
                                )}
                              </div>

                              <div className="flex items-center space-x-4">
                                <div className="flex flex-col">
                                  <div className="flex items-center border-2 border-gray-300 rounded-lg">
                                    <button
                                      onClick={() => updateQuantity(item.id, item.quantity - 1, item.variant)}
                                      className="w-10 h-10 flex items-center justify-center text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
                                      title={item.quantity <= (item.moq || 1) ? 'Remove item' : 'Decrease quantity'}
                                    >
                                      {item.quantity <= (item.moq || 1) ? (
                                        <i className="ri-delete-bin-line text-red-500"></i>
                                      ) : (
                                        <i className="ri-subtract-line"></i>
                                      )}
                                    </button>
                                    <input
                                      type="number"
                                      value={item.quantity}
                                      onChange={(e) => updateQuantity(item.id, parseInt(e.target.value) || (item.moq || 1), item.variant)}
                                      className="w-12 h-10 text-center border-x-2 border-gray-300 focus:outline-none font-semibold"
                                      min={item.moq || 1}
                                      max={item.maxStock}
                                    />
                                    <button
                                      onClick={() => updateQuantity(item.id, item.quantity + 1, item.variant)}
                                      disabled={item.quantity >= item.maxStock}
                                      className="w-10 h-10 flex items-center justify-center text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                      <i className="ri-add-line"></i>
                                    </button>
                                  </div>
                                  {(item.moq || 1) > 1 && (
                                    <span className="text-xs text-amber-600 mt-1">
                                      Min. order: {item.moq} units
                                    </span>
                                  )}
                                  {item.quantity >= item.maxStock && (
                                    <span className="text-xs text-amber-600 mt-1">Max stock reached</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="bg-white rounded-xl shadow-sm p-6 sticky top-24">
                    <h3 className="text-xl font-bold text-gray-900 mb-6">Order Summary</h3>

                    <div className="space-y-4 mb-6">
                      <div className="flex justify-between text-gray-700">
                        <span>Subtotal</span>
                        <span className="font-semibold">GH₵{subtotal.toFixed(2)}</span>
                      </div>

                      {appliedCoupon && couponDiscount > 0 && (
                        <div className="flex justify-between text-[#0A0F1D]">
                          <div className="flex items-center space-x-2">
                            <span>Coupon ({appliedCoupon.code})</span>
                          </div>
                          <span className="font-semibold">-GH₵{couponDiscount.toFixed(2)}</span>
                        </div>
                      )}

                      <div className="flex justify-between text-gray-700">
                        <span>Delivery</span>
                        <span className="font-semibold">{shippingText}</span>
                      </div>
                    </div>

                    <div className="border-t border-gray-200 pt-4 mb-6">
                      <div className="flex justify-between text-xl font-bold text-gray-900">
                        <span>Total</span>
                        <span>GH₵{total.toFixed(2)}</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">Store pickup is free. If you choose delivery, our team confirms the fee with you after you order.</p>
                    </div>

                    <AdvancedCouponSystem
                      subtotal={subtotal}
                      onApply={applyCoupon}
                      onRemove={removeCoupon}
                      appliedCoupon={appliedCoupon}
                      notice={couponNotice}
                    />

                    <Link
                      href="/checkout"
                      className="block w-full bg-brand-accent hover:bg-brand-accentDark text-white py-4 rounded-lg font-semibold text-center transition-colors mt-6 mb-3 whitespace-nowrap"
                    >
                      Proceed to Checkout
                    </Link>

                    <Link
                      href="/shop"
                      className="block w-full text-center text-[#0A0F1D] hover:text-black font-semibold py-2 whitespace-nowrap"
                    >
                      Continue Shopping
                    </Link>

                    <div className="mt-6 pt-6 border-t border-gray-200 space-y-3">
                      <div className="flex items-center text-sm text-gray-600">
                        <i className="ri-shield-check-line text-[#0A0F1D] mr-2"></i>
                        <span>Secure checkout</span>
                      </div>
                      <div className="flex items-center text-sm text-gray-600">
                        <i className="ri-arrow-left-right-line text-[#0A0F1D] mr-2"></i>
                        <span>30-day returns</span>
                      </div>
                      <div className="flex items-center text-sm text-gray-600">
                        <i className="ri-customer-service-line text-[#0A0F1D] mr-2"></i>
                        <span>24/7 support</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
