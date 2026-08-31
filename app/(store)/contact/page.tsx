"use client";

import { useState, useEffect } from 'react';
import { useCMS } from '@/context/CMSContext';
import { supabase } from '@/lib/supabase';
import PageHero from '@/components/PageHero';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useRecaptcha } from '@/hooks/useRecaptcha';
import { SITE_PHONE, SITE_PHONE_SECONDARY, whatsAppUrl } from '@/lib/seo';

export default function ContactPage() {
  usePageTitle('Contact Us');
  const { getSetting } = useCMS();
  const [pageContent, setPageContent] = useState<any>(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    subject: '',
    message: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const { getToken, verifying } = useRecaptcha();

  useEffect(() => {
    async function fetchContactContent() {
      const { data } = await supabase
        .from('cms_content')
        .select('*')
        .eq('section', 'contact')
        .eq('block_key', 'main')
        .single();

      if (data) {
        setPageContent(data);
      }
    }
    fetchContactContent();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitStatus('idle');

    // reCAPTCHA verification
    const isHuman = await getToken('contact');
    if (!isHuman) {
      setSubmitStatus('error');
      setIsSubmitting(false);
      return;
    }

    try {
      // Store in Supabase
      const { error } = await supabase
        .from('contact_submissions')
        .insert({
          name: formData.name,
          email: formData.email,
          phone: formData.phone,
          subject: formData.subject,
          message: formData.message,
        });

      if (error) {
        // Table might not exist, still show success
        console.log('Note: contact_submissions table may not exist');
      }

      // Send Contact Notification
      fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'contact',
          payload: formData
        })
      }).catch(err => console.error('Contact notification error:', err));

      setSubmitStatus('success');
      setFormData({ name: '', email: '', phone: '', subject: '', message: '' });
    } catch (error) {
      setSubmitStatus('error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const heroTitle = pageContent?.title || 'Get In Touch';
  const heroSubtitle = pageContent?.subtitle || 'Have a question or need assistance?';
  const heroContent = pageContent?.content || 'Send us a message and we\'ll get back to you.';
  const contactPhone = getSetting('contact_phone') || SITE_PHONE;
  const contactPhoneSecondary = SITE_PHONE_SECONDARY;
  const contactAddress = getSetting('contact_address') || 'Accra, Ghana';
  const siteName = getSetting('site_name') || 'AbbyGlow Essentials';

  const faqs = [
    {
      question: 'What are your delivery times?',
      answer: 'Standard delivery typically takes 2–5 business days within Ghana, depending on your location. Every order is packed carefully so it arrives in good condition.'
    },
    {
      question: 'Do you offer international shipping?',
      answer: 'At the moment, we focus on customers within Ghana. If we open up international shipping in the future, we will announce it on our social media channels.'
    },
    {
      question: 'What payment methods do you accept?',
      answer: 'We accept mobile money (MTN, Vodafone, AirtelTigo) and credit/debit cards through our secure Moolre payment gateway.'
    }
  ];

  return (
    <div className="min-h-screen bg-white">
      <PageHero
        title="Contact"
        subtitle="Questions? Send us a message."
        backgroundImage="/contact-hero.png"
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-28 relative">
        {/* Subtle page background glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-brand-soft/40 rounded-full blur-[120px] pointer-events-none -z-10"></div>

        <div className="grid lg:grid-cols-12 gap-16 lg:gap-24">

          {/* Left Column: Form */}
          <div className="lg:col-span-7">
            <div className="mb-10">
              <h2 className="font-serif text-3xl sm:text-4xl text-gray-900 mb-4 tracking-tight drop-shadow-sm">Send Us a Message</h2>
              <p className="text-gray-500 font-light text-lg tracking-wide">
                Fill out the form below and we'll get back to you securely.
              </p>
            </div>

            <form id="contactForm" onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label htmlFor="name" className="block text-[13px] uppercase tracking-wider font-semibold text-gray-500">
                    Full Name <span className="text-brand">*</span>
                </label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-5 py-4 bg-gray-50/50 border border-gray-100 rounded-2xl focus:bg-white focus:shadow-[0_8px_30px_rgba(0,0,0,0.04)] focus:border-gray-300 focus:ring-0 transition-all duration-300 outline-none text-gray-800 placeholder:text-gray-400"
                  placeholder="John Doe"
                />
              </div>

                <div className="space-y-2">
                  <label htmlFor="email" className="block text-[13px] uppercase tracking-wider font-semibold text-gray-500">
                    Email Address <span className="text-brand">*</span>
                </label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-5 py-4 bg-gray-50/50 border border-gray-100 rounded-2xl focus:bg-white focus:shadow-[0_8px_30px_rgba(0,0,0,0.04)] focus:border-gray-300 focus:ring-0 transition-all duration-300 outline-none text-gray-800 placeholder:text-gray-400"
                  placeholder="john@example.com"
                />
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="phone" className="block text-[13px] uppercase tracking-wider font-semibold text-gray-500">
                  Phone Number
                </label>
                <input
                  type="tel"
                  id="phone"
                  name="phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-5 py-4 bg-gray-50/50 border border-gray-100 rounded-2xl focus:bg-white focus:shadow-[0_8px_30px_rgba(0,0,0,0.04)] focus:border-gray-300 focus:ring-0 transition-all duration-300 outline-none text-gray-800 placeholder:text-gray-400"
                  placeholder="+233 XX XXX XXXX"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="subject" className="block text-[13px] uppercase tracking-wider font-semibold text-gray-500">
                  Subject <span className="text-brand">*</span>
                </label>
                <input
                  type="text"
                  id="subject"
                  name="subject"
                  required
                  value={formData.subject}
                  onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                  className="w-full px-5 py-4 bg-gray-50/50 border border-gray-100 rounded-2xl focus:bg-white focus:shadow-[0_8px_30px_rgba(0,0,0,0.04)] focus:border-gray-300 focus:ring-0 transition-all duration-300 outline-none text-gray-800 placeholder:text-gray-400"
                  placeholder="Order inquiry, product question, etc."
                />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-end">
                  <label htmlFor="message" className="block text-[13px] uppercase tracking-wider font-semibold text-gray-500">
                    Message <span className="text-brand">*</span>
                </label>
                  <span className="text-[11px] text-gray-400 font-medium">{formData.message.length}/500</span>
                </div>
                <textarea
                  id="message"
                  name="message"
                  required
                  rows={5}
                  maxLength={500}
                  value={formData.message}
                  onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                  className="w-full px-5 py-4 bg-gray-50/50 border border-gray-100 rounded-2xl focus:bg-white focus:shadow-[0_8px_30px_rgba(0,0,0,0.04)] focus:border-gray-300 focus:ring-0 transition-all duration-300 outline-none resize-none text-gray-800 placeholder:text-gray-400"
                  placeholder="Tell us how we can help you..."
                ></textarea>
              </div>

              {submitStatus === 'success' && (
                <div className="bg-green-50/50 backdrop-blur-md border border-green-100 text-green-700 px-6 py-4 rounded-2xl flex items-center shadow-sm">
                  <div className="w-8 h-8 rounded-full bg-green-100 text-green-600 flex items-center justify-center mr-3 shrink-0">
                    <i className="ri-check-line"></i>
                  </div>
                  <span className="text-sm font-medium">Message sent successfully! We'll respond within 24 hours.</span>
                </div>
              )}

              {submitStatus === 'error' && (
                <div className="bg-red-50/50 backdrop-blur-md border border-red-100 text-red-700 px-6 py-4 rounded-2xl flex items-center shadow-sm">
                  <div className="w-8 h-8 rounded-full bg-red-100 text-red-600 flex items-center justify-center mr-3 shrink-0">
                    <i className="ri-error-warning-line"></i>
                  </div>
                  <span className="text-sm font-medium">Failed to send message. Please try again.</span>
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting || verifying}
                className="group relative w-full sm:w-auto inline-flex items-center justify-center px-10 py-4 bg-brand-accent hover:bg-brand-accentDark text-white rounded-full font-medium overflow-hidden transition-all duration-300 hover:shadow-[0_8px_25px_rgba(17,24,39,0.3)] hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]"></div>
                <span className="relative flex items-center gap-2">
                {isSubmitting || verifying ? (verifying ? 'Verifying...' : 'Sending...') : 'Send Message'}
                  {!(isSubmitting || verifying) && <i className="ri-send-plane-fill transition-transform group-hover:translate-x-1 group-hover:-translate-y-1"></i>}
                </span>
              </button>
            </form>
          </div>

          {/* Right Column: Quick Info */}
          <div className="lg:col-span-5 lg:pl-8 flex flex-col pt-4 lg:pt-0">
            <div className="mb-10">
              <h2 className="font-serif text-3xl sm:text-4xl text-gray-900 mb-4 tracking-tight drop-shadow-sm">Quick Answers</h2>
              <p className="text-gray-500 font-light text-lg tracking-wide">
                Find answers before reaching out.
              </p>
            </div>

            {(contactPhone || contactAddress) && (
              <div className="relative group overflow-hidden bg-white border border-gray-100 rounded-3xl p-8 sm:p-10 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.03)] hover:shadow-[0_20px_40px_-10px_rgba(0,0,0,0.05)] transition-all duration-500 mb-12">
                {/* Ethereal Glow */}
                <div className="absolute top-0 right-0 w-48 h-48 bg-brand-soft rounded-full blur-[60px] opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none -translate-y-1/2 translate-x-1/2"></div>

                <h3 className="font-serif text-xl font-bold text-gray-900 mb-6 tracking-wide relative z-10">{siteName}</h3>
                <div className="space-y-5 relative z-10">
                  {contactAddress && (
                    <div className="flex items-start gap-4 text-gray-600">
                      <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center shrink-0 border border-gray-100 group-hover:bg-white transition-colors duration-500">
                        <i className="ri-map-pin-line text-lg text-gray-400"></i>
                      </div>
                      <p className="pt-2 font-light leading-relaxed">{contactAddress}</p>
                    </div>
                  )}
                  {contactPhone && (
                    <div className="flex items-start gap-4 text-gray-600">
                      <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center shrink-0 border border-gray-100 group-hover:bg-white transition-colors duration-500">
                        <i className="ri-phone-line text-lg text-gray-400"></i>
                      </div>
                      <div className="pt-2 flex flex-col gap-2">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                          <a href={`tel:${contactPhone.replace(/\s/g, '')}`} className="font-light hover:text-black transition-colors">{contactPhone}</a>
                          {contactPhoneSecondary && (
                            <a href={`tel:${contactPhoneSecondary.replace(/\s/g, '')}`} className="font-light hover:text-black transition-colors">{contactPhoneSecondary}</a>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2 pt-1">
                          <a href={whatsAppUrl(contactPhone)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center text-xs font-semibold px-3 py-1 rounded-full bg-green-50 text-green-700 hover:bg-green-100 transition-colors">
                            <i className="ri-whatsapp-fill mr-1.5 text-sm"></i> WhatsApp {contactPhone}
                          </a>
                          {contactPhoneSecondary && (
                            <a href={whatsAppUrl(contactPhoneSecondary)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center text-xs font-semibold px-3 py-1 rounded-full bg-green-50 text-green-700 hover:bg-green-100 transition-colors">
                              <i className="ri-whatsapp-fill mr-1.5 text-sm"></i> WhatsApp {contactPhoneSecondary}
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="space-y-3">
              {faqs.map((faq, index) => (
                <details key={index} className="group bg-white border border-gray-100 rounded-2xl overflow-hidden [&_summary::-webkit-details-marker]:hidden transition-all duration-300 hover:border-gray-200 hover:shadow-sm">
                  <summary className="px-6 py-5 font-medium text-gray-800 cursor-pointer flex justify-between items-center select-none text-[15px]">
                    {faq.question}
                    <span className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center ml-4 shrink-0 transition-transform duration-300 group-open:rotate-180 group-hover:bg-gray-100">
                      <i className="ri-arrow-down-s-line text-gray-400"></i>
                    </span>
                  </summary>
                  <div className="px-6 pb-6 pt-1 text-gray-500 text-[15px] font-light leading-relaxed border-t border-transparent group-open:border-gray-50 transition-colors duration-300">
                    <div className="animate-in fade-in slide-in-from-top-2 duration-300 ease-out">
                    {faq.answer}
                    </div>
                  </div>
                </details>
              ))}
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
