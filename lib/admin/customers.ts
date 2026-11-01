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

type OrderRow = {
  id: string;
  user_id: string | null;
  email: string | null;
  amount_paid: number | string | null;
  total: number | string | null;
  created_at: string;
  status: string | null;
  payment_status: string | null;
  shipping_address: any;
};

const STAFF_ROLES = new Set(['admin', 'staff']);
/** Synthetic addresses created by the POS for walk-in sales. */
const isPlaceholderEmail = (email?: string | null) => /\.local$/i.test(email || '');

/** Money actually received: full or deposit. */
export const isPaidLikeOrder = (o: { payment_status?: string | null; status?: string | null }) =>
  (o.payment_status === 'paid' || o.payment_status === 'partially_paid') && o.status !== 'cancelled';

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

/** Quote a CSV cell so commas, quotes and newlines survive. */
export const csvCell = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
export const toCsv = (rows: unknown[][]) => rows.map((r) => r.map(csvCell).join(',')).join('\n');

export function customersToCsv(records: Array<Pick<AdminCustomerRecord, 'name' | 'email' | 'phone' | 'orders' | 'totalSpent' | 'joined' | 'lastOrder' | 'status' | 'isGuest'>>) {
  return toCsv([
    ['Name', 'Email', 'Phone', 'Orders', 'Total Spent', 'Joined', 'Last Order', 'Status', 'Guest'],
    ...records.map((c) => [
      c.name,
      c.email,
      c.phone,
      c.orders,
      Number(c.totalSpent || 0).toFixed(2),
      c.joined ? new Date(c.joined).toISOString().slice(0, 10) : '',
      c.lastOrder ? new Date(c.lastOrder).toISOString().slice(0, 10) : '',
      c.status,
      c.isGuest ? 'yes' : 'no',
    ]),
  ]);
}

