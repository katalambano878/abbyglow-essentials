'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useCart } from '@/context/CartContext';
import { escapeHtml } from '@/lib/sanitize';
import { isPreorderProduct } from '@/lib/preorder';
import { SITE_NAME } from '@/lib/seo';

const PLACEHOLDER = '/images/placeholder-product.svg';

interface OrderItem {
  id: string;
  productId: string | null;
  variantId: string | null;
  variantName: string | null;
  name: string;
  image: string;
  quantity: number;
  price: number;
}

interface Order {
  id: string;
  orderNumber: string;
  date: string;
  status: string;
  paymentStatus: string;
  total: number;
  subtotal: number;
  shippingTotal: number;
  discountTotal: number;
  balanceDue: number;
  amountPaid: number;
  shippingAddress: any;
  items: OrderItem[];
}

export default function OrderHistory() {
  const { addToCart, setIsCartOpen } = useCart();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [signedIn, setSignedIn] = useState(true);
  const [reorderingId, setReorderingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ orderId: string; type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchOrders() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (cancelled) return;
        if (!session) {
          setSignedIn(false);
          return;
        }

        const { data, error: qError } = await supabase
          .from('orders')
          .select('*, order_items (*)')
          .eq('user_id', session.user.id)
          .order('created_at', { ascending: false });

        if (qError) throw qError;
        if (cancelled) return;

        const formatted: Order[] = (data || []).map((order: any) => ({
          id: order.id,
          orderNumber: order.order_number,
          date: order.created_at,
          status: order.status || 'pending',
          paymentStatus: order.payment_status || 'pending',
          total: Number(order.total) || 0,
          subtotal: Number(order.subtotal) || 0,
          shippingTotal: Number(order.shipping_total) || 0,
          discountTotal: Number(order.discount_total) || 0,
          balanceDue: Number(order.balance_due) || 0,
          amountPaid: Number(order.amount_paid) || 0,
          shippingAddress: order.shipping_address || null,
          items: (order.order_items || []).map((item: any) => ({
            id: item.id,
            productId: item.product_id || null,
            variantId: item.variant_id || item.metadata?.variant_id || null,
            variantName: item.variant_name || null,
            name: item.product_name,
            image: item.metadata?.image || PLACEHOLDER,
            quantity: Number(item.quantity) || 1,
            price: Number(item.unit_price) || 0,
          })),
        }));
        setOrders(formatted);
      } catch (err: any) {
        console.error('Error fetching orders:', err);
        if (!cancelled) setError(err?.message || 'Could not load your orders.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchOrders();
    return () => {
      cancelled = true;
    };
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'delivered':
        return 'bg-green-100 text-green-700';
      case 'shipped':
        return 'bg-brand-soft text-brand';
      case 'processing':
        return 'bg-yellow-100 text-yellow-700';
      case 'cancelled':
      case 'refunded':
        return 'bg-red-100 text-red-700';
      default: // pending / awaiting_payment
        return 'bg-gray-100 text-gray-700';
    }
  };

  const statusLabel = (status: string) => {
    if (status === 'shipped') return 'Packaged';
    return status.replace(/_/g, ' ').replace(/^\w/, (c: string) => c.toUpperCase());
  };

  const handleReorder = async (order: Order) => {
    setReorderingId(order.id);
    setMessage(null);
    try {
      const ids = Array.from(new Set(order.items.map((i) => i.productId).filter(Boolean))) as string[];
      if (ids.length === 0) {
        setMessage({ orderId: order.id, type: 'error', text: 'These items are no longer available to reorder.' });
        return;
      }

      const { data, error: qError } = await supabase
        .from('products')
        .select('id, name, slug, price, quantity, status, metadata, product_images(url), product_variants(id, name, price, quantity)')
        .in('id', ids);
      if (qError) throw qError;

      const byId = new Map<string, any>((data || []).map((p: any) => [p.id, p]));
      let added = 0;
      const skipped: string[] = [];

      for (const item of order.items) {
        const product = item.productId ? byId.get(item.productId) : null;
        if (!product || product.status !== 'active') {
          skipped.push(item.name);
          continue;
        }
        const preorder = isPreorderProduct(product.metadata);
        const variant = item.variantId
          ? (product.product_variants || []).find((v: any) => v.id === item.variantId)
          : null;
        if (item.variantId && !variant) {
          skipped.push(item.name);
          continue;
        }
        const stock = Number(variant ? variant.quantity : product.quantity) || 0;
        if (!preorder && stock <= 0) {
          skipped.push(item.name);
          continue;
        }
        const maxStock = preorder ? 999 : stock;
        const price = Number(variant ? variant.price ?? product.price : product.price) || 0;
        const image = product.product_images?.[0]?.url || item.image || PLACEHOLDER;

        addToCart({
          id: product.id,
          name: product.name,
          price,
          image,
          quantity: Math.min(item.quantity, maxStock),
          variant: variant ? variant.name : undefined,
          slug: product.slug,
          maxStock,
          isPreorder: preorder,
        });
        added += 1;
      }

      if (added === 0) {
        setMessage({ orderId: order.id, type: 'error', text: 'None of the items in this order are available right now.' });
        return;
      }
      setIsCartOpen(true);
      setMessage({
        orderId: order.id,
        type: 'success',
        text:
          skipped.length > 0
            ? `${added} item${added === 1 ? '' : 's'} added to your cart. Unavailable: ${skipped.join(', ')}.`
            : `${added} item${added === 1 ? '' : 's'} added to your cart at today's prices.`,
      });
    } catch (err: any) {
      setMessage({ orderId: order.id, type: 'error', text: err?.message || 'Could not reorder right now.' });
    } finally {
      setReorderingId(null);
    }
  };

  const handlePrintInvoice = (order: Order) => {
    const addr = order.shippingAddress || {};
    const customer = [addr.firstName, addr.lastName].filter(Boolean).join(' ');
    const addressLines = [addr.address, [addr.city, addr.region].filter(Boolean).join(', ')].filter(Boolean);
    const rows = order.items
      .map(
        (i) => `<tr>
          <td>${escapeHtml(i.name)}${i.variantName ? ` <small>(${escapeHtml(i.variantName)})</small>` : ''}</td>
          <td class="num">${i.quantity}</td>
          <td class="num">GH₵${i.price.toFixed(2)}</td>
          <td class="num">GH₵${(i.price * i.quantity).toFixed(2)}</td>
        </tr>`
      )
      .join('');
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Invoice ${escapeHtml(order.orderNumber)}</title>
      <style>
        body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:40px;font-size:14px}
        h1{font-size:22px;margin:0 0 4px}
        .muted{color:#666}
        table{width:100%;border-collapse:collapse;margin-top:24px}
        th,td{padding:8px 6px;border-bottom:1px solid #ddd;text-align:left}
        .num{text-align:right}
        .totals td{border:0;padding:4px 6px}
        .totals{margin-top:12px;width:auto;margin-left:auto}
        .grid{display:flex;justify-content:space-between;gap:24px;margin-top:24px}
      </style></head><body>
      <h1>${escapeHtml(SITE_NAME)}</h1>
      <div class="muted">Invoice for order ${escapeHtml(order.orderNumber)}</div>
      <div class="grid">
        <div><strong>Bill to</strong><br>${escapeHtml(customer || '—')}<br>${addressLines.map(escapeHtml).join('<br>')}${addr.phone ? `<br>${escapeHtml(addr.phone)}` : ''}</div>
        <div><strong>Date</strong><br>${escapeHtml(new Date(order.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }))}<br><strong>Status</strong><br>${escapeHtml(statusLabel(order.status))} · ${escapeHtml(statusLabel(order.paymentStatus))}</div>
      </div>
      <table><thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Unit</th><th class="num">Total</th></tr></thead><tbody>${rows}</tbody></table>
      <table class="totals">
        <tr><td>Subtotal</td><td class="num">GH₵${order.subtotal.toFixed(2)}</td></tr>
        ${order.discountTotal > 0 ? `<tr><td>Discount</td><td class="num">-GH₵${order.discountTotal.toFixed(2)}</td></tr>` : ''}
        <tr><td>Delivery</td><td class="num">GH₵${order.shippingTotal.toFixed(2)}</td></tr>
        <tr><td><strong>Total</strong></td><td class="num"><strong>GH₵${order.total.toFixed(2)}</strong></td></tr>
        <tr><td>Paid</td><td class="num">GH₵${order.amountPaid.toFixed(2)}</td></tr>
        ${order.balanceDue > 0 ? `<tr><td>Balance due</td><td class="num">GH₵${order.balanceDue.toFixed(2)}</td></tr>` : ''}
      </table>
      <p class="muted" style="margin-top:32px">Thank you for shopping with ${escapeHtml(SITE_NAME)}.</p>
      <script>window.onload=function(){window.print();}</script>
      </body></html>`;

    const win = window.open('', '_blank', 'width=800,height=900');
    if (!win) {
      setMessage({ orderId: order.id, type: 'error', text: 'Allow pop-ups for this site to print the invoice.' });
      return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
  };

  if (loading) {
    return (
      <div className="py-8 text-center">
        <i className="ri-loader-4-line animate-spin text-3xl text-brand"></i>
        <p className="mt-2 text-gray-500">Loading orders...</p>
      </div>
    );
  }

  if (!signedIn) {
    return (
      <div className="py-12 text-center bg-white rounded-lg border border-gray-200">
        <p className="text-gray-600 mb-4">Sign in to see your orders.</p>
        <Link href="/auth/login?next=/account?tab=orders" className="inline-block bg-brand text-white px-6 py-2 rounded-lg font-medium hover:bg-brand-dark transition-colors">
          Sign In
        </Link>
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-12 text-center bg-red-50 rounded-lg border border-red-100" role="alert">
        <i className="ri-error-warning-line text-3xl text-red-500"></i>
        <h3 className="text-lg font-semibold text-red-800 mt-2 mb-1">Could not load your orders</h3>
        <p className="text-red-700 mb-4">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="inline-block bg-white border border-red-200 text-red-700 px-6 py-2 rounded-lg font-medium hover:bg-red-100 transition-colors"
        >
          Try again
        </button>
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="py-12 text-center bg-white rounded-lg border border-gray-200">
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <i className="ri-shopping-bag-line text-3xl text-gray-400"></i>
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-1">No orders yet</h3>
        <p className="text-gray-500 mb-6">Start shopping to see your orders here.</p>
        <Link href="/shop" className="inline-block bg-brand text-white px-6 py-2 rounded-lg font-medium hover:bg-brand-dark transition-colors">
          Go to Shop
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Order History</h2>
        <div className="text-sm text-gray-600">
          Total Orders: <span className="font-bold text-gray-900">{orders.length}</span>
        </div>
      </div>

      <div className="space-y-6">
        {orders.map((order) => {
          const canPayBalance =
            order.balanceDue > 0 && !['cancelled', 'refunded'].includes(order.status);
          return (
            <div key={order.id} className="bg-white border-2 border-gray-200 rounded-lg overflow-hidden">
              <div className="bg-gray-50 border-b border-gray-200 px-6 py-4">
                <div className="flex flex-col sm:flex-row flex-wrap items-start sm:items-center justify-between gap-4">
                  <div className="flex flex-col sm:flex-row flex-wrap items-start sm:items-center gap-4 sm:gap-6 w-full sm:w-auto">
                    <div className="w-full sm:w-auto">
                      <p className="text-xs text-gray-600 mb-1">Order Number</p>
                      <p className="font-bold text-gray-900">{order.orderNumber}</p>
                    </div>
                    <div className="w-full sm:w-auto">
                      <p className="text-xs text-gray-600 mb-1">Date</p>
                      <p className="font-semibold text-gray-900">
                        {new Date(order.date).toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric'
                        })}
                      </p>
                    </div>
                    <div className="w-full sm:w-auto">
                      <p className="text-xs text-gray-600 mb-1">Total</p>
                      <p className="font-bold text-brand">GH₵{order.total.toFixed(2)}</p>
                    </div>
                    {canPayBalance && (
                      <div className="w-full sm:w-auto">
                        <p className="text-xs text-gray-600 mb-1">Balance Due</p>
                        <p className="font-bold text-amber-700">GH₵{order.balanceDue.toFixed(2)}</p>
                      </div>
                    )}
                  </div>
                  <div className="w-full sm:w-auto">
                    <span className={`inline-block px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap ${getStatusColor(order.status)}`}>
                      {statusLabel(order.status)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="p-6">
                <div className="space-y-4 mb-4">
                  {order.items.map((item) => (
                    <div key={item.id} className="flex space-x-4">
                      <div className="w-20 h-20 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0 border border-gray-200">
                        <img
                          src={item.image}
                          alt={item.name}
                          className="w-full h-full object-cover object-center"
                          onError={(e) => {
                            const img = e.currentTarget;
                            if (!img.src.endsWith(PLACEHOLDER)) img.src = PLACEHOLDER;
                          }}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold text-gray-900 mb-1">{item.name}</h4>
                        {item.variantName && <p className="text-sm text-gray-500">{item.variantName}</p>}
                        <p className="text-sm text-gray-600">Quantity: {item.quantity}</p>
                        <p className="text-sm font-bold text-gray-900 mt-1">GH₵{item.price.toFixed(2)}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {message && message.orderId === order.id && (
                  <div
                    className={`mb-4 p-3 rounded-lg text-sm flex items-start gap-2 ${message.type === 'success' ? 'bg-brand-soft text-brand border border-brand/20' : 'bg-red-50 text-red-700 border border-red-100'}`}
                    role="status"
                  >
                    <i className={`${message.type === 'success' ? 'ri-checkbox-circle-line' : 'ri-error-warning-line'} mt-0.5`}></i>
                    <span>{message.text}</span>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row flex-wrap gap-3 pt-4 border-t border-gray-200">
                  {canPayBalance && (
                    <Link
                      href={`/pay/${order.id}`}
                      className="flex-1 sm:flex-none text-center px-4 py-2 bg-amber-500 text-white rounded-lg font-semibold hover:bg-amber-600 transition-colors whitespace-nowrap"
                    >
                      <i className="ri-bank-card-line mr-2"></i>
                      Pay Balance
                    </Link>
                  )}
                  <Link
                    href={`/order-tracking?order=${encodeURIComponent(order.orderNumber)}`}
                    className="flex-1 sm:flex-none text-center px-4 py-2 bg-brand text-white rounded-lg font-semibold hover:bg-brand-dark transition-colors whitespace-nowrap"
                  >
                    <i className="ri-map-pin-line mr-2"></i>
                    Track Order
                  </Link>
                  <button
                    onClick={() => handleReorder(order)}
                    disabled={reorderingId === order.id}
                    className="flex-1 sm:flex-none px-4 py-2 border-2 border-gray-300 text-gray-900 rounded-lg font-semibold hover:bg-gray-50 transition-colors whitespace-nowrap disabled:opacity-50"
                  >
                    <i className={`${reorderingId === order.id ? 'ri-loader-4-line animate-spin' : 'ri-refresh-line'} mr-2`}></i>
                    Reorder
                  </button>
                  <button
                    onClick={() => handlePrintInvoice(order)}
                    className="flex-1 sm:flex-none px-4 py-2 border-2 border-gray-300 text-gray-900 rounded-lg font-semibold hover:bg-gray-50 transition-colors whitespace-nowrap"
                  >
                    <i className="ri-printer-line mr-2"></i>
                    Invoice
                  </button>
                  <Link
                    href="/contact"
                    className="flex-1 sm:flex-none text-center px-4 py-2 border-2 border-gray-300 text-gray-900 rounded-lg font-semibold hover:bg-gray-50 transition-colors whitespace-nowrap"
                  >
                    <i className="ri-customer-service-line mr-2"></i>
                    Get Help
                  </Link>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
