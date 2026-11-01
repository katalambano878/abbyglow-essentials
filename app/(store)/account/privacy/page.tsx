'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function PrivacySettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [checking, setChecking] = useState(true);

  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleteReason, setDeleteReason] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [ticketNumber, setTicketNumber] = useState<string | number | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (!data.session) {
        router.replace('/auth/login?next=/account/privacy');
        return;
      }
      setUser(data.session.user);
      setChecking(false);
    });
    return () => {
      cancelled = true;
    };
  }, [router]);

  const handleExportData = async () => {
    if (!user) return;
    setExporting(true);
    setExportMessage(null);
    try {
      const [profileRes, ordersRes, addressesRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
        supabase
          .from('orders')
          .select('*, order_items(*)')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),
        supabase.from('addresses').select('*').eq('user_id', user.id),
      ]);

      const failed = [profileRes, ordersRes, addressesRes].find((r) => r.error);
      if (failed?.error) throw failed.error;

      const exportData = {
        exported_at: new Date().toISOString(),
        account: {
          id: user.id,
          email: user.email,
          created_at: user.created_at,
          first_name: user.user_metadata?.first_name ?? null,
          last_name: user.user_metadata?.last_name ?? null,
          phone: user.user_metadata?.phone ?? user.phone ?? null,
          newsletter: user.user_metadata?.newsletter ?? null,
        },
        profile: profileRes.data ?? null,
        orders: ordersRes.data ?? [],
        addresses: addressesRes.data ?? [],
      };

      const dataStr = JSON.stringify(exportData, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(dataBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `abbyglow-data-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setExportMessage({ type: 'success', text: 'Your data file has been downloaded.' });
    } catch (err: any) {
      setExportMessage({ type: 'error', text: err?.message || 'Could not export your data right now.' });
    } finally {
      setExporting(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!user || deleteConfirmText !== 'DELETE') return;
    setDeleting(true);
    setDeleteError('');
    try {
      const { data, error } = await supabase
        .from('support_tickets')
        .insert({
          email: user.email,
          subject: 'Account deletion request',
          category: 'account',
          description: deleteReason.trim() || 'Customer requested deletion of their account and personal data.',
        })
        .select('ticket_number')
        .single();
      if (error) throw error;
      setTicketNumber(data?.ticket_number ?? null);
      setShowDeleteConfirm(false);
      setDeleteConfirmText('');
    } catch (err: any) {
      setDeleteError(err?.message || 'Could not submit the request. Please try again.');
    } finally {
      setDeleting(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <i className="ri-loader-4-line animate-spin text-4xl text-brand"></i>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <Link href="/account" className="w-9 h-9 flex items-center justify-center hover:bg-gray-100 rounded-lg transition-colors" aria-label="Back to account">
              <i className="ri-arrow-left-line text-xl"></i>
            </Link>
            <div>
              <h1 className="text-xl font-bold">Privacy & Data</h1>
              <p className="text-sm text-gray-600">Manage your personal information</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-4 space-y-6">
        <div className="bg-brand-soft border border-brand/30 rounded-xl p-4">
          <div className="flex gap-3">
            <i className="ri-shield-check-line text-xl text-brand flex-shrink-0 mt-0.5"></i>
            <div>
              <h3 className="font-semibold text-brand-dark mb-1">Your Privacy Matters</h3>
              <p className="text-sm text-brand">
                You can download everything we hold about your account, or ask us to delete it. Signed in as {user?.email}.
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border p-6 space-y-6">
          <div>
            <h2 className="text-lg font-bold mb-4">Data Export</h2>
            <div className="bg-gray-50 rounded-lg p-4 mb-4">
              <h3 className="font-semibold mb-2 flex items-center gap-2">
                <i className="ri-download-cloud-line text-lg"></i>
                Download Your Data
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                Get a copy of your profile, orders and saved addresses as a JSON file.
              </p>
              <button
                onClick={handleExportData}
                disabled={exporting}
                className="px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed font-medium whitespace-nowrap"
              >
                {exporting ? (
                  <>
                    <i className="ri-loader-4-line animate-spin mr-2"></i>
                    Preparing Export...
                  </>
                ) : (
                  <>
                    <i className="ri-download-line mr-2"></i>
                    Export My Data
                  </>
                )}
              </button>
              {exportMessage && (
                <p className={`mt-3 text-sm ${exportMessage.type === 'success' ? 'text-green-700' : 'text-red-600'}`} role="status">
                  {exportMessage.text}
                </p>
              )}
            </div>

            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="font-semibold mb-2">What's Included?</h3>
              <ul className="space-y-2 text-sm text-gray-600">
                <li className="flex items-start gap-2">
                  <i className="ri-check-line text-green-600 mt-0.5 flex-shrink-0"></i>
                  <span>Account details (name, email, phone)</span>
                </li>
                <li className="flex items-start gap-2">
                  <i className="ri-check-line text-green-600 mt-0.5 flex-shrink-0"></i>
                  <span>Order history with the items in each order</span>
                </li>
                <li className="flex items-start gap-2">
                  <i className="ri-check-line text-green-600 mt-0.5 flex-shrink-0"></i>
                  <span>Saved delivery addresses</span>
                </li>
              </ul>
            </div>
          </div>

          <div className="border-t pt-6">
            <h2 className="text-lg font-bold mb-4 text-red-600">Danger Zone</h2>
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <h3 className="font-semibold text-red-900 mb-2 flex items-center gap-2">
                <i className="ri-delete-bin-line text-lg"></i>
                Delete Account
              </h3>
              <p className="text-sm text-red-800 mb-4">
                Ask our team to delete your account and personal data. We review every request by hand and confirm by email before anything is removed.
              </p>

              {ticketNumber !== null ? (
                <div className="bg-white rounded-lg p-4 border border-green-200 text-sm text-gray-700" role="status">
                  <p className="font-semibold text-green-800 mb-1">
                    <i className="ri-checkbox-circle-line mr-1"></i>
                    Request received — ticket #{ticketNumber}
                  </p>
                  <p>
                    We&apos;ll email {user?.email} within 2 business days to confirm the deletion. You can follow the request on your{' '}
                    <Link href="/support/tickets" className="text-brand font-medium hover:underline">support tickets</Link> page.
                  </p>
                </div>
              ) : !showDeleteConfirm ? (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium whitespace-nowrap"
                >
                  Request Account Deletion
                </button>
              ) : (
                <div className="space-y-4">
                  <div className="bg-white rounded-lg p-4 border border-red-300">
                    <h4 className="font-semibold text-red-900 mb-2">Before You Continue:</h4>
                    <ul className="space-y-2 text-sm text-gray-700 mb-4">
                      <li className="flex items-start gap-2">
                        <i className="ri-alert-line text-red-600 mt-0.5 flex-shrink-0"></i>
                        <span>Your profile, addresses and wishlist will be removed</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <i className="ri-alert-line text-red-600 mt-0.5 flex-shrink-0"></i>
                        <span>Orders are kept for our records but unlinked from you</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <i className="ri-alert-line text-red-600 mt-0.5 flex-shrink-0"></i>
                        <span>Once confirmed, this cannot be reversed</span>
                      </li>
                    </ul>

                    <div className="mb-4">
                      <label htmlFor="delete-reason" className="block text-sm font-medium mb-2 text-gray-900">
                        Reason <span className="text-gray-400 font-normal">(optional)</span>
                      </label>
                      <textarea
                        id="delete-reason"
                        value={deleteReason}
                        onChange={(e) => setDeleteReason(e.target.value)}
                        rows={3}
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                        placeholder="Tell us why you're leaving"
                      />
                    </div>

                    <div className="mb-4">
                      <label htmlFor="delete-confirm" className="block text-sm font-medium mb-2 text-gray-900">
                        Type <span className="font-bold">DELETE</span> to confirm:
                      </label>
                      <input
                        id="delete-confirm"
                        type="text"
                        value={deleteConfirmText}
                        onChange={(e) => setDeleteConfirmText(e.target.value)}
                        placeholder="DELETE"
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                      />
                    </div>

                    {deleteError && (
                      <p className="mb-4 text-sm text-red-600" role="alert">{deleteError}</p>
                    )}

                    <div className="flex gap-3">
                      <button
                        onClick={() => {
                          setShowDeleteConfirm(false);
                          setDeleteConfirmText('');
                          setDeleteError('');
                        }}
                        className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium whitespace-nowrap"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleDeleteAccount}
                        disabled={deleteConfirmText !== 'DELETE' || deleting}
                        className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed font-medium whitespace-nowrap"
                      >
                        {deleting ? (
                          <>
                            <i className="ri-loader-4-line animate-spin mr-2"></i>
                            Sending...
                          </>
                        ) : (
                          'Submit Deletion Request'
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border p-6">
          <h2 className="text-lg font-bold mb-4">Your Privacy Rights</h2>
          <div className="space-y-4 text-sm text-gray-700">
            <div className="flex gap-3">
              <i className="ri-eye-line text-lg text-gray-400 flex-shrink-0"></i>
              <div>
                <h3 className="font-semibold mb-1">Right to Access</h3>
                <p className="text-gray-600">You can request and download all your personal data at any time.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <i className="ri-edit-line text-lg text-gray-400 flex-shrink-0"></i>
              <div>
                <h3 className="font-semibold mb-1">Right to Rectification</h3>
                <p className="text-gray-600">You can update and correct your personal information in account settings.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <i className="ri-delete-bin-line text-lg text-gray-400 flex-shrink-0"></i>
              <div>
                <h3 className="font-semibold mb-1">Right to Erasure</h3>
                <p className="text-gray-600">You can request deletion of your account and personal data.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <i className="ri-file-shield-line text-lg text-gray-400 flex-shrink-0"></i>
              <div>
                <h3 className="font-semibold mb-1">Right to Data Portability</h3>
                <p className="text-gray-600">Export your data in a structured, machine-readable format.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-gray-100 rounded-xl p-4">
          <p className="text-sm text-gray-600 text-center">
            Questions about privacy? Read our{' '}
            <Link href="/privacy" className="text-black font-medium hover:underline">
              Privacy Policy
            </Link>
            {' '}or{' '}
            <Link href="/contact" className="text-black font-medium hover:underline">
              contact support
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
