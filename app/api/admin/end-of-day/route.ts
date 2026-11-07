import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db/pool';
import { isAdminRole, requireStaff } from '@/lib/admin/require-staff';

export const dynamic = 'force-dynamic';

/** An order came from the in-store POS (new orders set metadata.channel; older ones only pos_sale / checkout_source). */
const POS = `(o.metadata->>'channel' = 'pos' OR o.metadata->>'checkout_source' = 'pos' OR o.metadata->>'pos_sale' = 'true')`;
/** Money received and the order still stands. */
const PAID = `(o.payment_status = 'paid' AND o.status NOT IN ('cancelled', 'refunded'))`;
const LOW_STOCK_AT = 5;

type DayTotals = {
  paid_orders: number;
  part_paid_orders: number;
  unpaid_orders: number;
  cancelled_orders: number;
  pos_orders: number;
  web_orders: number;
  revenue: number;
  pos_revenue: number;
  web_revenue: number;
  collected: number;
  part_paid_collected: number;
  discounts: number;
  delivery_fees: number;
  to_fulfil: number;
  delivery_fee_to_agree: number;
};

/** Accra is UTC+0 all year, so a calendar day is a plain UTC range. */
function dayRange(raw: string | null) {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Accra' });
  const day = raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) && raw <= today ? raw : today;
  return { day, start: `${day}T00:00:00Z`, end: `${day}T23:59:59.999Z` };
}

