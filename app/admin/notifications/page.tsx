'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

const BATCH_SIZE = 50;
/** The admin notifications route allows 20 requests/min — pause between batches so a campaign never trips it. */
const BATCH_PAUSE_MS = 3000;
const MAX_RETRIES = 3;

type Recipient = { email: string | null; phone: string | null; name: string | null };
type Progress = { batch: number; batches: number; email: number; sms: number; errors: number };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const isPlaceholderEmail = (email?: string | null) => /\.local$/i.test(email || '');
const normalizePhone = (p: string) => p.replace(/[\s\-().]+/g, '').replace(/^00/, '+');

export default function NotificationsPage() {
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState('');
    const [error, setError] = useState('');
    const [progress, setProgress] = useState<Progress | null>(null);
    const [presetEmails, setPresetEmails] = useState<string[]>([]);

    const [form, setForm] = useState({
        subject: '',
        message: '',
        channels: { email: true, sms: false },
        audience: 'all' as 'all' | 'selected'
    });

    // /admin/notifications?to=a@x.com,b@y.com (from the Customers page) preselects recipients.
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const to = params.get('to');
        if (to) {
            const emails = Array.from(new Set(
                to.split(',').map((e) => e.trim().toLowerCase()).filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
            ));
            if (emails.length > 0) {
                setPresetEmails(emails);
                setForm((prev) => ({ ...prev, audience: 'selected' }));
            }
        }
    }, []);

    const loadRecipients = async (): Promise<Recipient[]> => {
        const [{ data: customers, error: fetchError }, { data: profiles, error: profileError }] = await Promise.all([
            supabase.from('customers').select('email, phone, full_name, secondary_phone, secondary_email, user_id'),
            supabase.from('profiles').select('id, email, phone, full_name, role'),
        ]);
        if (fetchError && profileError) throw fetchError;

        const staffIds = new Set((profiles || []).filter((p) => p.role === 'admin' || p.role === 'staff').map((p) => p.id));

        const merged = [
            ...(customers || []).filter((c) => !(c.user_id && staffIds.has(c.user_id))),
            ...(profiles || [])
                .filter((profile) => profile.role === 'customer')
                .map((profile) => ({
                    email: profile.email,
                    phone: profile.phone,
                    full_name: profile.full_name,
                    secondary_phone: null,
                    secondary_email: null,
                })),
        ];

        const seenPhones = new Set<string>();
        const seenEmails = new Set<string>();
        const recipients: Recipient[] = [];
        const selected = form.audience === 'selected' ? new Set(presetEmails) : null;

        for (const c of merged) {
            const phones = [c.phone, c.secondary_phone].filter(Boolean).map((p: string) => normalizePhone(p));
            const emails = [c.email, c.secondary_email]
                .filter(Boolean)
                .map((e: string) => e.toLowerCase().trim())
                .filter((e) => !isPlaceholderEmail(e));

            if (selected && !emails.some((e) => selected.has(e))) continue;

            const uniquePhone = phones.find((p) => !seenPhones.has(p)) || null;
            const uniqueEmail = emails.find((e) => !seenEmails.has(e)) || null;
            phones.forEach((p) => seenPhones.add(p));
            emails.forEach((e) => seenEmails.add(e));

            const recipient: Recipient = { email: uniqueEmail, phone: uniquePhone, name: c.full_name };
            if (form.channels.sms && !form.channels.email && !recipient.phone) continue;
            if (form.channels.email && !form.channels.sms && !recipient.email) continue;
            if (!recipient.email && !recipient.phone) continue;
            recipients.push(recipient);
        }

        // Preselected addresses with no matching customer row still get the email.
        if (selected) {
            for (const email of selected) {
                if (!seenEmails.has(email) && form.channels.email) {
                    recipients.push({ email, phone: null, name: null });
                    seenEmails.add(email);
                }
            }
        }

        return recipients;
    };

    /** Sends one batch, retrying on 429 after the rate-limit reset. Returns the parsed response. */
    const sendBatch = async (batch: Recipient[], token: string, batchNumber: number) => {
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            const res = await fetch('/api/notifications', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    type: 'campaign',
                    payload: {
                        recipients: batch,
                        subject: form.subject,
                        message: form.message,
                        channels: form.channels,
                    }
                })
            });

            if (res.status === 429) {
                const resetHeader = res.headers.get('X-RateLimit-Reset') || res.headers.get('Retry-After');
                const resetSeconds = Math.min(Math.max(Number(resetHeader) || 60, 5), 120);
                if (attempt === MAX_RETRIES) {
                    throw new Error(`Batch ${batchNumber} was rate limited ${MAX_RETRIES} times — stopped. Wait a minute and resend to the remaining customers.`);
                }
                setError(`Rate limited on batch ${batchNumber}; waiting ${resetSeconds}s before retrying…`);
                await sleep(resetSeconds * 1000);
                setError('');
                continue;
            }

            const contentType = res.headers.get('content-type') || '';
            if (!contentType.includes('application/json')) {
                const text = await res.text();
                throw new Error(`Server error (batch ${batchNumber}): ${text.slice(0, 100)}`);
            }
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || data.message || `Batch ${batchNumber} failed (HTTP ${res.status})`);
            return data;
        }
        throw new Error(`Batch ${batchNumber} could not be sent.`);
    };

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        setSuccess('');
        setProgress(null);

        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.access_token) {
                throw new Error('You must be logged in as admin to send campaigns');
            }

            const recipients = await loadRecipients();
            if (recipients.length === 0) throw new Error('No recipients found with valid contact info');

            const smsCount = recipients.filter(r => r.phone).length;
            const emailCount = recipients.filter(r => r.email).length;
            const summary = [];
            if (form.channels.sms) summary.push(`${smsCount} SMS (deduplicated)`);
            if (form.channels.email) summary.push(`${emailCount} emails`);

            const audienceLabel = form.audience === 'selected' ? `${recipients.length} selected customer${recipients.length === 1 ? '' : 's'}` : 'all customers';
            if (!window.confirm(`This will send ${summary.join(' and ')} to ${audienceLabel}. Continue?`)) {
                setLoading(false);
                return;
            }

            const batches = Math.ceil(recipients.length / BATCH_SIZE);
            const totals = { email: 0, sms: 0, errors: 0 };

            for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
                const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
                setProgress({ batch: batchNumber, batches, ...totals });

                const data = await sendBatch(recipients.slice(i, i + BATCH_SIZE), session.access_token, batchNumber);

                const msg = String(data.message || '');
                const emailMatch = msg.match(/(\d+) emails?/);
                const smsMatch = msg.match(/(\d+) SMS/);
                const errorMatch = msg.match(/(\d+) failed/);
                if (emailMatch) totals.email += parseInt(emailMatch[1], 10);
                if (smsMatch) totals.sms += parseInt(smsMatch[1], 10);
                if (errorMatch) totals.errors += parseInt(errorMatch[1], 10);
                setProgress({ batch: batchNumber, batches, ...totals });

                if (i + BATCH_SIZE < recipients.length) await sleep(BATCH_PAUSE_MS);
            }

            const resultParts = [];
            if (totals.email > 0) resultParts.push(`${totals.email} emails`);
            if (totals.sms > 0) resultParts.push(`${totals.sms} SMS`);
            const errorNote = totals.errors > 0 ? ` (${totals.errors} failed)` : '';
            setSuccess(`Campaign sent to ${recipients.length} recipient${recipients.length === 1 ? '' : 's'} in ${batches} batch${batches === 1 ? '' : 'es'}: ${resultParts.join(', ') || 'nothing delivered'}.${errorNote}`);
            setForm(prev => ({ ...prev, subject: '', message: '' }));
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto">
            <h1 className="text-3xl font-bold text-gray-900 mb-6">Marketing & Notifications</h1>

            <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-200">
                <h2 className="text-xl font-semibold mb-6">Send New Campaign</h2>

                {success && <div className="bg-brand-soft text-brand p-4 rounded-lg mb-4">{success}</div>}
                {error && <div className="bg-red-50 text-red-700 p-4 rounded-lg mb-4">{error}</div>}
                {progress && loading && (
                    <div className="bg-gray-50 border border-gray-200 p-4 rounded-lg mb-4 text-sm text-gray-700">
                        <div className="flex items-center justify-between mb-2">
                            <span>Sending batch {progress.batch} of {progress.batches}</span>
                            <span>{progress.email} emails · {progress.sms} SMS · {progress.errors} failed</span>
                        </div>
                        <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div className="h-full bg-brand transition-all" style={{ width: `${Math.round((progress.batch / progress.batches) * 100)}%` }}></div>
                        </div>
                    </div>
                )}

                <form onSubmit={handleSend} className="space-y-6">
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">Audience</label>
                        <select
                            value={form.audience}
                            onChange={e => setForm({ ...form, audience: e.target.value as 'all' | 'selected' })}
                            className="w-full p-3 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-brand"
                        >
                            <option value="all">All Customers</option>
                            {presetEmails.length > 0 && (
                                <option value="selected">Selected customers ({presetEmails.length})</option>
                            )}
                            <option value="newsletter" disabled>Newsletter Subscribers (coming soon)</option>
                        </select>
                        {form.audience === 'selected' && (
                            <p className="text-xs text-gray-500 mt-2 break-words">To: {presetEmails.join(', ')}</p>
                        )}
                        {form.audience === 'all' && (
                            <p className="text-xs text-gray-500 mt-2">Registered customers and guest buyers. Staff accounts and walk-in placeholder addresses are skipped.</p>
                        )}
                    </div>

                    <div className="flex gap-6 p-4 bg-gray-50 rounded-lg border border-gray-100">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={form.channels.email}
                                onChange={e => setForm({ ...form, channels: { ...form.channels, email: e.target.checked } })}
                                className="w-5 h-5 text-brand rounded focus:ring-brand cursor-pointer"
                            />
                            <span className="font-medium text-gray-900">Send Email</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={form.channels.sms}
                                onChange={e => setForm({ ...form, channels: { ...form.channels, sms: e.target.checked } })}
                                className="w-5 h-5 text-brand rounded focus:ring-brand cursor-pointer"
                            />
                            <span className="font-medium text-gray-900">Send SMS</span>
                        </label>
                    </div>

                    {form.channels.email && (
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">Email Subject</label>
                            <input
                                type="text"
                                value={form.subject}
                                onChange={e => setForm({ ...form, subject: e.target.value })}
                                className="w-full p-3 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-brand"
                                placeholder="e.g., Summer Sale Starts Now!"
                                required={form.channels.email}
                            />
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">Message Content</label>
                        <textarea
                            value={form.message}
                            onChange={e => setForm({ ...form, message: e.target.value })}
                            className="w-full p-3 border border-gray-300 rounded-lg h-40 outline-none focus:ring-2 focus:ring-brand"
                            placeholder="Write your message here... For emails, this supports plain text."
                            required
                        />
                        <p className="text-sm text-gray-500 mt-1">This message will be used for the email body (wrapped in a template) and SMS content (if selected). Large audiences are sent in batches of {BATCH_SIZE} with a short pause between batches.</p>
                    </div>

                    <button
                        type="submit"
                        disabled={loading || (!form.channels.email && !form.channels.sms)}
                        className="w-full bg-brand text-white py-4 rounded-lg font-bold text-lg hover:bg-brand-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    >
                        {loading ? (
                            <span className="flex items-center justify-center">
                                <i className="ri-loader-4-line animate-spin mr-2"></i> Sending...
                            </span>
                        ) : 'Send Campaign'}
                    </button>
                </form>
            </div>
        </div>
    );
}
