"use client";

import { useState } from 'react';

export default function NewsletterSection() {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitStatus('idle');

    try {
      await new Promise((resolve) => setTimeout(resolve, 800));
      setSubmitStatus('success');
      setEmail('');
    } catch {
      setSubmitStatus('error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="bg-white px-4 sm:px-8 pb-10 md:pb-14">
      <div className="max-w-[1400px] mx-auto rounded-3xl bg-black px-6 sm:px-10 py-12 md:py-16">
        <form
          onSubmit={handleSubmit}
          className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 lg:gap-10"
        >
          <div className="flex items-start gap-3 text-white max-w-md">
            <i className="ri-mail-line text-2xl text-brand-accent mt-0.5" aria-hidden />
            <div>
              <p className="text-[15px] sm:text-[18px] font-black uppercase tracking-tight">
                Stay in the loop
              </p>
              <p className="mt-1.5 text-[13px] sm:text-[14px] leading-relaxed text-white/65">
                Restocks, new drops, and deals — no spam, just what is worth knowing.
              </p>
            </div>
          </div>

          <div className="w-full max-w-sm flex items-stretch overflow-hidden rounded-2xl">
            <label htmlFor="insider-email" className="sr-only">Email address</label>
            <input
              id="insider-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              className="min-w-0 flex-1 bg-white px-4 py-4 text-[14px] text-black placeholder:text-black/40 focus:outline-none"
            />
            <button
              type="submit"
              disabled={isSubmitting}
              className="shrink-0 bg-brand-accent hover:bg-brand-accentDark text-black font-extrabold tracking-[0.12em] uppercase px-5 sm:px-6 py-4 text-[12px] disabled:opacity-70"
            >
              {isSubmitting ? '...' : 'Subscribe'}
            </button>
          </div>
        </form>
        {submitStatus === 'success' && (
          <p className="mt-4 text-sm text-brand-accent">Thanks — you are on the list.</p>
        )}
      </div>
    </section>
  );
}
