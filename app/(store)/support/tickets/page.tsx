'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

type TicketStatus = 'open' | 'in_progress' | 'waiting_customer' | 'resolved' | 'closed';

interface Ticket {
  id: string;
  ticket_number: string | number;
  subject: string;
  description: string;
  category: string;
  status: TicketStatus;
  priority: string;
  created_at: string;
  updated_at: string;
  metadata: { order_number?: string | null } | null;
}

const CATEGORY_LABELS: Record<string, string> = {
  order: 'Order Issue',
  delivery: 'Delivery Problem',
  return: 'Return Request',
  payment: 'Payment Issue',
  product: 'Product Question',
  account: 'Account Help',
  other: 'Other',
};

const FILTERS: Array<{ id: 'all' | TicketStatus; label: string }> = [
  { id: 'all', label: 'All Tickets' },
  { id: 'open', label: 'Open' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'resolved', label: 'Resolved' },
  { id: 'closed', label: 'Closed' },
];

export default function MyTicketsPage() {
  const [selectedFilter, setSelectedFilter] = useState<'all' | TicketStatus>('all');
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(true);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [closingId, setClosingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;
      if (!session) {
        setSignedIn(false);
        setLoading(false);
        return;
      }
      const { data, error: qError } = await supabase
        .from('support_tickets')
        .select('id, ticket_number, subject, description, category, status, priority, created_at, updated_at, metadata')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false });
      if (cancelled) return;
      if (qError) {
        setError(qError.message || 'Could not load your tickets.');
      } else {
        setTickets((data || []) as Ticket[]);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const closeTicket = async (id: string) => {
    setClosingId(id);
    setActionError('');
    try {
      const { error: pError } = await supabase
        .from('support_tickets')
        .update({ status: 'closed' })
        .eq('id', id);
      if (pError) throw pError;
      setTickets((prev) => prev.map((t) => (t.id === id ? { ...t, status: 'closed', updated_at: new Date().toISOString() } : t)));
    } catch (err: any) {
      setActionError(err?.message || 'Could not close the ticket.');
    } finally {
      setClosingId(null);
    }
  };

  const counts = tickets.reduce<Record<string, number>>((acc, t) => {
    acc[t.status] = (acc[t.status] || 0) + 1;
    return acc;
  }, {});

  const filteredTickets = selectedFilter === 'all'
    ? tickets
    : tickets.filter(ticket => ticket.status === selectedFilter);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open': return 'bg-brand-soft text-brand';
      case 'in_progress': return 'bg-amber-100 text-amber-700';
      case 'waiting_customer': return 'bg-purple-100 text-purple-700';
      case 'resolved': return 'bg-green-100 text-green-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <main className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">My Support Tickets</h1>
            <p className="text-gray-600">Track and manage your support requests</p>
          </div>
          <Link
            href="/support/ticket"
            className="bg-brand hover:bg-brand-dark text-white px-6 py-3 rounded-lg font-semibold transition-colors whitespace-nowrap text-center"
          >
            <i className="ri-add-line mr-2"></i>
            New Ticket
          </Link>
        </div>

        {loading ? (
          <div className="bg-white rounded-xl shadow-sm p-12 text-center">
            <i className="ri-loader-4-line animate-spin text-3xl text-brand"></i>
            <p className="mt-2 text-gray-500">Loading your tickets...</p>
          </div>
        ) : !signedIn ? (
          <div className="bg-white rounded-xl shadow-sm p-12 text-center">
            <div className="w-20 h-20 flex items-center justify-center bg-gray-100 rounded-full mx-auto mb-6">
              <i className="ri-lock-line text-4xl text-gray-400"></i>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Sign in to see your tickets</h2>
            <p className="text-gray-600 mb-6">Tickets are linked to your account. Sign in to track them here, or create a new ticket without an account.</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                href="/auth/login?next=/support/tickets"
                className="inline-block bg-brand hover:bg-brand-dark text-white px-6 py-3 rounded-lg font-semibold transition-colors whitespace-nowrap"
              >
                Sign In
              </Link>
              <Link
                href="/support/ticket"
                className="inline-block border-2 border-gray-300 text-gray-700 px-6 py-3 rounded-lg font-semibold hover:bg-gray-50 transition-colors whitespace-nowrap"
              >
                Create a Ticket
              </Link>
            </div>
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-100 rounded-xl p-8 text-center text-red-700" role="alert">
            <i className="ri-error-warning-line text-3xl"></i>
            <p className="mt-2 font-semibold">Could not load your tickets</p>
            <p className="text-sm mt-1">{error}</p>
          </div>
        ) : (
          <>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 mb-6">
              <div className="flex border-b border-gray-200 overflow-x-auto">
                {FILTERS.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setSelectedFilter(f.id)}
                    className={`px-6 py-4 font-semibold whitespace-nowrap border-b-2 transition-colors ${
                      selectedFilter === f.id
                        ? 'border-brand text-brand'
                        : 'border-transparent text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    {f.label} ({f.id === 'all' ? tickets.length : counts[f.id] || 0})
                  </button>
                ))}
              </div>
            </div>

            {actionError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-100 text-red-700 rounded-lg text-sm" role="alert">{actionError}</div>
            )}

            {filteredTickets.length === 0 ? (
              <div className="bg-white rounded-xl shadow-sm p-12 text-center">
                <div className="w-20 h-20 flex items-center justify-center bg-gray-100 rounded-full mx-auto mb-6">
                  <i className="ri-ticket-line text-4xl text-gray-400"></i>
                </div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">No tickets found</h2>
                <p className="text-gray-600 mb-6">
                  {tickets.length === 0 ? "You don't have any support tickets yet" : 'No tickets match this filter'}
                </p>
                <Link
                  href="/support/ticket"
                  className="inline-block bg-brand hover:bg-brand-dark text-white px-6 py-3 rounded-lg font-semibold transition-colors whitespace-nowrap"
                >
                  {tickets.length === 0 ? 'Create Your First Ticket' : 'Create a Ticket'}
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredTickets.map((ticket) => {
                  const expanded = expandedId === ticket.id;
                  const canClose = !['closed', 'resolved'].includes(ticket.status);
                  return (
                    <div
                      key={ticket.id}
                      className={`bg-white rounded-xl shadow-sm p-6 border-2 transition-all ${expanded ? 'border-brand' : 'border-transparent hover:border-gray-200'}`}
                    >
                      <button
                        type="button"
                        onClick={() => setExpandedId(expanded ? null : ticket.id)}
                        aria-expanded={expanded}
                        className="w-full text-left"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-3 mb-2">
                              <h3 className="text-xl font-bold text-gray-900">{ticket.subject}</h3>
                              <span className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${getStatusColor(ticket.status)}`}>
                                {ticket.status.replace(/_/g, ' ').toUpperCase()}
                              </span>
                            </div>
                            <p className="text-gray-600 mb-3">
                              {CATEGORY_LABELS[ticket.category] || ticket.category || 'General'} • Ticket #{ticket.ticket_number}
                              {ticket.metadata?.order_number ? ` • Order ${ticket.metadata.order_number}` : ''}
                            </p>
                            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-gray-500">
                              <div className="flex items-center space-x-2">
                                <i className="ri-calendar-line"></i>
                                <span>Created {formatDate(ticket.created_at)}</span>
                              </div>
                              <div className="flex items-center space-x-2">
                                <i className="ri-time-line"></i>
                                <span>Updated {formatDate(ticket.updated_at || ticket.created_at)}</span>
                              </div>
                            </div>
                          </div>
                          <i className={`ri-arrow-${expanded ? 'up' : 'down'}-s-line text-2xl text-gray-400 flex-shrink-0`}></i>
                        </div>
                      </button>

                      {expanded && (
                        <div className="mt-5 pt-5 border-t border-gray-100">
                          <p className="text-sm font-semibold text-gray-900 mb-2">Your message</p>
                          <p className="text-gray-700 whitespace-pre-wrap">{ticket.description || 'No description provided.'}</p>
                          <div className="mt-5 flex flex-col sm:flex-row gap-3">
                            {canClose && (
                              <button
                                onClick={() => closeTicket(ticket.id)}
                                disabled={closingId === ticket.id}
                                className="px-5 py-2.5 border-2 border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-50 transition-colors disabled:opacity-50 whitespace-nowrap"
                              >
                                {closingId === ticket.id ? 'Closing...' : 'Close ticket'}
                              </button>
                            )}
                            <Link
                              href="/contact"
                              className="px-5 py-2.5 text-brand font-semibold hover:text-brand-dark whitespace-nowrap"
                            >
                              Need to add something? Contact us
                            </Link>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        <div className="mt-8 grid md:grid-cols-3 gap-6">
          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="w-12 h-12 flex items-center justify-center bg-brand-soft rounded-lg mb-4">
              <i className="ri-time-line text-2xl text-brand"></i>
            </div>
            <h3 className="font-bold text-gray-900 mb-2">Response Time</h3>
            <p className="text-2xl font-bold text-brand mb-1">24 hours</p>
            <p className="text-sm text-gray-600">We reply by email</p>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="w-12 h-12 flex items-center justify-center bg-brand-soft rounded-lg mb-4">
              <i className="ri-whatsapp-line text-2xl text-brand"></i>
            </div>
            <h3 className="font-bold text-gray-900 mb-2">Urgent?</h3>
            <p className="text-sm text-gray-600 mb-2">Message us on WhatsApp for same-day help with an order.</p>
            <Link href="/contact" className="text-brand font-semibold hover:underline">Contact options</Link>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="w-12 h-12 flex items-center justify-center bg-purple-100 rounded-lg mb-4">
              <i className="ri-customer-service-line text-2xl text-purple-700"></i>
            </div>
            <h3 className="font-bold text-gray-900 mb-2">Support Hours</h3>
            <p className="text-2xl font-bold text-purple-700 mb-1">Mon–Sat</p>
            <p className="text-sm text-gray-600">9am – 7pm, Accra time</p>
          </div>
        </div>
      </div>
    </main>
  );
}
