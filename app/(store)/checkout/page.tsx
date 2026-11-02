'use client';

import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import CheckoutSteps from '@/components/CheckoutSteps';
import OrderSummary from '@/components/OrderSummary';
import AdvancedCouponSystem, {
  type AppliedCoupon,
  clearStoredCouponCode,
  previewCoupon,
  readStoredCouponCode,
} from '@/components/AdvancedCouponSystem';
import { useCart } from '@/context/CartContext';
import { supabase } from '@/lib/supabase';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useRecaptcha } from '@/hooks/useRecaptcha';
import {
  computeShipping,
  deliveryMethodHint,
  DEFAULT_DELIVERY_RATES,
  normalizeDeliveryRates,
  shippingLabel,
  type DeliveryMethod,
  type DeliveryRates,
} from '@/lib/shipping';

const CHECKOUT_EMAIL_KEY = 'abbyglow_checkout_email';

type CreatedOrder = {
  id: string;
  order_number: string;
  total: number;
  subtotal: number;
  discount_total: number;
  shipping_total: number;
  coupon_code: string | null;
  tracking_number: string | null;
  payment_status: string;
  status: string;
  payment_plan: string;
  amount_due_now: number;
  amount_paid: number;
  balance_due: number;
  payment_gateway: string | null;
};

function rememberCheckoutEmail(email: string) {
  try {
    sessionStorage.setItem(CHECKOUT_EMAIL_KEY, email.trim().toLowerCase());
  } catch {
    /* storage unavailable */
  }
}

