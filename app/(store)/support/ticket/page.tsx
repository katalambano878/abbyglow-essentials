'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useRecaptcha } from '@/hooks/useRecaptcha';

export default function SupportTicketPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    orderNumber: '',
    category: 'order',
    subject: '',
    description: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [ticketNumber, setTicketNumber] = useState<string | number | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const { getToken, verifying } = useRecaptcha();

  // Prefill from the session when the visitor is signed in.
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled || !data.session) return;
      const u = data.session.user;
      setSignedIn(true);
      setFormData((prev) => ({
        ...prev,
        email: prev.email || u.email || '',
        name:
          prev.name ||
          [u.user_metadata?.first_name, u.user_metadata?.last_name].filter(Boolean).join(' ') ||
          u.user_metadata?.full_name ||
          '',
      }));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const categories = [
    { value: 'order', label: 'Order Issue', icon: 'ri-shopping-bag-line' },
    { value: 'delivery', label: 'Delivery Problem', icon: 'ri-truck-line' },
    { value: 'return', label: 'Return Request', icon: 'ri-arrow-left-right-line' },
    { value: 'payment', label: 'Payment Issue', icon: 'ri-bank-card-line' },
    { value: 'product', label: 'Product Question', icon: 'ri-gift-line' },
    { value: 'account', label: 'Account Help', icon: 'ri-user-line' },
    { value: 'other', label: 'Other', icon: 'ri-question-line' }
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');

    const email = formData.email.trim();
    if (!email || !/\S+@\S+\.\S+/.test(email)) {
      setSubmitError('Please enter a valid email address so we can reply to you.');
      return;
    }
    if (!formData.subject.trim() || !formData.description.trim()) {
      setSubmitError('Please add a subject and describe the issue.');
      return;
    }

    setIsSubmitting(true);
    try {
      const isHuman = await getToken('support_ticket');
      if (!isHuman) {
        setSubmitError('Security verification failed. Please try again.');
        return;
      }

      const orderNumber = formData.orderNumber.trim();
      const { data, error } = await supabase
        .from('support_tickets')
        .insert({
          email,
          subject: formData.subject.trim(),
          description: formData.description.trim(),
          category: formData.category,
          metadata: {
            order_number: orderNumber || null,
            name: formData.name.trim() || null,
          },
        })
        .select('ticket_number')
        .single();

      if (error) throw error;
      setTicketNumber(data?.ticket_number ?? null);
    } catch (err: any) {
      setSubmitError(err?.message || 'Could not submit your ticket. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (ticketNumber !== null) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center py-12">
        <div className="max-w-md mx-auto px-4 text-center">
          <div className="bg-white rounded-xl shadow-lg p-8">
            <div className="w-20 h-20 flex items-center justify-center bg-brand-soft rounded-full mx-auto mb-6">
              <i className="ri-check-line text-4xl text-brand"></i>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Ticket Created!</h2>
            <p className="text-gray-600 mb-2">
              Your support ticket has been submitted successfully.
            </p>
            <p className="text-sm text-gray-500 mb-6">
              Ticket #{ticketNumber}
            </p>
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                We&apos;ll reply to {formData.email} within 24 hours.
              </p>
              {signedIn ? (
                <Link
                  href="/support/tickets"
                  className="block bg-brand hover:bg-brand-dark text-white py-3 rounded-lg font-semibold transition-colors whitespace-nowrap"
                >
                  View My Tickets
                </Link>
              ) : (
                <p className="text-xs text-gray-500">
                  Keep this ticket number — quote it if you follow up by email or WhatsApp.
                </p>
              )}
              <Link
                href="/help"
                className="block text-brand hover:text-brand-dark font-semibold whitespace-nowrap"
              >
                Back to Help Center
              </Link>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-4xl mx-auto px-4">
        <Link
          href="/help"
          className="inline-flex items-center text-brand hover:text-brand-dark font-semibold mb-6 whitespace-nowrap"
        >
          <i className="ri-arrow-left-line mr-2"></i>
          Back to Help Center
        </Link>

        <div className="bg-white rounded-xl shadow-sm p-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Create Support Ticket</h1>
            <p className="text-gray-600">
              Fill out the form below and our team will get back to you within 24 hours
            </p>
          </div>

          {submitError && (
            <div className="mb-6 p-4 bg-red-50 border border-red-100 text-red-700 rounded-lg text-sm flex items-start gap-2" role="alert">
              <i className="ri-error-warning-line mt-0.5"></i>
              <span>{submitError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <label htmlFor="ticket-name" className="block text-sm font-semibold text-gray-900 mb-2">
                  Your Name
                </label>
                <input
                  id="ticket-name"
                  type="text"
                  autoComplete="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-brand focus:border-brand"
                  placeholder="John Doe"
                />
              </div>

              <div>
                <label htmlFor="ticket-email" className="block text-sm font-semibold text-gray-900 mb-2">
                  Email Address *
                </label>
                <input
                  id="ticket-email"
                  type="email"
                  autoComplete="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-brand focus:border-brand"
                  placeholder="you@example.com"
                  required
                />
              </div>
            </div>

            <div>
              <label htmlFor="ticket-order" className="block text-sm font-semibold text-gray-900 mb-2">
                Order Number (if applicable)
              </label>
              <input
                id="ticket-order"
                type="text"
                value={formData.orderNumber}
                onChange={(e) => setFormData({ ...formData, orderNumber: e.target.value })}
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-brand focus:border-brand"
                placeholder="ORD-..."
              />
            </div>

            <div>
              <p className="block text-sm font-semibold text-gray-900 mb-3">
                What can we help you with? *
              </p>
              <div className="grid md:grid-cols-2 gap-3">
                {categories.map((cat) => (
                  <button
                    key={cat.value}
                    type="button"
                    onClick={() => setFormData({ ...formData, category: cat.value })}
                    aria-pressed={formData.category === cat.value}
                    className={`p-4 rounded-lg border-2 text-left transition-all ${
                      formData.category === cat.value
                        ? 'border-brand bg-brand-soft'
                        : 'border-gray-300 hover:border-gray-400'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <i className={`${cat.icon} text-2xl ${
                        formData.category === cat.value ? 'text-brand' : 'text-gray-400'
                      }`}></i>
                      <span className="font-semibold text-gray-900">{cat.label}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="ticket-subject" className="block text-sm font-semibold text-gray-900 mb-2">
                Subject *
              </label>
              <input
                id="ticket-subject"
                type="text"
                value={formData.subject}
                onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-brand focus:border-brand"
                placeholder="Brief description of your issue"
                required
                maxLength={150}
              />
            </div>

            <div>
              <label htmlFor="ticket-description" className="block text-sm font-semibold text-gray-900 mb-2">
                Description *
              </label>
              <textarea
                id="ticket-description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-brand focus:border-brand h-32 resize-none"
                placeholder="Please provide as much detail as possible..."
                required
                maxLength={1000}
              />
              <p className="text-sm text-gray-500 mt-1">
                {formData.description.length}/1000 characters
              </p>
            </div>

            <div className="flex space-x-4 pt-6">
              <button
                type="button"
                onClick={() => router.push('/help')}
                className="flex-1 py-4 border-2 border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-50 transition-colors whitespace-nowrap"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || verifying}
                className="flex-1 py-4 bg-brand hover:bg-brand-dark text-white rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
              >
                {isSubmitting || verifying ? (
                  <>
                    <i className="ri-loader-4-line animate-spin mr-2"></i>
                    Submitting...
                  </>
                ) : (
                  'Submit Ticket'
                )}
              </button>
            </div>
          </form>
        </div>

        <div className="mt-8 bg-brand-soft border border-brand/30 rounded-xl p-6">
          <div className="flex items-start space-x-3">
            <i className="ri-information-line text-2xl text-brand mt-0.5"></i>
            <div>
              <p className="font-semibold text-brand-dark mb-2">Before submitting a ticket</p>
              <ul className="text-sm text-brand space-y-1">
                <li>• Check our <Link href="/help" className="underline hover:text-brand-dark">Help Center</Link> for quick answers</li>
                <li>• Average response time: 24 hours</li>
                <li>• Include your order number for faster assistance</li>
                <li>• For product issues, send photos by WhatsApp after you get your ticket number</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
