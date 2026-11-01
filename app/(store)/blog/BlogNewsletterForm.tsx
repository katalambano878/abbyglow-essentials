'use client';

import { useState } from 'react';

interface Props {
  source: string;
  /** 'sidebar' = stacked inputs on grey card; 'banner' = inline on brand gradient. */
  variant?: 'sidebar' | 'banner';
}

export default function BlogNewsletterForm({ source, variant = 'sidebar' }: Props) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed || !/\S+@\S+\.\S+/.test(trimmed)) {
      setStatus('error');
      setMessage('Please enter a valid email address.');
      return;
    }
    setStatus('loading');
    setMessage('');
    try {
      const res = await fetch('/api/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed, source }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.success) {
        setStatus('success');
        setMessage(json.message || "You're subscribed. Watch your inbox for new articles.");
        setEmail('');
      } else {
        setStatus('error');
        setMessage(json.message || 'Could not subscribe right now. Please try again.');
      }
    } catch {
      setStatus('error');
      setMessage('Could not subscribe right now. Please check your connection.');
    }
  };

  if (variant === 'banner') {
    return (
      <div className="max-w-md mx-auto">
        <form onSubmit={handleSubmit} className="flex gap-3">
          <label htmlFor={`newsletter-${source}`} className="sr-only">Email address</label>
          <input
            id={`newsletter-${source}`}
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Your email address"
            className="flex-1 min-w-0 px-6 py-4 rounded-full text-gray-900 focus:ring-2 focus:ring-white outline-none"
            required
          />
          <button
            type="submit"
            disabled={status === 'loading'}
            className="bg-white text-brand px-8 py-4 rounded-full font-medium hover:bg-brand-soft transition-colors whitespace-nowrap disabled:opacity-60"
          >
            {status === 'loading' ? 'Sending...' : 'Subscribe'}
          </button>
        </form>
        {message && (
          <p className={`mt-4 text-sm ${status === 'success' ? 'text-white' : 'text-amber-100'}`} role="status">
            {message}
          </p>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <label htmlFor={`newsletter-${source}`} className="sr-only">Email address</label>
      <input
        id={`newsletter-${source}`}
        type="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Your email address"
        className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-brand focus:border-transparent text-sm"
        required
      />
      <button
        type="submit"
        disabled={status === 'loading'}
        className="w-full bg-brand text-white py-3 rounded-xl font-medium hover:bg-brand-dark transition-colors whitespace-nowrap disabled:opacity-60"
      >
        {status === 'loading' ? 'Sending...' : 'Subscribe'}
      </button>
      {message && (
        <p className={`text-sm ${status === 'success' ? 'text-green-700' : 'text-red-600'}`} role="status">
          {message}
        </p>
      )}
    </form>
  );
}
