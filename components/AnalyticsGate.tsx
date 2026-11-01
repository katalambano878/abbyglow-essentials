'use client';

import { useEffect, useState } from 'react';
import Script from 'next/script';
import { COOKIE_CONSENT_EVENT, readCookieConsent } from './CookieConsent';

interface Props {
  measurementId?: string;
}

/**
 * Loads Google Analytics only after the visitor has accepted analytics
 * cookies. Listens for the consent event so acceptance in this session takes
 * effect without a reload. Once injected, gtag stays for the page lifetime;
 * a later "essential only" choice applies from the next page load.
 */
export default function AnalyticsGate({ measurementId }: Props) {
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    if (!measurementId) return;
    const sync = () => {
      const consent = readCookieConsent();
      if (consent?.analytics) setAllowed(true);
    };
    sync();
    window.addEventListener(COOKIE_CONSENT_EVENT, sync);
    return () => window.removeEventListener(COOKIE_CONSENT_EVENT, sync);
  }, [measurementId]);

  if (!measurementId || !allowed) return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`}
        strategy="afterInteractive"
      />
      <Script id="google-analytics" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${measurementId}', {
            page_path: window.location.pathname,
            anonymize_ip: true,
          });
        `}
      </Script>
    </>
  );
}
