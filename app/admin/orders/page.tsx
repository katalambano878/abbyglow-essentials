'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { adminFetch } from '@/lib/admin-fetch';
import ProductSalesStats from './ProductSalesStats';
import { depositPlanLabel, isDepositPlan } from '@/lib/payments/plans';
import { deliveryFeePending, deliveryMethodLabel, orderChannel, orderChannelLabel, parseDeliveryMethod, type DeliveryMethod, type OrderChannel } from '@/lib/shipping';

const DELIVERY_FILTERS: Array<{ id: DeliveryMethod; label: string }> = [
  { id: 'pickup', label: 'Store Pickup' },
  { id: 'delivery', label: 'Doorstep Delivery' },
  { id: 'outside_accra', label: 'Outside Accra Delivery' },
];

/** Which delivery option the customer chose (handles the old POS value `doorstep`). */
const orderDelivery = (order: { shipping_method?: string | null; metadata?: any }): DeliveryMethod =>
  parseDeliveryMethod(order.shipping_method || order.metadata?.delivery_method);

/** Money has been received (full or deposit). One predicate for tabs, counts and bulk actions. */
const isPaidLike = (o: { payment_status?: string }) =>
  o.payment_status === 'paid' || o.payment_status === 'partially_paid';

const csvCell = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
const toCsv = (rows: unknown[][]) => rows.map((r) => r.map(csvCell).join(',')).join('\n');
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface Order {
  id: string;
  order_number: string;
  email: string;
  total: number;
  shipping_total?: number | null;
  status: string;
  payment_status: string;
  payment_method: string;
  shipping_method: string;
  created_at: string;
  phone?: string;
  shipping_address?: any;
  metadata?: any;
  payment_plan?: string | null;
  amount_paid?: number | null;
  balance_due?: number | null;
  profiles?: {
    full_name: string;
    email: string;
  };
  order_items?: {
    quantity: number;
    product_name?: string;
  }[];
}

interface OrderStats {
  label: string;
  count: number;
  status: string;
}

