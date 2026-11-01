'use client';

import { useState, useEffect, Suspense } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { usePageTitle } from '@/hooks/usePageTitle';
import { depositPlanLabel, isDepositPlan } from '@/lib/payments/plans';

type Gateway = { id: string; label: string };

function PaymentPageContent() {
  usePageTitle('Complete Payment');
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const orderId = params.orderId as string;
  const wasCancelled = searchParams.get('cancelled') === '1';
  const startFailed = searchParams.get('notice') === 'start-failed';

  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gateways, setGateways] = useState<Gateway[]>([]);
  const [gateway, setGateway] = useState('');

  useEffect(() => {
    fetch('/api/payment/gateways')
      .then((r) => r.json())
      .then((d) => {
        const list = d.gateways || [];
        setGateways(list);
        if (list[0]?.id) setGateway(list[0].id);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    async function fetchOrder() {
      try {
        const res = await fetch('/api/storefront/orders/lookup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'pay', orderId }),
        });
        const result = await res.json().catch(() => ({}));

        if (!res.ok || !result.success || !result.order) {
          setError(result.message || 'Order not found. Please check your link and try again.');
          setLoading(false);
          return;
        }

        const data = result.order;
        if (data.payment_status === 'paid') {
          router.push(`/order-success?order=${data.order_number}`);
          return;
        }

        setOrder(data);
      } catch (err) {
        console.error('Error fetching order:', err);
        setError('Failed to load order details.');
      } finally {
        setLoading(false);
      }
    }

    if (orderId) {
      fetchOrder();
    }
  }, [orderId, router]);

  const isBalance =
    order?.payment_status === 'partially_paid' || Number(order?.amount_paid || 0) > 0;
  const chargeAmount = isBalance
    ? Number(order?.balance_due ?? 0)
    : Number(order?.amount_due_now ?? order?.total ?? 0);

  const handlePayNow = async () => {
    if (!order || !gateway) return;

    setProcessing(true);
    setError(null);

    try {
      const paymentRes = await fetch('/api/payment/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: order.id,
          gateway,
          purpose: isBalance ? 'balance' : 'checkout',
        }),
      });

      const paymentResult = await paymentRes.json();

      if (!paymentResult.success) {
        throw new Error(paymentResult.message || 'Payment initialization failed');
      }

      window.location.href = paymentResult.url;
    } catch (err: any) {
      console.error('Payment error:', err);
      setError(err.message || 'Failed to initialize payment. Please try again.');
      setProcessing(false);
    }
  };

  const isClosed =
    order?.status === 'cancelled' ||
    order?.status === 'refunded' ||
    order?.payment_status === 'refunded';
  const closedTitle = order?.status === 'cancelled' ? 'Order cancelled' : 'Order refunded';
  const closedMessage =
    order?.status === 'cancelled'
      ? 'This order was cancelled, so no payment is needed. If you still want these items, please place a new order.'
      : 'This order has been refunded and is closed. No further payment is needed.';

  if (loading) {
    return (
      <main className="min-h-screen bg-brand-soft flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-brand/30 border-t-brand rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading order details...</p>
        </div>
      </main>
    );
  }

  if (error && !order) {
    return (
      <main className="min-h-screen bg-brand-soft flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <div className="w-20 h-20 mx-auto mb-6 bg-red-50 rounded-full flex items-center justify-center">
            <i className="ri-error-warning-line text-4xl text-red-500"></i>
          </div>
          <h1 className="text-2xl font-bold text-brand-ink mb-3">Order Not Found</h1>
          <p className="text-gray-600 mb-6">{error}</p>
          <Link
            href="/"
            className="inline-flex items-center px-6 py-3 bg-brand-accent hover:bg-brand-accentDark text-white rounded-lg font-semibold transition-colors"
          >
            <i className="ri-home-line mr-2"></i>
            Go to Homepage
          </Link>
        </div>
      </main>
    );
  }

  const shippingAddress = order?.shipping_address || {};
  const customerName = order?.metadata?.first_name || shippingAddress.firstName || 'Customer';

  if (isClosed) {
    return (
      <main className="min-h-screen bg-brand-soft flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <div className="w-20 h-20 mx-auto mb-6 bg-gray-100 rounded-full flex items-center justify-center">
            <i className="ri-close-circle-line text-4xl text-gray-500"></i>
          </div>
          <h1 className="text-2xl font-bold text-brand-ink mb-2">{closedTitle}</h1>
          <p className="text-sm text-gray-500 mb-4">Order {order?.order_number}</p>
          <p className="text-gray-600 mb-8">{closedMessage}</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/shop"
              className="inline-flex items-center justify-center px-6 py-3 bg-brand-accent hover:bg-brand-accentDark text-white rounded-lg font-semibold transition-colors"
            >
              <i className="ri-shopping-bag-line mr-2"></i>
              Continue shopping
            </Link>
            <Link
              href="/contact"
              className="inline-flex items-center justify-center px-6 py-3 border-2 border-gray-300 hover:border-gray-400 text-gray-700 rounded-lg font-semibold transition-colors"
            >
              Contact support
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-brand-soft py-12 px-4">
      <div className="max-w-lg mx-auto">
        <div className="text-center mb-8">
          <Link href="/" className="inline-block mb-6">
            <span className="text-2xl font-['Pacifico'] text-brand">AbbyGlow Essentials</span>
          </Link>
          <h1 className="text-2xl font-bold text-brand-ink">
            {isBalance ? 'Pay Remaining Balance' : 'Complete Your Payment'}
          </h1>
          <p className="text-gray-600 mt-2">
            Hi {customerName},{' '}
            {isBalance
              ? 'pay the rest when your goods are ready / arrive.'
              : 'your order is waiting for payment.'}
          </p>
        </div>

        {wasCancelled && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
            <div className="flex items-start space-x-3">
              <i className="ri-arrow-go-back-line text-xl text-amber-600 mt-0.5"></i>
              <div>
                <p className="text-sm font-semibold text-amber-800">Payment was cancelled</p>
                <p className="text-sm text-amber-700 mt-1">No money was taken — you can try again below.</p>
              </div>
            </div>
          </div>
        )}

        {startFailed && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
            <div className="flex items-start space-x-3">
              <i className="ri-error-warning-line text-xl text-amber-600 mt-0.5"></i>
              <div>
                <p className="text-sm font-semibold text-amber-800">Your order was created, but we could not start the payment</p>
                <p className="text-sm text-amber-700 mt-1">Nothing was charged. Use the button below to pay for this order.</p>
              </div>
            </div>
          </div>
        )}

        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between mb-4 pb-4 border-b border-gray-100">
            <span className="text-sm text-gray-500">Order Number</span>
            <span className="font-semibold text-brand-ink">{order?.order_number}</span>
          </div>

          <div className="space-y-3 mb-6">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Order total</span>
              <span className="text-brand-ink">GH₵ {Number(order?.total || 0).toFixed(2)}</span>
            </div>
            {isDepositPlan(order?.payment_plan) && (
              <>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Plan</span>
                  <span className="text-brand font-medium">{depositPlanLabel()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Already paid</span>
                  <span className="text-brand-ink">GH₵ {Number(order?.amount_paid || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Balance due</span>
                  <span className="text-brand-ink">GH₵ {Number(order?.balance_due || 0).toFixed(2)}</span>
                </div>
              </>
            )}
          </div>

          <div className="flex justify-between items-center pt-4 border-t border-gray-200">
            <span className="text-lg font-semibold text-brand-ink">Pay now</span>
            <span className="text-2xl font-bold text-brand-accent">GH₵ {chargeAmount.toFixed(2)}</span>
          </div>
        </div>

        {order?.payment_status === 'partially_paid' && (
          <div className="bg-brand-soft border border-brand/20 rounded-lg p-4 mb-6">
            <div className="flex items-start space-x-3">
              <i className="ri-checkbox-circle-line text-xl text-brand mt-0.5"></i>
              <div>
                <p className="text-sm font-semibold text-brand">Deposit received</p>
                <p className="text-sm text-gray-700 mt-1">
                  Pay the remaining balance online, or settle when your goods arrive.
                </p>
              </div>
            </div>
          </div>
        )}

        {order?.payment_status === 'pending' && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
            <div className="flex items-start space-x-3">
              <i className="ri-time-line text-xl text-yellow-600 mt-0.5"></i>
              <div>
                <p className="text-sm font-semibold text-yellow-800">Payment Pending</p>
                <p className="text-sm text-yellow-700 mt-1">
                  Complete your payment to confirm your order.
                </p>
              </div>
            </div>
          </div>
        )}

        {order?.payment_status === 'failed' && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <div className="flex items-start space-x-3">
              <i className="ri-error-warning-line text-xl text-red-600 mt-0.5"></i>
              <div>
                <p className="text-sm font-semibold text-red-800">Payment Failed</p>
                <p className="text-sm text-red-700 mt-1">
                  Your previous payment attempt was unsuccessful. Please try again.
                </p>
              </div>
            </div>
          </div>
        )}

        {gateways.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm p-4 mb-6 space-y-3">
            <p className="text-sm font-semibold text-brand-ink">Pay with</p>
            {gateways.map((g) => (
              <label
                key={g.id}
                className={`flex items-center gap-3 p-3 border-2 rounded-lg cursor-pointer ${
                  gateway === g.id ? 'border-brand bg-brand-soft' : 'border-gray-200'
                }`}
              >
                <input
                  type="radio"
                  name="gateway"
                  value={g.id}
                  checked={gateway === g.id}
                  onChange={() => setGateway(g.id)}
                  className="text-brand"
                />
                <span className="text-sm font-medium text-brand-ink">{g.label}</span>
              </label>
            ))}
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <button
          onClick={handlePayNow}
          disabled={processing || !gateway || chargeAmount <= 0}
          className="w-full bg-brand-accent hover:bg-brand-accentDark text-white py-4 rounded-xl font-semibold text-lg transition-colors disabled:opacity-70 flex items-center justify-center cursor-pointer"
        >
          {processing ? (
            <>
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Processing...
            </>
          ) : (
            <>
              <i className="ri-secure-payment-line mr-2"></i>
              Pay GH₵ {chargeAmount.toFixed(2)} Now
            </>
          )}
        </button>

        <div className="mt-6 text-center">
          <p className="text-xs text-gray-500 flex items-center justify-center">
            <i className="ri-lock-line mr-1"></i>
            Secure online payment via Moolre or Hubtel
          </p>
        </div>

        <div className="mt-8 text-center">
          <p className="text-sm text-gray-600">
            Having issues? <Link href="/contact" className="text-brand hover:underline">Contact Support</Link>
          </p>
        </div>
      </div>
    </main>
  );
}

export default function PaymentPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-brand-soft flex items-center justify-center">
          <div className="w-16 h-16 border-4 border-brand/30 border-t-brand rounded-full animate-spin"></div>
        </main>
      }
    >
      <PaymentPageContent />
    </Suspense>
  );
}
