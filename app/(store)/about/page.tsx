'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState } from 'react';
import { useCMS } from '@/context/CMSContext';
import PageHero from '@/components/PageHero';
import { usePageTitle } from '@/hooks/usePageTitle';

export default function AboutPage() {
  usePageTitle('Our Story');
  const { getSetting } = useCMS();
  const [activeTab, setActiveTab] = useState('story');

  const siteName = getSetting('site_name') || 'AbbyGlow Essentials';

  const values = [
    {
      icon: 'ri-verified-badge-line',
      title: 'Quality Comes First',
      description: 'At AbbyGlow Essentials, quality comes first. We offer carefully selected products designed to deliver value, reliability, and a great shopping experience every time.'
    },
    {
      icon: 'ri-palette-line',
      title: 'Something for Everyone',
      description: 'From everyday essentials to special finds — whether you are shopping for yourself or your home, there is something made for you.'
    },
    {
      icon: 'ri-money-dollar-circle-line',
      title: 'Value Without Compromise',
      description: 'Our products give you the perfect balance of quality and value — all at competitive prices, so you never have to compromise.'
    },
    {
      icon: 'ri-truck-line',
      title: 'An Exceptional Experience',
      description: 'From the moment you shop to the moment your order arrives, we\u2019re committed to giving you an exceptional experience that keeps you coming back.'
    }
  ];

  return (
    <div className="min-h-screen bg-white">
      <PageHero
        title="More Than Just A Brand"
        subtitle="From Accra to your doorstep — shop quality products online at prices that make sense."
        backgroundImage="/about-hero.png"
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="flex justify-center mb-16 relative">
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent -z-10"></div>
          <div className="inline-flex items-center justify-center p-1.5 bg-white/60 backdrop-blur-md rounded-full border border-gray-200 shadow-sm">
            <button
              onClick={() => setActiveTab('story')}
              className={`relative px-8 py-2.5 rounded-full text-sm sm:text-base font-medium transition-all duration-500 ${activeTab === 'story'
                ? 'bg-gray-900 text-white shadow-md'
                : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100/50'
                }`}
            >
              Our Story
            </button>
            <button
              onClick={() => setActiveTab('mission')}
              className={`relative px-8 py-2.5 rounded-full text-sm sm:text-base font-medium transition-all duration-500 ${activeTab === 'mission'
                ? 'bg-gray-900 text-white shadow-md'
                : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100/50'
                }`}
            >
              Our Mission
            </button>
          </div>
        </div>

        {activeTab === 'story' && (
          <div className="grid lg:grid-cols-2 gap-16 lg:gap-24 items-center animate-in fade-in slide-in-from-bottom-8 duration-700">
            <div className="order-2 lg:order-1">
              <span className="inline-block py-1.5 px-4 rounded-full bg-brand-soft text-brand font-semibold text-xs tracking-widest uppercase mb-6 border border-brand/20">The Beginning</span>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-gray-900 mb-8 tracking-tight">How It All Started</h2>
              <div className="space-y-6 text-lg text-gray-500 leading-relaxed font-light">
                <p>
                  At <strong className="font-semibold text-gray-900">AbbyGlow Essentials</strong>, we believe great shopping starts with trust. Our online mall brings together quality products from trusted sellers — so you can shop with confidence, whether you are picking up everyday essentials or something special.
                </p>
                <p>
                  We carefully select every product for its quality and value, so you get items you can rely on at prices that make sense. Our goal is simple: to give you products you can trust and a shopping experience you&apos;ll always come back to.
                </p>
              </div>
            </div>
            <div className="order-1 lg:order-2 relative group md:px-8">
              {/* About image */}
              <div className="aspect-[4/5] sm:aspect-square lg:aspect-[3/4] rounded-[2.5rem] overflow-hidden bg-gradient-to-br from-gray-50 to-gray-100/50 relative flex items-center justify-center border border-gray-200 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.05)] transition-transform duration-1000 group-hover:scale-[1.02]">
                <Image
                  src="/about-story.png"
                  alt={`${siteName} about visual`}
                  fill
                  sizes="(min-width: 1024px) 480px, 70vw"
                  className="object-cover object-center"
                  priority
                />
              </div>

              {/* Decorative shadow blur element behind */}
              <div className="absolute -z-10 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[100%] h-[100%] bg-brand-soft/60 blur-3xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-1000 pointer-events-none"></div>
            </div>
          </div>
        )}

        {activeTab === 'mission' && (
          <div className="grid md:grid-cols-2 gap-8 lg:gap-12 animate-in fade-in slide-in-from-bottom-8 duration-700">
            {/* Card 1 */}
            <div className="group relative bg-white p-10 sm:p-14 rounded-[2.5rem] shadow-[0_8px_30px_rgb(0,0,0,0.03)] hover:shadow-[0_30px_60px_-15px_rgba(0,0,0,0.08)] transition-all duration-1000 overflow-hidden ring-1 ring-gray-900/5 hover:ring-gray-900/10 hover:-translate-y-1">
              {/* Subtle God-Level Background Glow */}
              <div className="absolute top-0 right-0 -mr-20 -mt-20 w-72 h-72 bg-brand-soft/60 rounded-full blur-[80px] opacity-0 group-hover:opacity-100 transition-opacity duration-1000 pointer-events-none z-0"></div>

              {/* Ultra-subtle watermark */}
              <div className="absolute top-0 right-0 p-8 opacity-0 group-hover:opacity-[0.02] transform translate-x-8 -translate-y-8 group-hover:translate-x-2 group-hover:-translate-y-2 group-hover:scale-[1.1] transition-all duration-1000 ease-out pointer-events-none z-0">
                <i className="ri-shield-check-fill text-[160px] text-gray-900 leading-none"></i>
              </div>

              <div className="relative z-10 w-16 h-16 bg-gradient-to-br from-gray-50 to-gray-50/50 group-hover:from-brand-soft/50 group-hover:to-brand-soft/50 rounded-2xl flex items-center justify-center mb-10 border border-gray-200/50 group-hover:border-brand/50 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.03)] group-hover:shadow-[0_8px_30px_-4px_rgba(59,130,246,0.12)] group-hover:-translate-y-1 transition-all duration-700 ease-out">
                <i className="ri-shield-check-line text-2xl text-gray-500 group-hover:text-brand transition-colors duration-700"></i>
              </div>

              <div className="relative z-10">
                <h3 className="text-2xl sm:text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-800 mb-5 tracking-tight group-hover:to-gray-600 transition-all duration-700">
                  Quality You Can Trust
                </h3>
                <p className="text-gray-500 text-[1.125rem] leading-[1.8] font-light group-hover:text-gray-600 transition-colors duration-700">
                  Every product in our collection is personally inspected before it reaches you. We source directly from trusted manufacturers and local suppliers to guarantee quality at every step.
                </p>
              </div>
            </div>

            {/* Card 2 */}
            <div className="group relative bg-white p-10 sm:p-14 rounded-[2.5rem] shadow-[0_8px_30px_rgb(0,0,0,0.03)] hover:shadow-[0_30px_60px_-15px_rgba(0,0,0,0.08)] transition-all duration-1000 overflow-hidden ring-1 ring-gray-900/5 hover:ring-gray-900/10 hover:-translate-y-1">
              {/* Subtle God-Level Background Glow */}
              <div className="absolute top-0 right-0 -mr-20 -mt-20 w-72 h-72 bg-amber-50/60 rounded-full blur-[80px] opacity-0 group-hover:opacity-100 transition-opacity duration-1000 pointer-events-none z-0"></div>

              {/* Ultra-subtle watermark */}
              <div className="absolute top-0 right-0 p-8 opacity-0 group-hover:opacity-[0.02] transform translate-x-8 -translate-y-8 group-hover:translate-x-2 group-hover:-translate-y-2 group-hover:scale-[1.1] transition-all duration-1000 ease-out pointer-events-none z-0">
                <i className="ri-price-tag-3-fill text-[160px] text-gray-900 leading-none"></i>
              </div>

              <div className="relative z-10 w-16 h-16 bg-gradient-to-br from-gray-50 to-gray-50/50 group-hover:from-amber-50/50 group-hover:to-amber-100/50 rounded-2xl flex items-center justify-center mb-10 border border-gray-200/50 group-hover:border-amber-200/50 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.03)] group-hover:shadow-[0_8px_30px_-4px_rgba(251,191,36,0.12)] group-hover:-translate-y-1 transition-all duration-700 ease-out">
                <i className="ri-price-tag-3-line text-2xl text-gray-500 group-hover:text-amber-600 transition-colors duration-700"></i>
              </div>

              <div className="relative z-10">
                <h3 className="text-2xl sm:text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-800 mb-5 tracking-tight group-hover:to-gray-600 transition-all duration-700">
                  Affordable Shopping For Everyone
                </h3>
                <p className="text-gray-500 text-[1.125rem] leading-[1.8] font-light group-hover:text-gray-600 transition-colors duration-700">
                  Whether you are shopping for yourself or looking for the perfect gift, {siteName} has you covered. We cut out the middleman by sourcing directly, so you get the best products at prices that make sense — delivered right to your doorstep across Ghana.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Values Section */}
      <div className="relative bg-gradient-to-b from-[#FAFAFA] to-white py-24 lg:py-32 overflow-hidden border-t border-gray-100">
        {/* Ambient Glow Effects */}
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-brand-soft/50 rounded-full blur-[120px] -translate-y-1/2 translate-x-1/3 pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-gray-100/50 rounded-full blur-[100px] translate-y-1/3 -translate-x-1/3 pointer-events-none"></div>

        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="text-center mb-20 flex flex-col items-center">
            <span className="inline-block py-1.5 px-5 rounded-full bg-white text-gray-600 font-bold text-[11px] tracking-[0.25em] uppercase mb-6 border border-gray-200/60 shadow-[0_2px_15px_-4px_rgba(0,0,0,0.05)]">The Standard</span>
            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-black text-gray-900 mb-6 tracking-tight">Why Shop With Us?</h2>
            <p className="text-lg sm:text-xl text-gray-500 max-w-2xl mx-auto font-light leading-relaxed">Carefully selected products at competitive prices — delivered across Ghana from our Accra online mall.</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8 max-w-7xl mx-auto">
            {values.map((value, index) => (
              <div
                key={index}
                className="group relative bg-white p-8 xl:p-10 rounded-[2.5rem] border border-gray-100 shadow-[0_8px_30px_rgb(0,0,0,0.03)] hover:shadow-[0_30px_60px_-15px_rgba(0,0,0,0.1)] transition-all duration-700 hover:-translate-y-2 overflow-hidden flex flex-col"
              >
                {/* Subtle Background Number */}
                <div className="absolute -top-12 -right-8 text-[180px] font-black text-gray-50 group-hover:text-[#FAFAFA] transition-colors duration-700 select-none pointer-events-none leading-none z-0">
                  {index + 1}
                </div>

                <div className="relative z-10 flex-col h-full flex">
                  <div className="w-16 h-16 bg-gradient-to-br from-white to-gray-50 rounded-2xl flex items-center justify-center mb-8 border border-gray-100 shadow-[0_4px_12px_-4px_rgba(0,0,0,0.05)] group-hover:scale-110 group-hover:-rotate-6 group-hover:shadow-[0_8px_20px_-6px_rgba(0,0,0,0.1)] transition-all duration-500">
                    <i className={`${value.icon} text-2xl text-gray-700 group-hover:text-black transition-colors duration-500`}></i>
                  </div>

                  <h3 className="text-xl xl:text-2xl font-bold text-gray-900 mb-4 tracking-tight drop-shadow-sm">{value.title}</h3>
                  <p className="text-gray-500 text-[15px] xl:text-base leading-relaxed font-light mb-10">{value.description}</p>

                  {/* Expanding interaction bar */}
                  <div className="mt-auto">
                    <div className="w-8 h-1 bg-gray-200 rounded-full group-hover:bg-gray-900 transition-all duration-700 ease-out group-hover:w-full"></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Premium CTA */}
      <div className="bg-white py-20 lg:py-32 px-4 sm:px-6 lg:px-8 flex justify-center">
        <div className="relative w-full max-w-6xl rounded-[3rem] overflow-hidden bg-gray-900 border border-gray-800 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.3)] group">
          {/* Subtle elegant glow effects */}
          <div className="absolute top-0 right-0 -m-32 w-96 h-96 bg-brand/30 rounded-full blur-[100px] pointer-events-none group-hover:bg-brand-dark/40 transition-colors duration-1000"></div>
          <div className="absolute bottom-0 left-0 -m-32 w-96 h-96 bg-brand/20 rounded-full blur-[100px] pointer-events-none group-hover:bg-brand-dark/30 transition-colors duration-1000"></div>

          {/* Glass Overlay */}
          <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent opacity-50 pointer-events-none"></div>

          <div className="relative z-10 px-6 py-20 sm:p-24 text-center">
            <span className="inline-flex items-center gap-2 py-1.5 px-4 rounded-full bg-white/10 text-gray-300 font-medium text-xs tracking-widest uppercase mb-8 border border-white/10 backdrop-blur-md">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-accent animate-pulse"></span>
              The Next Step
            </span>
            <h2 className="text-4xl sm:text-5xl lg:text-7xl font-black mb-6 text-white tracking-tight">
              Ready to shop <span className="text-transparent bg-clip-text bg-gradient-to-br from-brand-accent via-white to-brand-soft">smarter?</span>
            </h2>
            <p className="text-lg md:text-xl text-gray-400 mb-12 leading-relaxed max-w-2xl mx-auto font-light">
              Browse our curated collection of quality products from trusted sellers. Shop smarter from Accra to your doorstep.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/shop"
                className="group/btn relative inline-flex items-center justify-center gap-3 w-full sm:w-auto px-10 py-4 rounded-full bg-white text-gray-900 font-bold text-lg transition-all duration-500 hover:scale-105 shadow-[0_0_0_4px_rgba(255,255,255,0.05)] hover:shadow-[0_0_0_8px_rgba(255,255,255,0.1)]"
              >
                <span>Start Shopping</span>
                <i className="ri-arrow-right-line transition-transform duration-500 group-hover/btn:translate-x-1"></i>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
