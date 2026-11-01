'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { fetchAdminCustomerById, fetchOrdersForCustomer, isPaidLikeOrder } from '@/lib/admin/customers';

type Kind = 'customers' | 'profiles' | 'guest';

export default function CustomerDetailsPage() {
    const params = useParams();
    const customerId = params.id as string;

    const [customer, setCustomer] = useState<any>(null);
    const [kind, setKind] = useState<Kind | null>(null);
    const [orders, setOrders] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    // Inline edit (customers table only)
    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [editForm, setEditForm] = useState({ phone: '', notes: '', tags: '' });

    useEffect(() => {
        if (customerId) {
            fetchCustomerData();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [customerId]);

    const fetchCustomerData = async () => {
        try {
            setLoadError(null);
            const found = await fetchAdminCustomerById(supabase, customerId);
            if (!found) {
                setCustomer(null);
                setOrders([]);
                return;
            }

            const record = found.record;
            const userId = record.user_id || (found.kind === 'profiles' ? record.id : null);
            const email = record.email || null;

            const ordersData = await fetchOrdersForCustomer(
                supabase,
                userId,
                email,
                'id, order_number, created_at, status, payment_status, total, amount_paid, balance_due, payment_method'
            );

            setKind(found.kind);
            setCustomer({
                ...record,
                full_name: record.full_name || [record.first_name, record.last_name].filter(Boolean).join(' ') || 'No Name',
            });
            setEditForm({
                phone: record.phone || '',
                notes: record.notes || '',
                tags: Array.isArray(record.tags) ? record.tags.join(', ') : '',
            });
            setOrders(ordersData || []);
        } catch (err: any) {
            console.error('Error fetching customer:', err);
            setLoadError(err?.message || 'Failed to load customer');
        } finally {
            setLoading(false);
        }
    };

    const handleSaveEdit = async () => {
        if (!customer || kind !== 'customers') return;
        setSaving(true);
        setNotice(null);
        try {
            const payload = {
                phone: editForm.phone.trim() || null,
                notes: editForm.notes.trim() || null,
                tags: editForm.tags.split(',').map((t) => t.trim()).filter(Boolean),
                updated_at: new Date().toISOString(),
            };
            const { error } = await supabase.from('customers').update(payload).eq('id', customer.id);
            if (error) throw error;
            setCustomer({ ...customer, ...payload });
            setEditing(false);
            setNotice({ type: 'success', text: 'Customer details saved.' });
        } catch (err: any) {
            setNotice({ type: 'error', text: `Could not save: ${err?.message || 'unknown error'}` });
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div className="p-8 text-center text-gray-500">Loading customer details...</div>;
    if (loadError) return <div className="p-8 text-center text-red-500">{loadError}</div>;
    if (!customer) return <div className="p-8 text-center text-red-500">Customer not found</div>;

    const paidOrders = orders.filter(isPaidLikeOrder);
    const totalSpent = paidOrders.reduce((sum, order) => sum + (Number(order.amount_paid) || 0), 0);
    const hasRealEmail = customer.email && !/\.local$/i.test(customer.email);
    const tags: string[] = Array.isArray(customer.tags) ? customer.tags : [];

    const paymentBadge = (status: string) => {
        if (status === 'paid') return 'bg-brand-soft text-brand';
        if (status === 'partially_paid') return 'bg-amber-100 text-amber-800';
        if (status === 'failed' || status === 'refunded') return 'bg-red-100 text-red-800';
        return 'bg-gray-100 text-gray-700';
    };

    return (
        <div className="max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                <div className="flex items-center space-x-4">
                    <Link href="/admin/customers" className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors">
                        <i className="ri-arrow-left-line text-xl"></i>
                    </Link>
                    <div className="w-16 h-16 bg-brand-soft rounded-full flex items-center justify-center text-brand text-2xl font-bold">
                        {customer.full_name?.charAt(0) || customer.email?.charAt(0)?.toUpperCase() || 'C'}
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900">{customer.full_name || 'No Name'}</h1>
                        <p className="text-gray-500">{customer.email}</p>
                        {kind === 'guest' && <span className="text-xs text-gray-500">Guest (orders only)</span>}
                        {kind === 'profiles' && <span className="text-xs text-gray-500">Registered account</span>}
                    </div>
                </div>
                <div className="flex space-x-3">
                    {hasRealEmail && (
                        <a
                            href={`mailto:${customer.email}`}
                            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 cursor-pointer"
                        >
                            <i className="ri-mail-send-line mr-2"></i>
                            Send Email
                        </a>
                    )}
                    {kind === 'customers' && !editing && (
                        <button
                            onClick={() => setEditing(true)}
                            className="px-4 py-2 bg-brand text-white rounded-lg font-bold hover:bg-brand-dark cursor-pointer"
                        >
                            Edit Customer
                        </button>
                    )}
                </div>
            </div>

            {notice && (
                <div className={`mb-6 rounded-lg p-4 text-sm flex items-start justify-between gap-4 border ${notice.type === 'success' ? 'bg-brand-soft text-brand border-brand/30' : 'bg-red-50 text-red-700 border-red-200'}`}>
                    <span>{notice.text}</span>
                    <button onClick={() => setNotice(null)} className="shrink-0 cursor-pointer" aria-label="Dismiss">
                        <i className="ri-close-line text-lg"></i>
                    </button>
                </div>
            )}

            {editing && kind === 'customers' && (
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 mb-8">
                    <h2 className="text-lg font-bold text-gray-900 mb-4">Edit Customer</h2>
                    <div className="grid md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-semibold text-gray-900 mb-2">Phone</label>
                            <input
                                type="tel"
                                value={editForm.phone}
                                onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-brand focus:border-brand"
                                placeholder="024 000 0000"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-gray-900 mb-2">Tags</label>
                            <input
                                type="text"
                                value={editForm.tags}
                                onChange={(e) => setEditForm({ ...editForm, tags: e.target.value })}
                                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-brand focus:border-brand"
                                placeholder="vip, wholesale"
                            />
                            <p className="text-xs text-gray-500 mt-1">Separate tags with commas</p>
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-sm font-semibold text-gray-900 mb-2">Internal notes</label>
                            <textarea
                                rows={3}
                                maxLength={1000}
                                value={editForm.notes}
                                onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-brand focus:border-brand resize-none"
                                placeholder="Only visible to staff"
                            />
                        </div>
                    </div>
                    <div className="flex justify-end gap-3 mt-4">
                        <button
                            onClick={() => setEditing(false)}
                            disabled={saving}
                            className="px-5 py-2.5 border-2 border-gray-300 text-gray-700 rounded-lg font-semibold hover:border-gray-400 disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSaveEdit}
                            disabled={saving}
                            className="px-5 py-2.5 bg-brand text-white rounded-lg font-semibold hover:bg-brand-dark disabled:opacity-50"
                        >
                            {saving ? 'Saving...' : 'Save'}
                        </button>
                    </div>
                </div>
            )}

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                    <p className="text-sm font-medium text-gray-500 mb-1">Total Spent</p>
                    <p className="text-2xl font-bold text-gray-900">GH₵{totalSpent.toFixed(2)}</p>
                    <p className="text-xs text-gray-500 mt-1">Paid and partially paid orders</p>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                    <p className="text-sm font-medium text-gray-500 mb-1">Paid Orders</p>
                    <p className="text-2xl font-bold text-gray-900">{paidOrders.length}</p>
                    <p className="text-xs text-gray-500 mt-1">{orders.length} total incl. unpaid</p>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                    <p className="text-sm font-medium text-gray-500 mb-1">Last Order</p>
                    <p className="text-xl font-bold text-gray-900">
                        {orders[0] ? new Date(orders[0].created_at).toLocaleDateString() : 'Never'}
                    </p>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                    <p className="text-sm font-medium text-gray-500 mb-1">Phone</p>
                    <p className="text-lg font-bold text-gray-900">{customer.phone || 'N/A'}</p>
                </div>
            </div>

            {(tags.length > 0 || customer.notes) && (
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 mb-8">
                    {tags.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-3">
                            {tags.map((tag) => (
                                <span key={tag} className="px-3 py-1 bg-brand-soft text-brand rounded-full text-xs font-semibold">{tag}</span>
                            ))}
                        </div>
                    )}
                    {customer.notes && (
                        <p className="text-sm text-gray-700 whitespace-pre-wrap">{customer.notes}</p>
                    )}
                </div>
            )}

            {/* Orders History */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200">
                    <h2 className="text-lg font-bold text-gray-900">Order History</h2>
                </div>

                {orders.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">No orders found.</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-gray-50 text-gray-600 text-xs uppercase font-semibold">
                                <tr>
                                    <th className="px-6 py-4">Order</th>
                                    <th className="px-6 py-4">Date</th>
                                    <th className="px-6 py-4">Status</th>
                                    <th className="px-6 py-4">Payment</th>
                                    <th className="px-6 py-4">Total</th>
                                    <th className="px-6 py-4 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {orders.map(order => (
                                    <tr key={order.id} className="hover:bg-gray-50">
                                        <td className="px-6 py-4 text-sm font-medium text-brand whitespace-nowrap">
                                            <Link href={`/admin/orders/${order.id}`}>{order.order_number || `#${order.id.slice(0, 8)}`}</Link>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-600 whitespace-nowrap">
                                            {new Date(order.created_at).toLocaleDateString()}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize
                                                ${order.status === 'delivered' ? 'bg-brand-soft text-brand' :
                                                    order.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                                                        order.status === 'cancelled' ? 'bg-red-100 text-red-800' : 'bg-brand-soft text-brand'}`}>
                                                {String(order.status || '').replace('_', ' ')}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${paymentBadge(order.payment_status)}`}>
                                                {String(order.payment_status || 'pending').replace('_', ' ')}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-sm font-bold text-gray-900 whitespace-nowrap">
                                            GH₵{(Number(order.total) || 0).toFixed(2)}
                                            {order.payment_status === 'partially_paid' && (
                                                <span className="block text-xs font-medium text-gray-500">Paid GH₵{(Number(order.amount_paid) || 0).toFixed(2)}</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <Link href={`/admin/orders/${order.id}`} className="text-gray-400 hover:text-brand">
                                                <i className="ri-eye-line text-lg"></i>
                                            </Link>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
