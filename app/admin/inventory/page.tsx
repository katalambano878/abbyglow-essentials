'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

const LOW_STOCK_THRESHOLD = 10;

const csvCell = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;

/** Minimal RFC-4180 parser: handles quoted cells, escaped quotes and CRLF. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else { inQuotes = false; }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cell); cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else {
      cell += ch;
    }
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}

type ImportResult = { updated: string[]; errors: string[] };

export default function InventoryManagementPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [stockFilter, setStockFilter] = useState('all');
  const [showImportModal, setShowImportModal] = useState(false);
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importFileName, setImportFileName] = useState('');

  useEffect(() => {
    fetchInventory();
  }, []);

  const fetchInventory = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('products')
        .select(`
          id,
          name,
          sku,
          price,
          quantity,
          status,
          categories(name)
        `)
        .order('name');

      if (error) throw error;

      if (data) {
        const mapped = data.map((p: any) => {
          const stock = Number(p.quantity) || 0;
          let status = 'good';
          if (stock === 0) status = 'out';
          else if (stock < LOW_STOCK_THRESHOLD) status = 'low';

          // categories is a single object from the forward (fk) embed
          return {
            id: p.id,
            name: p.name,
            sku: p.sku || '',
            category: p.categories?.name || 'Uncategorized',
            currentStock: stock,
            price: Number(p.price) || 0,
            productStatus: p.status,
            status,
          };
        });
        setProducts(mapped);
      }
    } catch (error: any) {
      console.error('Error fetching inventory:', error);
      setNotice({ type: 'error', text: `Could not load inventory: ${error?.message || 'unknown error'}` });
    } finally {
      setLoading(false);
    }
  };

  const filteredProducts = products.filter(product => {
    const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.sku.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = stockFilter === 'all' ||
      (stockFilter === 'low' && product.status === 'low') ||
      (stockFilter === 'out' && product.status === 'out') ||
      (stockFilter === 'good' && product.status === 'good');
    return matchesSearch && matchesFilter;
  });

  const lowStockCount = products.filter(p => p.status === 'low').length;
  const outOfStockCount = products.filter(p => p.status === 'out').length;
  const totalValue = products.reduce((sum, p) => sum + (p.currentStock * p.price), 0);

  const toggleProductSelection = (id: string) => {
    setSelectedProducts(prev =>
      prev.includes(id) ? prev.filter(pid => pid !== id) : [...prev, id]
    );
  };

  const toggleAllProducts = () => {
    if (selectedProducts.length === filteredProducts.length) {
      setSelectedProducts([]);
    } else {
      setSelectedProducts(filteredProducts.map(p => p.id));
    }
  };

  const handleExportCSV = () => {
    const rows = selectedProducts.length > 0
      ? products.filter((p) => selectedProducts.includes(p.id))
      : filteredProducts;
    const csvData = [
      ['SKU', 'Product Name', 'Category', 'Current Stock', 'Price', 'Retail Value', 'Status'],
      ...rows.map(p => [
        p.sku,
        p.name,
        p.category,
        p.currentStock,
        p.price.toFixed(2),
        (p.currentStock * p.price).toFixed(2),
        p.status === 'out' ? 'Out of stock' : p.status === 'low' ? 'Low stock' : 'In stock',
      ])
    ];

    const csvContent = csvData.map(row => row.map(csvCell).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inventory-export-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;
    setImportFileName(file.name);
    setImporting(true);
    setImportResult(null);
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      if (rows.length < 2) throw new Error('The file has no data rows.');

      const header = rows[0].map((h) => h.trim().toLowerCase());
      const skuIdx = header.findIndex((h) => h === 'sku');
      const qtyIdx = header.findIndex((h) => ['quantity', 'qty', 'stock', 'current stock'].includes(h));
      const nameIdx = header.findIndex((h) => ['name', 'product name', 'product'].includes(h));
      if (skuIdx === -1 || qtyIdx === -1) {
        throw new Error('The header row must contain "sku" and "quantity" columns (a "name" column is optional).');
      }

      const result: ImportResult = { updated: [], errors: [] };
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const sku = (row[skuIdx] || '').trim();
        const label = nameIdx >= 0 && row[nameIdx]?.trim() ? `${row[nameIdx].trim()} (${sku || 'no SKU'})` : sku || `row ${i + 1}`;
        const qtyRaw = (row[qtyIdx] || '').trim();
        const qty = Number(qtyRaw);

        if (!sku) { result.errors.push(`Row ${i + 1}: missing SKU`); continue; }
        if (qtyRaw === '' || !Number.isInteger(qty) || qty < 0) {
          result.errors.push(`${label}: quantity "${qtyRaw}" is not a whole number ≥ 0`);
          continue;
        }

        const { data, error } = await supabase
          .from('products')
          .update({ quantity: qty, updated_at: new Date().toISOString() })
          .eq('sku', sku)
          .select('id');
        if (error) { result.errors.push(`${label}: ${error.message}`); continue; }
        if (!data || data.length === 0) { result.errors.push(`${label}: SKU not found`); continue; }
        result.updated.push(`${label} → ${qty}`);
      }

      setImportResult(result);
      if (result.updated.length > 0) await fetchInventory();
    } catch (err: any) {
      setImportResult({ updated: [], errors: [err?.message || 'Could not read the file'] });
    } finally {
      setImporting(false);
      input.value = '';
    }
  };

  const closeImport = () => {
    if (importing) return;
    setShowImportModal(false);
    setImportResult(null);
    setImportFileName('');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Inventory Management</h1>
            <p className="text-gray-600 mt-1 md:mt-2 text-sm md:text-base">Track stock levels and update quantities in bulk</p>
          </div>
          <Link
            href="/admin"
            className="bg-gray-900 hover:bg-gray-800 text-white px-6 py-3 rounded-lg font-semibold transition-colors whitespace-nowrap text-center"
          >
            Back to Dashboard
          </Link>
        </div>

        {notice && (
          <div className={`mb-6 rounded-lg p-4 text-sm flex items-start justify-between gap-4 border ${notice.type === 'success' ? 'bg-brand-soft text-brand border-brand/30' : 'bg-red-50 text-red-700 border-red-200'}`}>
            <span>{notice.text}</span>
            <button onClick={() => setNotice(null)} className="shrink-0 cursor-pointer" aria-label="Dismiss">
              <i className="ri-close-line text-lg"></i>
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Total Products</p>
                <p className="text-3xl font-bold text-gray-900">{products.length}</p>
              </div>
              <div className="w-12 h-12 flex items-center justify-center bg-brand-soft rounded-lg">
                <i className="ri-stack-line text-2xl text-brand"></i>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Low Stock Items</p>
                <p className="text-3xl font-bold text-amber-600">{lowStockCount}</p>
              </div>
              <div className="w-12 h-12 flex items-center justify-center bg-amber-100 rounded-lg">
                <i className="ri-alert-line text-2xl text-amber-600"></i>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Out of Stock</p>
                <p className="text-3xl font-bold text-red-600">{outOfStockCount}</p>
              </div>
              <div className="w-12 h-12 flex items-center justify-center bg-red-100 rounded-lg">
                <i className="ri-close-circle-line text-2xl text-red-600"></i>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6 min-w-0">
            <div className="flex items-center justify-between gap-3 min-w-0">
              <div className="min-w-0">
                <p className="text-sm text-gray-600 mb-1">Total Retail Value</p>
                <p className="text-2xl lg:text-3xl font-bold text-brand tabular-nums break-words">GH₵{totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
              </div>
              <div className="w-12 h-12 shrink-0 flex items-center justify-center bg-brand-soft rounded-lg">
                <i className="ri-coins-line text-2xl text-brand"></i>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
            <div className="flex-1 min-w-[220px] max-w-md">
              <div className="relative">
                <i className="ri-search-line absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-xl flex items-center justify-center"></i>
                <input
                  type="text"
                  placeholder="Search name or SKU..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-brand focus:border-brand text-sm"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center space-x-2 bg-gray-100 rounded-lg p-1">
                {['all', 'low', 'out', 'good'].map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setStockFilter(filter)}
                    className={`px-4 py-2 rounded-md font-medium text-sm transition-colors whitespace-nowrap cursor-pointer ${stockFilter === filter
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                      }`}
                  >
                    {filter === 'all' && 'All'}
                    {filter === 'low' && 'Low Stock'}
                    {filter === 'out' && 'Out (0)'}
                    {filter === 'good' && 'In Stock'}
                  </button>
                ))}
              </div>

              <button
                onClick={() => setShowImportModal(true)}
                className="bg-brand hover:bg-brand-dark text-white px-4 py-3 rounded-lg font-semibold transition-colors flex items-center space-x-2 whitespace-nowrap cursor-pointer"
              >
                <i className="ri-upload-line"></i>
                <span>Import CSV</span>
              </button>

              <button
                onClick={handleExportCSV}
                disabled={loading || filteredProducts.length === 0}
                className="border-2 border-gray-300 hover:border-gray-400 text-gray-700 px-4 py-3 rounded-lg font-semibold transition-colors flex items-center space-x-2 whitespace-nowrap cursor-pointer disabled:opacity-50"
              >
                <i className="ri-download-line"></i>
                <span>Export{selectedProducts.length > 0 ? ` (${selectedProducts.length})` : ''}</span>
              </button>
            </div>
          </div>

          {selectedProducts.length > 0 && (
            <div className="mt-4 flex items-center justify-between p-4 bg-brand-soft border border-brand/30 rounded-lg">
              <p className="text-brand font-medium">
                {selectedProducts.length} product{selectedProducts.length > 1 ? 's' : ''} selected — Export downloads only these
              </p>
              <button
                onClick={() => setSelectedProducts([])}
                className="text-gray-600 hover:text-gray-900 font-medium whitespace-nowrap cursor-pointer"
              >
                Clear Selection
              </button>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-4 text-left">
                    <input
                      type="checkbox"
                      checked={selectedProducts.length === filteredProducts.length && filteredProducts.length > 0}
                      onChange={toggleAllProducts}
                      className="w-5 h-5 text-brand rounded cursor-pointer"
                    />
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Product</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">SKU</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Category</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Stock</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Retail Value</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Status</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900 whitespace-nowrap min-w-[5rem]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {loading ? (
                  <tr><td colSpan={8} className="p-10 text-center text-gray-500">Loading inventory...</td></tr>
                ) : filteredProducts.length === 0 ? (
                  <tr><td colSpan={8} className="p-10 text-center text-gray-500">No products found.</td></tr>
                ) : (
                  filteredProducts.map((product) => (
                    <tr key={product.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <input
                          type="checkbox"
                          checked={selectedProducts.includes(product.id)}
                          onChange={() => toggleProductSelection(product.id)}
                          className="w-5 h-5 text-brand rounded cursor-pointer"
                        />
                      </td>
                      <td className="px-6 py-4">
                        <div>
                          <Link href={`/admin/products/${product.id}`} className="font-semibold text-gray-900 hover:text-brand">{product.name}</Link>
                          <p className="text-sm text-gray-500 capitalize">{product.productStatus || 'active'}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-gray-700 font-mono text-sm">{product.sku || '—'}</td>
                      <td className="px-6 py-4 text-gray-700">{product.category}</td>
                      <td className="px-6 py-4">
                        <span className="font-semibold text-gray-900">{product.currentStock}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-semibold text-gray-900">
                          GH₵{(product.currentStock * product.price).toFixed(2)}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {product.status === 'good' && (
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-brand-soft text-brand whitespace-nowrap">
                            <i className="ri-checkbox-circle-fill mr-1"></i>
                            In Stock
                          </span>
                        )}
                        {product.status === 'low' && (
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-amber-100 text-amber-700 whitespace-nowrap">
                            <i className="ri-alert-fill mr-1"></i>
                            Low Stock
                          </span>
                        )}
                        {product.status === 'out' && (
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-red-100 text-red-700 whitespace-nowrap">
                            <i className="ri-close-circle-fill mr-1"></i>
                            Out of Stock
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center space-x-2">
                          <Link
                            href={`/admin/products/${product.id}`}
                            className="w-8 h-8 flex items-center justify-center text-gray-600 hover:text-brand transition-colors cursor-pointer"
                            title="Edit product"
                          >
                            <i className="ri-edit-line text-lg"></i>
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showImportModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">Import stock from CSV</h2>
              <button onClick={closeImport} className="w-10 h-10 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg cursor-pointer">
                <i className="ri-close-line text-2xl"></i>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-600">
                Upload a CSV with a header row containing <code className="font-mono bg-gray-100 px-1 rounded">sku</code> and{' '}
                <code className="font-mono bg-gray-100 px-1 rounded">quantity</code> (a <code className="font-mono bg-gray-100 px-1 rounded">name</code> column is optional and only used in the report).
                Each matching SKU gets its quantity replaced. The Export file uses this same format.
              </p>
              <label className={`block border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-brand hover:bg-brand-soft transition-colors cursor-pointer ${importing ? 'opacity-50 cursor-not-allowed' : ''}`}>
                <i className={`${importing ? 'ri-loader-4-line animate-spin' : 'ri-upload-cloud-line'} text-4xl text-gray-400 mb-2 block`}></i>
                <p className="text-gray-700 font-medium">{importing ? 'Updating quantities…' : importFileName || 'Click to choose a CSV file'}</p>
                <input type="file" accept=".csv,text/csv" className="hidden" onChange={handleImportFile} disabled={importing} />
              </label>

              {importResult && (
                <div className="space-y-3">
                  <div className={`rounded-lg p-3 text-sm border ${importResult.errors.length === 0 ? 'bg-brand-soft text-brand border-brand/30' : 'bg-amber-50 text-amber-800 border-amber-200'}`}>
                    {importResult.updated.length} updated · {importResult.errors.length} skipped
                  </div>
                  {importResult.updated.length > 0 && (
                    <details className="text-sm">
                      <summary className="cursor-pointer font-semibold text-gray-700">Updated ({importResult.updated.length})</summary>
                      <ul className="mt-2 space-y-1 text-gray-600 max-h-40 overflow-y-auto">
                        {importResult.updated.map((line, i) => <li key={i}>{line}</li>)}
                      </ul>
                    </details>
                  )}
                  {importResult.errors.length > 0 && (
                    <details open className="text-sm">
                      <summary className="cursor-pointer font-semibold text-red-700">Errors ({importResult.errors.length})</summary>
                      <ul className="mt-2 space-y-1 text-red-700 max-h-40 overflow-y-auto">
                        {importResult.errors.map((line, i) => <li key={i}>{line}</li>)}
                      </ul>
                    </details>
                  )}
                </div>
              )}
            </div>
            <div className="p-6 border-t border-gray-200 flex justify-end bg-gray-50 rounded-b-2xl">
              <button onClick={closeImport} disabled={importing} className="px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-lg font-semibold hover:border-gray-400 cursor-pointer disabled:opacity-50">
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
