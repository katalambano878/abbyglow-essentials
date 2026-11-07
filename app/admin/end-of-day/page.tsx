'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { adminFetch, cedis } from '@/lib/admin-fetch';
import { deliveryMethodLabel } from '@/lib/shipping';

type Report = {
  day: string;
  canSeeProfit: boolean;
  summary: {
    paidOrders: number;
    partPaidOrders: number;
    unpaidOrders: number;
    cancelledOrders: number;
    posOrders: number;
    webOrders: number;
    revenue: number;
    posRevenue: number;
    webRevenue: number;
    collected: number;
    partPaidCollected: number;
    discounts: number;
    deliveryFees: number;
    toFulfil: number;
    deliveryFeeToAgree: number;
    unitsSold: number;
    averageOrder: number;
    profit: number | null;
    profitMargin: number | null;
    profitCoverage: number;
    itemsMissingCost: number;
  };
  comparison: { yesterday: number; lastWeek: number };
  payments: { method: string; channel: string; orders: number; revenue: number }[];
  items: { productId: string | null; name: string; units: number; posUnits: number; webUnits: number; revenue: number; stockLeft: number | null; profit: number | null }[];
  lowStock: { name: string; stockLeft: number | null }[];
  staff: { name: string; orders: number; revenue: number; units: number }[];
  orders: {
    id: string; order_number: string; total: number; payment_status: string; payment_method: string | null;
    status: string; created_at: string; shipping_method: string | null; staff_name: string | null; channel: string; customer: string;
  }[];
  hourly: { hour: number; orders: number; revenue: number }[];
};

const METHOD_LABELS: Record<string, string> = {
  cash: 'Cash',
  card: 'Card',
  momo: 'Mobile Money',
  moolre: 'Moolre (MoMo / card)',
  hubtel: 'Hubtel (MoMo / card)',
  pos_cash: 'Cash',
  pos_card: 'Card',
  pos_momo: 'Mobile Money',
  other: 'Other',
};

const STATUS_LABELS: Record<string, string> = {
  awaiting_payment: 'Awaiting payment',
  pending: 'Pending',
  processing: 'Processing',
  shipped: 'Packaged',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
};

function today() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Accra' });
}

function shiftDay(day: string, delta: number) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function change(now: number, before: number) {
  if (!before) return null;
  return Math.round(((now - before) / before) * 100);
}

