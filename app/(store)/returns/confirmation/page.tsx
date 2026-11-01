'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

interface ReturnRequest {
  id: string;
  status: string;
  reason: string;
  created_at: string;
  order_number: string;
  items: Array<{ quantity: number; reason: string | null; product_name: string; variant_name: string | null }>;
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Under review',
  approved: 'Approved',
  rejected: 'Not approved',
  processing: 'Processing',
  completed: 'Completed',
};

function ReturnConfirmationContent() {
  const searchParams = useSearchParams();
  const id = searchParams.get('id') || '';
  const order = searchParams.get('order') || '';

  const [request, setRequest] = useState<ReturnRequest | null>(null);
  const [loading, setLoading] = useState(Boolean(id && order));
  const [error, setError] = useState(id && order ? '' : 'This page needs a return request link. Open the link from your confirmation email or start a new return.');

  useEffect(() => {
    if (!id || !order) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/storefront/returns?id=${encodeURIComponent(id)}&order=${encodeURIComponent(order)}`);
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok || !json.success || !json.request) {
          setError(json.message || 'We could not find that return request.');
        } else {
          setRequest(json.request as ReturnRequest);
        }
      } catch {
        if (!cancelled) setError('Could not load the return request. Please check your connection.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, order]);

  return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center py-12">
        <div className="max-w-2xl mx-auto px-4 w-full">
          <div className="bg-white rounded-xl shadow-lg p-8 text-center">
            {loading ? (
              <div className="py-10">
                <i className="ri-loader-4-line animate-spin text-3xl text-brand"></i>
                <p className="mt-3 text-gray-500">Loading your return request...</p>
              </div>
            ) : error || !request ? (
              <>
                <div className="w-20 h-20 flex items-center justify-center bg-red-50 rounded-full mx-auto mb-6">
                  <i className="ri-error-warning-line text-4xl text-red-500"></i>
                </div>
                <h1 className="text-2xl font-bold text-gray-900 mb-4">Return request not found</h1>
                <p className="text-gray-600 mb-8" role="alert">{error}</p>
                <Link
                  href="/returns"
                  className="inline-block bg-brand hover:bg-brand-dark text-white px-8 py-3 rounded-lg font-semibold transition-colors whitespace-nowrap"
                >
                  Start a Return
                </Link>
              </>
            ) : (
              <>
                <div className="w-20 h-20 flex items-center justify-center bg-brand-soft rounded-full mx-auto mb-6">
                  <i className="ri-check-line text-4xl text-brand"></i>
                </div>

                <h1 className="text-3xl font-bold text-gray-900 mb-4">Return Request Submitted!</h1>
                <p className="text-gray-600 mb-2">We&apos;ve received your request for order {request.order_number}</p>
                <p className="text-sm text-gray-500 mb-2">
                  Reference: <span className="font-semibold">{request.id.slice(0, 8).toUpperCase()}</span>
                </p>
                <p className="text-sm text-gray-500 mb-8">
                  Submitted {new Date(request.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                  {' • '}
                  <span className="inline-block px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-semibold text-xs">
                    {STATUS_LABELS[request.status] || request.status}
                  </span>
                </p>

                <div className="mb-8 text-left">
                  <h2 className="font-bold text-gray-900 mb-3">Items in this request</h2>
                  <div className="space-y-2">
                    {request.items.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg text-sm">
                        <div>
                          <p className="font-semibold text-gray-900">
                            {item.product_name}{item.variant_name ? ` — ${item.variant_name}` : ''}
                          </p>
                          {item.reason && <p className="text-gray-600">{item.reason}</p>}
                        </div>
                        <span className="text-gray-700 font-semibold">× {item.quantity}</span>
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-sm text-gray-600">Problem: {request.reason}</p>
                </div>

                <div className="mb-8 p-6 bg-brand-soft border border-brand/30 rounded-xl text-left">
                  <h2 className="font-bold text-gray-900 mb-4 flex items-center">
                    <i className="ri-mail-line text-2xl text-brand mr-2"></i>
                    Check Your Email
                  </h2>
                  <p className="text-sm text-gray-700">
                    We&apos;ve sent a confirmation to the email on the order. Our team will review the request and email you the next steps within 2 business days.
                  </p>
                </div>

                <div className="mb-8 text-left">
                  <h2 className="font-bold text-gray-900 mb-4">What happens next?</h2>
                  <div className="space-y-4">
                    <div className="flex items-start space-x-4">
                      <div className="w-10 h-10 flex items-center justify-center bg-brand-soft rounded-full flex-shrink-0">
                        <span className="font-bold text-brand">1</span>
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">We review your request</p>
                        <p className="text-sm text-gray-600">You&apos;ll hear from us by email within 2 business days</p>
                      </div>
                    </div>

                    <div className="flex items-start space-x-4">
                      <div className="w-10 h-10 flex items-center justify-center bg-brand-soft rounded-full flex-shrink-0">
                        <span className="font-bold text-brand">2</span>
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">Keep the items ready</p>
                        <p className="text-sm text-gray-600">Unused, sealed and in their original packaging</p>
                      </div>
                    </div>

                    <div className="flex items-start space-x-4">
                      <div className="w-10 h-10 flex items-center justify-center bg-brand-soft rounded-full flex-shrink-0">
                        <span className="font-bold text-brand">3</span>
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">Hand the items back</p>
                        <p className="text-sm text-gray-600">We arrange a pickup or drop-off in Accra, or courier instructions elsewhere</p>
                      </div>
                    </div>

                    <div className="flex items-start space-x-4">
                      <div className="w-10 h-10 flex items-center justify-center bg-brand-soft rounded-full flex-shrink-0">
                        <span className="font-bold text-brand">4</span>
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">Get Your Refund</p>
                        <p className="text-sm text-gray-600">Sent to your Mobile Money within 5-7 business days after inspection</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <Link
                    href="/shop"
                    className="block w-full bg-brand hover:bg-brand-dark text-white py-4 rounded-lg font-semibold transition-colors whitespace-nowrap"
                  >
                    Continue Shopping
                  </Link>
                  <Link
                    href="/support/ticket"
                    className="block text-brand hover:text-brand-dark font-semibold whitespace-nowrap"
                  >
                    Need Help? Contact Support
                  </Link>
                </div>
              </>
            )}
          </div>

          {request && (
            <div className="mt-8 bg-amber-50 border border-amber-200 rounded-xl p-6">
              <div className="flex items-start space-x-3">
                <i className="ri-alert-line text-2xl text-amber-700 mt-0.5"></i>
                <div>
                  <p className="font-semibold text-amber-900 mb-2">Important Reminders</p>
                  <ul className="text-sm text-amber-800 space-y-1">
                    <li>• Keep this reference number and your order number for any follow-up</li>
                    <li>• Items must be unused with the original seals intact</li>
                    <li>• Refunds go to the Mobile Money number used at checkout</li>
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
  );
}

export default function ReturnConfirmationPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-gray-50 flex items-center justify-center">
          <i className="ri-loader-4-line animate-spin text-3xl text-brand"></i>
        </main>
      }
    >
      <ReturnConfirmationContent />
    </Suspense>
  );
}