export async function fetchAdminCustomers(supabase: SupabaseClient): Promise<AdminCustomerRecord[]> {
  const [crmRes, profilesRes, ordersRes] = await Promise.all([
    supabase.from('customers').select('*').order('created_at', { ascending: false }),
    supabase.from('profiles').select('id, email, full_name, phone, role, created_at').order('created_at', { ascending: false }),
    supabase
      .from('orders')
      .select('id, user_id, email, amount_paid, total, created_at, status, payment_status, shipping_address'),
  ]);

  const profiles: any[] = profilesRes.data || [];
  const staffIds = new Set(profiles.filter((p) => STAFF_ROLES.has(p.role)).map((p) => p.id));
  const staffEmails = new Set(
    profiles.filter((p) => STAFF_ROLES.has(p.role) && p.email).map((p) => String(p.email).toLowerCase())
  );

  const orders: OrderRow[] = ordersRes.data || [];
  const byUser = new Map<string, OrderRow[]>();
  const byEmail = new Map<string, OrderRow[]>();
  for (const order of orders) {
    if (order.user_id) {
      const list = byUser.get(order.user_id) || [];
      list.push(order);
      byUser.set(order.user_id, list);
    }
    if (order.email) {
      const key = String(order.email).toLowerCase();
      const list = byEmail.get(key) || [];
      list.push(order);
      byEmail.set(key, list);
    }
  }

  /** Paid-order stats for a person identified by user id and/or emails (deduped by order id). */
  const statsFor = (userId: string | null | undefined, emails: Array<string | null | undefined>) => {
    const seen = new Set<string>();
    let count = 0;
    let totalSpent = 0;
    let lastOrder: Date | null = null;
    const candidates: OrderRow[] = [];
    if (userId) candidates.push(...(byUser.get(userId) || []));
    for (const email of emails) {
      if (email) candidates.push(...(byEmail.get(String(email).toLowerCase()) || []));
    }
    for (const order of candidates) {
      if (seen.has(order.id)) continue;
      seen.add(order.id);
      if (!isPaidLikeOrder(order)) continue;
      count += 1;
      totalSpent += Number(order.amount_paid) || 0;
      const created = new Date(order.created_at);
      if (!lastOrder || created > lastOrder) lastOrder = created;
    }
    return { count, totalSpent, lastOrder };
  };

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
    if (customer.user_id && staffIds.has(customer.user_id)) continue;
    if (customer.email && staffEmails.has(String(customer.email).toLowerCase())) continue;

    const name = displayName(
      customer.full_name,
      [customer.first_name, customer.last_name].filter(Boolean).join(' '),
    );
    const joined = new Date(customer.created_at);
    const stats = statsFor(customer.user_id, [customer.email, customer.secondary_email]);
    records.push({
      id: customer.id,
      userId: customer.user_id || null,
      name,
      email: customer.email || '',
      phone: customer.phone || 'N/A',
      secondaryEmail: customer.secondary_email,
      secondaryPhone: customer.secondary_phone,
      orders: stats.count,
      totalSpent: stats.totalSpent,
      joined,
      lastOrder: stats.lastOrder || (customer.last_order_at ? new Date(customer.last_order_at) : null),
      status: classifyStatus(stats.totalSpent, stats.count, joined),
      isGuest: !customer.user_id,
      source: 'customers',
    });
    mark(customer.user_id, customer.email);
    if (customer.secondary_email) mark(null, customer.secondary_email);
  }

  for (const profile of profiles) {
    if (STAFF_ROLES.has(profile.role)) continue;
    if (alreadyHave(profile.id, profile.email)) continue;

    const stats = statsFor(profile.id, [profile.email]);
    const joined = new Date(profile.created_at);

    records.push({
      id: profile.id,
      userId: profile.id,
      name: displayName(profile.full_name),
      email: profile.email || '',
      phone: profile.phone || 'N/A',
      orders: stats.count,
      totalSpent: stats.totalSpent,
      joined,
      lastOrder: stats.lastOrder,
      status: classifyStatus(stats.totalSpent, stats.count, joined),
      isGuest: false,
      source: 'profiles',
    });
    mark(profile.id, profile.email);
  }

  const guestOrders = orders.filter((order) => !order.user_id && order.email && !isPlaceholderEmail(order.email));
  const guestMap = new Map<string, any>();

  for (const order of guestOrders) {
    const email = String(order.email).toLowerCase();
    if (alreadyHave(null, email)) continue;
    if (staffEmails.has(email)) continue;

    const firstName = order.shipping_address?.firstName || '';
    const lastName = order.shipping_address?.lastName || '';
    const fullName = order.shipping_address?.full_name || `${firstName} ${lastName}`.trim();
    const orderDate = new Date(order.created_at);
    const existing = guestMap.get(email);

    if (!existing) {
      guestMap.set(email, {
        email: order.email,
        name: fullName || 'Guest',
        phone: order.shipping_address?.phone || 'N/A',
        firstOrder: orderDate,
      });
    } else {
      if (orderDate < existing.firstOrder) existing.firstOrder = orderDate;
      if (!existing.name || existing.name === 'Guest') existing.name = fullName || existing.name;
    }
  }

  for (const guest of guestMap.values()) {
    const stats = statsFor(null, [guest.email]);
    records.push({
      id: `guest-${guest.email}`,
      userId: null,
      name: guest.name || 'Guest',
      email: guest.email,
      phone: guest.phone,
      orders: stats.count,
      totalSpent: stats.totalSpent,
      joined: guest.firstOrder,
      lastOrder: stats.lastOrder,
      status: classifyStatus(stats.totalSpent, stats.count, guest.firstOrder),
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

/** Orders for a person: by user id and by email, run as two plain queries and merged by id. */
export async function fetchOrdersForCustomer(
  supabase: SupabaseClient,
  userId: string | null,
  email: string | null,
  columns = '*'
) {
  const queries: PromiseLike<any>[] = [];
  if (userId) {
    queries.push(supabase.from('orders').select(columns).eq('user_id', userId).order('created_at', { ascending: false }));
  }
  if (email) {
    queries.push(supabase.from('orders').select(columns).eq('email', email).order('created_at', { ascending: false }));
  }
  const results = await Promise.all(queries);
  const merged = new Map<string, any>();
  for (const res of results) {
    if (res.error) throw res.error;
    for (const row of res.data || []) merged.set(row.id, row);
  }
  return Array.from(merged.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

export async function fetchPosCustomers(supabase: SupabaseClient) {
  const [crmRes, profilesRes] = await Promise.all([
    supabase.from('customers').select('id, full_name, email, phone, user_id').order('full_name').limit(200),
    supabase.from('profiles').select('id, full_name, email, phone, role').order('full_name').limit(200),
  ]);

  const seen = new Set<string>();
  const list: Array<{ id: string; full_name: string; email: string; phone: string; user_id: string | null }> = [];

  for (const customer of crmRes.data || []) {
    if (isPlaceholderEmail(customer.email)) continue;
    const key = (customer.email || customer.phone || customer.id).toLowerCase();
    seen.add(key);
    if (customer.user_id) seen.add(customer.user_id);
    list.push({
      id: customer.id,
      full_name: customer.full_name || 'No Name',
      email: customer.email || '',
      phone: customer.phone || '',
      user_id: customer.user_id || null,
    });
  }

  for (const profile of profilesRes.data || []) {
    if (STAFF_ROLES.has(profile.role)) continue;
    const emailKey = (profile.email || '').toLowerCase();
    if (seen.has(profile.id) || (emailKey && seen.has(emailKey))) continue;
    list.push({
      id: profile.id,
      full_name: profile.full_name || 'No Name',
      email: profile.email || '',
      phone: profile.phone || '',
      user_id: profile.id,
    });
  }

  return list;
}
