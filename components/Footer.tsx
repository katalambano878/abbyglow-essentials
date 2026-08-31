"use client";

import Link from 'next/link';
import { useState } from 'react';
import { useCMS } from '@/context/CMSContext';
import BrandLogo from './BrandLogo';

function FooterSection({ title, children }: { title: string, children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="border-b border-white/10 lg:border-none last:border-0">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between py-4 text-left lg:py-0 lg:cursor-default lg:mb-5"
      >
        <h4 className="font-extrabold text-[13px] uppercase tracking-[0.14em] text-white">{title}</h4>
        <i className={`ri-arrow-down-s-line text-brand-accent text-xl transition-transform duration-300 lg:hidden ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      <div className={`overflow-hidden transition-all duration-300 ${isOpen ? 'max-h-96 pb-6' : 'max-h-0 lg:max-h-full lg:overflow-visible'}`}>
        {children}
      </div>
    </div>
  );
}

export default function Footer() {
  const { getSetting } = useCMS();

  const siteName = getSetting('site_name') || 'AbbyGlow Essentials';
  const siteTagline = getSetting('site_tagline') || '';
  const contactAddress = getSetting('contact_address') || 'Accra, Ghana';
  const contactEmail = getSetting('contact_email');
  const contactPhone = getSetting('contact_phone');
  const socialInstagram = getSetting('social_instagram') || '';
  const socialTiktok = getSetting('social_tiktok') || '';
  const socialSnapchat = getSetting('social_snapchat') || '';

  const normalizeSocialUrl = (value: string, baseUrl?: string) => {
    const raw = value.trim();
    if (!raw || raw === '#') return baseUrl || '';
    if (/^https?:\/\//i.test(raw)) return raw;
    if (/^(mailto:|tel:)/i.test(raw)) return raw;
    if (baseUrl) return `${baseUrl}${raw.replace(/^@/, '')}`;
    return `https://${raw}`;
  };

  const socialLinks = [
    { link: normalizeSocialUrl(socialInstagram, 'https://instagram.com/'), icon: 'ri-instagram-line', label: 'Instagram' },
    { link: normalizeSocialUrl(socialTiktok, 'https://www.tiktok.com/@'), icon: 'ri-tiktok-fill', label: 'TikTok' },
    { link: normalizeSocialUrl(socialSnapchat, 'https://www.snapchat.com/add/'), icon: 'ri-snapchat-fill', label: 'Snapchat' },
  ].filter((social) => social.link);

  const linkClass = 'text-[13px] text-white/55 hover:text-brand-accent transition-colors';

  return (
    <footer className="relative z-0 bg-black text-white overflow-hidden">
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-[0.04] select-none">
        <span className="text-[18vw] font-black uppercase tracking-tighter">AbbyGlow</span>
      </div>

      <div className="relative pt-16 pb-10">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-10 lg:gap-8">
            <div className="lg:col-span-4 space-y-5">
              <BrandLogo inverted />
              <p className="text-white/55 leading-relaxed text-[14px] max-w-sm">
                {siteTagline || 'Electronics, beauty, home, fashion, and everyday essentials — delivered across Ghana.'}
              </p>
              {socialLinks.length > 0 && (
                <div className="flex gap-3 pt-1">
                  {socialLinks.map((social, i) => (
                    <a
                      key={i}
                      href={social.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={social.label}
                      className="w-10 h-10 border border-white/15 flex items-center justify-center text-white/70 hover:border-brand-accent hover:text-brand-accent transition-colors"
                    >
                      <i className={`${social.icon} text-lg`} />
                    </a>
                  ))}
                </div>
              )}
            </div>

            <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-3 gap-2 lg:gap-10">
              <FooterSection title="Shop">
                <ul className="space-y-3">
                  <li><Link href="/shop" className={linkClass}>All Products</Link></li>
                  <li><Link href="/shop?sort=new" className={linkClass}>New Arrivals</Link></li>
                  <li><Link href="/categories" className={linkClass}>Categories</Link></li>
                  <li><Link href="/order-tracking" className={linkClass}>Track Order</Link></li>
                </ul>
              </FooterSection>

              <FooterSection title="Customer Care">
                <ul className="space-y-3">
                  <li><Link href="/contact" className={linkClass}>Contact Us</Link></li>
                  <li><Link href="/faqs" className={linkClass}>FAQs</Link></li>
                  <li><Link href="/shipping" className={linkClass}>Shipping Policy</Link></li>
                  <li><Link href="/returns" className={linkClass}>Returns & Refunds</Link></li>
                </ul>
              </FooterSection>

              <FooterSection title="Company">
                <ul className="space-y-3">
                  <li><Link href="/about" className={linkClass}>About Us</Link></li>
                  <li><Link href="/privacy" className={linkClass}>Privacy Policy</Link></li>
                  <li><Link href="/terms" className={linkClass}>Terms & Conditions</Link></li>
                  {contactEmail && (
                    <li><a href={`mailto:${contactEmail}`} className={linkClass}>{contactEmail}</a></li>
                  )}
                  {contactPhone && (
                    <li><a href={`tel:${contactPhone}`} className={linkClass}>{contactPhone}</a></li>
                  )}
                  <li className={linkClass}>{contactAddress}</li>
                </ul>
              </FooterSection>
            </div>
          </div>
        </div>
      </div>

      <div className="relative border-t border-white/10">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-8 py-4 flex flex-col sm:flex-row justify-between items-center gap-3 text-[11px] font-bold uppercase tracking-wide text-white/45">
          <p>&copy; {new Date().getFullYear()} {siteName}</p>
          <div className="flex gap-4 text-white/50">
            <i className="ri-visa-line text-2xl" />
            <i className="ri-mastercard-line text-2xl" />
            <i className="ri-smartphone-line text-2xl" title="Mobile Money" />
          </div>
        </div>
      </div>
    </footer>
  );
}
