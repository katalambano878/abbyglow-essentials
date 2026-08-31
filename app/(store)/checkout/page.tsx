'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import CheckoutSteps from '@/components/CheckoutSteps';
import OrderSummary from '@/components/OrderSummary';
import { useCart } from '@/context/CartContext';
import { supabase } from '@/lib/supabase';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useRecaptcha } from '@/hooks/useRecaptcha';
import { isPreorderProduct } from '@/lib/preorder';
import { computePaymentPlan, depositPlanLabel, DEPOSIT_PERCENT } from '@/lib/payments/plans';
import { SITE_PHONE, toWhatsAppE164 } from '@/lib/seo';

export default function CheckoutPage() {
  usePageTitle('Checkout');
  const router = useRouter();
  const { cart, subtotal: cartSubtotal, clearCart } = useCart();

  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [checkoutType, setCheckoutType] = useState<'guest' | 'account'>('guest');
  const [saveAddress, setSaveAddress] = useState(false);
  const [savePayment, setSavePayment] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [preorderByProductId, setPreorderByProductId] = useState<Record<string, boolean>>({});
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

  const [deliveryMethod, setDeliveryMethod] = useState('pickup');
  const [paymentPlan, setPaymentPlan] = useState<'full' | 'deposit_50'>('full');
  const [paymentGateway, setPaymentGateway] = useState<'moolre' | 'hubtel' | ''>('');
  const [gateways, setGateways] = useState<Array<{ id: 'moolre' | 'hubtel'; label: string; configured: boolean }>>([]);
  const [errors, setErrors] = useState<any>({});
  const cartHasPreorder = cart.some(
    (item) => item.isPreorder === true || preorderByProductId[item.id] === true
  );

  // Store WhatsApp number (E.164, no +) that receives the orders
  const WHATSAPP_NUMBER = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || toWhatsAppE164(SITE_PHONE);

  const buildWhatsAppMessage = (orderNumber: string, trackingNumber: string) => {
    const lines = [
      `Hello AbbyGlow Essentials! I just placed an order on your website.`,
      ``,
      `*Order:* ${orderNumber}`,
      `*Tracking:* ${trackingNumber}`,
      ``,
      `*My Items:*`,
      ...cart.map((item, i) =>
        `${i + 1}. ${item.name}${item.variant ? ` (${item.variant})` : ''} x${item.quantity} — GH₵${(item.price * item.quantity).toFixed(2)}`
      ),
      ``,
      `*Total: GH₵${total.toFixed(2)}*`,
      ``,
      `*Delivery:* ${deliveryMethod === 'pickup' ? 'Store Pickup' : 'Doorstep Delivery'}`,
      `*Name:* ${shippingData.firstName} ${shippingData.lastName}`,
      `*Phone:* ${shippingData.phone}`,
      `*Address:* ${shippingData.address}, ${shippingData.city}, ${shippingData.region}`,
    ];
    return lines.join('\n');
  };



  // Check auth and cart
  useEffect(() => {
    async function checkUser() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUser(session.user);
        setCheckoutType('account'); // Auto-select account checkout if logged in
        // Pre-fill email if available
        setShippingData(prev => ({ ...prev, email: session.user.email || '' }));
      }
    }
    checkUser();

    // Small delay to ensure cart load
    const timer = setTimeout(() => {
      if (cart.length === 0 && !isLoading) {
        // router.push('/cart'); // Optional: redirect if empty
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [cart, router, isLoading]);

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

  // Resolve pre-order flags from DB (covers older cart items without isPreorder)
  useEffect(() => {
    const ids = [...new Set(cart.map((item) => item.id).filter(Boolean))];
    if (ids.length === 0) {
      setPreorderByProductId({});
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from('products').select('id, metadata').in('id', ids);
      if (cancelled || !data) return;
      const map: Record<string, boolean> = {};
      for (const row of data as Array<{ id: string; metadata?: unknown }>) {
        map[row.id] = isPreorderProduct(row.metadata as any);
      }
      setPreorderByProductId(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [cart]);

  // Calculate Totals
  const subtotal = cartSubtotal;
  const shippingCost = 0; // Delivery options temporarily disabled
  const tax = 0; // No Tax
  const total = subtotal + shippingCost + tax;
  const effectivePlan = cartHasPreorder ? paymentPlan : 'full';
  const planBreakdown = computePaymentPlan(total, effectivePlan);
  const amountDueNow = planBreakdown.amountDueNow;
  const balanceDue = planBreakdown.balanceDue;

  useEffect(() => {
    if (!cartHasPreorder && paymentPlan === 'deposit_50') {
      setPaymentPlan('full');
    }
  }, [cartHasPreorder, paymentPlan]);

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



  const handlePlaceOrder = async () => {
    if (cart.length === 0) {
      alert('Your cart is empty');
      return;
    }
    if (!paymentGateway) {
      alert('Please select a payment method or contact support.');
      return;
    }

    setIsLoading(true);

    const isHuman = await getToken('checkout');
    if (!isHuman) {
      alert('Security verification failed. Please try again.');
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
            variantName: item.variant || null,
            quantity: item.quantity,
          })),
          shipping: shippingData,
          deliveryMethod,
          paymentPlan: cartHasPreorder ? paymentPlan : 'full',
          paymentGateway,
        }),
      });

      const result = await res.json().catch(() => ({}));
      if (!res.ok || !result.success || !result.order) {
        throw new Error(result.message || 'Failed to place order');
      }

      const order = result.order;
      const orderNumber = order.order_number as string;
      const trackingNumber = (order.tracking_number as string) || '';

      const initiateRes = await fetch('/api/payment/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: order.id,
          gateway: paymentGateway,
          purpose: 'checkout',
          customerEmail: shippingData.email,
          customerPhone: shippingData.phone,
          customerName: `${shippingData.firstName} ${shippingData.lastName}`.trim(),
        }),
      });

      const initiateResult = await initiateRes.json().catch(() => ({}));

      if (!initiateRes.ok || !initiateResult.success) {
        const msg = initiateResult.message || 'Failed to start payment';
        alert(`${msg}\n\nYou can try again at /pay/${order.id}`);
        setIsLoading(false);
        return;
      }

      fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'order_created',
          payload: {
            id: order.id,
            order_number: orderNumber,
            email: shippingData.email,
            phone: shippingData.phone,
            total: order.total,
            shipping_address: shippingData,
            metadata: {
              tracking_number: trackingNumber,
              payment_gateway: paymentGateway,
              payment_plan: order.payment_plan || effectivePlan,
              amount_due_now: order.amount_due_now ?? amountDueNow,
            },
          },
        }),
      }).catch((err) => console.error('Notification trigger error:', err));

      clearCart();
      if (initiateResult.url) {
        window.location.href = initiateResult.url;
      } else {
        window.location.href = `/pay/${order.id}`;
      }
    } catch (err: any) {
      console.error('Checkout error:', err);
      alert('Failed to place order: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

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
          <div className="mb-8 bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-6">Checkout As</h2>
            <div className="grid md:grid-cols-2 gap-4">
              <button
                onClick={() => !user && setCheckoutType('guest')}
                className={`p-6 rounded-xl border-2 transition-all text-left cursor-pointer ${checkoutType === 'guest'
                  ? 'border-brand bg-brand-soft'
                  : 'border-gray-200 hover:border-gray-300'
                  } ${user ? 'opacity-50 cursor-not-allowed' : ''}`}
                disabled={!!user}
              >
                <div className="flex items-center justify-between mb-3">
                  <i className="ri-user-line text-3xl text-brand"></i>
                  <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${checkoutType === 'guest' ? 'border-brand bg-brand' : 'border-gray-300'
                    }`}>
                    {checkoutType === 'guest' && <i className="ri-check-line text-white text-sm"></i>}
                  </div>
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">Guest Checkout</h3>
                <p className="text-sm text-gray-600">Quick checkout without creating an account</p>
                {user && <p className="text-xs text-brand mt-2">You are logged in</p>}
              </button>

              <button
                onClick={() => setCheckoutType('account')}
                className={`p-6 rounded-xl border-2 transition-all text-left cursor-pointer ${checkoutType === 'account'
                  ? 'border-brand bg-brand-soft'
                  : 'border-gray-200 hover:border-gray-300'
                  }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <i className="ri-account-circle-line text-3xl text-brand"></i>
                  <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${checkoutType === 'account' ? 'border-brand bg-brand' : 'border-gray-300'
                    }`}>
                    {checkoutType === 'account' && <i className="ri-check-line text-white text-sm"></i>}
                  </div>
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">{user ? 'My Account' : 'Create Account'}</h3>
                <p className="text-sm text-gray-600">
                  {user ? `Logged in as ${user.email}` : 'Save info, track orders & earn loyalty points'}
                </p>
              </button>
            </div>
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

                    {checkoutType === 'account' && (
                      <label className="flex items-center space-x-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={saveAddress}
                          onChange={(e) => setSaveAddress(e.target.checked)}
                          className="w-5 h-5 text-brand rounded border-gray-300 focus:ring-brand"
                        />
                        <span className="text-sm text-gray-700">Save this address for future orders</span>
                      </label>
                    )}
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
                    <label className={`flex items-center justify-between p-4 border-2 rounded-lg cursor-pointer transition-colors ${deliveryMethod === 'pickup' ? 'border-brand bg-brand-soft' : 'border-gray-300 hover:border-gray-400'
                      }`}>
                      <div className="flex items-center space-x-4">
                        <input
                          type="radio"
                          name="delivery"
                          value="pickup"
                          checked={deliveryMethod === 'pickup'}
                          onChange={(e) => setDeliveryMethod(e.target.value)}
                          className="w-5 h-5 text-brand"
                        />
                        <div>
                          <p className="font-semibold text-gray-900">Store Pickup</p>
                          <p className="text-sm text-gray-600">Pick up from our store — Ready in 24 hours</p>
                        </div>
                      </div>
                      <p className="font-bold text-brand">FREE</p>
                    </label>

                    <label className={`flex items-center justify-between p-4 border-2 rounded-lg cursor-pointer transition-colors ${deliveryMethod === 'doorstep' ? 'border-brand bg-brand-soft' : 'border-gray-300 hover:border-gray-400'
                      }`}>
                      <div className="flex items-center space-x-4">
                        <input
                          type="radio"
                          name="delivery"
                          value="doorstep"
                          checked={deliveryMethod === 'doorstep'}
                          onChange={(e) => setDeliveryMethod(e.target.value)}
                          className="w-5 h-5 text-brand"
                        />
                        <div>
                          <p className="font-semibold text-gray-900">Doorstep Delivery</p>
                          <p className="text-sm text-gray-600">We will contact you with the delivery cost</p>
                        </div>
                      </div>
                      <p className="font-semibold text-amber-600 text-sm">At a Cost</p>
                    </label>

                    {/* Comprehensive delivery options - to be re-enabled later
                    <label className={`flex items-center justify-between p-4 border-2 rounded-lg cursor-pointer transition-colors ${deliveryMethod === 'accra' ? 'border-brand bg-brand-soft' : 'border-gray-300 hover:border-gray-400'
                      }`}>
                      <div className="flex items-center space-x-4">
                        <input type="radio" name="delivery" value="accra" checked={deliveryMethod === 'accra'} onChange={(e) => setDeliveryMethod(e.target.value)} className="w-5 h-5 text-brand" />
                        <div>
                          <p className="font-semibold text-gray-900">Accra Delivery</p>
                          <p className="text-sm text-gray-600">Delivery within Accra</p>
                        </div>
                      </div>
                      <p className="font-bold text-gray-900">GH₵ 40.00</p>
                    </label>
                    <label className={`flex items-center justify-between p-4 border-2 rounded-lg cursor-pointer transition-colors ${deliveryMethod === 'outside-accra' ? 'border-brand bg-brand-soft' : 'border-gray-300 hover:border-gray-400'
                      }`}>
                      <div className="flex items-center space-x-4">
                        <input type="radio" name="delivery" value="outside-accra" checked={deliveryMethod === 'outside-accra'} onChange={(e) => setDeliveryMethod(e.target.value)} className="w-5 h-5 text-brand" />
                        <div>
                          <p className="font-semibold text-gray-900">Outside Accra Delivery</p>
                          <p className="text-sm text-gray-600">Delivery to bus stations (VIP, OA, STC, etc.)</p>
                        </div>
                      </div>
                      <p className="font-bold text-gray-900">GH₵ 30.00</p>
                    </label>
                    */}
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
                  <h2 className="text-xl font-bold text-gray-900 mb-2">Payment Plan</h2>
                  <p className="text-sm text-gray-600 mb-6">
                    {cartHasPreorder
                      ? `Your cart includes pre-order items. Pay in full now, or ${DEPOSIT_PERCENT}% now and the balance when goods arrive.`
                      : 'Pay the full amount now for in-stock items available in Ghana.'}
                  </p>
                  <div className={`grid gap-4 mb-8 ${cartHasPreorder ? 'md:grid-cols-2' : 'grid-cols-1'}`}>
                    <button
                      type="button"
                      onClick={() => setPaymentPlan('full')}
                      className={`p-5 rounded-xl border-2 transition-all text-left cursor-pointer ${
                        effectivePlan === 'full'
                          ? 'border-brand bg-brand-soft'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-lg font-bold text-gray-900">Full Payment</h3>
                        <div
                          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                            effectivePlan === 'full' ? 'border-brand bg-brand' : 'border-gray-300'
                          }`}
                        >
                          {effectivePlan === 'full' && <i className="ri-check-line text-white text-xs"></i>}
                        </div>
                      </div>
                      <p className="text-sm text-gray-600 mb-2">Pay the full amount now</p>
                      <p className="text-xl font-bold text-brand">GH₵ {total.toFixed(2)}</p>
                    </button>

                    {cartHasPreorder && (
                      <button
                        type="button"
                        onClick={() => setPaymentPlan('deposit_50')}
                        className={`p-5 rounded-xl border-2 transition-all text-left cursor-pointer ${
                          effectivePlan === 'deposit_50'
                            ? 'border-brand bg-brand-soft'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="text-lg font-bold text-gray-900">{depositPlanLabel()}</h3>
                          <div
                            className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                              effectivePlan === 'deposit_50' ? 'border-brand bg-brand' : 'border-gray-300'
                            }`}
                          >
                            {effectivePlan === 'deposit_50' && <i className="ri-check-line text-white text-xs"></i>}
                          </div>
                        </div>
                        <p className="text-sm text-gray-600 mb-2">Pay {DEPOSIT_PERCENT}% now, rest when goods arrive</p>
                        <p className="text-xl font-bold text-brand-accent">GH₵ {amountDueNow.toFixed(2)} now</p>
                        <p className="text-sm text-gray-500 mt-1">Balance: GH₵ {balanceDue.toFixed(2)}</p>
                      </button>
                    )}
                  </div>

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
                      disabled={isLoading || !paymentGateway}
                      className="flex-1 bg-brand-accent hover:bg-brand-accentDark text-white py-4 rounded-lg font-semibold transition-colors whitespace-nowrap cursor-pointer disabled:opacity-70 flex items-center justify-center"
                    >
                      {isLoading ? (
                        <>
                          <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Processing...
                        </>
                      ) : (
                        <>Pay GH₵ {amountDueNow.toFixed(2)} Now</>
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
              shipping={shippingCost}
              tax={tax}
              total={total}
              paymentPlan={currentStep >= 3 ? effectivePlan : undefined}
              amountDueNow={currentStep >= 3 ? amountDueNow : undefined}
              balanceDue={currentStep >= 3 ? balanceDue : undefined}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
