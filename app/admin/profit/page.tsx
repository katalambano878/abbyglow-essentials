'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { adminFetch, cedis } from '@/lib/admin-fetch';

type Row = {
  id: string;
  name: string;
  sku: string | null;
  status: string;
  category: string | null;
  image: string | null;
  stock: number;
  regularPrice: number;
  sellingPrice: number;
  onPromotion: boolean;
  costPrice: number | null;
  supplierName: string | null;
  notes: string | null;
  costUpdatedAt: string | null;
  unitsSold30d: number;
  revenue30d: number;
};

type Draft = { cost: string; supplier: string; notes: string };
type Filter = 'all' | 'missing' | 'low' | 'selling';

const LOW_MARGIN = 25;
const PLACEHOLDER = '/images/placeholder-product.svg';

function margin(price: number, cost: number | null) {
  if (cost == null || price <= 0) return null;
  return ((price - cost) / price) * 100;
}

function marginTone(m: number | null) {
  if (m == null) return 'text-gray-400';
  if (m < 0) return 'text-red-600';
  if (m < LOW_MARGIN) return 'text-amber-600';
  return 'text-green-700';
}

export default function ProfitMarginsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({ cost: '', supplier: '', notes: '' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await adminFetch<{ products: Row[] }>('/api/admin/profit');
      setRows(data.products);
    } catch (err: any) {
      setNotice({ type: 'error', text: `Could not load products: ${err?.message || 'unknown error'}` });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const totals = useMemo(() => {
    const costed = rows.filter((r) => r.costPrice != null);
    const stockValueCost = costed.reduce((s, r) => s + (r.costPrice || 0) * Math.max(0, r.stock || 0), 0);
    const stockValueRetail = costed.reduce((s, r) => s + r.sellingPrice * Math.max(0, r.stock || 0), 0);
    const margins = costed.map((r) => margin(r.sellingPrice, r.costPrice)).filter((m): m is number => m != null);
    const profit30d = costed.reduce((s, r) => s + (r.revenue30d - (r.costPrice || 0) * r.unitsSold30d), 0);
    const revenue30d = costed.reduce((s, r) => s + r.revenue30d, 0);
    return {
      costed: costed.length,
      missing: rows.length - costed.length,
      average: margins.length ? margins.reduce((a, b) => a + b, 0) / margins.length : null,
      stockValueCost,
      stockProfit: stockValueRetail - stockValueCost,
      profit30d,
      margin30d: revenue30d > 0 ? (profit30d / revenue30d) * 100 : null,
      lowMargin: margins.filter((m) => m < LOW_MARGIN).length,
    };
  }, [rows]);

  const visible = rows.filter((r) => {
    const q = search.trim().toLowerCase();
    if (q && !`${r.name} ${r.sku || ''} ${r.supplierName || ''} ${r.category || ''}`.toLowerCase().includes(q)) return false;
    if (filter === 'missing') return r.costPrice == null;
    if (filter === 'selling') return r.unitsSold30d > 0;
    if (filter === 'low') {
      const m = margin(r.sellingPrice, r.costPrice);
      return m != null && m < LOW_MARGIN;
    }
    return true;
  });

  const startEdit = (row: Row) => {
    setEditing(row.id);
    setNotice(null);
    setDraft({ cost: row.costPrice != null ? String(row.costPrice) : '', supplier: row.supplierName || '', notes: row.notes || '' });
  };

  const save = async (row: Row, clear = false) => {
    setSaving(true);
    try {
      const result = await adminFetch<{ message: string }>('/api/admin/profit', {
        method: 'PUT',
        body: JSON.stringify({
          productId: row.id,
          costPrice: clear || draft.cost.trim() === '' ? null : draft.cost,
          supplierName: draft.supplier,
          notes: draft.notes,
        }),
      });
      setNotice({ type: 'success', text: result.message });
      setEditing(null);
      await load();
    } catch (err: any) {
      setNotice({ type: 'error', text: `Could not save: ${err?.message || 'unknown error'}` });
    } finally {
      setSaving(false);
    }
  };

  const draftCost = draft.cost.trim() === '' ? null : Number(draft.cost);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Profit Margins</h1>
          <p className="text-gray-600 mt-1">
            Enter what each product cost you from the supplier to see your margin per item. Only admins see this page; customers and staff never see your costs.
          </p>
        </div>
        <Link
          href="/admin/end-of-day"
          className="inline-flex items-center justify-center px-4 py-3 border-2 border-gray-300 text-gray-700 rounded-lg hover:border-gray-400 font-medium whitespace-nowrap"
        >
          <i className="ri-calendar-check-line mr-2"></i>
          End of Day report
        </Link>
      </div>

      {notice && (
        <div
          role="status"
          className={`p-4 rounded-lg border flex items-start justify-between gap-4 text-sm ${notice.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}
        >
          <span><i className={`${notice.type === 'success' ? 'ri-checkbox-circle-line' : 'ri-error-warning-line'} mr-2`}></i>{notice.text}</span>
          <button onClick={() => setNotice(null)} className="shrink-0 cursor-pointer" aria-label="Dismiss"><i className="ri-close-line text-lg"></i></button>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl bg-gray-900 p-5 text-white">
          <p className="text-sm text-gray-300">Average margin</p>
          <p className="mt-2 text-3xl font-bold tabular-nums">{totals.average == null ? '—' : `${totals.average.toFixed(1)}%`}</p>
          <p className="mt-1 text-xs text-gray-400">Across {totals.costed} costed product{totals.costed === 1 ? '' : 's'}</p>
        </div>
        <Stat label="Profit, last 30 days" value={totals.costed ? cedis(totals.profit30d) : '—'} hint={totals.margin30d == null ? 'Paid orders, costed products only' : `${totals.margin30d.toFixed(1)}% of costed sales`} />
        <Stat label="Stock at cost" value={totals.costed ? cedis(totals.stockValueCost) : '—'} hint="What the stock on hand cost you" />
        <Stat label="Profit in stock" value={totals.costed ? cedis(totals.stockProfit) : '—'} hint="If everything on hand sells at today’s price" />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6 border-b border-gray-200 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <i className="ri-search-line absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-lg"></i>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search product, SKU, category or supplier..."
              className="w-full pl-12 pr-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-brand focus:border-brand text-sm"
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {([
              ['all', `All (${rows.length})`],
              ['missing', `No cost yet (${totals.missing})`],
              ['low', `Under ${LOW_MARGIN}% (${totals.lowMargin})`],
              ['selling', 'Sold in 30 days'],
            ] as [Filter, string][]).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors cursor-pointer whitespace-nowrap ${filter === key ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="py-12 text-center text-gray-500">
            <i className="ri-loader-4-line animate-spin text-3xl text-brand"></i>
            <p className="mt-2">Loading products...</p>
          </div>
        ) : visible.length === 0 ? (
          <div className="py-12 text-center text-gray-500">
            <i className="ri-inbox-line text-4xl text-gray-300"></i>
            <p className="mt-2">No products match</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {visible.map((row) => {
              const sellingMargin = margin(row.sellingPrice, row.costPrice);
              const regularMargin = margin(row.regularPrice, row.costPrice);
              const isEditing = editing === row.id;
              const previewMargin = isEditing ? margin(row.sellingPrice, draftCost) : null;
              return (
                <li key={row.id} className="p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                    <div className="flex items-center gap-3 lg:w-80 min-w-0">
                      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-gray-100">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={row.image || PLACEHOLDER} alt="" className="h-full w-full object-cover object-top" />
                      </div>
                      <div className="min-w-0">
                        <Link href={`/admin/products/${row.id}`} className="font-semibold text-gray-900 hover:text-brand truncate block">{row.name}</Link>
                        <p className="text-xs text-gray-500 truncate">
                          {[row.sku, row.category, `${row.stock} in stock`, `${row.unitsSold30d} sold in 30 days`].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                    </div>

                    <dl className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-4 text-sm">
                      <div>
                        <dt className="text-xs text-gray-500">Supplier cost</dt>
                        <dd className="font-semibold text-gray-900 tabular-nums">{row.costPrice == null ? '—' : cedis(row.costPrice)}</dd>
                        {row.supplierName && <dd className="text-xs text-gray-500 truncate">{row.supplierName}</dd>}
                      </div>
                      <div>
                        <dt className="text-xs text-gray-500">{row.onPromotion ? 'Selling now' : 'Selling price'}</dt>
                        <dd className="font-semibold text-gray-900 tabular-nums">{cedis(row.sellingPrice)}</dd>
                        {row.onPromotion && <dd className="text-xs text-gray-500 line-through tabular-nums">{cedis(row.regularPrice)}</dd>}
                      </div>
                      <div>
                        <dt className="text-xs text-gray-500">Profit per item</dt>
                        <dd className={`font-semibold tabular-nums ${marginTone(sellingMargin)}`}>
                          {row.costPrice == null ? '—' : cedis(row.sellingPrice - row.costPrice)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-gray-500">Margin</dt>
                        <dd className={`text-lg font-bold tabular-nums ${marginTone(sellingMargin)}`}>
                          {sellingMargin == null ? '—' : `${sellingMargin.toFixed(1)}%`}
                        </dd>
                        {row.onPromotion && regularMargin != null && (
                          <dd className="text-xs text-gray-500">{regularMargin.toFixed(1)}% at full price</dd>
                        )}
                      </div>
                    </dl>

                    {!isEditing && (
                      <button
                        onClick={() => startEdit(row)}
                        className={`self-start lg:self-center rounded-lg px-4 py-2 text-sm font-semibold whitespace-nowrap cursor-pointer ${row.costPrice == null ? 'bg-brand text-white hover:bg-brand-dark' : 'border-2 border-gray-200 text-gray-700 hover:border-gray-400'}`}
                      >
                        {row.costPrice == null ? 'Add cost' : 'Edit cost'}
                      </button>
                    )}
                  </div>

                  {isEditing && (
                    <form
                      onSubmit={(e) => { e.preventDefault(); save(row); }}
                      className="mt-4 grid gap-3 rounded-xl bg-gray-50 border border-gray-200 p-4 sm:grid-cols-[1fr_1fr_2fr_auto] sm:items-end"
                    >
                      <label className="block">
                        <span className="mb-1 block text-xs font-semibold text-gray-700">Supplier cost (GH₵)</span>
                        <input
                          autoFocus
                          inputMode="decimal"
                          type="number"
                          min="0"
                          step="0.01"
                          value={draft.cost}
                          onChange={(e) => setDraft({ ...draft, cost: e.target.value })}
                          className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg bg-white text-sm focus:ring-2 focus:ring-brand focus:border-brand"
                          placeholder="0.00"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-xs font-semibold text-gray-700">Supplier (optional)</span>
                        <input value={draft.supplier} onChange={(e) => setDraft({ ...draft, supplier: e.target.value })} className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg bg-white text-sm focus:ring-2 focus:ring-brand focus:border-brand" />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-xs font-semibold text-gray-700">Notes (optional)</span>
                        <input value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg bg-white text-sm focus:ring-2 focus:ring-brand focus:border-brand" placeholder="e.g. bought in packs of 6" />
                      </label>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setEditing(null)} className="rounded-lg px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-white cursor-pointer">
                          Cancel
                        </button>
                        {row.costPrice != null && (
                          <button type="button" disabled={saving} onClick={() => save(row, true)} className="rounded-lg px-3 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 cursor-pointer disabled:opacity-50">
                            Clear
                          </button>
                        )}
                        <button disabled={saving} className="rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark cursor-pointer disabled:opacity-60">
                          {saving ? 'Saving...' : 'Save'}
                        </button>
                      </div>
                      {previewMargin != null && (
                        <p className={`sm:col-span-4 text-sm font-medium ${marginTone(previewMargin)}`}>
                          At {cedis(row.sellingPrice)} you make {cedis(row.sellingPrice - (draftCost || 0))} per item, a {previewMargin.toFixed(1)}% margin.
                          {draftCost != null && draftCost > 0 && ` Mark-up on cost is ${(((row.sellingPrice - draftCost) / draftCost) * 100).toFixed(0)}%.`}
                        </p>
                      )}
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <p className="text-sm text-gray-600">{label}</p>
      <p className="mt-2 text-2xl font-bold text-gray-900 tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-gray-500">{hint}</p>
    </div>
  );
}
