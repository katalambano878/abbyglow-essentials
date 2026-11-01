'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

type CouponType = 'percentage' | 'fixed_amount' | 'free_shipping';

interface Coupon {
  id: string;
  code: string;
  description: string | null;
  type: CouponType;
  value: number;
  minimum_purchase: number | null;
  maximum_discount: number | null;
  usage_limit: number | null;
  usage_count: number;
  per_user_limit: number | null;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
  created_at: string;
}

interface CouponForm {
  code: string;
  description: string;
  type: CouponType;
  value: string;
  minimum_purchase: string;
  maximum_discount: string;
  usage_limit: string;
  per_user_limit: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
}

const emptyForm: CouponForm = {
  code: '',
  description: '',
  type: 'percentage',
  value: '',
  minimum_purchase: '',
  maximum_discount: '',
  usage_limit: '',
  per_user_limit: '',
  start_date: '',
  end_date: '',
  is_active: true,
};

const CODE_PATTERN = /^[A-Z0-9_-]{3,32}$/;

type CouponStatus = 'active' | 'scheduled' | 'expired' | 'disabled' | 'exhausted';

const couponStatus = (c: Coupon): CouponStatus => {
  if (!c.is_active) return 'disabled';
  const now = Date.now();
  if (c.start_date && new Date(c.start_date).getTime() > now) return 'scheduled';
  if (c.end_date && new Date(c.end_date).getTime() < now) return 'expired';
  if (c.usage_limit && c.usage_count >= c.usage_limit) return 'exhausted';
  return 'active';
};

const statusColors: Record<CouponStatus, string> = {
  active: 'bg-brand-soft text-brand',
  scheduled: 'bg-purple-100 text-purple-700',
  expired: 'bg-gray-100 text-gray-700',
  disabled: 'bg-red-100 text-red-700',
  exhausted: 'bg-amber-100 text-amber-700',
};

const typeLabel: Record<CouponType, string> = {
  percentage: 'Percentage',
  fixed_amount: 'Fixed Amount',
  free_shipping: 'Free Shipping',
};

const toDateInput = (value: string | null) => (value ? new Date(value).toISOString().slice(0, 10) : '');