export default function EndOfDayPage() {
  const [date, setDate] = useState(today());
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (day: string) => {
    setLoading(true);
    setError('');
    try {
      setReport(await adminFetch<Report>(`/api/admin/end-of-day?date=${day}`));
    } catch (err: any) {
      setError(err?.message || 'Could not load the report.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(date);
  }, [date, load]);

  const s = report?.summary;
  const vsYesterday = s && report ? change(s.revenue, report.comparison.yesterday) : null;
  const vsLastWeek = s && report ? change(s.revenue, report.comparison.lastWeek) : null;
  const webShare = s && s.revenue ? Math.round((s.webRevenue / s.revenue) * 100) : 0;
  const isToday = date === today();
  const prettyDay = new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const peakHour = report?.hourly.length
    ? report.hourly.reduce((best, h) => (h.revenue > best.revenue ? h : best), report.hourly[0])
    : null;
  const maxHourRevenue = report?.hourly.reduce((m, h) => Math.max(m, h.revenue), 0) || 0;

  return (
    <div className="space-y-6 print:space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">End of Day</h1>
          <p className="text-gray-600 mt-1">{prettyDay} · sales, payments, stock movement, website vs POS</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <button
            onClick={() => setDate(shiftDay(date, -1))}
            className="w-10 h-10 flex items-center justify-center border-2 border-gray-300 rounded-lg text-gray-700 hover:border-gray-400 cursor-pointer"
            aria-label="Previous day"
          >
            <i className="ri-arrow-left-s-line text-xl"></i>
          </button>
          <input
            type="date"
            value={date}
            max={today()}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="px-3 py-2 border-2 border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand focus:border-brand"
          />
          <button
            onClick={() => setDate(shiftDay(date, 1))}
            disabled={isToday}
            className="w-10 h-10 flex items-center justify-center border-2 border-gray-300 rounded-lg text-gray-700 hover:border-gray-400 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Next day"
          >
            <i className="ri-arrow-right-s-line text-xl"></i>
          </button>
          <button
            onClick={() => setDate(today())}
            disabled={isToday}
            className="px-3 py-2 border-2 border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:border-gray-400 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Today
          </button>
          <button
            onClick={() => load(date)}
            className="px-3 py-2 border-2 border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:border-gray-400 cursor-pointer"
          >
            <i className="ri-refresh-line mr-1"></i>Refresh
          </button>
          <button
            onClick={() => window.print()}
            className="px-4 py-2 bg-gray-900 hover:bg-black text-white rounded-lg text-sm font-semibold flex items-center gap-2 cursor-pointer"
          >
            <i className="ri-printer-line"></i> Print close
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-red-50 text-red-800 text-sm border border-red-200">
          <i className="ri-error-warning-line mr-2"></i>{error}
        </div>
      )}

      {loading && !report ? (
        <div className="flex items-center justify-center min-h-[30vh] text-gray-500">
          <i className="ri-loader-4-line text-3xl animate-spin mr-2 text-brand"></i> Building the report...
        </div>
      ) : s && report ? (
        <div className={loading ? 'opacity-60 transition-opacity' : ''}>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="col-span-2 rounded-xl bg-gray-900 p-6 text-white">
              <p className="text-sm text-gray-300">Paid sales</p>
              <p className="mt-2 text-4xl font-bold tabular-nums">{cedis(s.revenue)}</p>
              <p className="mt-2 text-sm text-gray-300 flex flex-wrap items-center gap-2">
                <span>{s.paidOrders} paid order{s.paidOrders === 1 ? '' : 's'} · {s.unitsSold} item{s.unitsSold === 1 ? '' : 's'} sold</span>
                {vsYesterday != null && (
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${vsYesterday >= 0 ? 'bg-green-500/20 text-green-200' : 'bg-red-500/20 text-red-200'}`}>
                    {vsYesterday >= 0 ? '+' : ''}{vsYesterday}% vs yesterday
                  </span>
                )}
                {vsLastWeek != null && (
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${vsLastWeek >= 0 ? 'bg-green-500/20 text-green-200' : 'bg-red-500/20 text-red-200'}`}>
                    {vsLastWeek >= 0 ? '+' : ''}{vsLastWeek}% vs last {new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long' })}
                  </span>
                )}
              </p>
              {s.partPaidOrders > 0 && (
                <p className="mt-2 text-xs text-gray-400">
                  Plus {cedis(s.partPaidCollected)} collected on {s.partPaidOrders} partly paid order{s.partPaidOrders === 1 ? '' : 's'}
                </p>
              )}
            </div>
            <Stat label="Average order" value={cedis(s.averageOrder)} hint={s.deliveryFees > 0 ? `Includes ${cedis(s.deliveryFees)} delivery fees` : 'Paid orders only'} />
            {report.canSeeProfit ? (
              <Stat
                label="Profit (where cost is known)"
                value={s.profit == null ? '—' : cedis(s.profit)}
                hint={
                  s.profit == null
                    ? 'Add supplier costs on Profit Margins'
                    : `${s.profitMargin != null ? `${(s.profitMargin * 100).toFixed(1)}% margin · ` : ''}${Math.round(s.profitCoverage * 100)}% of items costed`
                }
                href="/admin/profit"
              />
            ) : (
              <Stat label="Discounts given" value={cedis(s.discounts)} hint="Coupons on paid orders" />
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-3 mt-4">
            <div className="rounded-xl border border-gray-200 bg-white p-6 lg:col-span-2">
              <h2 className="font-semibold text-gray-900">Website vs POS</h2>
              <div className="mt-4 h-3 w-full overflow-hidden rounded-full bg-purple-100" aria-hidden>
                <div className="h-full bg-blue-600" style={{ width: `${webShare}%` }} />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-4">
                <Channel label="Website" icon="ri-global-line" revenue={s.webRevenue} orders={s.webOrders} tone="blue" />
                <Channel label="POS (in store)" icon="ri-store-3-line" revenue={s.posRevenue} orders={s.posOrders} tone="purple" />
              </div>
              {peakHour && peakHour.revenue > 0 && (
                <div className="mt-6">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
                    Sales by hour · busiest {String(peakHour.hour).padStart(2, '0')}:00–{String(peakHour.hour + 1).padStart(2, '0')}:00
                  </p>
                  <div className="flex items-end gap-1 h-16">
                    {Array.from({ length: 24 }, (_, h) => {
                      const row = report.hourly.find((x) => x.hour === h);
                      const height = row && maxHourRevenue ? Math.max(4, Math.round((row.revenue / maxHourRevenue) * 100)) : 2;
                      return (
                        <div
                          key={h}
                          title={`${String(h).padStart(2, '0')}:00 · ${row ? `${row.orders} order${row.orders === 1 ? '' : 's'} · ${cedis(row.revenue)}` : 'no sales'}`}
                          className={`flex-1 rounded-t ${row ? 'bg-brand' : 'bg-gray-100'}`}
                          style={{ height: `${height}%` }}
                        />
                      );
                    })}
                  </div>
                  <div className="flex justify-between text-[10px] text-gray-400 mt-1"><span>00:00</span><span>12:00</span><span>23:00</span></div>
                </div>
              )}
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-6">
              <h2 className="font-semibold text-gray-900">Still to do</h2>
              <ul className="mt-4 space-y-3 text-sm">
                <Todo label="Paid, not yet packaged" value={s.toFulfil} href="/admin/orders" />
                <Todo label="Delivery fee to agree with customer" value={s.deliveryFeeToAgree} href="/admin/orders" />
                <Todo label="Waiting for payment" value={s.unpaidOrders} href="/admin/orders" />
                <Todo label="Partly paid" value={s.partPaidOrders} href="/admin/orders" />
                <Todo label="Cancelled / refunded" value={s.cancelledOrders} />
                <Todo label="Discounts given" value={cedis(s.discounts)} />
                <Todo label="Delivery fees collected" value={cedis(s.deliveryFees)} />
              </ul>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2 mt-4">
            <Card title="Sales by staff (POS)" empty="No POS sales on this day.">
              {report.staff.length > 0 && (
                <table className="w-full text-sm">
                  <thead className="text-left text-gray-500">
                    <tr>
                      <th className="py-2 font-medium">Sold by</th>
                      <th className="py-2 font-medium text-right">Orders</th>
                      <th className="py-2 font-medium text-right">Items</th>
                      <th className="py-2 font-medium text-right">Sales</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {report.staff.map((row) => (
                      <tr key={row.name}>
                        <td className="py-2.5 font-medium text-gray-900">
                          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-brand-soft text-xs font-bold text-brand mr-2">
                            {row.name.charAt(0).toUpperCase()}
                          </span>
                          {row.name}
                        </td>
                        <td className="py-2.5 text-right tabular-nums">{row.orders}</td>
                        <td className="py-2.5 text-right tabular-nums">{row.units}</td>
                        <td className="py-2.5 text-right font-semibold tabular-nums">{cedis(row.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>

            <Card title="How customers paid" empty="No payments on this day.">
              {report.payments.length > 0 && (
                <ul className="divide-y divide-gray-100 text-sm">
                  {report.payments.map((p) => (
                    <li key={p.method + p.channel} className="flex items-center justify-between py-2.5">
                      <span className="text-gray-800">
                        {METHOD_LABELS[p.method] || p.method}
                        <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-semibold ${p.channel === 'POS' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>{p.channel}</span>
                      </span>
                      <span className="tabular-nums">
                        <span className="text-gray-500 mr-3">{p.orders}×</span>
                        <span className="font-semibold">{cedis(p.revenue)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <div className="mt-4">
            <Card title="Stock movement" empty="Nothing sold on this day.">
              {report.items.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-gray-500">
                      <tr>
                        <th className="py-2 font-medium">Product</th>
                        <th className="py-2 font-medium text-right">Website</th>
                        <th className="py-2 font-medium text-right">POS</th>
                        <th className="py-2 font-medium text-right">Total out</th>
                        <th className="py-2 font-medium text-right">Stock left</th>
                        <th className="py-2 font-medium text-right">Sales</th>
                        {report.canSeeProfit && <th className="py-2 font-medium text-right">Profit</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {report.items.map((item) => (
                        <tr key={(item.productId || '') + item.name}>
                          <td className="py-2.5 font-medium text-gray-900">
                            {item.productId ? <Link href={`/admin/products/${item.productId}`} className="hover:text-brand">{item.name}</Link> : item.name}
                          </td>
                          <td className="py-2.5 text-right tabular-nums">{item.webUnits}</td>
                          <td className="py-2.5 text-right tabular-nums">{item.posUnits}</td>
                          <td className="py-2.5 text-right font-semibold tabular-nums">−{item.units}</td>
                          <td className={`py-2.5 text-right tabular-nums ${item.stockLeft != null && item.stockLeft <= 5 ? 'text-red-600 font-semibold' : ''}`}>
                            {item.stockLeft ?? '—'}
                          </td>
                          <td className="py-2.5 text-right tabular-nums">{cedis(item.revenue)}</td>
                          {report.canSeeProfit && (
                            <td className={`py-2.5 text-right tabular-nums ${item.profit != null && item.profit < 0 ? 'text-red-600' : ''}`}>
                              {item.profit == null ? <span className="text-gray-400" title="No supplier cost yet">—</span> : cedis(item.profit)}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {report.canSeeProfit && s.itemsMissingCost > 0 && report.items.length > 0 && (
                <p className="mt-3 text-xs text-gray-500">
                  {s.itemsMissingCost} product{s.itemsMissingCost === 1 ? '' : 's'} sold today ha{s.itemsMissingCost === 1 ? 's' : 've'} no supplier cost, so profit is understated.{' '}
                  <Link href="/admin/profit" className="text-brand hover:underline">Add costs</Link>
                </p>
              )}
              {report.lowStock.length > 0 && (
                <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">
                  <i className="ri-alarm-warning-line mr-1"></i>
                  Running low after today: {report.lowStock.map((i) => `${i.name} (${i.stockLeft})`).join(', ')}.{' '}
                  <Link href="/admin/inventory" className="underline">Restock</Link>
                </p>
              )}
            </Card>
          </div>

          <div className="mt-4">
            <Card title={`All orders (${report.orders.length})`} empty="No orders on this day.">
              {report.orders.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-gray-500">
                      <tr>
                        <th className="py-2 font-medium">Time</th>
                        <th className="py-2 font-medium">Order</th>
                        <th className="py-2 font-medium">Customer</th>
                        <th className="py-2 font-medium">Channel</th>
                        <th className="py-2 font-medium">Delivery</th>
                        <th className="py-2 font-medium">Sold by</th>
                        <th className="py-2 font-medium">Payment</th>
                        <th className="py-2 font-medium">Status</th>
                        <th className="py-2 font-medium text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {report.orders.map((o) => (
                        <tr key={o.id} className={o.status === 'cancelled' || o.status === 'refunded' ? 'text-gray-400' : ''}>
                          <td className="py-2.5 tabular-nums text-gray-600">
                            {new Date(o.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Accra' })}
                          </td>
                          <td className="py-2.5">
                            <Link href={`/admin/orders/${o.id}`} className="font-medium text-brand hover:underline print:no-underline print:text-gray-900">
                              {o.order_number}
                            </Link>
                          </td>
                          <td className="py-2.5 text-gray-800">{o.customer || 'Walk-in'}</td>
                          <td className="py-2.5">
                            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${o.channel === 'POS' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>{o.channel}</span>
                          </td>
                          <td className="py-2.5 text-gray-700">{deliveryMethodLabel(o.shipping_method)}</td>
                          <td className="py-2.5 text-gray-800">{o.staff_name || (o.channel === 'POS' ? 'Unassigned' : '—')}</td>
                          <td className="py-2.5">
                            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${o.payment_status === 'paid' ? 'bg-green-50 text-green-700' : o.payment_status === 'partially_paid' ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-600'}`}>
                              {o.payment_status.replace(/_/g, ' ')}
                            </span>
                            {o.payment_method && <span className="ml-1 text-xs text-gray-500">{METHOD_LABELS[o.payment_method] || o.payment_method}</span>}
                          </td>
                          <td className="py-2.5 text-gray-700">{STATUS_LABELS[o.status] || o.status}</td>
                          <td className="py-2.5 text-right font-semibold tabular-nums">{cedis(o.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Stat({ label, value, hint, href }: { label: string; value: string; hint?: string; href?: string }) {
  const body = (
    <>
      <p className="text-sm text-gray-600">{label}</p>
      <p className="mt-2 text-2xl font-bold text-gray-900 tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
    </>
  );
  const cls = 'rounded-xl border border-gray-200 bg-white p-6 block';
  return href ? <Link href={href} className={`${cls} hover:border-brand`}>{body}</Link> : <div className={cls}>{body}</div>;
}

function Channel({ label, icon, revenue, orders, tone }: { label: string; icon: string; revenue: number; orders: number; tone: 'blue' | 'purple' }) {
  return (
    <div className="flex items-center gap-3">
      <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${tone === 'blue' ? 'bg-blue-600 text-white' : 'bg-purple-100 text-purple-700'}`}>
        <i className={icon}></i>
      </span>
      <div>
        <p className="text-sm text-gray-600">{label}</p>
        <p className="font-bold text-gray-900 tabular-nums">{cedis(revenue)}</p>
        <p className="text-xs text-gray-500">{orders} paid order{orders === 1 ? '' : 's'}</p>
      </div>
    </div>
  );
}

function Todo({ label, value, href }: { label: string; value: number | string; href?: string }) {
  const content = (
    <span className="flex items-center justify-between">
      <span className="text-gray-700">{label}</span>
      <span className="font-semibold text-gray-900 tabular-nums">{value}</span>
    </span>
  );
  return <li>{href ? <Link href={href} className="block hover:text-brand">{content}</Link> : content}</li>;
}

function Card({ title, empty, children }: { title: string; empty: string; children: React.ReactNode }) {
  const hasContent = Array.isArray(children) ? children.some(Boolean) : Boolean(children);
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 break-inside-avoid">
      <h2 className="font-semibold text-gray-900 mb-3">{title}</h2>
      {hasContent ? children : <p className="py-6 text-center text-sm text-gray-500">{empty}</p>}
    </div>
  );
}
