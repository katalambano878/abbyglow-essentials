import type { SupabaseClient } from '@supabase/supabase-js';

export type AdminCustomerRecord = {
  id: string;
  userId: string | null;
  name: string;
  email: string;
  phone: string;
  secondaryEmail?: string | null;
  secondaryPhone?: string | null;
  orders: number;
  totalSpent: number;
  joined: Date;
  lastOrder: Date | null;
  status: 'New' | 'Active' | 'VIP' | 'Inactive';
  isGuest: boolean;
  source: 'customers' | 'profiles' | 'guest';
};

function classifyStatus(totalSpent: number, orderCount: number, joined: Date): AdminCustomerRecord['status'] {
  if (totalSpent > 1000) return 'VIP';
  if (orderCount > 0) return 'Active';
  if (joined.getTime() < Date.now() - 30 * 24 * 60 * 60 * 1000) return 'Inactive';
  return 'New';
}

function displayName(...parts: Array<string | null | undefined>) {
  const joined = parts.filter(Boolean).join(' ').trim();
  return joined || 'No Name';
}

export function insightSegment(customer: AdminCustomerRecord) {
  const daysSinceJoin = (Date.now() - customer.joined.getTime()) / (1000 * 3600 * 24);
  const last = customer.lastOrder || customer.joined;
  const daysSinceLastOrder = (Date.now() - last.getTime()) / (1000 * 3600 * 24);

  if (customer.totalSpent > 1000) return 'vip';
  if (customer.orders > 1) return 'returning';
  if (daysSinceLastOrder > 90 && customer.orders > 0) return 'at-risk';
  if (daysSinceJoin < 30) return 'new';
  return customer.orders > 0 ? 'returning' : 'new';
}

export async function fetchAdminCustomers(supabase: SupabaseClient): Promise<AdminCustomerRecord[]> {
  const [crmRes, profilesRes, ordersRes] = await Promise.all([
    supabase.from('customers').select('*').order('created_at', { ascending: false }),
    supabase.from('profiles').select('*').order('created_at', { ascending: false }),
    supabase.from('orders').select('id, user_id, email, total, created_at, status, shipping_address'),
  ]);

  const orders = ordersRes.data || [];
  const paid = orders.filter((o: any) => o.status !== 'cancelled');
  const records: AdminCustomerRecord[] = [];
  const seenUsers = new Set<string>();
  const seenEmails = new Set<string>();

  const mark = (userId?: string | null, email?: string | null) => {
    if (userId) seenUsers.add(userId);
    if (email) seenEmails.add(email.toLowerCase());
  };

  const alreadyHave = (userId?: string | null, email?: string | null) => {
    if (userId && seenUsers.has(userId)) return true;
    if (email && seenEmails.has(email.toLowerCase())) return true;
    return false;
  };

  for (const customer of crmRes.data || []) {
    const name = displayName(
      customer.full_name,
      [customer.first_name, customer.last_name].filter(Boolean).join(' '),
    );
    const joined = new Date(customer.created_at);
    const totalSpent = Number(customer.total_spent) || 0;
    const totalOrders = Number(customer.total_orders) || 0;
    records.push({
      id: customer.id,
      userId: customer.user_id || null,
      name,
      email: customer.email || '',
      phone: customer.phone || 'N/A',
      secondaryEmail: customer.secondary_email,
      secondaryPhone: customer.secondary_phone,
      orders: totalOrders,
      totalSpent,
      joined,
      lastOrder: customer.last_order_at ? new Date(customer.last_order_at) : null,
      status: classifyStatus(totalSpent, totalOrders, joined),
      isGuest: !customer.user_id,
      source: 'customers',
    });
    mark(customer.user_id, customer.email);
  }

  for (const profile of profilesRes.data || []) {
    if (alreadyHave(profile.id, profile.email)) continue;

    const userOrders = paid.filter((order: any) => order.user_id === profile.id);
    const totalSpent = userOrders.reduce((sum: number, order: any) => sum + Number(order.total || 0), 0);
    const lastOrder = userOrders.length
      ? new Date(Math.max(...userOrders.map((order: any) => new Date(order.created_at).getTime())))
      : null;
    const joined = new Date(profile.created_at);

    records.push({
      id: profile.id,
      userId: profile.id,
      name: displayName(profile.full_name),
      email: profile.email || '',
      phone: profile.phone || 'N/A',
      orders: userOrders.length,
      totalSpent,
      joined,
      lastOrder,
      status: classifyStatus(totalSpent, userOrders.length, joined),
      isGuest: false,
      source: 'profiles',
    });
    mark(profile.id, profile.email);
  }

  const guestOrders = orders.filter((order: any) => !order.user_id && order.email);
  const guestMap = new Map<string, any>();

  for (const order of guestOrders) {
    const email = String(order.email).toLowerCase();
    if (alreadyHave(null, email)) continue;

    const firstName = order.shipping_address?.firstName || '';
    const lastName = order.shipping_address?.lastName || '';
    const fullName = order.shipping_address?.full_name || `${firstName} ${lastName}`.trim();
    const orderTotal = Number(order.total) || 0;
    const orderDate = new Date(order.created_at);
    const existing = guestMap.get(email);

    if (!existing) {
      guestMap.set(email, {
        email: order.email,
        name: fullName || 'Guest',
        phone: order.shipping_address?.phone || 'N/A',
        orders: order.status !== 'cancelled' ? 1 : 0,
        totalSpent: order.status !== 'cancelled' ? orderTotal : 0,
        firstOrder: orderDate,
        lastOrder: orderDate,
      });
    } else {
      if (order.status !== 'cancelled') {
        existing.orders += 1;
        existing.totalSpent += orderTotal;
      }
      if (orderDate < existing.firstOrder) existing.firstOrder = orderDate;
      if (orderDate > existing.lastOrder) existing.lastOrder = orderDate;
      if (!existing.name || existing.name === 'Guest') existing.name = fullName || existing.name;
    }
  }

  for (const guest of guestMap.values()) {
    records.push({
      id: `guest-${guest.email}`,
      userId: null,
      name: guest.name || 'Guest',
      email: guest.email,
      phone: guest.phone,
      orders: guest.orders,
      totalSpent: guest.totalSpent,
      joined: guest.firstOrder,
      lastOrder: guest.lastOrder,
      status: classifyStatus(guest.totalSpent, guest.orders, guest.firstOrder),
      isGuest: true,
      source: 'guest',
    });
  }

  return records.sort((a, b) => b.joined.getTime() - a.joined.getTime());
}

