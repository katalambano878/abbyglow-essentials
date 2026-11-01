'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

const PLACEHOLDER = '/images/placeholder-product.svg';
const RETURN_WINDOW_DAYS = 14;

interface FoundItem {
  id: string;
  name: string;
  variantName: string | null;
  quantity: number;
  unitPrice: number;
  image: string;
}

interface FoundOrder {
  id: string;
  orderNumber: string;
  createdAt: string;
  status: string;
  paymentStatus: string;
  items: FoundItem[];
}

export default function ReturnsPortalPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [orderNumber, setOrderNumber] = useState('');
  const [email, setEmail] = useState('');
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [returnQuantities, setReturnQuantities] = useState<Record<string, number>>({});
  const [itemReasons, setItemReasons] = useState<Record<string, string>>({});
  const [overallReason, setOverallReason] = useState('');
  const [description, setDescription] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [lookupError, setLookupError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [foundOrder, setFoundOrder] = useState<FoundOrder | null>(null);

  // Prefill the email for signed-in customers.
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled && data.session?.user.email) {
        setEmail((prev) => prev || data.session!.user.email || '');
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const reasons = [
    'Wrong item received',
    'Defective/damaged item',
    'Not as described',
    'Changed my mind',
    'No longer needed',
    'Other'
  ];

  const handleFindOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setLookupError('');
    setIsLoading(true);
    try {
      const res = await fetch('/api/storefront/orders/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'track', orderNumber: orderNumber.trim(), email: email.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success || !json.order) {
        setLookupError(json.message || 'Order not found. Please check your order number and try again.');
        return;
      }
      const o = json.order;
      const order: FoundOrder = {
        id: o.id,
        orderNumber: o.order_number,
        createdAt: o.created_at,
        status: o.status,
        paymentStatus: o.payment_status,
        items: (o.order_items || []).map((it: any) => ({
          id: it.id,
          name: it.product_name,
          variantName: it.variant_name || null,
          quantity: Number(it.quantity) || 1,
          unitPrice: Number(it.unit_price) || 0,
          image: it.products?.product_images?.[0]?.url || it.metadata?.image || PLACEHOLDER,
        })),
      };

      if (['cancelled', 'refunded'].includes(order.status)) {
        setLookupError('This order has already been closed, so it cannot be returned.');
        return;
      }
      if (!['paid', 'partially_paid'].includes(order.paymentStatus)) {
        setLookupError('Only paid orders can be returned. If you have paid, give us a moment for the payment to register and try again.');
        return;
      }
      if (order.items.length === 0) {
        setLookupError('We could not find any items on this order.');
        return;
      }

      setFoundOrder(order);
      setSelectedItems([]);
      setReturnQuantities({});
      setItemReasons({});
      setStep(2);
    } catch {
      setLookupError('Could not look up the order. Please check your connection and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleItemSelection = (itemId: string) => {
    setSelectedItems(prev =>
      prev.includes(itemId)
        ? prev.filter(id => id !== itemId)
        : [...prev, itemId]
    );
    setReturnQuantities(prev => (prev[itemId] ? prev : { ...prev, [itemId]: 1 }));
  };

  const canContinue =
    selectedItems.length > 0 &&
    selectedItems.every(id => itemReasons[id]) &&
    overallReason.trim().length > 0;

  const handleSubmitReturn = async () => {
    if (!foundOrder) return;
    setSubmitError('');
    setIsLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;

      const res = await fetch('/api/storefront/returns', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          orderNumber: foundOrder.orderNumber,
          email: email.trim(),
          reason: overallReason.trim(),
          description: description.trim() || undefined,
          items: selectedItems.map((id) => ({
            orderItemId: id,
            quantity: returnQuantities[id] || 1,
            reason: itemReasons[id],
          })),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.status === 409) {
        setSubmitError(json.message || 'A return request for this order is already in progress.');
        return;
      }
      if (!res.ok || !json.success || !json.request) {
        setSubmitError(json.message || 'Could not submit the return request. Please try again.');
        return;
      }
      router.push(
        `/returns/confirmation?id=${encodeURIComponent(json.request.id)}&order=${encodeURIComponent(json.request.order_number || foundOrder.orderNumber)}`
      );
    } catch {
      setSubmitError('Could not submit the return request. Please check your connection and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const selectedTotal = foundOrder
    ? foundOrder.items
        .filter((i) => selectedItems.includes(i.id))
        .reduce((sum, i) => sum + i.unitPrice * (returnQuantities[i.id] || 1), 0)
    : 0;

  return (
    <main className="min-h-screen bg-gray-50 py-12">
        <div className="max-w-4xl mx-auto px-4">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Returns Portal</h1>
          <p className="text-gray-600 mb-8">Start a return for a delivered order</p>

          <div className="mb-8">
            <div className="flex items-center justify-between">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center flex-1">
                  <div className={`w-10 h-10 flex items-center justify-center rounded-full font-bold ${
                    i <= step ? 'bg-brand text-white' : 'bg-gray-200 text-gray-500'
                  }`}>
                    {i < step ? <i className="ri-check-line"></i> : i}
                  </div>
                  {i < 3 && (
                    <div className={`flex-1 h-1 mx-4 ${
                      i < step ? 'bg-brand' : 'bg-gray-200'
                    }`}></div>
                  )}
                </div>
              ))}
            </div>
            <div className="flex justify-between mt-2">
              <span className="text-sm font-semibold text-gray-900">Find Order</span>
              <span className="text-sm font-semibold text-gray-900">Select Items</span>
              <span className="text-sm font-semibold text-gray-900">Submit</span>
            </div>
          </div>

          {step === 1 && (
            <div className="bg-white rounded-xl shadow-sm p-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">Find Your Order</h2>
              {lookupError && (
                <div className="mb-6 p-4 bg-red-50 border border-red-100 text-red-700 rounded-lg text-sm flex items-start gap-2" role="alert">
                  <i className="ri-error-warning-line mt-0.5"></i>
                  <span>{lookupError}</span>
                </div>
              )}
              <form onSubmit={handleFindOrder} className="space-y-6">
                <div>
                  <label htmlFor="return-order" className="block text-sm font-semibold text-gray-900 mb-2">
                    Order Number *
                  </label>
                  <input
                    id="return-order"
                    type="text"
                    value={orderNumber}
                    onChange={(e) => setOrderNumber(e.target.value)}
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-brand focus:border-brand"
                    placeholder="ORD-..."
                    required
                  />
                </div>

                <div>
                  <label htmlFor="return-email" className="block text-sm font-semibold text-gray-900 mb-2">
                    Email Address *
                  </label>
                  <input
                    id="return-email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-brand focus:border-brand"
                    placeholder="you@example.com"
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-brand hover:bg-brand-dark text-white py-4 rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  {isLoading ? 'Finding Order...' : 'Find Order'}
                </button>
              </form>

              <div className="mt-8 p-4 bg-brand-soft border border-brand/30 rounded-lg">
                <div className="flex items-start space-x-3">
                  <i className="ri-information-line text-xl text-brand mt-0.5"></i>
                  <div className="text-sm text-brand">
                    <p className="font-semibold mb-1">Return Policy Highlights</p>
                    <ul className="space-y-1">
                      <li>• Returns accepted within {RETURN_WINDOW_DAYS} days of delivery</li>
                      <li>• Items must be unused, sealed and in their original packaging</li>
                      <li>• We cover return delivery for defective or wrong items</li>
                      <li>• Refunds are sent to your Mobile Money within 5-7 business days after inspection</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 2 && foundOrder && (
            <div className="bg-white rounded-xl shadow-sm p-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">Select Items to Return</h2>

              <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-600">
                  Order #{foundOrder.orderNumber} • Placed on{' '}
                  {new Date(foundOrder.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
              </div>

              <div className="space-y-4 mb-8">
                {foundOrder.items.map((item) => {
                  const selected = selectedItems.includes(item.id);
                  return (
                    <div key={item.id} className={`border-2 rounded-lg p-4 ${selected ? 'border-brand' : 'border-gray-200'}`}>
                      <div className="flex items-start space-x-4">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleItemSelection(item.id)}
                          aria-label={`Return ${item.name}`}
                          className="mt-1 w-5 h-5 text-brand rounded border-gray-300 focus:ring-brand"
                        />
                        <div className="w-20 h-20 flex-shrink-0 bg-gray-100 rounded-lg overflow-hidden">
                          <img
                            src={item.image}
                            alt={item.name}
                            className="w-full h-full object-cover object-top"
                            onError={(e) => {
                              const img = e.currentTarget;
                              if (!img.src.endsWith(PLACEHOLDER)) img.src = PLACEHOLDER;
                            }}
                          />
                        </div>
                        <div className="flex-1">
                          <p className="font-semibold text-gray-900 mb-1">{item.name}</p>
                          {item.variantName && <p className="text-sm text-gray-500 mb-1">{item.variantName}</p>}
                          <p className="text-sm text-gray-600 mb-1">Ordered: {item.quantity}</p>
                          <p className="text-lg font-bold text-gray-900 mb-3">GH₵{item.unitPrice.toFixed(2)}</p>

                          {selected && (
                            <div className="mt-4 grid sm:grid-cols-[120px_1fr] gap-4">
                              <div>
                                <label htmlFor={`qty-${item.id}`} className="block text-sm font-semibold text-gray-900 mb-2">
                                  Quantity
                                </label>
                                <select
                                  id={`qty-${item.id}`}
                                  value={returnQuantities[item.id] || 1}
                                  onChange={(e) => setReturnQuantities({ ...returnQuantities, [item.id]: Number(e.target.value) })}
                                  className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-brand focus:border-brand pr-8"
                                >
                                  {Array.from({ length: item.quantity }, (_, i) => i + 1).map((n) => (
                                    <option key={n} value={n}>{n}</option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label htmlFor={`reason-${item.id}`} className="block text-sm font-semibold text-gray-900 mb-2">
                                  Reason for return *
                                </label>
                                <select
                                  id={`reason-${item.id}`}
                                  value={itemReasons[item.id] || ''}
                                  onChange={(e) => setItemReasons({ ...itemReasons, [item.id]: e.target.value })}
                                  className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-brand focus:border-brand pr-8"
                                  required
                                >
                                  <option value="">Select a reason</option>
                                  {reasons.map((reason) => (
                                    <option key={reason} value={reason}>{reason}</option>
                                  ))}
                                </select>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mb-8">
                <label htmlFor="overall-reason" className="block text-sm font-semibold text-gray-900 mb-2">
                  Summary of the problem *
                </label>
                <input
                  id="overall-reason"
                  type="text"
                  value={overallReason}
                  onChange={(e) => setOverallReason(e.target.value)}
                  maxLength={200}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-brand focus:border-brand"
                  placeholder="e.g. Shower gel arrived with a broken seal"
                />
              </div>

              <div className="mb-8">
                <label htmlFor="return-description" className="block text-sm font-semibold text-gray-900 mb-2">
                  Extra details <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <textarea
                  id="return-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={2000}
                  rows={4}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-brand focus:border-brand resize-none"
                  placeholder="Anything that helps us resolve this faster"
                />
              </div>

              <div className="flex space-x-4">
                <button
                  onClick={() => setStep(1)}
                  className="flex-1 py-4 border-2 border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-50 transition-colors whitespace-nowrap"
                >
                  Back
                </button>
                <button
                  onClick={() => setStep(3)}
                  disabled={!canContinue}
                  className="flex-1 py-4 bg-brand hover:bg-brand-dark text-white rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {step === 3 && foundOrder && (
            <div className="bg-white rounded-xl shadow-sm p-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">Review & Submit</h2>

              {submitError && (
                <div className="mb-6 p-4 bg-red-50 border border-red-100 text-red-700 rounded-lg text-sm flex items-start gap-2" role="alert">
                  <i className="ri-error-warning-line mt-0.5"></i>
                  <span>{submitError}</span>
                </div>
              )}

              <div className="mb-8">
                <h3 className="font-semibold text-gray-900 mb-4">Return Summary</h3>
                <div className="space-y-3">
                  {foundOrder.items
                    .filter((item) => selectedItems.includes(item.id))
                    .map((item) => (
                      <div key={item.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                        <div>
                          <p className="font-semibold text-gray-900">{item.name}{item.variantName ? ` — ${item.variantName}` : ''}</p>
                          <p className="text-sm text-gray-600">Qty {returnQuantities[item.id] || 1} • Reason: {itemReasons[item.id]}</p>
                        </div>
                        <p className="font-bold text-gray-900">GH₵{(item.unitPrice * (returnQuantities[item.id] || 1)).toFixed(2)}</p>
                      </div>
                    ))}
                  <div className="flex items-center justify-between px-4 pt-2 text-sm">
                    <span className="text-gray-600">Value of items in this request</span>
                    <span className="font-bold text-gray-900">GH₵{selectedTotal.toFixed(2)}</span>
                  </div>
                  <p className="px-4 text-sm text-gray-600">Problem: {overallReason}</p>
                </div>
              </div>

              <div className="mb-8 p-6 border-2 border-brand/30 bg-brand-soft rounded-lg">
                <h3 className="font-semibold text-gray-900 mb-4">Next Steps</h3>
                <ol className="space-y-2 text-sm text-gray-700">
                  <li className="flex items-start space-x-2">
                    <span className="font-bold">1.</span>
                    <span>Our team reviews your request and emails you within 2 business days</span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <span className="font-bold">2.</span>
                    <span>Keep the items unused and in their original packaging until then</span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <span className="font-bold">3.</span>
                    <span>We arrange a pickup or drop-off in Accra, or courier instructions elsewhere</span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <span className="font-bold">4.</span>
                    <span>Your refund is sent to Mobile Money within 5-7 business days after inspection</span>
                  </li>
                </ol>
              </div>

              <div className="flex space-x-4">
                <button
                  onClick={() => setStep(2)}
                  disabled={isLoading}
                  className="flex-1 py-4 border-2 border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-50 transition-colors whitespace-nowrap disabled:opacity-50"
                >
                  Back
                </button>
                <button
                  onClick={handleSubmitReturn}
                  disabled={isLoading}
                  className="flex-1 py-4 bg-brand hover:bg-brand-dark text-white rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  {isLoading ? 'Submitting...' : 'Submit Return Request'}
                </button>
              </div>

              <p className="mt-6 text-center text-sm text-gray-500">
                Questions first? <Link href="/contact" className="text-brand font-semibold hover:underline">Contact us</Link>
              </p>
            </div>
          )}
        </div>
      </main>
  );
}
