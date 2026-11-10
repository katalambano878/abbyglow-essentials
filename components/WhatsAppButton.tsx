'use client';

import { usePathname } from 'next/navigation';
import { SITE_PHONE, whatsAppUrl } from '@/lib/seo';

const PRESET_MESSAGE = "Hello AbbyGlow! I'd like to ask about a product.";

/**
 * Floating WhatsApp chat button for the home page. Sits above the mobile
 * bottom nav, pulses softly to draw the eye, and opens a chat with the store
 * number pre-filled. Mounted from the store layout so no animated wrapper
 * (transforms break position: fixed) sits between it and the viewport.
 */
export default function WhatsAppButton({ paths = ['/'] }: { paths?: string[] }) {
  const pathname = usePathname();
  if (!SITE_PHONE || !paths.includes(pathname)) return null;
  const href = `${whatsAppUrl(SITE_PHONE)}?text=${encodeURIComponent(PRESET_MESSAGE)}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with AbbyGlow on WhatsApp"
      className="wa-float fixed right-4 sm:right-6 z-40 block rounded-full bg-[#25D366] text-white shadow-[0_10px_30px_-8px_rgba(37,211,102,0.65)] transition-transform duration-200 ease-out hover:-translate-y-0.5 active:scale-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#25D366]/40"
    >
      <span className="relative grid h-14 w-14 place-items-center sm:h-16 sm:w-16">
        <span aria-hidden className="wa-ring absolute inset-0 rounded-full bg-[#25D366]" />
        <span aria-hidden className="wa-ring wa-ring-late absolute inset-0 rounded-full bg-[#25D366]" />
        <i className="ri-whatsapp-fill relative text-[30px] leading-none sm:text-[34px]" aria-hidden />
      </span>
    </a>
  );
}