export async function fetchAdminCustomerById(supabase: SupabaseClient, customerId: string) {
  if (customerId.startsWith('guest-')) {
    const email = customerId.slice('guest-'.length);
    return {
      record: { id: customerId, email, full_name: 'Guest', phone: null, user_id: null },
      kind: 'guest' as const,
    };
  }

  const { data: crm } = await supabase.from('customers').select('*').eq('id', customerId).maybeSingle();
  if (crm) return { record: crm, kind: 'customers' as const };

  const { data: byUser } = await supabase.from('customers').select('*').eq('user_id', customerId).maybeSingle();
  if (byUser) return { record: byUser, kind: 'customers' as const };

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', customerId).maybeSingle();
  if (profile) return { record: profile, kind: 'profiles' as const };

  return null;
}

export async function fetchPosCustomers(supabase: SupabaseClient) {
  const [crmRes, profilesRes] = await Promise.all([
    supabase.from('customers').select('id, full_name, email, phone, user_id').order('full_name').limit(200),
    supabase.from('profiles').select('id, full_name, email, phone').order('full_name').limit(200),
  ]);

  const seen = new Set<string>();
  const list: Array<{ id: string; full_name: string; email: string; phone: string }> = [];

  for (const customer of crmRes.data || []) {
    const key = (customer.email || customer.phone || customer.id).toLowerCase();
    seen.add(key);
    if (customer.user_id) seen.add(customer.user_id);
    list.push({
      id: customer.id,
      full_name: customer.full_name || 'No Name',
      email: customer.email || '',
      phone: customer.phone || '',
    });
  }

  for (const profile of profilesRes.data || []) {
    const emailKey = (profile.email || '').toLowerCase();
    if (seen.has(profile.id) || (emailKey && seen.has(emailKey))) continue;
    list.push({
      id: profile.id,
      full_name: profile.full_name || 'No Name',
      email: profile.email || '',
      phone: profile.phone || '',
    });
  }

  return list;
}