export default function AdminOrdersPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [sortBy, setSortBy] = useState('date');
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [orderViewTab, setOrderViewTab] = useState<'confirmed' | 'abandoned'>('confirmed');
  const [sendingPaymentLink, setSendingPaymentLink] = useState<string | null>(null);
  const [orderStats, setOrderStats] = useState<OrderStats[]>([
    { label: 'All Orders', count: 0, status: 'all' },
    { label: 'Pending', count: 0, status: 'pending' },
    { label: 'Processing', count: 0, status: 'processing' },
    { label: 'Packaged', count: 0, status: 'shipped' },
    { label: 'Delivered', count: 0, status: 'delivered' },
    { label: 'Cancelled', count: 0, status: 'cancelled' }
  ]);
  const [abandonedCount, setAbandonedCount] = useState(0);
  const [confirmedCount, setConfirmedCount] = useState(0);
  const [showProductStats, setShowProductStats] = useState(false);
  const [productFilter, setProductFilter] = useState('all');
  const [availableProducts, setAvailableProducts] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [paymentMethodFilter, setPaymentMethodFilter] = useState('all');
  const [shippingMethodFilter, setShippingMethodFilter] = useState<'all' | DeliveryMethod>('all');
  const [channelFilter, setChannelFilter] = useState<'all' | OrderChannel>('all');
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [bulkWorking, setBulkWorking] = useState(false);

  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    try {
      setLoading(true);

      // Fetch orders with related data
      const { data: ordersData, error } = await supabase
        .from('orders')
        .select(`
          id,
          order_number,
          email,
          total,
          shipping_total,
          status,
          payment_status,
          payment_plan,
          amount_paid,
          balance_due,
          payment_method,
          shipping_method,
          created_at,
          phone,
          shipping_address,
          metadata,
          order_items (
            quantity,
            product_name
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setOrders(ordersData || []);

      // Extract unique product names for filter
      const productNames = new Set<string>();
      ordersData?.forEach(o => {
        o.order_items?.forEach((item: any) => {
          if (item.product_name) productNames.add(item.product_name);
        });
      });
      setAvailableProducts(Array.from(productNames).sort());

      // Confirmed = money received (full or deposit). Abandoned = no payment yet.
      const confirmedOrders = ordersData?.filter(isPaidLike) || [];
      const abandonedOrders = ordersData?.filter((o) => !isPaidLike(o)) || [];
      
      setConfirmedCount(confirmedOrders.length);
      setAbandonedCount(abandonedOrders.length);

      // Calculate stats based on confirmed orders only
      const stats = [
        { label: 'All Orders', count: confirmedOrders.length, status: 'all' },
        { label: 'Pending', count: confirmedOrders.filter(o => o.status === 'pending').length, status: 'pending' },
        { label: 'Processing', count: confirmedOrders.filter(o => o.status === 'processing').length, status: 'processing' },
        { label: 'Packaged', count: confirmedOrders.filter(o => o.status === 'shipped').length, status: 'shipped' },
        { label: 'Delivered', count: confirmedOrders.filter(o => o.status === 'delivered').length, status: 'delivered' },
        { label: 'Cancelled', count: confirmedOrders.filter(o => o.status === 'cancelled').length, status: 'cancelled' }
      ];
      setOrderStats(stats);

    } catch (error) {
      console.error('Error fetching orders:', error);
    } finally {
      setLoading(false);
    }
  };

  const statusColors: Record<string, string> = {
    'pending': 'bg-amber-100 text-amber-700 border-amber-200',
    'processing': 'bg-brand-soft text-brand border-brand/30',
    'shipped': 'bg-purple-100 text-purple-700 border-purple-200',
    'delivered': 'bg-brand-soft text-brand border-brand/30',
    'cancelled': 'bg-red-100 text-red-700 border-red-200',
    'awaiting_payment': 'bg-gray-100 text-gray-700 border-gray-200'
  };

  const formatStatus = (status: string) => {
    if (status === 'shipped') return 'Packaged';
    return status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Unknown';
  };

  const getCustomerName = (order: Order) => {
    // Try shipping address names first (most reliable — entered at checkout)
    if (order.shipping_address?.firstName || order.shipping_address?.lastName) {
      const first = order.shipping_address.firstName?.trim() || '';
      const last = order.shipping_address.lastName?.trim() || '';
      return `${first} ${last}`.trim();
    }
    if (order.shipping_address?.full_name) return order.shipping_address.full_name;
    // Try metadata names
    if (order.metadata?.first_name || order.metadata?.last_name) {
      const first = order.metadata.first_name?.trim() || '';
      const last = order.metadata.last_name?.trim() || '';
      return `${first} ${last}`.trim();
    }
    if (order.profiles?.full_name) return order.profiles.full_name;
    if (order.email) {
      const name = order.email.split('@')[0];
      return name.charAt(0).toUpperCase() + name.slice(1);
    }
    return 'Guest';
  };

  const getCustomerEmail = (order: Order) => {
    return order.email || order.profiles?.email || 'N/A';
  };

  const getCustomerAvatar = (order: Order) => {
    const name = getCustomerName(order);
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return parts[0][0] + parts[1][0];
    }
    return name.substring(0, 2).toUpperCase();
  };

  const getItemCount = (order: Order) => {
    if (!order.order_items) return 0;
    return order.order_items.reduce((sum, item) => sum + item.quantity, 0);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  const handleSelectAll = () => {
    if (selectedOrders.length === filteredOrders.length) {
      setSelectedOrders([]);
    } else {
      setSelectedOrders(filteredOrders.map(o => o.id));
    }
  };

  const handleSelectOrder = (orderId: string) => {
    if (selectedOrders.includes(orderId)) {
      setSelectedOrders(selectedOrders.filter(id => id !== orderId));
    } else {
      setSelectedOrders([...selectedOrders, orderId]);
    }
  };

  const downloadCsv = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const ordersCsv = (list: Order[]) =>
    toCsv([
      ['Order ID', 'Customer', 'Email', 'Date', 'Items', 'Total', 'Delivery Fee', 'Channel', 'Delivery Method', 'Status', 'Payment Status', 'Payment Method'],
      ...list.map((o) => [
        o.order_number || o.id,
        getCustomerName(o),
        getCustomerEmail(o),
        formatDate(o.created_at),
        getItemCount(o),
        Number(o.total || 0).toFixed(2),
        Number(o.shipping_total || 0) > 0 ? Number(o.shipping_total).toFixed(2) : deliveryFeePending(o) ? 'To agree' : '0.00',
        orderChannelLabel(o),
        deliveryMethodLabel(orderDelivery(o)),
        o.status,
        o.payment_status,
        o.payment_method || 'N/A',
      ]),
    ]);

  const handleBulkAction = async (action: string, newStatus?: string) => {
    if (newStatus) {
      const selected = orders.filter((o) => selectedOrders.includes(o.id));
      // Only paid / partially paid orders that are not cancelled can move through fulfilment.
      const eligible = selected.filter((o) => isPaidLike(o) && o.status !== 'cancelled');
      const skipped = selected.length - eligible.length;

      if (eligible.length === 0) {
        setNotice({ type: 'error', text: 'None of the selected orders are paid (or they are cancelled), so nothing was updated.' });
        return;
      }

      setBulkWorking(true);
      setNotice(null);
      try {
        const { error } = await supabase
          .from('orders')
          .update({ status: newStatus, updated_at: new Date().toISOString() })
          .in('id', eligible.map((o) => o.id));

        if (error) throw error;

        // Notify customers one at a time, pausing between calls so the admin rate limit is not tripped.
        const { data: { session } } = await supabase.auth.getSession();
        const authToken = session?.access_token;
        const failed: string[] = [];

        for (let i = 0; i < eligible.length; i++) {
          const order = eligible[i];
          try {
            const res = await fetch('/api/notifications', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(authToken && { 'Authorization': `Bearer ${authToken}` })
              },
              body: JSON.stringify({
                type: 'order_updated',
                payload: { order: { ...order, status: newStatus }, status: newStatus }
              })
            });
            if (!res.ok) failed.push(order.order_number || order.id);
          } catch {
            failed.push(order.order_number || order.id);
          }
          if (i < eligible.length - 1) await sleep(400);
        }

        await fetchOrders();
        setSelectedOrders([]);

        const parts = [`${eligible.length} order${eligible.length === 1 ? '' : 's'} marked ${formatStatus(newStatus)}`];
        if (skipped > 0) parts.push(`${skipped} skipped (unpaid or cancelled)`);
        if (failed.length > 0) parts.push(`notification failed for ${failed.join(', ')}`);
        setNotice({ type: failed.length ? 'error' : 'success', text: parts.join(' · ') });
      } catch (error: any) {
        console.error('Error updating orders:', error);
        setNotice({ type: 'error', text: `Failed to update orders: ${error?.message || 'unknown error'}` });
      } finally {
        setBulkWorking(false);
      }
    } else if (action === 'Export') {
      const ordersToExport = orders.filter(o => selectedOrders.includes(o.id));
      downloadCsv(ordersCsv(ordersToExport), 'selected-orders.csv');
    }
  };

  const handleExportAll = () => {
    downloadCsv(ordersCsv(filteredOrders), 'orders.csv');
  };

  const handlePrintInvoice = (orderId: string) => {
    window.open(`/admin/orders/${orderId}?print=true`, '_blank');
  };

  const handleResendPaymentLink = async (order: Order) => {
    setSendingPaymentLink(order.id);
    setNotice(null);
    try {
      await adminFetch('/api/notifications', {
        method: 'POST',
        body: JSON.stringify({
          type: 'payment_link',
          payload: order
        })
      });
      setNotice({ type: 'success', text: `Payment link sent to ${order.phone || order.email}` });
    } catch (error: any) {
      console.error('Error sending payment link:', error);
      setNotice({ type: 'error', text: `Failed to send payment link: ${error?.message || 'unknown error'}` });
    } finally {
      setSendingPaymentLink(null);
    }
  };

  const normalizeMethod = (value?: string | null) => (value || '').toLowerCase().replace(/[\s_-]+/g, '');

  const filteredOrders = orders
    .filter(order => {
      const customerName = getCustomerName(order).toLowerCase();
      const customerEmail = getCustomerEmail(order).toLowerCase();
      const orderId = (order.order_number || order.id).toLowerCase();

      // First filter by view tab (confirmed vs abandoned)
      const matchesViewTab = orderViewTab === 'confirmed' ? isPaidLike(order) : !isPaidLike(order);

      const matchesSearch = orderId.includes(searchQuery.toLowerCase()) ||
        customerName.includes(searchQuery.toLowerCase()) ||
        customerEmail.includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
      const matchesProduct = productFilter === 'all' ||
        order.order_items?.some((item: any) => item.product_name === productFilter);

      const created = new Date(order.created_at).getTime();
      const matchesFrom = !dateFrom || created >= new Date(`${dateFrom}T00:00:00`).getTime();
      const matchesTo = !dateTo || created <= new Date(`${dateTo}T23:59:59.999`).getTime();
      const matchesPayment = paymentMethodFilter === 'all' ||
        normalizeMethod(order.payment_method) === paymentMethodFilter ||
        normalizeMethod(order.metadata?.payment_gateway) === paymentMethodFilter;
      const matchesShipping = shippingMethodFilter === 'all' || orderDelivery(order) === shippingMethodFilter;
      const matchesChannel = channelFilter === 'all' || orderChannel(order) === channelFilter;

      return matchesViewTab && matchesSearch && matchesStatus && matchesProduct &&
        matchesFrom && matchesTo && matchesPayment && matchesShipping && matchesChannel;
    })
    .sort((a, b) => {
      if (sortBy === 'total') return Number(b.total || 0) - Number(a.total || 0);
      if (sortBy === 'customer') return getCustomerName(a).localeCompare(getCustomerName(b));
      if (sortBy === 'status') return (a.status || '').localeCompare(b.status || '');
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

  const paymentMethodOptions = Array.from(
    new Set(
      orders
        .flatMap((o) => [o.payment_method, o.metadata?.payment_gateway])
        .filter(Boolean)
        .map((m) => normalizeMethod(m))
    )
  ).sort();
  const methodLabel = (m: string) => m.charAt(0).toUpperCase() + m.slice(1);

  // Channel / delivery breakdown for the current tab (before the other filters), so the
  // admin sees at a glance how orders are coming in.
  const tabOrders = orders.filter((o) => (orderViewTab === 'confirmed' ? isPaidLike(o) : !isPaidLike(o)));
  const countBy = <T extends string>(fn: (o: Order) => T) =>
    tabOrders.reduce<Record<string, number>>((acc, o) => {
      const k = fn(o);
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {});
  const channelCounts = countBy(orderChannel);
  const deliveryCounts = countBy(orderDelivery);
  const chipClass = (active: boolean, tone: 'blue' | 'purple' | 'gray') => {
    const tones = {
      blue: active ? 'bg-blue-600 text-white border-blue-600' : 'bg-blue-50 text-blue-700 border-blue-200 hover:border-blue-400',
      purple: active ? 'bg-purple-600 text-white border-purple-600' : 'bg-purple-50 text-purple-700 border-purple-200 hover:border-purple-400',
      gray: active ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400',
    };
    return `px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors cursor-pointer whitespace-nowrap ${tones[tone]}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Orders</h1>
          <p className="text-gray-600 mt-1">Manage and track all customer orders</p>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          <button
            onClick={() => setShowProductStats(true)}
            className="flex-1 md:flex-none bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-6 py-3 rounded-lg font-semibold transition-colors whitespace-nowrap cursor-pointer shadow-sm flex items-center justify-center"
          >
            <i className="ri-bar-chart-groupped-line mr-2"></i>
            Stats
          </button>
          <button
            onClick={handleExportAll}
            className="flex-1 md:flex-none bg-brand hover:bg-brand-dark text-white px-6 py-3 rounded-lg font-semibold transition-colors whitespace-nowrap cursor-pointer shadow-sm flex items-center justify-center"
          >
            <i className="ri-download-line mr-2"></i>
            Export
          </button>
        </div>
      </div>

      {/* View Tabs: Confirmed Orders vs Abandoned Carts */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => { setOrderViewTab('confirmed'); setStatusFilter('all'); }}
          className={`px-6 py-3 font-semibold text-sm border-b-2 transition-colors cursor-pointer ${
            orderViewTab === 'confirmed'
              ? 'border-brand text-brand'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <i className="ri-check-double-line mr-2"></i>
          Confirmed Orders ({confirmedCount})
        </button>
        <button
          onClick={() => { setOrderViewTab('abandoned'); setStatusFilter('all'); }}
          className={`px-6 py-3 font-semibold text-sm border-b-2 transition-colors cursor-pointer ${
            orderViewTab === 'abandoned'
              ? 'border-amber-600 text-amber-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <i className="ri-shopping-cart-2-line mr-2"></i>
          Abandoned Carts ({abandonedCount})
        </button>
      </div>

      {orderViewTab === 'confirmed' && (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {orderStats.map((stat) => (
          <button
            key={stat.status}
            onClick={() => setStatusFilter(stat.status)}
            className={`p-4 rounded-xl border-2 transition-all text-left cursor-pointer ${statusFilter === stat.status
              ? 'border-brand bg-brand-soft'
              : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
          >
            <p className="text-2xl font-bold text-gray-900">{stat.count}</p>
            <p className="text-sm text-gray-600 mt-1">{stat.label}</p>
          </button>
        ))}
      </div>
      )}

      {notice && (
        <div className={`rounded-lg p-4 text-sm flex items-start justify-between gap-4 border ${notice.type === 'success' ? 'bg-brand-soft text-brand border-brand/30' : 'bg-red-50 text-red-700 border-red-200'}`}>
          <span>{notice.text}</span>
          <button onClick={() => setNotice(null)} className="shrink-0 cursor-pointer" aria-label="Dismiss">
            <i className="ri-close-line text-lg"></i>
          </button>
        </div>
      )}

      {/* Abandoned carts info banner */}
      {orderViewTab === 'abandoned' && abandonedCount > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-start space-x-3">
            <i className="ri-information-line text-xl text-amber-600 mt-0.5"></i>
            <div>
              <p className="text-sm font-semibold text-amber-800">Abandoned Carts</p>
              <p className="text-sm text-amber-700 mt-1">
                These orders were created but payment was not completed. You can resend payment links to customers.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex flex-col lg:flex-row lg:items-center gap-3 lg:gap-6">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 mr-1">Channel</span>
            <button onClick={() => setChannelFilter('all')} className={chipClass(channelFilter === 'all', 'gray')}>All ({tabOrders.length})</button>
            <button onClick={() => setChannelFilter('web')} className={chipClass(channelFilter === 'web', 'blue')}>
              <i className="ri-global-line mr-1"></i>Web ({channelCounts.web || 0})
            </button>
            <button onClick={() => setChannelFilter('pos')} className={chipClass(channelFilter === 'pos', 'purple')}>
              <i className="ri-store-3-line mr-1"></i>POS ({channelCounts.pos || 0})
            </button>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 mr-1">Delivery</span>
            <button onClick={() => setShippingMethodFilter('all')} className={chipClass(shippingMethodFilter === 'all', 'gray')}>All</button>
            {DELIVERY_FILTERS.map((d) => (
              <button key={d.id} onClick={() => setShippingMethodFilter(d.id)} className={chipClass(shippingMethodFilter === d.id, 'gray')}>
                {d.label} ({deliveryCounts[d.id] || 0})
              </button>
            ))}
          </div>
        </div>
        <div className="p-6 border-b border-gray-200">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0">
            <div className="flex-1 max-w-md">
              <div className="relative">
                <i className="ri-search-line absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-lg w-5 h-5 flex items-center justify-center"></i>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by order ID, customer name, or email..."
                  className="w-full pl-12 pr-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-brand focus:border-brand text-sm"
                />
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="px-4 py-3 border-2 border-gray-300 text-gray-700 rounded-lg hover:border-gray-400 transition-colors font-medium whitespace-nowrap cursor-pointer"
              >
                <i className="ri-filter-line mr-2"></i>
                Filters
              </button>
              <select
                value={productFilter}
                onChange={(e) => setProductFilter(e.target.value)}
                className="px-4 py-3 pr-8 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-brand focus:border-brand font-medium cursor-pointer"
              >
                <option value="all">All Products</option>
                {availableProducts.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="px-4 py-3 pr-8 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-brand focus:border-brand font-medium cursor-pointer"
              >
                <option value="date">Sort by Date</option>
                <option value="total">Sort by Total</option>
                <option value="customer">Sort by Customer</option>
                <option value="status">Sort by Status</option>
              </select>
            </div>
          </div>

          {showFilters && (
            <div className="mt-4 p-4 bg-gray-50 rounded-lg grid md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">From</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">To</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Payment Method</label>
                <select
                  value={paymentMethodFilter}
                  onChange={(e) => setPaymentMethodFilter(e.target.value)}
                  className="w-full px-3 py-2 pr-8 border-2 border-gray-300 rounded-lg text-sm cursor-pointer"
                >
                  <option value="all">All Methods</option>
                  {paymentMethodOptions.map((m) => (
                    <option key={m} value={m}>{methodLabel(m)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Delivery Method</label>
                <select
                  value={shippingMethodFilter}
                  onChange={(e) => setShippingMethodFilter(e.target.value as 'all' | DeliveryMethod)}
                  className="w-full px-3 py-2 pr-8 border-2 border-gray-300 rounded-lg text-sm cursor-pointer"
                >
                  <option value="all">All Methods</option>
                  {DELIVERY_FILTERS.map((d) => (
                    <option key={d.id} value={d.id}>{d.label}</option>
                  ))}
                </select>
              </div>
              {(dateFrom || dateTo || paymentMethodFilter !== 'all' || shippingMethodFilter !== 'all' || channelFilter !== 'all') && (
                <div className="md:col-span-4">
                  <button
                    onClick={() => { setDateFrom(''); setDateTo(''); setPaymentMethodFilter('all'); setShippingMethodFilter('all'); setChannelFilter('all'); }}
                    className="text-sm text-brand font-medium hover:underline cursor-pointer"
                  >
                    Clear filters
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {selectedOrders.length > 0 && (
          <div className="p-4 bg-brand-soft border-b border-brand/30 flex items-center justify-between">
            <p className="text-brand font-semibold">
              {selectedOrders.length} order{selectedOrders.length > 1 ? 's' : ''} selected
            </p>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => handleBulkAction('Mark as Processing', 'processing')}
                disabled={bulkWorking}
                className="px-4 py-2 bg-brand hover:bg-brand-dark text-white rounded-lg text-sm font-medium transition-colors whitespace-nowrap cursor-pointer disabled:opacity-50"
              >
                {bulkWorking ? 'Working...' : 'Mark Processing'}
              </button>
              <button
                onClick={() => handleBulkAction('Mark as Packaged', 'shipped')}
                disabled={bulkWorking}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors whitespace-nowrap cursor-pointer disabled:opacity-50"
              >
                Mark Packaged
              </button>
              <button
                onClick={() => handleBulkAction('Export')}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-800 text-white rounded-lg text-sm font-medium transition-colors whitespace-nowrap cursor-pointer"
              >
                <i className="ri-download-line mr-2"></i>
                Export
              </button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="py-4 px-6">
                  <input
                    type="checkbox"
                    checked={selectedOrders.length === filteredOrders.length && filteredOrders.length > 0}
                    onChange={handleSelectAll}
                    className="w-4 h-4 text-brand border-gray-300 rounded focus:ring-brand cursor-pointer"
                  />
                </th>
                <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Order ID</th>
                <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Customer</th>
                <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Date</th>
                <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Items</th>
                <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Channel / Delivery</th>
                <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Total</th>
                <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Payment</th>
                <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Status</th>
                <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-gray-500">
                    <i className="ri-loader-4-line animate-spin text-3xl text-brand"></i>
                    <p className="mt-2">Loading orders...</p>
                  </td>
                </tr>
              ) : filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-gray-500">
                    <i className="ri-inbox-line text-4xl text-gray-300"></i>
                    <p className="mt-2">No orders found</p>
                    <p className="text-sm">Orders will appear here when customers place them</p>
                  </td>
                </tr>
              ) : (
                filteredOrders.map((order) => (
                  <tr key={order.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="py-4 px-6">
                      <input
                        type="checkbox"
                        checked={selectedOrders.includes(order.id)}
                        onChange={() => handleSelectOrder(order.id)}
                        className="w-4 h-4 text-brand border-gray-300 rounded focus:ring-brand cursor-pointer"
                      />
                    </td>
                    <td className="py-4 px-4">
                      <Link href={`/admin/orders/${order.id}`} className="text-brand hover:text-brand font-semibold whitespace-nowrap cursor-pointer">
                        {order.order_number || order.id.substring(0, 8)}
                      </Link>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 flex items-center justify-center bg-gray-200 text-gray-700 rounded-full font-semibold text-sm">
                          {getCustomerAvatar(order)}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 whitespace-nowrap">{getCustomerName(order)}</p>
                          <p className="text-sm text-gray-500">{getCustomerEmail(order)}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-4 text-gray-700 text-sm whitespace-nowrap">{formatDate(order.created_at)}</td>
                    <td className="py-4 px-4 text-gray-700">{getItemCount(order)}</td>
                    <td className="py-4 px-4 whitespace-nowrap">
                      <div className="flex flex-col items-start gap-1">
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${orderChannel(order) === 'pos' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                          <i className={`${orderChannel(order) === 'pos' ? 'ri-store-3-line' : 'ri-global-line'} mr-1`}></i>
                          {orderChannelLabel(order)}
                        </span>
                        <span className="text-xs text-gray-700">
                          <i className={`${orderDelivery(order) === 'pickup' ? 'ri-store-2-line' : orderDelivery(order) === 'outside_accra' ? 'ri-map-pin-range-line' : 'ri-truck-line'} mr-1 text-gray-400`}></i>
                          {deliveryMethodLabel(orderDelivery(order))}
                          {Number(order.shipping_total || 0) > 0 ? (
                            <span className="text-gray-400"> · GH₵ {Number(order.shipping_total).toFixed(2)}</span>
                          ) : deliveryFeePending(order) ? (
                            <span className="text-amber-600 font-medium"> · fee to agree with customer</span>
                          ) : null}
                        </span>
                      </div>
                    </td>
                    <td className="py-4 px-4 font-semibold text-gray-900 whitespace-nowrap">
                      <div>GH₵ {order.total?.toFixed(2) || '0.00'}</div>
                      {order.payment_status === 'partially_paid' && (
                        <div className="text-xs text-brand-accent font-medium mt-0.5">
                          Paid GH₵ {Number(order.amount_paid || 0).toFixed(2)} · Bal GH₵ {Number(order.balance_due || 0).toFixed(2)}
                        </div>
                      )}
                    </td>
                    <td className="py-4 px-4 text-sm whitespace-nowrap">
                      <div className="flex flex-col">
                        <span className="text-gray-700">{order.payment_method || 'N/A'}</span>
                        {isDepositPlan(order.payment_plan) && (
                          <span className="text-xs text-brand mt-0.5">{depositPlanLabel()}</span>
                        )}
                        {order.payment_status === 'partially_paid' && (
                          <span className="text-xs mt-1 text-brand-accent">Partially paid</span>
                        )}
                        {orderViewTab === 'abandoned' && (
                          <span className={`text-xs mt-1 ${order.payment_status === 'failed' ? 'text-red-600' : 'text-amber-600'}`}>
                            {order.payment_status === 'failed' ? 'Failed' : 'Pending'}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold border whitespace-nowrap ${statusColors[order.status] || 'bg-gray-100 text-gray-700 border-gray-200'}`}>
                        {formatStatus(order.status)}
                      </span>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center space-x-2">
                        <Link
                          href={`/admin/orders/${order.id}`}
                          className="w-8 h-8 flex items-center justify-center text-gray-600 hover:text-brand hover:bg-brand-soft rounded-lg transition-colors cursor-pointer"
                          title="View Order"
                        >
                          <i className="ri-eye-line text-lg w-4 h-4 flex items-center justify-center"></i>
                        </Link>
                        {orderViewTab === 'abandoned' && !isPaidLike(order) && (
                          <button
                            onClick={() => handleResendPaymentLink(order)}
                            disabled={sendingPaymentLink === order.id}
                            className="w-8 h-8 flex items-center justify-center text-amber-600 hover:text-amber-800 hover:bg-amber-50 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                            title="Resend Payment Link"
                          >
                            {sendingPaymentLink === order.id ? (
                              <i className="ri-loader-4-line text-lg w-4 h-4 flex items-center justify-center animate-spin"></i>
                            ) : (
                              <i className="ri-send-plane-line text-lg w-4 h-4 flex items-center justify-center"></i>
                            )}
                          </button>
                        )}
                        <button
                          onClick={() => handlePrintInvoice(order.id)}
                          className="w-8 h-8 flex items-center justify-center text-gray-600 hover:text-brand hover:bg-brand-soft rounded-lg transition-colors cursor-pointer"
                          title="Print Invoice"
                        >
                          <i className="ri-printer-line text-lg w-4 h-4 flex items-center justify-center"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {filteredOrders.length > 0 && (
          <div className="p-6 border-t border-gray-200 flex items-center justify-between">
            <p className="text-gray-600">Showing {filteredOrders.length} of {orders.length} orders</p>
          </div>
        )}
      </div>

      <ProductSalesStats isOpen={showProductStats} onClose={() => setShowProductStats(false)} />
    </div>
  );
}
