'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const statColorClasses: Record<string, string> = {
  brand: 'bg-brand-soft text-brand',
  purple: 'bg-purple-100 text-purple-700',
  amber: 'bg-amber-100 text-amber-700',
};

const PAID_STATUSES = ['paid', 'partially_paid'];
const LOW_STOCK_THRESHOLD = 5;

type RangeKey = '7days' | '30days';
const rangeDays: Record<RangeKey, number> = { '7days': 7, '30days': 30 };

export default function AdminDashboard() {
  const [dateRange, setDateRange] = useState<RangeKey>('7days');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Real Stats
  const [stats, setStats] = useState([
    {
      title: 'Revenue',
      value: 'GH₵ 0.00',
      change: 'Last 7 days',
      icon: 'ri-coins-line',
      color: 'brand'
    },
    {
      title: 'Orders',
      value: '0',
      change: 'All time',
      icon: 'ri-shopping-bag-line',
      color: 'brand'
    },
    {
      title: 'Customers',
      value: '0',
      change: 'Registered + guests',
      icon: 'ri-group-line',
      color: 'purple'
    },
    {
      title: 'Avg Order Value',
      value: 'GH₵ 0.00',
      change: 'Last 7 days',
      icon: 'ri-line-chart-line',
      color: 'amber'
    }
  ]);

  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [lowStockProducts, setLowStockProducts] = useState<any[]>([]);
  const [topProducts, setTopProducts] = useState<any[]>([]);
  const [chartData, setChartData] = useState<any[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function fetchDashboardData() {
      try {
        setLoading(true);
        setLoadError(null);

        const days = rangeDays[dateRange];
        const rangeStart = new Date();
        rangeStart.setHours(0, 0, 0, 0);
        rangeStart.setDate(rangeStart.getDate() - (days - 1));
        const rangeStartIso = rangeStart.toISOString();
        const rangeLabel = `Last ${days} days`;

        // 1. Paid orders inside the selected range (revenue, chart, AOV, top products)
        const { data: paidOrders, error: ordersError } = await supabase
          .from('orders')
          .select('id, amount_paid, total, created_at')
          .in('payment_status', PAID_STATUSES)
          .neq('status', 'cancelled')
          .gte('created_at', rangeStartIso);

        if (ordersError) throw ordersError;

        const paid = paidOrders || [];
        const totalRevenue = paid.reduce((sum, order) => sum + (Number(order.amount_paid) || 0), 0);
        const paidOrderCount = paid.length;
        const avgOrderValue = paidOrderCount > 0 ? totalRevenue / paidOrderCount : 0;

        // 2. Counts via HEAD queries — no row payloads
        const [{ count: totalOrders }, { count: registeredCustomers }, { count: guestCustomers }] = await Promise.all([
          supabase.from('orders').select('id', { count: 'exact', head: true }),
          supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'customer'),
          supabase.from('customers').select('id', { count: 'exact', head: true }).is('user_id', null),
        ]);

        // 3. Chart (zero-filled days in the range)
        const dayKeys = Array.from({ length: days }, (_, i) => {
          const d = new Date(rangeStart);
          d.setDate(rangeStart.getDate() + i);
          return d.toISOString().split('T')[0];
        });
        const chartMap: Record<string, number> = {};
        dayKeys.forEach((key) => { chartMap[key] = 0; });
        paid.forEach((order) => {
          const key = new Date(order.created_at).toISOString().split('T')[0];
          if (chartMap[key] !== undefined) chartMap[key] += Number(order.amount_paid) || 0;
        });
        const processedChartData = dayKeys.map((key) => ({
          date: new Date(key).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          revenue: chartMap[key]
        }));

        // 4. Recent paid orders
        const { data: recentOrdersData } = await supabase
          .from('orders')
          .select('id, order_number, email, created_at, total, status, shipping_address')
          .in('payment_status', PAID_STATUSES)
          .order('created_at', { ascending: false })
          .limit(5);

        const formattedRecent = (recentOrdersData || []).map((o: any) => {
          const addr = o.shipping_address || {};
          const customerName = (addr.firstName && addr.lastName)
            ? `${addr.firstName.trim()} ${addr.lastName.trim()}`
            : addr.full_name || addr.firstName || (o.email ? o.email.split('@')[0] : 'Guest');
          return {
            id: o.id,
            displayId: o.order_number,
            customer: customerName,
            email: o.email,
            date: new Date(o.created_at).toLocaleDateString(),
            total: Number(o.total) || 0,
            status: o.status
          };
        });

        // 5. Low stock
        const { data: lowStockData } = await supabase
          .from('products')
          .select('id, name, quantity')
          .lte('quantity', LOW_STOCK_THRESHOLD)
          .neq('status', 'archived')
          .order('quantity', { ascending: true })
          .limit(5);

        const lowStock = (lowStockData || []).map((p: any) => ({
          id: p.id,
          name: p.name,
          stock: p.quantity,
          status: p.quantity === 0 ? 'critical' : 'low'
        }));

        // 6. Top products: units sold from order_items of the paid orders in range
        const salesByProduct = new Map<string, { units: number; revenue: number }>();
        const orderIds = paid.map((o) => o.id);
        for (let i = 0; i < orderIds.length; i += 100) {
          const chunk = orderIds.slice(i, i + 100);
          const { data: items } = await supabase
            .from('order_items')
            .select('product_id, quantity, total_price')
            .in('order_id', chunk);
          (items || []).forEach((item: any) => {
            if (!item.product_id) return;
            const entry = salesByProduct.get(item.product_id) || { units: 0, revenue: 0 };
            entry.units += Number(item.quantity) || 0;
            entry.revenue += Number(item.total_price) || 0;
            salesByProduct.set(item.product_id, entry);
          });
        }

        const rankedIds = Array.from(salesByProduct.entries())
          .sort((a, b) => b[1].units - a[1].units)
          .slice(0, 4)
          .map(([id]) => id);

        let productRows: any[] = [];
        if (rankedIds.length > 0) {
          const { data } = await supabase
            .from('products')
            .select('id, name, quantity, product_images(url)')
            .in('id', rankedIds);
          productRows = rankedIds
            .map((id) => (data || []).find((p: any) => p.id === id))
            .filter(Boolean);
        }
        if (productRows.length < 4) {
          const { data: latest } = await supabase
            .from('products')
            .select('id, name, quantity, product_images(url)')
            .order('created_at', { ascending: false })
            .limit(8);
          (latest || []).forEach((p: any) => {
            if (productRows.length < 4 && !productRows.some((row) => row.id === p.id)) productRows.push(p);
          });
        }

        const formattedTop = productRows.map((p: any) => ({
          id: p.id,
          name: p.name,
          image: p.product_images?.[0]?.url || '/images/placeholder-product.svg',
          sales: salesByProduct.get(p.id)?.units || 0,
          revenue: salesByProduct.get(p.id)?.revenue || 0,
          stock: p.quantity
        }));

        if (cancelled) return;

        setChartData(processedChartData);
        setRecentOrders(formattedRecent);
        setLowStockProducts(lowStock);
        setTopProducts(formattedTop);
        setStats([
          {
            title: 'Revenue',
            value: `GH₵ ${totalRevenue.toFixed(2)}`,
            change: rangeLabel,
            icon: 'ri-coins-line',
            color: 'brand'
          },
          {
            title: 'Orders',
            value: String(totalOrders ?? 0),
            change: `${paidOrderCount} paid · ${rangeLabel.toLowerCase()}`,
            icon: 'ri-shopping-bag-line',
            color: 'brand'
          },
          {
            title: 'Customers',
            value: String((registeredCustomers ?? 0) + (guestCustomers ?? 0)),
            change: `${registeredCustomers ?? 0} registered · ${guestCustomers ?? 0} guests`,
            icon: 'ri-group-line',
            color: 'purple'
          },
          {
            title: 'Avg Order Value',
            value: `GH₵ ${avgOrderValue.toFixed(2)}`,
            change: rangeLabel,
            icon: 'ri-line-chart-line',
            color: 'amber'
          }
        ]);
      } catch (error: any) {
        console.error('Error loading dashboard:', error);
        if (!cancelled) setLoadError(error?.message || 'Failed to load dashboard data');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchDashboardData();
    return () => { cancelled = true; };
  }, [dateRange]);

  const statusColors: any = {
    'pending': 'bg-amber-100 text-amber-700',
    'processing': 'bg-brand-soft text-brand',
    'shipped': 'bg-purple-100 text-purple-700',
    'delivered': 'bg-brand-soft text-brand',
    'cancelled': 'bg-red-100 text-red-700'
  };

  if (loading && chartData.length === 0) {
    return <div className="p-8 text-center text-gray-500">Loading Dashboard...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
            <p className="text-gray-600 mt-1">Welcome back! Here's what's happening with your store.</p>
          </div>
        </div>

        {loadError && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 text-sm">{loadError}</div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {stats.map((stat) => (
            <div key={stat.title} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-4">
                <div className={`w-12 h-12 flex items-center justify-center ${statColorClasses[stat.color] ?? 'bg-gray-100 text-gray-700'} rounded-lg`}>
                  <i className={`${stat.icon} text-2xl`}></i>
                </div>
                <span className="text-xs font-semibold text-gray-500 text-right">
                  {stat.change}
                </span>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-1">{stat.value}</h3>
              <p className="text-gray-600 text-sm">{stat.title}</p>
            </div>
          ))}
        </div>

        {/* Revenue Chart & Quick Actions */}
        <div className="grid lg:grid-cols-3 gap-6 mb-8">
          <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">Revenue Trend</h2>
              <select
                className="bg-gray-50 border border-gray-200 text-gray-700 text-sm rounded-lg focus:ring-brand focus:border-brand block p-2"
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value as RangeKey)}
                disabled={loading}
              >
                <option value="7days">Last 7 Days</option>
                <option value="30days">Last 30 Days</option>
              </select>
            </div>
            <div className={`h-80 w-full ${loading ? 'opacity-50' : ''}`}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.1} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} tickFormatter={(value) => `GH₵${value}`} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    formatter={(value) => [`GH₵${(value as number)?.toFixed(2) ?? '0.00'}`, 'Revenue']}
                  />
                  <Area type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorRevenue)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Quick Actions</h2>
            <div className="space-y-3">
              <Link href="/admin/products/new" className="flex items-center justify-between p-4 bg-gray-50 hover:bg-brand-soft text-gray-700 hover:text-brand rounded-lg transition-colors group">
                <div className="flex items-center font-medium">
                  <span className="w-8 h-8 rounded-full bg-white flex items-center justify-center mr-3 group-hover:bg-brand-soft transition-colors shadow-sm">
                    <i className="ri-add-line"></i>
                  </span>
                  Add Product
                </div>
                <i className="ri-arrow-right-line"></i>
              </Link>
              <Link href="/admin/pos" className="flex items-center justify-between p-4 bg-gray-50 hover:bg-brand-soft text-gray-700 hover:text-brand rounded-lg transition-colors group">
                <div className="flex items-center font-medium">
                  <span className="w-8 h-8 rounded-full bg-white flex items-center justify-center mr-3 group-hover:bg-brand-soft transition-colors shadow-sm">
                    <i className="ri-computer-line"></i>
                  </span>
                  Open POS
                </div>
                <i className="ri-arrow-right-line"></i>
              </Link>
              <Link href="/admin/orders" className="flex items-center justify-between p-4 bg-gray-50 hover:bg-brand-soft text-gray-700 hover:text-brand rounded-lg transition-colors group">
                <div className="flex items-center font-medium">
                  <span className="w-8 h-8 rounded-full bg-white flex items-center justify-center mr-3 group-hover:bg-brand-soft transition-colors shadow-sm">
                    <i className="ri-file-list-line"></i>
                  </span>
                  Manage Orders
                </div>
                <i className="ri-arrow-right-line"></i>
              </Link>
              <Link href="/admin/inventory" className="flex items-center justify-between p-4 bg-gray-50 hover:bg-brand-soft text-gray-700 hover:text-brand rounded-lg transition-colors group">
                <div className="flex items-center font-medium">
                  <span className="w-8 h-8 rounded-full bg-white flex items-center justify-center mr-3 group-hover:bg-brand-soft transition-colors shadow-sm">
                    <i className="ri-stack-line"></i>
                  </span>
                  Inventory
                </div>
                <i className="ri-arrow-right-line"></i>
              </Link>
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6 mb-8">
          <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6 overflow-hidden">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900">Recent Orders</h2>
              <Link href="/admin/orders" className="text-brand hover:text-brand font-medium text-sm whitespace-nowrap cursor-pointer">
                View All <i className="ri-arrow-right-line ml-1"></i>
              </Link>
            </div>

            <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
              {recentOrders.length === 0 ? (
                <p className="text-gray-500 text-center py-4">No recent orders.</p>
              ) : (
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Order ID</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Customer</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Date</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Total</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentOrders.map((order) => (
                      <tr key={order.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                        <td className="py-4 px-4">
                          <Link href={`/admin/orders/${order.id}`} className="text-brand hover:text-brand font-medium whitespace-nowrap cursor-pointer">
                            {order.displayId}
                          </Link>
                        </td>
                        <td className="py-4 px-4">
                          <p className="font-medium text-gray-900 whitespace-nowrap">{order.customer}</p>
                          <p className="text-sm text-gray-500">{order.email}</p>
                        </td>
                        <td className="py-4 px-4 text-gray-700 whitespace-nowrap">{order.date}</td>
                        <td className="py-4 px-4 font-semibold text-gray-900 whitespace-nowrap">GH₵ {order.total.toFixed(2)}</td>
                        <td className="py-4 px-4">
                          <span className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${statusColors[order.status] || 'bg-gray-100'}`}>
                            {order.status === 'shipped' ? 'Packaged' : order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Low Stock Alert</h2>
              {lowStockProducts.length === 0 ? (
                <p className="text-gray-500">Inventory looks good!</p>
              ) : (
                <div className="space-y-3">
                  {lowStockProducts.map((product) => (
                    <Link key={product.id} href={`/admin/products/${product.id}`} className="flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 text-sm truncate pr-2">{product.name}</p>
                        <p className="text-xs text-gray-600 mt-1">Stock: {product.stock} units</p>
                      </div>
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${product.status === 'critical' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                        }`}>
                        {product.status === 'critical' ? 'Critical' : 'Low'}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
              <Link href="/admin/products?filter=low-stock" className="block text-center mt-4 text-brand hover:text-brand font-medium text-sm whitespace-nowrap cursor-pointer">
                View All Low Stock <i className="ri-arrow-right-line ml-1"></i>
              </Link>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6 overflow-hidden">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Top Products</h2>
              <p className="text-sm text-gray-500">Units sold in paid orders, {rangeDays[dateRange] === 7 ? 'last 7 days' : 'last 30 days'}</p>
            </div>
            <Link href="/admin/products" className="text-brand hover:text-brand font-medium text-sm whitespace-nowrap cursor-pointer">
              View All <i className="ri-arrow-right-line ml-1"></i>
            </Link>
          </div>

          {topProducts.length === 0 ? (
            <p className="text-gray-500 text-center py-4">No products yet.</p>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
              {topProducts.map((product) => (
                <div key={product.id} className="border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow">
                  <div className="aspect-square bg-gray-100 rounded-lg overflow-hidden mb-3">
                    <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-2 line-clamp-2">{product.name}</h3>
                  <div className="flex items-center justify-between text-sm text-gray-600">
                    <span>{product.sales} sold</span>
                    <span>GH₵ {product.revenue.toFixed(2)}</span>
                  </div>
                  <div className="mt-3 pt-3 border-t border-gray-200 flex items-center justify-between">
                    <span className="text-sm text-gray-600">Stock: {product.stock}</span>
                    <Link href={`/admin/products/${product.id}`} className="text-brand hover:text-brand text-sm font-medium whitespace-nowrap cursor-pointer">
                      Edit <i className="ri-arrow-right-line ml-1"></i>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
