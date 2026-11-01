'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

interface Address {
  id: string;
  label: string;
  full_name: string;
  phone: string;
  address_line1: string;
  address_line2: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  is_default: boolean;
}

type AddressForm = Omit<Address, 'id'>;

const EMPTY_FORM: AddressForm = {
  label: '',
  full_name: '',
  phone: '',
  address_line1: '',
  address_line2: '',
  city: '',
  state: '',
  postal_code: '',
  country: 'Ghana',
  is_default: false,
};

const SELECT_COLS =
  'id, label, full_name, phone, address_line1, address_line2, city, state, postal_code, country, is_default';

export default function AddressBook() {
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<AddressForm>(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');

  const loadAddresses = useCallback(async (uid: string) => {
    const { data, error } = await supabase
      .from('addresses')
      .select(SELECT_COLS)
      .eq('user_id', uid)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) {
      setListError(error.message || 'Could not load your addresses.');
      return;
    }
    setListError('');
    setAddresses(
      ((data || []) as any[]).map((a) => ({
        id: a.id,
        label: a.label || '',
        full_name: a.full_name || '',
        phone: a.phone || '',
        address_line1: a.address_line1 || '',
        address_line2: a.address_line2 || '',
        city: a.city || '',
        state: a.state || '',
        postal_code: a.postal_code || '',
        country: a.country || 'Ghana',
        is_default: !!a.is_default,
      }))
    );
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;
      if (!session) {
        setLoading(false);
        return;
      }
      setUserId(session.user.id);
      await loadAddresses(session.user.id);
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadAddresses]);

  const openNew = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, is_default: addresses.length === 0 });
    setFormError('');
    setNotice('');
    setShowForm(true);
  };

  const openEdit = (address: Address) => {
    setEditingId(address.id);
    const { id: _id, ...rest } = address;
    setForm(rest);
    setFormError('');
    setNotice('');
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;
    setFormError('');

    const payload = {
      label: form.label.trim(),
      full_name: form.full_name.trim(),
      phone: form.phone.trim(),
      address_line1: form.address_line1.trim(),
      address_line2: form.address_line2.trim() || null,
      city: form.city.trim(),
      state: form.state.trim(),
      postal_code: form.postal_code.trim(),
      country: form.country.trim() || 'Ghana',
      is_default: form.is_default,
      type: 'both',
    };

    const required: Array<[keyof typeof payload, string]> = [
      ['full_name', 'Full name'],
      ['phone', 'Phone number'],
      ['address_line1', 'Street address'],
      ['city', 'City'],
      ['state', 'Region'],
      ['postal_code', 'Postal / digital address'],
      ['country', 'Country'],
    ];
    for (const [key, labelText] of required) {
      if (!payload[key]) {
        setFormError(`${labelText} is required`);
        return;
      }
    }

    setSaving(true);
    try {
      if (payload.is_default) {
        // Clear the default flag on every other address first.
        const { error: clearError } = await supabase
          .from('addresses')
          .update({ is_default: false })
          .eq('user_id', userId)
          .eq('is_default', true);
        if (clearError) throw clearError;
      }

      if (editingId) {
        const { error } = await supabase
          .from('addresses')
          .update(payload)
          .eq('id', editingId)
          .eq('user_id', userId);
        if (error) throw error;
        setNotice('Address updated.');
      } else {
        const { error } = await supabase
          .from('addresses')
          .insert({ ...payload, user_id: userId });
        if (error) throw error;
        setNotice('Address saved.');
      }
      await loadAddresses(userId);
      closeForm();
    } catch (err: any) {
      setFormError(err?.message || 'Could not save the address. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const deleteAddress = async (id: string) => {
    if (!userId) return;
    setBusyId(id);
    setNotice('');
    try {
      const { error } = await supabase
        .from('addresses')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);
      if (error) throw error;
      await loadAddresses(userId);
      setNotice('Address removed.');
    } catch (err: any) {
      setListError(err?.message || 'Could not delete the address.');
    } finally {
      setBusyId(null);
    }
  };

  const setDefault = async (id: string) => {
    if (!userId) return;
    setBusyId(id);
    setNotice('');
    try {
      const { error: clearError } = await supabase
        .from('addresses')
        .update({ is_default: false })
        .eq('user_id', userId)
        .eq('is_default', true);
      if (clearError) throw clearError;
      const { error } = await supabase
        .from('addresses')
        .update({ is_default: true })
        .eq('id', id)
        .eq('user_id', userId);
      if (error) throw error;
      await loadAddresses(userId);
      setNotice('Default address updated.');
    } catch (err: any) {
      setListError(err?.message || 'Could not update the default address.');
    } finally {
      setBusyId(null);
    }
  };

  const inputClass =
    'w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand focus:border-transparent';

  if (loading) {
    return (
      <div className="py-8 text-center">
        <i className="ri-loader-4-line animate-spin text-3xl text-brand"></i>
        <p className="mt-2 text-gray-500">Loading addresses...</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Address Book</h2>
        <button
          onClick={openNew}
          className="px-4 py-2 bg-brand text-white rounded-lg font-semibold hover:bg-brand-dark transition-colors whitespace-nowrap"
        >
          <i className="ri-add-line mr-2"></i>
          Add New Address
        </button>
      </div>

      {listError && (
        <div className="mb-6 p-4 rounded-xl bg-red-50 text-red-700 border border-red-100 flex items-start gap-3" role="alert">
          <i className="ri-error-warning-line text-xl mt-0.5"></i>
          <div>{listError}</div>
        </div>
      )}
      {notice && !listError && (
        <div className="mb-6 p-4 rounded-xl bg-brand-soft text-brand border border-brand/20 flex items-start gap-3" role="status">
          <i className="ri-checkbox-circle-line text-xl mt-0.5"></i>
          <div>{notice}</div>
        </div>
      )}

      {showForm && (
        <div className="bg-white border-2 border-brand rounded-lg p-6 mb-6">
          <h3 className="text-xl font-bold text-gray-900 mb-4">
            {editingId ? 'Edit Address' : 'New Address'}
          </h3>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label htmlFor="addr-label" className="block text-sm font-semibold text-gray-900 mb-2">Label <span className="text-gray-400 font-normal">(optional)</span></label>
              <input
                id="addr-label"
                type="text"
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                className={inputClass}
                placeholder="Home, Office..."
              />
            </div>
            <div>
              <label htmlFor="addr-name" className="block text-sm font-semibold text-gray-900 mb-2">Full Name</label>
              <input
                id="addr-name"
                type="text"
                autoComplete="name"
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                className={inputClass}
                placeholder="John Doe"
                required
              />
            </div>
            <div>
              <label htmlFor="addr-phone" className="block text-sm font-semibold text-gray-900 mb-2">Phone Number</label>
              <input
                id="addr-phone"
                type="tel"
                autoComplete="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className={inputClass}
                placeholder="+233 24 123 4567"
                required
              />
            </div>
            <div className="md:col-span-2">
              <label htmlFor="addr-line1" className="block text-sm font-semibold text-gray-900 mb-2">Street Address</label>
              <input
                id="addr-line1"
                type="text"
                autoComplete="address-line1"
                value={form.address_line1}
                onChange={(e) => setForm({ ...form, address_line1: e.target.value })}
                className={inputClass}
                placeholder="123 Oxford Street"
                required
              />
            </div>
            <div className="md:col-span-2">
              <label htmlFor="addr-line2" className="block text-sm font-semibold text-gray-900 mb-2">Apartment, landmark <span className="text-gray-400 font-normal">(optional)</span></label>
              <input
                id="addr-line2"
                type="text"
                autoComplete="address-line2"
                value={form.address_line2}
                onChange={(e) => setForm({ ...form, address_line2: e.target.value })}
                className={inputClass}
                placeholder="Near Osu Oxford Street junction"
              />
            </div>
            <div>
              <label htmlFor="addr-city" className="block text-sm font-semibold text-gray-900 mb-2">City</label>
              <input
                id="addr-city"
                type="text"
                autoComplete="address-level2"
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
                className={inputClass}
                placeholder="Accra"
                required
              />
            </div>
            <div>
              <label htmlFor="addr-state" className="block text-sm font-semibold text-gray-900 mb-2">Region</label>
              <input
                id="addr-state"
                type="text"
                autoComplete="address-level1"
                value={form.state}
                onChange={(e) => setForm({ ...form, state: e.target.value })}
                className={inputClass}
                placeholder="Greater Accra"
                required
              />
            </div>
            <div>
              <label htmlFor="addr-postal" className="block text-sm font-semibold text-gray-900 mb-2">Postal / Digital Address</label>
              <input
                id="addr-postal"
                type="text"
                autoComplete="postal-code"
                value={form.postal_code}
                onChange={(e) => setForm({ ...form, postal_code: e.target.value })}
                className={inputClass}
                placeholder="GA-123-4567"
                required
              />
            </div>
            <div>
              <label htmlFor="addr-country" className="block text-sm font-semibold text-gray-900 mb-2">Country</label>
              <input
                id="addr-country"
                type="text"
                autoComplete="country-name"
                value={form.country}
                onChange={(e) => setForm({ ...form, country: e.target.value })}
                className={inputClass}
                placeholder="Ghana"
                required
              />
            </div>
            <div className="md:col-span-2">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={form.is_default}
                  onChange={(e) => setForm({ ...form, is_default: e.target.checked })}
                  className="w-4 h-4 text-brand border-gray-300 rounded focus:ring-brand"
                />
                <span className="ml-2 text-sm text-gray-700">Set as default address</span>
              </label>
            </div>
            {formError && (
              <p className="md:col-span-2 text-sm text-red-600" role="alert">{formError}</p>
            )}
            <div className="md:col-span-2 flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-3">
              <button
                type="submit"
                disabled={saving}
                className="flex-1 py-3 bg-brand text-white rounded-lg font-semibold hover:bg-brand-dark transition-colors whitespace-nowrap disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Address'}
              </button>
              <button
                type="button"
                onClick={closeForm}
                className="flex-1 py-3 border-2 border-gray-300 text-gray-900 rounded-lg font-semibold hover:bg-gray-50 transition-colors whitespace-nowrap"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {addresses.length === 0 && !showForm && (
        <div className="py-12 text-center bg-white rounded-lg border border-gray-200">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <i className="ri-map-pin-line text-3xl text-gray-400"></i>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">No saved addresses</h3>
          <p className="text-gray-500">Add an address to speed up checkout.</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {addresses.map((address) => (
          <div
            key={address.id}
            className={`bg-white border-2 rounded-lg p-6 relative ${address.is_default ? 'border-brand' : 'border-gray-200'
              }`}
          >
            {address.is_default && (
              <div className="absolute top-4 right-4">
                <span className="px-3 py-1 bg-brand text-white text-xs font-semibold rounded-full whitespace-nowrap">
                  Default
                </span>
              </div>
            )}

            <div className="mb-4 pr-20">
              {address.label && (
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">{address.label}</p>
              )}
              <h3 className="text-lg font-bold text-gray-900">{address.full_name}</h3>
              <p className="text-gray-600">{address.phone}</p>
            </div>

            <div className="text-gray-700 space-y-1 mb-6">
              <p>{address.address_line1}</p>
              {address.address_line2 && <p>{address.address_line2}</p>}
              <p>{address.city}, {address.state} {address.postal_code}</p>
              <p>{address.country}</p>
            </div>

            <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2">
              <button
                onClick={() => openEdit(address)}
                className="flex-1 py-2 border border-gray-300 text-gray-900 rounded-lg font-semibold hover:bg-gray-50 transition-colors whitespace-nowrap"
              >
                Edit
              </button>
              {!address.is_default && (
                <button
                  onClick={() => setDefault(address.id)}
                  disabled={busyId === address.id}
                  className="flex-1 py-2 border border-brand text-brand rounded-lg font-semibold hover:bg-brand-soft transition-colors whitespace-nowrap disabled:opacity-50"
                >
                  Set Default
                </button>
              )}
              <button
                onClick={() => deleteAddress(address.id)}
                disabled={busyId === address.id}
                aria-label="Delete address"
                className="px-4 py-2 border border-red-600 text-red-600 rounded-lg font-semibold hover:bg-red-50 transition-colors whitespace-nowrap disabled:opacity-50"
              >
                <i className={busyId === address.id ? 'ri-loader-4-line animate-spin' : 'ri-delete-bin-line'}></i>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