export default function AdminCouponsPage() {
  const [showModal, setShowModal] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null);
  const [form, setForm] = useState<CouponForm>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [totalDiscount, setTotalDiscount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'all' | CouponStatus>('all');
  const [sortBy, setSortBy] = useState<'date' | 'usage' | 'value'>('date');
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  useEffect(() => {
    fetchCoupons();
  }, []);

  const fetchCoupons = async () => {
    try {
      setLoading(true);
      const [{ data, error }, { data: discountRows }] = await Promise.all([
        supabase.from('coupons').select('*').order('created_at', { ascending: false }),
        supabase.from('orders').select('discount_total').gt('discount_total', 0),
      ]);

      setTotalDiscount((discountRows || []).reduce((sum, order) => sum + Number(order.discount_total || 0), 0));

      if (error) throw error;
      setCoupons(
        (data || []).map((c: any) => ({
          ...c,
          value: Number(c.value) || 0,
          minimum_purchase: c.minimum_purchase === null ? null : Number(c.minimum_purchase),
          maximum_discount: c.maximum_discount === null ? null : Number(c.maximum_discount),
          usage_limit: c.usage_limit === null ? null : Number(c.usage_limit),
          usage_count: Number(c.usage_count) || 0,
          per_user_limit: c.per_user_limit === null ? null : Number(c.per_user_limit),
          is_active: Boolean(c.is_active),
        }))
      );
    } catch (err: any) {
      console.error('Error fetching coupons:', err);
      setNotice({ type: 'error', text: `Could not load coupons: ${err?.message || 'unknown error'}` });
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditingCoupon(null);
    setForm(emptyForm);
    setFormError(null);
    setShowModal(true);
  };

  const openEdit = (coupon: Coupon) => {
    setEditingCoupon(coupon);
    setForm({
      code: coupon.code,
      description: coupon.description || '',
      type: coupon.type,
      value: coupon.type === 'free_shipping' ? '' : String(coupon.value ?? ''),
      minimum_purchase: coupon.minimum_purchase ? String(coupon.minimum_purchase) : '',
      maximum_discount: coupon.maximum_discount ? String(coupon.maximum_discount) : '',
      usage_limit: coupon.usage_limit ? String(coupon.usage_limit) : '',
      per_user_limit: coupon.per_user_limit ? String(coupon.per_user_limit) : '',
      start_date: toDateInput(coupon.start_date),
      end_date: toDateInput(coupon.end_date),
      is_active: coupon.is_active,
    });
    setFormError(null);
    setShowModal(true);
  };

  const closeModal = () => {
    if (saving) return;
    setShowModal(false);
    setEditingCoupon(null);
  };

  const updateForm = (patch: Partial<CouponForm>) => setForm((prev) => ({ ...prev, ...patch }));

  const handleSave = async () => {
    const code = form.code.trim().toUpperCase();
    if (!CODE_PATTERN.test(code)) {
      setFormError('Code must be 3–32 characters: letters, numbers, _ or - only.');
      return;
    }
    const value = parseFloat(form.value);
    if (form.type !== 'free_shipping') {
      if (!(value > 0)) { setFormError('Enter a discount value greater than 0.'); return; }
      if (form.type === 'percentage' && value > 100) { setFormError('Percentage cannot exceed 100.'); return; }
    }
    if (form.start_date && form.end_date && form.end_date < form.start_date) {
      setFormError('End date must be after the start date.');
      return;
    }

    const optionalNumber = (v: string) => (v.trim() === '' ? null : Number(v));
    const payload = {
      code,
      description: form.description.trim() || null,
      type: form.type,
      value: form.type === 'free_shipping' ? 0 : value,
      minimum_purchase: optionalNumber(form.minimum_purchase),
      maximum_discount: form.type === 'percentage' ? optionalNumber(form.maximum_discount) : null,
      usage_limit: optionalNumber(form.usage_limit),
      per_user_limit: optionalNumber(form.per_user_limit),
      start_date: form.start_date ? new Date(`${form.start_date}T00:00:00`).toISOString() : null,
      end_date: form.end_date ? new Date(`${form.end_date}T23:59:59.999`).toISOString() : null,
      is_active: form.is_active,
      updated_at: new Date().toISOString(),
    };

    setSaving(true);
    setFormError(null);
    try {
      if (editingCoupon) {
        const { error } = await supabase.from('coupons').update(payload).eq('id', editingCoupon.id);
        if (error) throw error;
        setNotice({ type: 'success', text: `Coupon ${code} updated.` });
      } else {
        const { error } = await supabase.from('coupons').insert([{ ...payload, usage_count: 0 }]);
        if (error) throw error;
        setNotice({ type: 'success', text: `Coupon ${code} created.` });
      }
      setShowModal(false);
      setEditingCoupon(null);
      await fetchCoupons();
    } catch (err: any) {
      const msg = err?.message || 'unknown error';
      setFormError(/unique|duplicate/i.test(msg) ? `A coupon with the code ${code} already exists.` : msg);
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (coupon: Coupon) => {
    setWorking(coupon.id);
    setNotice(null);
    try {
      const { error } = await supabase
        .from('coupons')
        .update({ is_active: !coupon.is_active, updated_at: new Date().toISOString() })
        .eq('id', coupon.id);
      if (error) throw error;
      setCoupons((prev) => prev.map((c) => (c.id === coupon.id ? { ...c, is_active: !coupon.is_active } : c)));
      setNotice({ type: 'success', text: `${coupon.code} ${coupon.is_active ? 'disabled' : 'enabled'}.` });
    } catch (err: any) {
      setNotice({ type: 'error', text: `Could not update ${coupon.code}: ${err?.message || 'unknown error'}` });
    } finally {
      setWorking(null);
    }
  };

  const handleDelete = async (coupon: Coupon) => {
    if (!confirm(`Delete coupon ${coupon.code}? Orders that already used it keep their discount.`)) return;
    setWorking(coupon.id);
    setNotice(null);
    try {
      const { error } = await supabase.from('coupons').delete().eq('id', coupon.id);
      if (error) throw error;
      setCoupons((prev) => prev.filter((c) => c.id !== coupon.id));
      setNotice({ type: 'success', text: `Coupon ${coupon.code} deleted.` });
    } catch (err: any) {
      setNotice({ type: 'error', text: `Could not delete ${coupon.code}: ${err?.message || 'unknown error'}` });
    } finally {
      setWorking(null);
    }
  };

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      window.setTimeout(() => setCopiedCode((current) => (current === code ? null : current)), 1500);
    } catch {
      setNotice({ type: 'error', text: 'Clipboard access was blocked by the browser.' });
    }
  };

  const filteredCoupons = coupons
    .filter((c) => statusFilter === 'all' || couponStatus(c) === statusFilter)
    .sort((a, b) => {
      if (sortBy === 'usage') return b.usage_count - a.usage_count;
      if (sortBy === 'value') return b.value - a.value;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

  const activeCount = coupons.filter((c) => couponStatus(c) === 'active').length;
  const totalUses = coupons.reduce((sum, c) => sum + c.usage_count, 0);

  const formatValue = (c: Coupon) => {
    if (c.type === 'percentage') return `${c.value}%${c.maximum_discount ? ` (max GH₵ ${c.maximum_discount.toFixed(2)})` : ''}`;
    if (c.type === 'fixed_amount') return `GH₵ ${c.value.toFixed(2)}`;
    return 'Free Shipping';
  };

  const formatDate = (value: string | null) => (value ? new Date(value).toLocaleDateString() : null);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Coupons & Promotions</h1>
          <p className="text-gray-600 mt-1">Create and manage discount codes</p>
        </div>
        <button
          onClick={openCreate}
          className="bg-brand hover:bg-brand-dark text-white px-6 py-3 rounded-lg font-semibold transition-colors whitespace-nowrap cursor-pointer"
        >
          <i className="ri-add-line mr-2"></i>
          Create Coupon
        </button>
      </div>

      {notice && (
        <div className={`rounded-lg p-4 text-sm flex items-start justify-between gap-4 border ${notice.type === 'success' ? 'bg-brand-soft text-brand border-brand/30' : 'bg-red-50 text-red-700 border-red-200'}`}>
          <span>{notice.text}</span>
          <button onClick={() => setNotice(null)} className="shrink-0 cursor-pointer" aria-label="Dismiss">
            <i className="ri-close-line text-lg"></i>
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border-2 border-gray-200 p-4">
          <p className="text-sm text-gray-600 mb-1">Total Coupons</p>
          <p className="text-2xl font-bold text-gray-900">{coupons.length}</p>
        </div>
        <div className="bg-white rounded-xl border-2 border-gray-200 p-4">
          <p className="text-sm text-gray-600 mb-1">Active</p>
          <p className="text-2xl font-bold text-brand">{activeCount}</p>
        </div>
        <div className="bg-white rounded-xl border-2 border-gray-200 p-4">
          <p className="text-sm text-gray-600 mb-1">Total Uses</p>
          <p className="text-2xl font-bold text-gray-900">{totalUses}</p>
        </div>
        <div className="bg-white rounded-xl border-2 border-gray-200 p-4">
          <p className="text-sm text-gray-600 mb-1">Total Discount</p>
          <p className="text-2xl font-bold text-purple-700">GH₵ {totalDiscount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-900">All Coupons</h2>
            <div className="flex items-center space-x-3">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
                className="px-4 py-2 pr-8 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-brand focus:border-brand font-medium cursor-pointer"
              >
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="scheduled">Scheduled</option>
                <option value="expired">Expired</option>
                <option value="exhausted">Limit reached</option>
                <option value="disabled">Disabled</option>
              </select>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="px-4 py-2 pr-8 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-brand focus:border-brand font-medium cursor-pointer"
              >
                <option value="date">Sort by Date</option>
                <option value="usage">Sort by Usage</option>
                <option value="value">Sort by Value</option>
              </select>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left py-4 px-6 text-sm font-semibold text-gray-700">Code</th>
                <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Type</th>
                <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Value</th>
                <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Min Purchase</th>
                <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Usage</th>
                <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Valid Period</th>
                <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Status</th>
                <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="p-8 text-center text-gray-500">Loading coupons...</td></tr>
              ) : filteredCoupons.length === 0 ? (
                <tr><td colSpan={8} className="p-8 text-center text-gray-500">No coupons found.</td></tr>
              ) : (
                filteredCoupons.map((coupon) => {
                  const status = couponStatus(coupon);
                  return (
                    <tr key={coupon.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="py-4 px-6">
                        <div className="flex items-center space-x-2">
                          <span className="font-mono font-bold text-gray-900 bg-gray-100 px-3 py-1 rounded">{coupon.code}</span>
                          <button
                            onClick={() => copyCode(coupon.code)}
                            title={copiedCode === coupon.code ? 'Copied' : 'Copy code'}
                            className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-brand hover:bg-brand-soft rounded transition-colors cursor-pointer"
                          >
                            <i className={copiedCode === coupon.code ? 'ri-check-line text-brand' : 'ri-file-copy-line'}></i>
                          </button>
                        </div>
                        {coupon.description && <p className="text-xs text-gray-500 mt-1">{coupon.description}</p>}
                      </td>
                      <td className="py-4 px-4 text-gray-700">{typeLabel[coupon.type] || coupon.type}</td>
                      <td className="py-4 px-4 font-semibold text-gray-900 whitespace-nowrap">{formatValue(coupon)}</td>
                      <td className="py-4 px-4 text-gray-700 whitespace-nowrap">
                        {coupon.minimum_purchase && coupon.minimum_purchase > 0 ? `GH₵ ${coupon.minimum_purchase.toFixed(2)}` : 'No minimum'}
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex items-center space-x-2">
                          <span className="text-gray-900 font-semibold">{coupon.usage_count}</span>
                          <span className="text-gray-500">/</span>
                          <span className="text-gray-600">{coupon.usage_limit || '∞'}</span>
                        </div>
                        {coupon.usage_limit ? (
                          <div className="w-24 h-2 bg-gray-200 rounded-full mt-2">
                            <div
                              className="h-full bg-brand rounded-full"
                              style={{ width: `${Math.min((coupon.usage_count / coupon.usage_limit) * 100, 100)}%` }}
                            ></div>
                          </div>
                        ) : null}
                        {coupon.per_user_limit ? (
                          <p className="text-xs text-gray-500 mt-1">{coupon.per_user_limit} per customer</p>
                        ) : null}
                      </td>
                      <td className="py-4 px-4">
                        <p className="text-sm text-gray-700 whitespace-nowrap">{formatDate(coupon.start_date) || 'Starts immediately'}</p>
                        <p className="text-sm text-gray-500 whitespace-nowrap">{formatDate(coupon.end_date) || 'No expiry'}</p>
                      </td>
                      <td className="py-4 px-4">
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap capitalize ${statusColors[status]}`}>
                          {status === 'exhausted' ? 'Limit reached' : status}
                        </span>
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => toggleActive(coupon)}
                            disabled={working === coupon.id}
                            title={coupon.is_active ? 'Disable' : 'Enable'}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer disabled:opacity-50 ${coupon.is_active ? 'bg-brand' : 'bg-gray-300'}`}
                          >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${coupon.is_active ? 'translate-x-6' : 'translate-x-1'}`} />
                          </button>
                          <button
                            onClick={() => openEdit(coupon)}
                            title="Edit"
                            className="w-8 h-8 flex items-center justify-center text-gray-600 hover:text-brand hover:bg-brand-soft rounded-lg transition-colors cursor-pointer"
                          >
                            <i className="ri-edit-line text-lg"></i>
                          </button>
                          <button
                            onClick={() => handleDelete(coupon)}
                            disabled={working === coupon.id}
                            title="Delete"
                            className="w-8 h-8 flex items-center justify-center text-gray-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                          >
                            <i className={`${working === coupon.id ? 'ri-loader-4-line animate-spin' : 'ri-delete-bin-line'} text-lg`}></i>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white z-10">
              <h2 className="text-2xl font-bold text-gray-900">{editingCoupon ? `Edit ${editingCoupon.code}` : 'Create Coupon'}</h2>
              <button
                onClick={closeModal}
                className="w-10 h-10 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
              >
                <i className="ri-close-line text-2xl"></i>
              </button>
            </div>

            <div className="p-6 space-y-5">
              {formError && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{formError}</div>
              )}

              <div className="grid md:grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2">Code *</label>
                  <input
                    type="text"
                    value={form.code}
                    onChange={(e) => updateForm({ code: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '') })}
                    maxLength={32}
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-brand focus:border-brand font-mono uppercase"
                    placeholder="SUMMER20"
                  />
                  <p className="text-xs text-gray-500 mt-1">3–32 characters: A–Z, 0–9, _ or -</p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2">Type</label>
                  <select
                    value={form.type}
                    onChange={(e) => updateForm({ type: e.target.value as CouponType })}
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-brand focus:border-brand cursor-pointer"
                  >
                    <option value="percentage">Percentage off</option>
                    <option value="fixed_amount">Fixed amount off</option>
                    <option value="free_shipping">Free shipping</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">Description</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => updateForm({ description: e.target.value })}
                  maxLength={200}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-brand focus:border-brand"
                  placeholder="Shown to customers when the code applies"
                />
              </div>

              <div className="grid md:grid-cols-3 gap-5">
                {form.type !== 'free_shipping' && (
                  <div>
                    <label className="block text-sm font-semibold text-gray-900 mb-2">
                      {form.type === 'percentage' ? 'Percent off *' : 'Amount off (GH₵) *'}
                    </label>
                    <input
                      type="number"
                      min="0"
                      step={form.type === 'percentage' ? '1' : '0.01'}
                      value={form.value}
                      onChange={(e) => updateForm({ value: e.target.value })}
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-brand focus:border-brand"
                      placeholder={form.type === 'percentage' ? '10' : '20.00'}
                    />
                  </div>
                )}
                {form.type === 'percentage' && (
                  <div>
                    <label className="block text-sm font-semibold text-gray-900 mb-2">Max discount (GH₵)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.maximum_discount}
                      onChange={(e) => updateForm({ maximum_discount: e.target.value })}
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-brand focus:border-brand"
                      placeholder="No cap"
                    />
                  </div>
                )}
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2">Minimum purchase (GH₵)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.minimum_purchase}
                    onChange={(e) => updateForm({ minimum_purchase: e.target.value })}
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-brand focus:border-brand"
                    placeholder="No minimum"
                  />
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2">Total usage limit</label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={form.usage_limit}
                    onChange={(e) => updateForm({ usage_limit: e.target.value })}
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-brand focus:border-brand"
                    placeholder="Unlimited"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2">Uses per customer</label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={form.per_user_limit}
                    onChange={(e) => updateForm({ per_user_limit: e.target.value })}
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-brand focus:border-brand"
                    placeholder="Unlimited"
                  />
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2">Start date</label>
                  <input
                    type="date"
                    value={form.start_date}
                    onChange={(e) => updateForm({ start_date: e.target.value })}
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-brand focus:border-brand"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2">End date</label>
                  <input
                    type="date"
                    value={form.end_date}
                    onChange={(e) => updateForm({ end_date: e.target.value })}
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-brand focus:border-brand"
                  />
                </div>
              </div>

              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => updateForm({ is_active: e.target.checked })}
                  className="w-5 h-5 text-brand border-gray-300 rounded focus:ring-brand cursor-pointer"
                />
                <span className="text-gray-900 font-medium">Active (customers can use this code)</span>
              </label>
            </div>

            <div className="p-6 border-t border-gray-200 flex items-center justify-end space-x-3 bg-gray-50 rounded-b-2xl sticky bottom-0">
              <button
                onClick={closeModal}
                disabled={saving}
                className="px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-lg hover:border-gray-400 font-semibold transition-colors whitespace-nowrap cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-6 py-3 bg-brand hover:bg-brand-dark text-white rounded-lg font-semibold transition-colors whitespace-nowrap cursor-pointer flex items-center disabled:opacity-70"
              >
                {saving && <i className="ri-loader-4-line animate-spin mr-2"></i>}
                {editingCoupon ? 'Save Changes' : 'Create Coupon'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