export default function CheckoutPage() {
  usePageTitle('Checkout');
  const router = useRouter();
  const { cart, subtotal: cartSubtotal, clearCart } = useCart();

  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [user, setUser] = useState<any>(null);
  const { getToken, verifying } = useRecaptcha();

  const [shippingData, setShippingData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    region: ''
  });

  // Ghana Regions for dropdown
  const ghanaRegions = [
    'Greater Accra',
    'Ashanti',
    'Western',
    'Central',
    'Eastern',
    'Northern',
    'Volta',
    'Upper East',
    'Upper West',
    'Brong-Ahafo',
    'Ahafo',
    'Bono',
    'Bono East',
    'North East',
    'Savannah',
    'Oti',
    'Western North'
  ];

  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>('pickup');
  const [deliveryRates, setDeliveryRates] = useState<DeliveryRates>(DEFAULT_DELIVERY_RATES);
  const [paymentGateway, setPaymentGateway] = useState<'moolre' | 'hubtel' | ''>('');
  const [gateways, setGateways] = useState<Array<{ id: 'moolre' | 'hubtel'; label: string; configured: boolean }>>([]);
  const [errors, setErrors] = useState<any>({});
  const [formError, setFormError] = useState('');

  // Coupon (preview only — the final discount comes from the checkout response)
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(null);
  const [couponNotice, setCouponNotice] = useState('');
  const lastCouponCheck = useRef<string>('');

  // Order created but the server total differs from what was displayed: confirm before paying
  const [pendingOrder, setPendingOrder] = useState<CreatedOrder | null>(null);

  // Check auth
  useEffect(() => {
    async function checkUser() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUser(session.user);
        setShippingData(prev => ({ ...prev, email: session.user.email || prev.email }));
      }
    }
    checkUser();
  }, []);

  // Scroll to top when step changes
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [currentStep]);

  // Load configured payment gateways
  useEffect(() => {
    fetch('/api/payment/gateways')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.gateways)) {
          setGateways(data.gateways);
          if (data.gateways.length > 0) {
            setPaymentGateway((prev) => prev || data.gateways[0].id);
          }
        }
      })
      .catch((err) => console.error('Failed to load payment gateways:', err));
  }, []);

  // Calculate Totals (same helpers as the server)
  const subtotal = cartSubtotal;
  const couponDiscount = Math.min(appliedCoupon?.discount || 0, subtotal);
  const discountedSubtotal = Math.max(0, Math.round((subtotal - couponDiscount) * 100) / 100);
  const shippingCost = appliedCoupon?.freeShipping ? 0 : computeShipping(discountedSubtotal, deliveryMethod, deliveryRates);
  const tax = 0; // No Tax
  const total = Math.round((discountedSubtotal + shippingCost + tax) * 100) / 100;
  const feePreview = (method: DeliveryMethod) =>
    appliedCoupon?.freeShipping ? 0 : computeShipping(discountedSubtotal, method, deliveryRates);

  // Delivery fees come from the admin's settings; the server charges the same numbers.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/storefront/delivery-rates')
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (!cancelled && json?.rates) setDeliveryRates(normalizeDeliveryRates(json.rates));
      })
      .catch(() => { /* keep defaults */ });
    return () => { cancelled = true; };
  }, []);

  // Re-validate the stored / applied coupon against the current subtotal + email
  useEffect(() => {
    const code = appliedCoupon?.code || readStoredCouponCode();
    if (!code || subtotal <= 0 || pendingOrder) return;
    const email = /\S+@\S+\.\S+/.test(shippingData.email) ? shippingData.email.trim().toLowerCase() : '';
    const signature = `${code}|${subtotal}|${email}`;
    if (lastCouponCheck.current === signature) return;
    lastCouponCheck.current = signature;
    let cancelled = false;
    (async () => {
      const result = await previewCoupon(code, subtotal, email || undefined);
      if (cancelled) return;
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
  }, [subtotal, shippingData.email, appliedCoupon?.code, pendingOrder]);

  const applyCoupon = (coupon: AppliedCoupon) => {
    const email = /\S+@\S+\.\S+/.test(shippingData.email) ? shippingData.email.trim().toLowerCase() : '';
    lastCouponCheck.current = `${coupon.code}|${subtotal}|${email}`;
    setAppliedCoupon(coupon);
    setCouponNotice('');
  };

  const removeCoupon = () => {
    setAppliedCoupon(null);
    setCouponNotice('');
  };

  const validateShipping = () => {
    const newErrors: any = {};
    if (!shippingData.firstName) newErrors.firstName = 'First name is required';
    if (!shippingData.lastName) newErrors.lastName = 'Last name is required';
    if (!shippingData.email) newErrors.email = 'Email is required';
    else if (!/\S+@\S+\.\S+/.test(shippingData.email)) newErrors.email = 'Invalid email';
    if (!shippingData.phone) newErrors.phone = 'Phone is required';
    if (!shippingData.address) newErrors.address = 'Address is required';
    if (!shippingData.city) newErrors.city = 'City is required';
    if (!shippingData.region) newErrors.region = 'Region is required';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleContinueToDelivery = () => {
    if (validateShipping()) {
      setCurrentStep(2);
    }
  };

  const handleContinueToPayment = () => {
    setCurrentStep(3);
  };

  /** Start the gateway session for an order that already exists. */
  const initiatePayment = async (order: CreatedOrder) => {
    rememberCheckoutEmail(shippingData.email);
    const initiateRes = await fetch('/api/payment/initiate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: order.id,
        gateway: paymentGateway,
        purpose: 'checkout',
        customerPhone: shippingData.phone,
        customerName: `${shippingData.firstName} ${shippingData.lastName}`.trim(),
      }),
    });
    const initiateResult = await initiateRes.json().catch(() => ({}));

    if (!initiateRes.ok || !initiateResult.success || !initiateResult.url) {
      // The order exists — never let the customer create a second one. Send them
      // to the pay page where they can retry.
      clearCart();
      router.push(`/pay/${order.id}?notice=start-failed`);
      return;
    }

    window.location.href = initiateResult.url;
  };

  const handlePlaceOrder = async () => {
    setFormError('');
    if (cart.length === 0) {
      setFormError('Your cart is empty.');
      return;
    }
    if (!paymentGateway) {
      setFormError('Please select a payment method or contact support.');
      return;
    }
    if (!validateShipping()) {
      setCurrentStep(1);
      return;
    }

    setIsLoading(true);

    const isHuman = await getToken('checkout');
    if (!isHuman) {
      setFormError('Security verification failed. Please try again.');
      setIsLoading(false);
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const authToken = session?.access_token;

      const res = await fetch('/api/storefront/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({
          items: cart.map((item) => ({
            productId: item.id,
            variantId: item.variantId || undefined,
            variantName: item.variant || undefined,
            quantity: item.quantity,
          })),
          shipping: shippingData,
          deliveryMethod,
          paymentGateway,
          couponCode: appliedCoupon?.code || undefined,
        }),
      });

      const result = await res.json().catch(() => ({}));
      if (!res.ok || !result.success || !result.order) {
        if (result.code === 'COUPON_INVALID') {
          clearStoredCouponCode();
          setAppliedCoupon(null);
          setCouponNotice(result.message || 'That coupon is no longer valid.');
          setFormError(result.message || 'That coupon is no longer valid. Your order was not placed.');
          return;
        }
        throw new Error(result.message || 'Failed to place order');
      }

      const order = result.order as CreatedOrder;
      rememberCheckoutEmail(shippingData.email);
      clearStoredCouponCode();

      fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'order_created',
          payload: { order_number: order.order_number },
        }),
      }).catch((err) => console.error('Notification trigger error:', err));

      clearCart();

      const serverAmount = Number(order.amount_due_now ?? order.total ?? 0);
      if (Math.abs(serverAmount - total) > 0.01) {
        // Show the server's figure and let the customer confirm before paying.
        setPendingOrder(order);
        return;
      }

      await initiatePayment(order);
    } catch (err: any) {
      console.error('Checkout error:', err);
      setFormError(err?.message ? `Failed to place order: ${err.message}` : 'Failed to place order. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmPendingPayment = async () => {
    if (!pendingOrder) return;
    setIsLoading(true);
    setFormError('');
    try {
      await initiatePayment(pendingOrder);
    } catch (err: any) {
      console.error('Payment start error:', err);
      clearCart();
      router.push(`/pay/${pendingOrder.id}?notice=start-failed`);
    } finally {
      setIsLoading(false);
    }
  };

  if (pendingOrder) {
    const serverAmount = Number(pendingOrder.amount_due_now ?? pendingOrder.total ?? 0);
    return (
      <main className="min-h-screen bg-gray-50 py-16">
        <div className="max-w-lg mx-auto px-4">
          <div className="bg-white rounded-xl shadow-sm p-6 sm:p-8">
            <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-5">
              <i className="ri-information-line text-3xl text-amber-600"></i>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 text-center mb-2">Please confirm your total</h1>
            <p className="text-gray-600 text-center mb-6">
              Order <span className="font-semibold text-gray-900">{pendingOrder.order_number}</span> has been created.
              The amount calculated by our server differs from the preview you saw.
            </p>
            <div className="space-y-3 mb-6 text-sm">
              <div className="flex justify-between text-gray-600">
                <span>Displayed amount</span>
                <span className="line-through">GH₵ {total.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-gray-700">
                <span>Subtotal</span>
                <span>GH₵ {Number(pendingOrder.subtotal || 0).toFixed(2)}</span>
              </div>
              {Number(pendingOrder.discount_total || 0) > 0 && (
                <div className="flex justify-between text-gray-700">
                  <span>Discount{pendingOrder.coupon_code ? ` (${pendingOrder.coupon_code})` : ''}</span>
                  <span>-GH₵ {Number(pendingOrder.discount_total).toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-gray-700">
                <span>Delivery</span>
                <span>{Number(pendingOrder.shipping_total || 0) > 0 ? `GH₵ ${Number(pendingOrder.shipping_total).toFixed(2)}` : 'Free'}</span>
              </div>
              <div className="flex justify-between text-gray-700">
                <span>Order total</span>
                <span>GH₵ {Number(pendingOrder.total || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center pt-3 border-t border-gray-200">
                <span className="text-lg font-semibold text-gray-900">Pay now</span>
                <span className="text-2xl font-bold text-brand-accent">GH₵ {serverAmount.toFixed(2)}</span>
              </div>
            </div>
            {formError && (
              <p className="text-sm text-red-600 mb-4 flex items-center">
                <i className="ri-error-warning-line mr-1"></i>
                {formError}
              </p>
            )}
            <button
              onClick={handleConfirmPendingPayment}
              disabled={isLoading}
              className="w-full bg-brand-accent hover:bg-brand-accentDark text-white py-4 rounded-lg font-semibold transition-colors disabled:opacity-70 cursor-pointer"
            >
              {isLoading ? 'Starting payment…' : `Continue to payment · GH₵ ${serverAmount.toFixed(2)}`}
            </button>
            <p className="text-xs text-gray-500 text-center mt-4">
              Prefer to pay later? Your order stays reserved at{' '}
              <Link href={`/pay/${pendingOrder.id}`} className="text-brand hover:underline">the payment page</Link>.
            </p>
          </div>
        </div>
      </main>
    );
  }

  if (cart.length === 0 && !isLoading) {
    return (
      <main className="min-h-screen bg-gray-50 py-20">
        <div className="max-w-md mx-auto text-center px-4">
          <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm">
            <i className="ri-shopping-cart-line text-4xl text-gray-300"></i>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Your cart is empty</h1>
          <p className="text-gray-600 mb-8">Add some items to start the checkout process.</p>
          <Link href="/shop" className="inline-block bg-brand-accent text-white px-8 py-3 rounded-lg font-semibold hover:bg-brand-accentDark transition-colors">
            Return to Shop
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-8">
          <Link href="/cart" className="text-gray-600 hover:text-gray-900 font-medium inline-flex items-center whitespace-nowrap">
            <i className="ri-arrow-left-line mr-2"></i>
            Back to Cart
          </Link>
        </div>

        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-8">Checkout</h1>

        {currentStep === 1 && (
          <div className="mb-8 bg-white rounded-xl shadow-sm p-4 sm:p-5 flex items-center gap-3 text-sm">
            <i className={`${user ? 'ri-account-circle-line' : 'ri-user-line'} text-2xl text-brand`}></i>
            {user ? (
              <p className="text-gray-700">
                Checking out as <span className="font-semibold text-gray-900">{user.email}</span>. Your order will appear in{' '}
                <Link href="/account?tab=orders" className="text-brand hover:underline">your account</Link>.
              </p>
            ) : (
              <p className="text-gray-700">
                Checking out as a guest.{' '}
                <Link href="/auth/login?redirect=/checkout" className="text-brand hover:underline font-semibold">Sign in</Link>{' '}
                to track orders from your account.
              </p>
            )}
          </div>
        )}

        <CheckoutSteps currentStep={currentStep} />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-8">
          <div className="lg:col-span-2">
            {currentStep === 1 && (
              <>
                <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
                  <h2 className="text-xl font-bold text-gray-900 mb-6">Shipping Information</h2>

                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-gray-900 mb-2">
                          First Name *
                        </label>
                        <input
                          type="text"
                          value={shippingData.firstName}
                          onChange={(e) => setShippingData({ ...shippingData, firstName: e.target.value })}
                          className={`w-full px-4 py-3 border-2 rounded-lg focus:ring-2 focus:ring-brand focus:border-brand ${errors.firstName ? 'border-red-500' : 'border-gray-300'
                            }`}
                          placeholder="John"
                        />
                        {errors.firstName && <p className="text-sm text-red-600 mt-1">{errors.firstName}</p>}
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-900 mb-2">
                          Last Name *
                        </label>
                        <input
                          type="text"
                          value={shippingData.lastName}
                          onChange={(e) => setShippingData({ ...shippingData, lastName: e.target.value })}
                          className={`w-full px-4 py-3 border-2 rounded-lg focus:ring-2 focus:ring-brand focus:border-brand ${errors.lastName ? 'border-red-500' : 'border-gray-300'
                            }`}
                          placeholder="Doe"
                        />
                        {errors.lastName && <p className="text-sm text-red-600 mt-1">{errors.lastName}</p>}
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-900 mb-2">
                        Email Address *
                      </label>
                      <input
                        type="email"
                        value={shippingData.email}
                        readOnly={!!user} // Make read-only if logged in (optional, but safer)
                        onChange={(e) => setShippingData({ ...shippingData, email: e.target.value })}
                        className={`w-full px-4 py-3 border-2 rounded-lg focus:ring-2 focus:ring-brand focus:border-brand ${errors.email ? 'border-red-500' : 'border-gray-300'
                          } ${user ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                        placeholder="you@example.com"
                      />
                      {errors.email && <p className="text-sm text-red-600 mt-1">{errors.email}</p>}
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-900 mb-2">
                        Phone Number *
                      </label>
                      <input
                        type="tel"
                        value={shippingData.phone}
                        onChange={(e) => setShippingData({ ...shippingData, phone: e.target.value })}
                        className={`w-full px-4 py-3 border-2 rounded-lg focus:ring-2 focus:ring-brand focus:border-brand ${errors.phone ? 'border-red-500' : 'border-gray-300'
                          }`}
                        placeholder="+233 XX XXX XXXX"
                      />
                      {errors.phone && <p className="text-sm text-red-600 mt-1">{errors.phone}</p>}
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-900 mb-2">
                        Street Address *
                      </label>
                      <input
                        type="text"
                        value={shippingData.address}
                        onChange={(e) => setShippingData({ ...shippingData, address: e.target.value })}
                        className={`w-full px-4 py-3 border-2 rounded-lg focus:ring-2 focus:ring-brand focus:border-brand ${errors.address ? 'border-red-500' : 'border-gray-300'
                          }`}
                        placeholder="House number and street name"
                      />
                      {errors.address && <p className="text-sm text-red-600 mt-1">{errors.address}</p>}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-gray-900 mb-2">
                          City *
                        </label>
                        <input
                          type="text"
                          value={shippingData.city}
                          onChange={(e) => setShippingData({ ...shippingData, city: e.target.value })}
                          className={`w-full px-4 py-3 border-2 rounded-lg focus:ring-2 focus:ring-brand focus:border-brand ${errors.city ? 'border-red-500' : 'border-gray-300'
                            }`}
                          placeholder="Accra"
                        />
                        {errors.city && <p className="text-sm text-red-600 mt-1">{errors.city}</p>}
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-900 mb-2">
                          Region *
                        </label>
                        <select
                          value={shippingData.region}
                          onChange={(e) => setShippingData({ ...shippingData, region: e.target.value })}
                          className={`w-full px-4 py-3 border-2 rounded-lg focus:ring-2 focus:ring-brand focus:border-brand bg-white ${errors.region ? 'border-red-500' : 'border-gray-300'
                            }`}
                        >
                          <option value="">Select Region</option>
                          {ghanaRegions.map((region) => (
                            <option key={region} value={region}>{region}</option>
                          ))}
                        </select>
                        {errors.region && <p className="text-sm text-red-600 mt-1">{errors.region}</p>}
                      </div>
                    </div>

                  </div>

                  <button
                    onClick={handleContinueToDelivery}
                    className="w-full mt-6 bg-brand-accent hover:bg-brand-accentDark text-white py-4 rounded-lg font-semibold transition-colors whitespace-nowrap cursor-pointer"
                  >
                    Continue to Delivery
                  </button>
                </div>


              </>
            )}

            {currentStep === 2 && (
              <>
                <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
                  <h2 className="text-xl font-bold text-gray-900 mb-6">Delivery Method</h2>
                  <div className="space-y-4">
                    {([
                      { id: 'pickup', title: 'Store Pickup', hint: deliveryMethodHint('pickup') },
                      {
                        id: 'delivery',
                        title: 'Doorstep Delivery (Accra)',
                        hint: `${deliveryMethodHint('delivery')} — to ${shippingData.city || 'your address'}`,
                      },
                      {
                        id: 'outside_accra',
                        title: 'Outside Accra Delivery',
                        hint: `${deliveryMethodHint('outside_accra')}${shippingData.region ? ` — ${shippingData.region}` : ''}`,
                      },
                    ] as Array<{ id: DeliveryMethod; title: string; hint: string }>).map((option) => {
                      const fee = feePreview(option.id);
                      const selected = deliveryMethod === option.id;
                      return (
                        <label
                          key={option.id}
                          className={`flex items-center justify-between p-4 border-2 rounded-lg cursor-pointer transition-colors ${selected ? 'border-brand bg-brand-soft' : 'border-gray-300 hover:border-gray-400'}`}
                        >
                          <div className="flex items-center space-x-4">
                            <input
                              type="radio"
                              name="delivery"
                              value={option.id}
                              checked={selected}
                              onChange={() => setDeliveryMethod(option.id)}
                              className="w-5 h-5 text-brand"
                            />
                            <div>
                              <p className="font-semibold text-gray-900">{option.title}</p>
                              <p className="text-sm text-gray-600">{option.hint}</p>
                            </div>
                          </div>
                          <p className={`font-bold whitespace-nowrap ${fee > 0 ? 'text-gray-900' : 'text-brand'}`}>
                            {fee > 0 ? `GH₵ ${fee.toFixed(2)}` : 'FREE'}
                          </p>
                        </label>
                      );
                    })}
                  </div>

                  <div className="flex flex-col-reverse md:flex-row gap-4 mt-6">
                    <button
                      onClick={() => setCurrentStep(1)}
                      className="flex-1 border-2 border-gray-300 hover:border-gray-400 text-gray-700 py-4 rounded-lg font-semibold transition-colors whitespace-nowrap cursor-pointer"
                    >
                      Back
                    </button>
                    <button
                      onClick={handleContinueToPayment}
                      className="flex-1 bg-brand-accent hover:bg-brand-accentDark text-white py-4 rounded-lg font-semibold transition-colors whitespace-nowrap cursor-pointer"
                    >
                      Continue to Payment
                    </button>
                  </div>
                </div>


              </>
            )}

            {currentStep === 3 && (
              <>
                <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
                  <h2 className="text-xl font-bold text-gray-900 mb-4">Payment Method</h2>
                  {gateways.length === 0 ? (
                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg mb-6">
                      <p className="text-sm text-amber-800">
                        Online payment is temporarily unavailable. Please contact support to complete your order.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3 mb-6">
                      {gateways.map((gw) => (
                        <label
                          key={gw.id}
                          className={`flex items-center justify-between p-4 border-2 rounded-lg cursor-pointer transition-colors ${
                            paymentGateway === gw.id
                              ? 'border-brand bg-brand-soft'
                              : 'border-gray-300 hover:border-gray-400'
                          }`}
                        >
                          <div className="flex items-center space-x-4">
                            <input
                              type="radio"
                              name="paymentGateway"
                              value={gw.id}
                              checked={paymentGateway === gw.id}
                              onChange={() => setPaymentGateway(gw.id)}
                              className="w-5 h-5 text-brand"
                            />
                            <div>
                              <p className="font-semibold text-gray-900">{gw.label}</p>
                              <p className="text-sm text-gray-600">Mobile Money &amp; Card</p>
                            </div>
                          </div>
                          <i className="ri-bank-card-line text-2xl text-brand"></i>
                        </label>
                      ))}
                    </div>
                  )}

                  {formError && (
                    <div className="p-4 bg-red-50 border border-red-200 rounded-lg mb-2">
                      <p className="text-sm text-red-700 flex items-start">
                        <i className="ri-error-warning-line mr-2 mt-0.5"></i>
                        <span>{formError}</span>
                      </p>
                    </div>
                  )}

                  <div className="flex flex-col-reverse md:flex-row gap-4 mt-6">
                    <button
                      onClick={() => setCurrentStep(2)}
                      disabled={isLoading}
                      className="flex-1 border-2 border-gray-300 hover:border-gray-400 text-gray-700 py-4 rounded-lg font-semibold transition-colors whitespace-nowrap cursor-pointer disabled:opacity-50"
                    >
                      Back
                    </button>
                    <button
                      onClick={handlePlaceOrder}
                      disabled={isLoading || verifying || !paymentGateway}
                      className="flex-1 bg-brand-accent hover:bg-brand-accentDark text-white py-4 rounded-lg font-semibold transition-colors whitespace-nowrap cursor-pointer disabled:opacity-70 flex items-center justify-center"
                    >
                      {isLoading || verifying ? (
                        <>
                          <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Processing...
                        </>
                      ) : (
                        <>Pay GH₵ {total.toFixed(2)} Now</>
                      )}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="lg:col-span-1">
            <OrderSummary
              items={cart}
              subtotal={subtotal}
              discount={couponDiscount}
              discountLabel={appliedCoupon ? `Coupon (${appliedCoupon.code})` : undefined}
              shipping={shippingCost}
              shippingText={shippingLabel(shippingCost, deliveryMethod)}
              tax={tax}
              total={total}
            >
              <AdvancedCouponSystem
                subtotal={subtotal}
                email={/\S+@\S+\.\S+/.test(shippingData.email) ? shippingData.email.trim().toLowerCase() : undefined}
                onApply={applyCoupon}
                onRemove={removeCoupon}
                appliedCoupon={appliedCoupon}
                notice={couponNotice}
                compact
              />
            </OrderSummary>
          </div>
        </div>
      </div>
    </main>
  );
}
