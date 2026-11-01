'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

export const COOKIE_CONSENT_KEY = 'cookieConsent';
export const COOKIE_CONSENT_EVENT = 'cookie-consent-changed';

export interface CookieConsentValue {
  analytics: boolean;
  timestamp: string;
}

/** Read the stored choice; null when the visitor has not decided yet. */
export function readCookieConsent(): CookieConsentValue | null {
  try {
    const raw = localStorage.getItem(COOKIE_CONSENT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || typeof parsed.analytics !== 'boolean') return null;
    return { analytics: parsed.analytics, timestamp: String(parsed.timestamp || '') };
  } catch {
    return null;
  }
}

function writeCookieConsent(analytics: boolean) {
  const value: CookieConsentValue = { analytics, timestamp: new Date().toISOString() };
  try {
    localStorage.setItem(COOKIE_CONSENT_KEY, JSON.stringify(value));
  } catch {
    // storage unavailable (private mode) — the choice still applies for this page view
  }
  window.dispatchEvent(new CustomEvent(COOKIE_CONSENT_EVENT, { detail: value }));
}

export default function CookieConsent() {
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    if (readCookieConsent()) return;
    const timer = setTimeout(() => setShowBanner(true), 1000);
    return () => clearTimeout(timer);
  }, []);

  const acceptAll = () => {
    writeCookieConsent(true);
    setShowBanner(false);
  };

  const essentialOnly = () => {
    writeCookieConsent(false);
    setShowBanner(false);
  };

  if (!showBanner) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 bg-white border-t-4 border-brand shadow-2xl z-[9999] animate-slide-up text-left"
      role="region"
      aria-label="Cookie consent"
    >
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-start space-x-4 flex-1">
            <div className="w-12 h-12 flex items-center justify-center bg-brand-soft rounded-lg flex-shrink-0">
              <i className="ri-cookie-line text-2xl text-brand"></i>
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900 mb-2 normal-case tracking-normal">We Value Your Privacy</h3>
              <p className="text-sm text-gray-600 leading-relaxed normal-case tracking-normal font-normal">
                Essential cookies keep your cart and sign-in working. With your permission we also use analytics cookies to see which pages are useful.{' '}
                <Link href="/privacy" className="text-brand hover:text-brand-dark font-medium whitespace-nowrap">
                  Read our Privacy Policy
                </Link>
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
            <button
              onClick={essentialOnly}
              className="px-6 py-3 border-2 border-gray-300 hover:border-gray-400 text-gray-700 rounded-lg font-semibold transition-colors whitespace-nowrap normal-case tracking-normal"
            >
              Essential only
            </button>
            <button
              onClick={acceptAll}
              className="px-6 py-3 rounded-lg font-semibold transition-colors whitespace-nowrap bg-brand-accent hover:bg-brand-accentDark text-white normal-case tracking-normal"
            >
              Accept all
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
