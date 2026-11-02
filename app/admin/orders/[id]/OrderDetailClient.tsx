/* eslint-disable react-hooks/exhaustive-deps */
'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import FraudDetectionAlert from '@/components/FraudDetectionAlert';
import { depositPlanLabel, isDepositPlan } from '@/lib/payments/plans';
import { deliveryMethodLabel, isDeliveryMethod, orderChannelLabel } from '@/lib/shipping';

interface OrderDetailClientProps {
  orderId: string;
}

type RiskLevel = 'low' | 'medium' | 'high';

interface FraudAnalysis {
  riskLevel: RiskLevel;
  reasons: string[];
}

export default function OrderDetailClient({ orderId }: OrderDetailClientProps) {
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const [trackingNumber, setTrackingNumber] = useState('');
  const [adminNotes, setAdminNotes] = useState('');
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [settling, setSettling] = useState(false);
  const [settleMethod, setSettleMethod] = useState('cash');
  const [settleNote, setSettleNote] = useState('');
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [cancelPrompt, setCancelPrompt] = useState(false);
  const [cancellationReason, setCancellationReason] = useState('');
  const [autoPrinted, setAutoPrinted] = useState(false);

  const handlePrint = () => {
    window.print();
  };

  // /admin/orders/<id>?print=true opens the print dialog once the order has loaded.
  useEffect(() => {
    if (!order || autoPrinted) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('print') === 'true') {
      setAutoPrinted(true);
      const t = window.setTimeout(() => window.print(), 300);
      return () => window.clearTimeout(t);
    }
  }, [order, autoPrinted]);

  // Inject print styles
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const styleId = 'order-print-styles';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = '@media print { body * { visibility: hidden; } .print-section, .print-section * { visibility: visible; } .print-section { position: absolute; left: 0; top: 0; width: 100%; padding: 20px; } .no-print { display: none !important; } }';
      document.head.appendChild(style);
    }
    return () => {
      const el = document.getElementById(styleId);
      if (el) el.remove();
    };
  }, []);

  useEffect(() => {
    fetchOrderDetails();
  }, [orderId]);

  const fetchOrderDetails = async () => {
    try {
      setLoading(true);
      // Try to fetch by ID or order_number
      let query = supabase
        .from('orders')
        .select(`
          *,
          order_items (
            id,
            product_id,
            variant_id,
            product_name,
            variant_name,
            sku,
            quantity,
            unit_price,
            total_price,
            metadata,
            products (
              product_images (url)
            )
          )
        `)
        .eq('id', orderId);

      let { data, error } = await query.single();

      if (error && error.code === 'PGRST116') {
        // Not found by ID, try order_number
        const { data: dataByNum, error: errorByNum } = await supabase
          .from('orders')
          .select(`
            *,
            order_items (
              id,
              product_id,
              variant_id,
              product_name,
              variant_name,
              sku,
              quantity,
              unit_price,
              total_price,
              metadata,
              products (
                product_images (url)
              )
            )
          `)
          .eq('order_number', orderId)
          .single();

        if (dataByNum) {
          data = dataByNum;
          error = null;
        } else {
          error = errorByNum;
        }
      }

      if (error) throw error;
      setOrder(data);
      setTrackingNumber(data.metadata?.tracking_number || '');
      setAdminNotes(data.notes || '');

    } catch (err: any) {
      console.error('Error fetching order:', err);
      setError('Failed to load order details');
    } finally {
      setLoading(false);
    }
  };

  const isPaidLike = (status?: string | null) => status === 'paid' || status === 'partially_paid';

  /** Put each line's quantity back on the product (and matching variant), mirroring apply_order_payment. */
  const restoreStock = async () => {
    const items: any[] = order.order_items || [];
    for (const item of items) {
      const qty = Number(item.quantity) || 0;
      if (qty <= 0) continue;

      if (item.product_id) {
        const { data: product, error: readError } = await supabase
          .from('products')
          .select('quantity')
          .eq('id', item.product_id)
          .maybeSingle();
        if (readError) throw readError;
        if (product) {
          const { error } = await supabase
            .from('products')
            .update({ quantity: (Number(product.quantity) || 0) + qty })
            .eq('id', item.product_id);
          if (error) throw error;
        }
      }

      let variantQuery = supabase.from('product_variants').select('id, quantity');
      if (item.variant_id) {
        variantQuery = variantQuery.eq('id', item.variant_id);
      } else if (item.product_id && item.variant_name) {
        variantQuery = variantQuery.eq('product_id', item.product_id).eq('name', item.variant_name);
      } else {
        continue;
      }
      const { data: variants, error: variantError } = await variantQuery;
      if (variantError) throw variantError;
      for (const variant of variants || []) {
        const { error } = await supabase
          .from('product_variants')
          .update({ quantity: (Number(variant.quantity) || 0) + qty })
          .eq('id', variant.id);
        if (error) throw error;
      }
    }
  };

  const handleUpdateStatus = async (newStatus?: string, options: { reason?: string; onHold?: boolean } = {}) => {
    if (!order || statusUpdating) return;
    const statusToUpdate = newStatus || pendingStatus || order.status;

    // Transition guards
    if (['shipped', 'delivered'].includes(statusToUpdate) && !isPaidLike(order.payment_status)) {
      setNotice({ type: 'error', text: `This order is ${order.payment_status || 'unpaid'} — it cannot be marked ${statusLabel(statusToUpdate)} until payment is recorded.` });
      setShowStatusMenu(false);
      return;
    }
    if (statusToUpdate === 'cancelled' && order.status !== 'cancelled' && options.reason === undefined) {
      setShowStatusMenu(false);
      setCancelPrompt(true);
      return;
    }

    try {
      setStatusUpdating(true);
      setNotice(null);

      // Re-read the row so metadata written elsewhere (payment refs, stock flags) is not clobbered.
      const { data: fresh, error: freshError } = await supabase
        .from('orders')
        .select('status, payment_status, metadata')
        .eq('id', order.id)
        .single();
      if (freshError) throw freshError;

      const freshMetadata = { ...(fresh?.metadata || {}) };
      const nextMetadata: Record<string, any> = { ...freshMetadata, tracking_number: trackingNumber };
      if (options.onHold !== undefined) nextMetadata.on_hold = options.onHold;
      if (statusToUpdate !== 'pending' && nextMetadata.on_hold) nextMetadata.on_hold = false;

      const cancelling = statusToUpdate === 'cancelled' && fresh?.status !== 'cancelled';
      if (cancelling) {
        nextMetadata.cancellation_reason = options.reason || '';
        nextMetadata.cancelled_at = new Date().toISOString();
        if (freshMetadata.stock_reduced && !freshMetadata.stock_restored) {
          await restoreStock();
          nextMetadata.stock_restored = true;
        }
      }

      const { error } = await supabase
        .from('orders')
        .update({
          status: statusToUpdate,
          notes: adminNotes,
          metadata: nextMetadata,
          updated_at: new Date().toISOString()
        })
        .eq('id', order.id);

      if (error) throw error;

      // Update local state
      setOrder({
        ...order,
        status: statusToUpdate,
        notes: adminNotes,
        metadata: nextMetadata
      });

      // Send Notification (Email + SMS)
      // Only send if status changed OR tracking number was added/changed
      const statusChanged = statusToUpdate !== order.status;
      const trackingChanged = trackingNumber !== (freshMetadata.tracking_number || '');

      let notifyText = '';
      if (statusChanged || (trackingChanged && trackingNumber)) {
        const { data: { session } } = await supabase.auth.getSession();
        const authToken = session?.access_token;

        try {
          const res = await fetch('/api/notifications', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(authToken && { 'Authorization': `Bearer ${authToken}` })
            },
            body: JSON.stringify({
              type: 'order_status',
              payload: {
                email: order.email,
                name: customerName,
                orderId: orderId,
                orderNumber: order.order_number || orderId,
                status: statusToUpdate,
                trackingNumber: trackingNumber,
                phone: shippingAddress.phone || order.phone // Ensure phone is passed for SMS
              }
            })
          });
          const result = await res.json().catch(() => ({}));
          notifyText = res.ok
            ? ` Customer notified${result?.message ? ` (${result.message})` : ''}.`
            : ` Customer notification failed: ${result?.error || result?.message || `HTTP ${res.status}`}.`;
        } catch (notifyErr: any) {
          notifyText = ` Customer notification failed: ${notifyErr?.message || 'network error'}.`;
        }
      }

      const stockText = cancelling && nextMetadata.stock_restored && !freshMetadata.stock_restored ? ' Stock restored.' : '';
      setNotice({
        type: notifyText.includes('failed') ? 'error' : 'success',
        text: `Order updated${statusChanged ? ` to ${statusLabel(statusToUpdate)}` : ''}.${stockText}${notifyText}`
      });
      setShowStatusMenu(false);
      setCancelPrompt(false);
      setCancellationReason('');
      setPendingStatus(null);
    } catch (err: any) {
      console.error('Error updating order:', err);
      setNotice({ type: 'error', text: `Failed to update order: ${err?.message || 'unknown error'}` });
    } finally {
      setStatusUpdating(false);
    }
  };

  const [resendingNotification, setResendingNotification] = useState(false);

  const handleResendNotification = async () => {
    if (!order) return;

    try {
      setResendingNotification(true);

      // Get auth token
      const { data: { session } } = await supabase.auth.getSession();
      const authToken = session?.access_token;

      const shippingAddress = order.shipping_address || {};
      const customerName = (shippingAddress.firstName && shippingAddress.lastName)
        ? `${shippingAddress.firstName.trim()} ${shippingAddress.lastName.trim()}`
        : shippingAddress.full_name || shippingAddress.firstName || order.email?.split('@')[0] || 'Customer';

      const response = await fetch('/api/notifications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken && { 'Authorization': `Bearer ${authToken}` })
        },
        body: JSON.stringify({
          type: 'order_status',
          payload: {
            email: order.email,
            name: customerName,
            orderNumber: order.order_number || order.id,
            status: order.status,
            trackingNumber: order.metadata?.tracking_number || '',
            phone: order.phone || shippingAddress.phone
          }
        })
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result.error || result.message || `Failed to send notification (HTTP ${response.status})`);
      }

      setNotice({ type: 'success', text: result.message ? `Notification sent: ${result.message}` : 'Notification sent (email + SMS if a phone number is on file).' });
    } catch (err: any) {
      console.error('Error resending notification:', err);
      setNotice({ type: 'error', text: `Failed to resend notification: ${err.message || 'Unknown error'}` });
    } finally {
      setResendingNotification(false);
    }
  };

  const handleHoldOrder = () => handleUpdateStatus('pending', { onHold: true });
  const handleContactCustomer = () => {
    const phone = order?.phone || order?.shipping_address?.phone;
    if (phone) {
      window.location.href = `tel:${String(phone).replace(/[^+\d]/g, '')}`;
    } else if (order?.email && !/\.local$/i.test(order.email)) {
      window.location.href = `mailto:${order.email}?subject=${encodeURIComponent(`Your order ${order.order_number || ''}`)}`;
    } else {
      setNotice({ type: 'error', text: 'This order has no phone number or usable email address.' });
    }
  };

  const statusOptions = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];
  const statusLabel = (s: string) => {
    if (s === 'shipped') return 'Packaged';
    if (s === 'awaiting_payment') return 'Awaiting payment';
    const clean = (s || '').replace(/_/g, ' ');
    return clean.charAt(0).toUpperCase() + clean.slice(1);
  };
  const statusColors: any = {
    'pending': 'bg-amber-100 text-amber-700 border-amber-200',
    'processing': 'bg-brand-soft text-brand border-brand/30',
    'shipped': 'bg-purple-100 text-purple-700 border-purple-200',
    'delivered': 'bg-brand-soft text-brand border-brand/30',
    'cancelled': 'bg-red-100 text-red-700 border-red-200',
    'awaiting_payment': 'bg-gray-100 text-gray-700 border-gray-200'
  };

  if (loading) return <div className="p-8 text-center">Loading...</div>;
  if (error || !order) return <div className="p-8 text-center text-red-500">{error || 'Order not found'}</div>;

  const currentStatus = pendingStatus || order.status || 'pending';
  const shippingAddress = order.shipping_address || {};
  const customerName = (shippingAddress.firstName && shippingAddress.lastName)
    ? `${shippingAddress.firstName.trim()} ${shippingAddress.lastName.trim()}`
    : shippingAddress.full_name || shippingAddress.firstName || order.email?.split('@')[0] || 'Customer';

  // Derive timeline from status (simplified logic as we don't have full history table joined here yet)
  const timeline = [
    { status: 'Order Placed', date: new Date(order.created_at).toLocaleString(), completed: true },
    {
      status: 'Payment',
      date: order.payment_status,
      completed: order.payment_status === 'paid' || order.payment_status === 'partially_paid',
    },
    { status: 'Processing', date: '', completed: ['processing', 'shipped', 'delivered'].includes(order.status) },
    { status: 'Packaged', date: '', completed: ['shipped', 'delivered'].includes(order.status) },
    { status: 'Delivered', date: '', completed: order.status === 'delivered' }
  ];

  // Simple risk heuristics from the order's own data
  const fraudReasons: string[] = [];
  if (Number(order.total || 0) > 2000) fraudReasons.push('Order total is above GH₵ 2,000');
  if (!order.phone && !shippingAddress.phone) fraudReasons.push('No phone number on the order');
  if (/\.local$/i.test(order.email || '')) fraudReasons.push('Placeholder email address (walk-in / POS)');
  if (order.metadata?.on_hold) fraudReasons.push('Order is currently on hold');
  const fraudAnalysis: FraudAnalysis = {
    riskLevel: fraudReasons.length >= 2 ? 'high' : fraudReasons.length === 1 ? 'medium' : 'low',
    reasons: fraudReasons
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Print styles injected via useEffect */}

      {/* Printable Order Slip */}
      <div className="print-section hidden print:block bg-white p-8">
        <div className="border-2 border-gray-800 p-6">
          {/* Header */}
          <div className="flex justify-between items-start border-b-2 border-gray-800 pb-4 mb-4">
            <div>
              <h1 className="text-2xl font-bold">AbbyGlow Essentials</h1>
              <p className="text-sm text-gray-600">Order Packing Slip</p>
            </div>
            <div className="text-right">
              <p className="font-bold text-lg">{order?.order_number}</p>
              <p className="text-sm">{order ? new Date(order.created_at).toLocaleDateString() : ''}</p>
            </div>
          </div>

          {/* Ship To */}
          <div className="mb-6">
            <h2 className="font-bold text-lg mb-2 bg-gray-200 px-2 py-1">SHIP TO:</h2>
            <div className="pl-2">
              <p className="font-bold text-lg">{customerName}</p>
              <p>{shippingAddress.phone || order?.phone}</p>
              <p>{shippingAddress.address || shippingAddress.address_line1}</p>
              <p>{shippingAddress.city}{(shippingAddress.region || shippingAddress.state) && `, ${shippingAddress.region || shippingAddress.state}`}</p>
            </div>
          </div>

          {/* Order Items */}
          <div className="mb-6">
            <h2 className="font-bold text-lg mb-2 bg-gray-200 px-2 py-1">ORDER ITEMS:</h2>
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-400">
                  <th className="text-left py-2 px-2">Product</th>
                  <th className="text-left py-2 px-2">Variant</th>
                  <th className="text-center py-2 px-2">Qty</th>
                  <th className="text-right py-2 px-2">Price</th>
                </tr>
              </thead>
              <tbody>
                {order?.order_items?.map((item: any) => (
                  <tr key={item.id} className="border-b border-gray-200">
                    <td className="py-2 px-2 font-medium">{item.product_name}</td>
                    <td className="py-2 px-2 text-sm">{item.variant_name || '-'}</td>
                    <td className="py-2 px-2 text-center font-bold">{item.quantity}</td>
                    <td className="py-2 px-2 text-right">GH₵ {item.unit_price?.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Order Summary */}
          <div className="flex justify-between mb-6">
            <div>
              <p><span className="font-semibold">Delivery:</span> {deliveryMethodLabel(order?.shipping_method || order?.metadata?.delivery_method)}</p>
              <p><span className="font-semibold">Channel:</span> {orderChannelLabel(order)}</p>
              <p><span className="font-semibold">Payment:</span> {order?.payment_method} ({order?.payment_status})</p>
              {trackingNumber && <p><span className="font-semibold">Tracking #:</span> {trackingNumber}</p>}
            </div>
            <div className="text-right">
              <p>Subtotal: GH₵ {order?.subtotal?.toFixed(2)}</p>
              <p>Shipping: GH₵ {order?.shipping_total?.toFixed(2)}</p>
              <p className="font-bold text-lg border-t border-gray-400 pt-1 mt-1">Total: GH₵ {order?.total?.toFixed(2)}</p>
            </div>
          </div>

          {/* Footer */}
          <div className="border-t-2 border-gray-800 pt-4 text-center text-sm text-gray-600">
            <p>Thank you for shopping with us.</p>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6 no-print">
        {/* Page Header with Print Button */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-4">
            <Link href="/admin/orders" className="text-gray-600 hover:text-gray-900">
              <i className="ri-arrow-left-line text-2xl"></i>
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{order?.order_number}</h1>
              <p className="text-sm text-gray-600">Order placed on {order ? new Date(order.created_at).toLocaleDateString() : ''}</p>
            </div>
          </div>
          <button
            onClick={handlePrint}
            className="flex items-center space-x-2 bg-gray-800 hover:bg-gray-900 text-white px-4 py-2 rounded-lg font-medium transition-colors"
          >
            <i className="ri-printer-line text-lg"></i>
            <span>Print Order</span>
          </button>
        </div>

        {notice && (
          <div className={`mb-6 rounded-lg p-4 text-sm flex items-start justify-between gap-4 border ${notice.type === 'success' ? 'bg-brand-soft text-brand border-brand/30' : 'bg-red-50 text-red-700 border-red-200'}`}>
            <span>{notice.text}</span>
            <button onClick={() => setNotice(null)} className="shrink-0 cursor-pointer" aria-label="Dismiss">
              <i className="ri-close-line text-lg"></i>
            </button>
          </div>
        )}

        {cancelPrompt && (
          <div className="mb-6 bg-white border-2 border-red-200 rounded-xl p-6">
            <h3 className="font-bold text-gray-900 mb-1">Cancel this order?</h3>
            <p className="text-sm text-gray-600 mb-3">
              {order.metadata?.stock_reduced && !order.metadata?.stock_restored
                ? 'Stock for each item will be returned to inventory.'
                : 'Stock was never reduced for this order, so inventory will not change.'}
            </p>
            <input
              type="text"
              value={cancellationReason}
              onChange={(e) => setCancellationReason(e.target.value)}
              placeholder="Reason for cancellation (shown in order metadata)"
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-red-400 focus:border-red-400 mb-3"
            />
            <div className="flex gap-3">
              <button
                onClick={() => handleUpdateStatus('cancelled', { reason: cancellationReason.trim() })}
                disabled={statusUpdating || !cancellationReason.trim()}
                className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold disabled:opacity-50"
              >
                {statusUpdating ? 'Cancelling...' : 'Confirm cancellation'}
              </button>
              <button
                onClick={() => { setCancelPrompt(false); setCancellationReason(''); }}
                disabled={statusUpdating}
                className="px-5 py-2.5 border-2 border-gray-300 text-gray-700 rounded-lg font-semibold hover:border-gray-400"
              >
                Keep order
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {fraudAnalysis.riskLevel !== 'low' && (
              <FraudDetectionAlert
                riskLevel={fraudAnalysis.riskLevel}
                reasons={fraudAnalysis.reasons}
                orderId={order.order_number || orderId}
                onHold={order.metadata?.on_hold ? undefined : handleHoldOrder}
                onContact={handleContactCustomer}
                busy={statusUpdating}
              />
            )}

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-gray-900">Order Items</h2>
                <span className="text-gray-600">{order.order_items?.length || 0} items</span>
              </div>

              <div className="space-y-4">
                {order.order_items?.map((item: any) => (
                  <div key={item.id} className="flex items-start space-x-4 p-4 bg-gray-50 rounded-lg">
                    <div className="w-20 h-20 bg-white rounded-lg overflow-hidden border border-gray-200 flex items-center justify-center relative">
                      {item.products?.product_images?.[0]?.url ? (
                        <img
                          src={item.products.product_images[0].url}
                          alt={item.product_name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <i className="ri-image-line text-2xl text-gray-300"></i>
                      )}
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900 mb-1">{item.product_name}</h3>
                      <p className="text-sm text-gray-600 mb-1">{item.variant_name}</p>
                      <p className="text-xs text-gray-500">SKU: {item.sku}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-gray-900 mb-1">GH₵ {item.unit_price?.toFixed(2)}</p>
                      <p className="text-sm text-gray-600">Qty: {item.quantity}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 pt-6 border-t border-gray-200 space-y-3">
                <div className="flex justify-between text-gray-700">
                  <span>Subtotal</span>
                  <span>GH₵ {order.subtotal?.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-gray-700">
                  <span>Shipping</span>
                  <span>GH₵ {order.shipping_total?.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-gray-700">
                  <span>Tax</span>
                  <span>GH₵ {order.tax_total?.toFixed(2)}</span>
                </div>
                {order.discount_total > 0 && (
                  <div className="flex justify-between text-brand font-semibold">
                    <span>Discount</span>
                    <span>-GH₵ {order.discount_total?.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-xl font-bold text-gray-900 pt-3 border-t border-gray-200">
                  <span>Total</span>
                  <span>GH₵ {order.total?.toFixed(2)}</span>
                </div>
                {isDepositPlan(order.payment_plan) && (
                  <div className="flex justify-between text-gray-700">
                    <span>Plan</span>
                    <span className="font-semibold">{depositPlanLabel()}</span>
                  </div>
                )}
                <div className="flex justify-between text-gray-700">
                  <span>Amount paid</span>
                  <span className="font-semibold text-brand">
                    GH₵ {Number(order.amount_paid || 0).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between text-gray-700">
                  <span>Balance due</span>
                  <span className="font-semibold text-brand-accent">
                    GH₵ {Number(order.balance_due || 0).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-6">Order Timeline</h2>
              <div className="space-y-4">
                {timeline.map((event, index) => (
                  <div key={index} className="flex items-start space-x-4">
                    <div className={`w-10 h-10 flex items-center justify-center rounded-full border-2 ${event.completed ? 'bg-brand border-brand' : 'bg-white border-gray-300'
                      }`}>
                      {event.completed ? (
                        <i className="ri-check-line text-white text-xl"></i>
                      ) : (
                        <span className="w-3 h-3 bg-gray-300 rounded-full"></span>
                      )}
                    </div>
                    <div className="flex-1 pb-6 border-b border-gray-200 last:border-0">
                      <p className={`font-semibold ${event.completed ? 'text-gray-900' : 'text-gray-500'}`}>
                        {event.status}
                      </p>
                      {event.date && (
                        <p className="text-sm text-gray-600 mt-1">{event.date}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Order Status</h2>
              <div className="relative">
                <button
                  onClick={() => setShowStatusMenu(!showStatusMenu)}
                  className={`w-full px-4 py-3 rounded-lg border-2 font-semibold text-left flex items-center justify-between ${statusColors[currentStatus] || 'bg-gray-100'}`}
                >
                  <span>{statusLabel(currentStatus)}</span>
                  <i className="ri-arrow-down-s-line text-xl"></i>
                </button>
                {showStatusMenu && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-white border-2 border-gray-200 rounded-lg shadow-lg overflow-hidden z-10">
                    {statusOptions.map((status) => (
                      <button
                        key={status}
                        onClick={() => {
                          // Selecting only stages the change; "Update Status" applies it.
                          setPendingStatus(status === order?.status ? null : status);
                          setShowStatusMenu(false);
                        }}
                        className={`w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors ${status === currentStatus ? 'bg-brand-soft font-semibold' : ''
                          }`}
                      >
                        {statusLabel(status)}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-4">
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  Tracking Number
                </label>
                <input
                  type="text"
                  value={trackingNumber}
                  onChange={(e) => setTrackingNumber(e.target.value)}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-brand focus:border-brand"
                />
              </div>

              <button
                onClick={() => handleUpdateStatus()}
                disabled={statusUpdating}
                className="w-full mt-4 bg-brand hover:bg-brand-dark text-white py-3 rounded-lg font-semibold transition-colors whitespace-nowrap disabled:opacity-50"
              >
                {statusUpdating ? 'Updating...' : pendingStatus ? `Update Status to ${statusLabel(pendingStatus)}` : 'Save Tracking & Notes'}
              </button>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Customer</h2>
              <div className="flex items-start space-x-3 mb-4">
                <div className="w-12 h-12 flex items-center justify-center bg-brand-soft text-brand rounded-full font-semibold uppercase">
                  {customerName.substring(0, 2)}
                </div>
                <div>
                  <p className="font-semibold text-gray-900">{customerName}</p>
                  <p className="text-sm text-gray-600">{order.email}</p>
                  <p className="text-sm text-gray-600">{shippingAddress.phone || order.phone}</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Delivery</h2>
              <div className="space-y-2 mb-4">
                <div className="flex justify-between">
                  <span className="text-gray-600">Method</span>
                  <span className="font-semibold text-gray-900">{deliveryMethodLabel(order.shipping_method || order.metadata?.delivery_method)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Delivery fee</span>
                  <span className="font-semibold text-gray-900">{Number(order.shipping_total || 0) > 0 ? `GH₵ ${Number(order.shipping_total).toFixed(2)}` : 'Free'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Channel</span>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${orderChannelLabel(order) === 'POS' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                    {orderChannelLabel(order)}
                  </span>
                </div>
              </div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">{isDeliveryMethod(order.shipping_method || order.metadata?.delivery_method) ? 'Deliver to' : 'Customer address'}</h3>
              <div className="text-gray-700 space-y-1">
                {/* Support both old field names (address_line1) and new (address) */}
                <p>{shippingAddress.address || shippingAddress.address_line1}</p>
                {(shippingAddress.address_line2) && <p>{shippingAddress.address_line2}</p>}
                <p>
                  {shippingAddress.city}
                  {(shippingAddress.region || shippingAddress.state) && `, ${shippingAddress.region || shippingAddress.state}`}
                </p>
                {shippingAddress.postal_code && <p>{shippingAddress.postal_code}</p>}
                {shippingAddress.country && <p className="font-semibold">{shippingAddress.country}</p>}
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Payment Info</h2>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600">Method</span>
                  <span className="font-semibold text-gray-900 capitalize">{order.payment_method}</span>
                </div>
                {isDepositPlan(order.payment_plan) && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Plan</span>
                    <span className="font-semibold text-gray-900">{depositPlanLabel()}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-600">Status</span>
                  <span className="px-3 py-1 bg-brand-soft text-brand rounded-full text-sm font-semibold whitespace-nowrap capitalize">
                    {order.payment_status}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Paid / Balance</span>
                  <span className="text-sm font-semibold text-gray-900">
                    GH₵ {Number(order.amount_paid || 0).toFixed(2)} / GH₵ {Number(order.balance_due || 0).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Transaction</span>
                  <span className="text-sm text-gray-900 font-mono truncate max-w-[150px]">
                    {order.metadata?.last_payment_ref ||
                      order.metadata?.moolre_reference ||
                      order.payment_transaction_id ||
                      'N/A'}
                  </span>
                </div>
              </div>

              {Number(order.balance_due || 0) > 0.01 && order.payment_status !== 'paid' && (
                <div className="mt-5 pt-5 border-t border-gray-100 space-y-3">
                  <p className="text-sm font-semibold text-gray-900">Record balance received</p>
                  <select
                    value={settleMethod}
                    onChange={(e) => setSettleMethod(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  >
                    <option value="cash">Cash</option>
                    <option value="momo">Mobile Money</option>
                    <option value="bank">Bank transfer</option>
                  </select>
                  <input
                    type="text"
                    value={settleNote}
                    onChange={(e) => setSettleNote(e.target.value)}
                    placeholder="Optional note"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                  <button
                    type="button"
                    disabled={settling}
                    onClick={async () => {
                      setSettling(true);
                      try {
                        const { data: { session } } = await supabase.auth.getSession();
                        const res = await fetch('/api/admin/orders/settle-balance', {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json',
                            ...(session?.access_token
                              ? { Authorization: `Bearer ${session.access_token}` }
                              : {}),
                          },
                          body: JSON.stringify({
                            orderNumber: order.order_number,
                            method: settleMethod,
                            note: settleNote,
                          }),
                        });
                        const result = await res.json().catch(() => ({}));
                        if (!res.ok || !result.success) throw new Error(result.message || result.error || 'Failed');
                        await fetchOrderDetails();
                        setNotice({ type: 'success', text: 'Balance recorded — order payment updated.' });
                      } catch (e: any) {
                        setNotice({ type: 'error', text: e.message || 'Failed to settle balance' });
                      } finally {
                        setSettling(false);
                      }
                    }}
                    className="w-full bg-brand-accent hover:bg-brand-accentDark text-white py-2.5 rounded-lg font-semibold text-sm disabled:opacity-50"
                  >
                    {settling ? 'Saving...' : 'Mark balance paid'}
                  </button>
                  <a
                    href={`/pay/${order.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="block w-full text-center border-2 border-brand text-brand py-2.5 rounded-lg font-semibold text-sm hover:bg-brand-soft"
                  >
                    Open customer balance pay link
                  </a>
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Notifications</h2>
              <p className="text-sm text-gray-600 mb-4">
                Resend email and SMS notifications to the customer about the current order status.
              </p>
              <button
                onClick={handleResendNotification}
                disabled={resendingNotification}
                className="w-full bg-brand hover:bg-brand-dark text-white py-3 rounded-lg font-semibold transition-colors whitespace-nowrap disabled:opacity-50 flex items-center justify-center"
              >
                {resendingNotification ? (
                  <>
                    <i className="ri-loader-4-line animate-spin mr-2"></i>
                    Sending...
                  </>
                ) : (
                  <>
                    <i className="ri-notification-3-line mr-2"></i>
                    Resend Notifications
                  </>
                )}
              </button>
              <p className="text-xs text-gray-500 mt-2">
                Phone: {order.phone || shippingAddress.phone || 'Not provided'}
              </p>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Admin Notes</h2>
              <textarea
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                placeholder="Add internal notes about this order..."
                rows={4}
                maxLength={500}
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-brand focus:border-brand resize-none"
              />
              <button
                onClick={() => handleUpdateStatus()}
                disabled={statusUpdating}
                className="w-full mt-3 bg-gray-700 hover:bg-gray-800 text-white py-2 rounded-lg font-medium transition-colors whitespace-nowrap disabled:opacity-50"
              >
                Save Note
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