export async function GET(req: NextRequest) {
  const auth = await requireStaff(req);
  if (!auth.ok) return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  const admin = isAdminRole(auth.role);

  const { day, start, end } = dayRange(req.nextUrl.searchParams.get('date'));
  const range = [start, end];

  try {
    const [totals, payments, products, staff, orders, previous, hourly] = await Promise.all([
      query<DayTotals>(
        `SELECT
           COUNT(*) FILTER (WHERE ${PAID})::int AS paid_orders,
           COUNT(*) FILTER (WHERE o.payment_status = 'partially_paid' AND o.status NOT IN ('cancelled','refunded'))::int AS part_paid_orders,
           COUNT(*) FILTER (WHERE o.payment_status IN ('pending','failed') AND o.status NOT IN ('cancelled','refunded'))::int AS unpaid_orders,
           COUNT(*) FILTER (WHERE o.status IN ('cancelled','refunded'))::int AS cancelled_orders,
           COUNT(*) FILTER (WHERE ${PAID} AND ${POS})::int AS pos_orders,
           COUNT(*) FILTER (WHERE ${PAID} AND NOT ${POS})::int AS web_orders,
           COALESCE(SUM(o.total) FILTER (WHERE ${PAID}), 0)::float AS revenue,
           COALESCE(SUM(o.total) FILTER (WHERE ${PAID} AND ${POS}), 0)::float AS pos_revenue,
           COALESCE(SUM(o.total) FILTER (WHERE ${PAID} AND NOT ${POS}), 0)::float AS web_revenue,
           COALESCE(SUM(COALESCE(o.amount_paid, 0)) FILTER (WHERE o.payment_status IN ('paid','partially_paid') AND o.status NOT IN ('cancelled','refunded')), 0)::float AS collected,
           COALESCE(SUM(COALESCE(o.amount_paid, 0)) FILTER (WHERE o.payment_status = 'partially_paid' AND o.status NOT IN ('cancelled','refunded')), 0)::float AS part_paid_collected,
           COALESCE(SUM(o.discount_total) FILTER (WHERE ${PAID}), 0)::float AS discounts,
           COALESCE(SUM(o.shipping_total) FILTER (WHERE ${PAID}), 0)::float AS delivery_fees,
           COUNT(*) FILTER (WHERE ${PAID} AND o.status NOT IN ('shipped','delivered'))::int AS to_fulfil,
           COUNT(*) FILTER (WHERE ${PAID} AND o.metadata->>'delivery_fee_pending' = 'true' AND COALESCE(o.shipping_total, 0) <= 0)::int AS delivery_fee_to_agree
         FROM orders o
         WHERE o.created_at BETWEEN $1 AND $2`,
        range
      ),
      query(
        `SELECT COALESCE(NULLIF(o.payment_method, ''), 'other') AS method,
                CASE WHEN ${POS} THEN 'POS' ELSE 'Website' END AS channel,
                COUNT(*)::int AS orders,
                COALESCE(SUM(o.total), 0)::float AS revenue
           FROM orders o
          WHERE o.created_at BETWEEN $1 AND $2 AND ${PAID}
          GROUP BY 1, 2
          ORDER BY revenue DESC`,
        range
      ),
      query(
        `SELECT oi.product_id,
                COALESCE(p.name, oi.product_name, 'Unknown item') AS name,
                SUM(oi.quantity)::int AS units,
                COALESCE(SUM(oi.quantity) FILTER (WHERE ${POS}), 0)::int AS pos_units,
                COALESCE(SUM(oi.quantity) FILTER (WHERE NOT ${POS}), 0)::int AS web_units,
                COALESCE(SUM(oi.total_price), 0)::float AS revenue,
                p.quantity::int AS stock_left,
                pc.cost_price::float AS unit_cost
           FROM order_items oi
           JOIN orders o ON o.id = oi.order_id
           LEFT JOIN products p ON p.id = oi.product_id
           LEFT JOIN product_costs pc ON pc.product_id = oi.product_id
          WHERE o.created_at BETWEEN $1 AND $2 AND ${PAID}
          GROUP BY oi.product_id, COALESCE(p.name, oi.product_name, 'Unknown item'), p.quantity, pc.cost_price
          ORDER BY revenue DESC
          LIMIT 200`,
        range
      ),
      query(
        `WITH sales AS (
           SELECT o.id, o.metadata->>'sold_by_id' AS staff_id,
                  COALESCE(NULLIF(o.metadata->>'sold_by_name', ''), NULLIF(o.metadata->>'sold_by_email', ''), 'Unassigned') AS staff_name,
                  o.total
             FROM orders o
            WHERE o.created_at BETWEEN $1 AND $2 AND ${PAID} AND ${POS}
         ), units AS (
           SELECT order_id, SUM(quantity) AS qty FROM order_items
            WHERE order_id IN (SELECT id FROM sales) GROUP BY order_id
         )
         SELECT s.staff_name AS name,
                COUNT(*)::int AS orders,
                COALESCE(SUM(s.total), 0)::float AS revenue,
                COALESCE(SUM(u.qty), 0)::int AS units
           FROM sales s LEFT JOIN units u ON u.order_id = s.id
          GROUP BY s.staff_id, s.staff_name
          ORDER BY revenue DESC`,
        range
      ),
      query(
        `SELECT o.id, o.order_number, o.total::float AS total, o.payment_status::text AS payment_status,
                o.payment_method, o.status::text AS status, o.created_at, o.shipping_method,
                o.metadata->>'sold_by_name' AS staff_name,
                CASE WHEN ${POS} THEN 'POS' ELSE 'Website' END AS channel,
                TRIM(COALESCE(o.metadata->>'first_name', o.shipping_address->>'firstName', '') || ' ' ||
                     COALESCE(o.metadata->>'last_name', o.shipping_address->>'lastName', '')) AS customer
           FROM orders o
          WHERE o.created_at BETWEEN $1 AND $2
          ORDER BY o.created_at DESC
          LIMIT 300`,
        range
      ),
      query<{ yesterday: number; last_week: number }>(
        `SELECT COALESCE(SUM(o.total) FILTER (WHERE o.created_at >= ($1::date - 1) AND o.created_at < $1::date), 0)::float AS yesterday,
                COALESCE(SUM(o.total) FILTER (WHERE o.created_at >= ($1::date - 7) AND o.created_at < ($1::date - 6)), 0)::float AS last_week
           FROM orders o
          WHERE ${PAID} AND o.created_at >= ($1::date - 7) AND o.created_at < $1::date`,
        [day]
      ),
      query<{ hour: number; orders: number; revenue: number }>(
        `SELECT EXTRACT(HOUR FROM o.created_at AT TIME ZONE 'UTC')::int AS hour,
                COUNT(*)::int AS orders, COALESCE(SUM(o.total), 0)::float AS revenue
           FROM orders o
          WHERE o.created_at BETWEEN $1 AND $2 AND ${PAID}
          GROUP BY 1 ORDER BY 1`,
        range
      ),
    ]);

    const t = totals.rows[0];
    const prior = previous.rows[0] ?? { yesterday: 0, last_week: 0 };
    const items = products.rows.map((p: any) => {
      const unitCost = p.unit_cost == null ? null : Number(p.unit_cost);
      const profit = unitCost == null ? null : Math.round((Number(p.revenue) - unitCost * Number(p.units)) * 100) / 100;
      return {
        productId: p.product_id,
        name: p.name,
        units: Number(p.units),
        posUnits: Number(p.pos_units),
        webUnits: Number(p.web_units),
        revenue: Number(p.revenue),
        stockLeft: p.stock_left == null ? null : Number(p.stock_left),
        profit: admin ? profit : null,
        hasCost: unitCost != null,
      };
    });
    const costed = items.filter((i) => i.hasCost);
    const costedRevenue = costed.reduce((s, i) => s + i.revenue, 0);
    const profit = admin && costed.length ? costed.reduce((s, i) => s + (i.profit || 0), 0) : null;

    return NextResponse.json({
      success: true,
      day,
      canSeeProfit: admin,
      summary: {
        paidOrders: t?.paid_orders || 0,
        partPaidOrders: t?.part_paid_orders || 0,
        unpaidOrders: t?.unpaid_orders || 0,
        cancelledOrders: t?.cancelled_orders || 0,
        posOrders: t?.pos_orders || 0,
        webOrders: t?.web_orders || 0,
        revenue: t?.revenue || 0,
        posRevenue: t?.pos_revenue || 0,
        webRevenue: t?.web_revenue || 0,
        collected: t?.collected || 0,
        partPaidCollected: t?.part_paid_collected || 0,
        discounts: t?.discounts || 0,
        deliveryFees: t?.delivery_fees || 0,
        toFulfil: t?.to_fulfil || 0,
        deliveryFeeToAgree: t?.delivery_fee_to_agree || 0,
        unitsSold: items.reduce((s, i) => s + i.units, 0),
        averageOrder: t?.paid_orders ? Number(t.revenue) / Number(t.paid_orders) : 0,
        profit,
        profitMargin: profit != null && costedRevenue > 0 ? profit / costedRevenue : null,
        profitCoverage: items.length ? costed.length / items.length : 0,
        itemsMissingCost: items.length - costed.length,
      },
      comparison: { yesterday: Number(prior.yesterday) || 0, lastWeek: Number(prior.last_week) || 0 },
      payments: payments.rows,
      items: items.map(({ hasCost: _hasCost, ...rest }) => rest),
      lowStock: items.filter((i) => i.stockLeft != null && i.stockLeft <= LOW_STOCK_AT).map((i) => ({ name: i.name, stockLeft: i.stockLeft })),
      staff: staff.rows,
      orders: orders.rows,
      hourly: hourly.rows,
    });
  } catch (err) {
    console.error('[admin/end-of-day] failed:', err);
    return NextResponse.json({ success: false, message: 'Could not build the end of day report' }, { status: 500 });
  }
}
