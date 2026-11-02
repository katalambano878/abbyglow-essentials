'use client';

import { useEffect, useState } from 'react';
import { adminFetch } from '@/lib/admin-fetch';
import { DEFAULT_DELIVERY_RATES, type DeliveryRates } from '@/lib/shipping';

type Form = { accra: string; outsideAccra: string; freeThreshold: string };

const toForm = (r: DeliveryRates): Form => ({
  accra: r.accra.toFixed(2),
  outsideAccra: r.outsideAccra.toFixed(2),
  freeThreshold: r.freeThreshold > 0 ? r.freeThreshold.toFixed(2) : '0',
});

export default function AdminDeliveryFeesPage() {
  const [form, setForm] = useState<Form>(toForm(DEFAULT_DELIVERY_RATES));
  const [saved, setSaved] = useState<DeliveryRates | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await adminFetch<{ rates: DeliveryRates }>('/api/admin/delivery-rates');
        if (cancelled) return;
        setSaved(res.rates);
        setForm(toForm(res.rates));
      } catch (err: any) {
        if (!cancelled) setNotice({ type: 'error', text: `Could not load delivery fees: ${err?.message || 'unknown error'}` });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const update = (key: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    setNotice(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      accra: Number(form.accra),
      outsideAccra: Number(form.outsideAccra),
      freeThreshold: Number(form.freeThreshold || 0),
    };
    for (const [k, v] of Object.entries(payload)) {
      if (!Number.isFinite(v) || v < 0) {
        setNotice({ type: 'error', text: `Enter a valid amount (0 or more) for ${k === 'accra' ? 'Accra doorstep delivery' : k === 'outsideAccra' ? 'Outside Accra delivery' : 'the free delivery threshold'}.` });
        return;
      }
    }
    setSaving(true);
    setNotice(null);
    try {
      const res = await adminFetch<{ rates: DeliveryRates }>('/api/admin/delivery-rates', {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      setSaved(res.rates);
      setForm(toForm(res.rates));
      setNotice({ type: 'success', text: 'Delivery fees saved. New checkouts and POS sales use them right away.' });
    } catch (err: any) {
      setNotice({ type: 'error', text: `Could not save: ${err?.message || 'unknown error'}` });
    } finally {
      setSaving(false);
    }
  };

  const fee = (n: number) => (n > 0 ? `GH₵ ${n.toFixed(2)}` : 'Free');

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Delivery Fees</h1>
        <p className="text-gray-600 mt-1">
          What customers pay for each delivery option at checkout and in the POS. Store pickup is always free.
        </p>
      </div>

      {notice && (
        <div
          role="status"
          className={`p-4 rounded-lg border flex items-start space-x-3 ${notice.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}
        >
          <i className={`${notice.type === 'success' ? 'ri-checkbox-circle-line' : 'ri-error-warning-line'} text-xl mt-0.5`}></i>
          <p className="text-sm">{notice.text}</p>
        </div>
      )}

      <form onSubmit={handleSave} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-6">
        {loading ? (
          <p className="text-gray-500 flex items-center"><i className="ri-loader-4-line animate-spin mr-2"></i>Loading current fees...</p>
        ) : (
          <>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <label htmlFor="fee-accra" className="block text-sm font-semibold text-gray-900 mb-2">
                  Doorstep Delivery (Accra)
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 text-sm">GH₵</span>
                  <input
                    id="fee-accra"
                    type="number"
                    min={0}
                    step="0.01"
                    inputMode="decimal"
                    value={form.accra}
                    onChange={update('accra')}
                    className="w-full pl-14 pr-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-brand focus:border-brand"
                    required
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">Rider delivery to an address within Accra.</p>
              </div>
              <div>
                <label htmlFor="fee-outside" className="block text-sm font-semibold text-gray-900 mb-2">
                  Outside Accra Delivery
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 text-sm">GH₵</span>
                  <input
                    id="fee-outside"
                    type="number"
                    min={0}
                    step="0.01"
                    inputMode="decimal"
                    value={form.outsideAccra}
                    onChange={update('outsideAccra')}
                    className="w-full pl-14 pr-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-brand focus:border-brand"
                    required
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">Courier delivery to any other region in Ghana.</p>
              </div>
            </div>

            <div>
              <label htmlFor="fee-threshold" className="block text-sm font-semibold text-gray-900 mb-2">
                Free delivery on orders from
              </label>
              <div className="relative md:w-1/2">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 text-sm">GH₵</span>
                <input
                  id="fee-threshold"
                  type="number"
                  min={0}
                  step="0.01"
                  inputMode="decimal"
                  value={form.freeThreshold}
                  onChange={update('freeThreshold')}
                  className="w-full pl-14 pr-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-brand focus:border-brand"
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">Leave at 0 to always charge delivery. Applies to both delivery options.</p>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pt-2 border-t border-gray-100">
              {saved && (
                <p className="text-sm text-gray-600">
                  Live now: Accra {fee(saved.accra)} · Outside Accra {fee(saved.outsideAccra)}
                  {saved.freeThreshold > 0 ? ` · free from GH₵ ${saved.freeThreshold.toFixed(2)}` : ''}
                </p>
              )}
              <button
                type="submit"
                disabled={saving}
                className="px-6 py-3 bg-brand hover:bg-brand-dark text-white rounded-lg font-semibold transition-colors disabled:opacity-50 whitespace-nowrap cursor-pointer"
              >
                {saving ? 'Saving...' : 'Save Delivery Fees'}
              </button>
            </div>
          </>
        )}
      </form>

      <div className="bg-brand-soft border border-brand/30 rounded-xl p-5 text-sm text-gray-700 space-y-1">
        <p className="font-semibold text-gray-900">Where these fees show up</p>
        <p>Checkout delivery step, the POS checkout, order totals, confirmation emails and the Shipping info page.</p>
        <p>Coupons with free shipping still remove the fee.</p>
      </div>
    </div>
  );
}
