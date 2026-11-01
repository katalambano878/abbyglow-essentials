'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { testSmsAction } from './actions';
import { supabase } from '@/lib/supabase';

export default function TestSmsPage() {
    const [isPending, startTransition] = useTransition();
    const [result, setResult] = useState<any>(null);
    const [phone, setPhone] = useState('024'); // Common start
    const [message, setMessage] = useState('Test message from AbbyGlow Essentials Admin');
    const [role, setRole] = useState<string | null>(null);
    const [checkingRole, setCheckingRole] = useState(true);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const { data: { session } } = await supabase.auth.getSession();
                if (!session?.user?.id) return;
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('role')
                    .eq('id', session.user.id)
                    .maybeSingle();
                if (!cancelled) setRole(profile?.role || null);
            } finally {
                if (!cancelled) setCheckingRole(false);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    const handleSend = () => {
        setResult(null);
        startTransition(async () => {
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token || '';
            const res = await testSmsAction(phone, message, token);
            setResult(res);
        });
    };

    if (checkingRole) {
        return <div className="p-6 text-gray-500">Checking access…</div>;
    }

    if (role !== 'admin') {
        return (
            <div className="p-6">
                <div className="bg-white p-8 rounded-lg shadow border border-gray-100 max-w-lg">
                    <div className="w-14 h-14 bg-amber-100 text-amber-700 rounded-full flex items-center justify-center mb-4">
                        <i className="ri-lock-2-line text-2xl"></i>
                    </div>
                    <h1 className="text-xl font-bold text-gray-900 mb-2">Admin only</h1>
                    <p className="text-gray-600 mb-4">The SMS debugger sends real messages through the live gateway and is limited to administrator accounts.</p>
                    <Link href="/admin" className="text-brand font-semibold hover:underline">Back to dashboard</Link>
                </div>
            </div>
        );
    }

    return (
        <div className="p-6">
            <h1 className="text-2xl font-bold mb-2">Test SMS Integration</h1>
            <p className="text-sm text-gray-500 mb-6">Sends through the same pipeline as order notifications (Taysend first, Moolre fallback). Limited to 5 test messages per 10 minutes.</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-lg shadow border border-gray-100">
                    <h2 className="text-lg font-semibold mb-4">Send Test Request</h2>

                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Phone Number
                            </label>
                            <input
                                type="text"
                                className="w-full border rounded-md p-2 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-brand outline-none"
                                placeholder="e.g. 024XXXXXXX"
                                value={phone}
                                onChange={(e) => setPhone(e.target.value)}
                            />
                            <p className="text-xs text-gray-500 mt-1">
                                Try local format (024...) to test auto-formatting (+23324...)
                            </p>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Message
                            </label>
                            <textarea
                                className="w-full border rounded-md p-2 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-brand outline-none h-24"
                                placeholder="Type your message..."
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                            />
                        </div>

                        <button
                            onClick={handleSend}
                            disabled={isPending}
                            className={`w-full py-2 px-4 rounded-md text-white font-medium transition-colors ${isPending
                                    ? 'bg-gray-400 cursor-not-allowed'
                                    : 'bg-brand hover:bg-brand-dark'
                                }`}
                        >
                            {isPending ? 'Sending...' : 'Send SMS'}
                        </button>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-lg shadow border border-gray-100">
                    <h2 className="text-lg font-semibold mb-4">Response & Debug Log</h2>

                    {result ? (
                        <div className="space-y-3">
                            <div className={`rounded-md px-3 py-2 text-sm font-medium ${result.success ? 'bg-brand-soft text-brand' : 'bg-red-50 text-red-700'}`}>
                                {result.success ? 'Message accepted by the gateway' : result.error || 'Message was not sent'}
                            </div>
                            <div className="bg-gray-900 text-gray-100 p-4 rounded-md font-mono text-sm overflow-auto max-h-[500px]">
                                <pre>{JSON.stringify(result, null, 2)}</pre>
                            </div>
                        </div>
                    ) : (
                        <div className="h-full flex items-center justify-center text-gray-400 border-2 border-dashed rounded-md min-h-[200px]">
                            Waiting for response...
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
