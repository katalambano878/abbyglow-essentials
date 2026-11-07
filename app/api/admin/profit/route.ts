import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db/pool';
import { requireAdmin } from '@/lib/admin/require-staff';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Admin only: every product with its supplier cost, current selling price and
 * recent sales, so the Profit Margins page can show margin per item.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });

  try {
    const { rows } = await query(
      `SELECT p.id, p.name, p.sku, p.status::text AS status,
              p.price::float AS price, p.compare_at_price::float AS compare_at_price,
              p.quantity::int AS quantity, c.name AS category,
              (SELECT url FROM product_images pi WHERE pi.product_id = p.id ORDER BY position NULLS LAST LIMIT 1) AS image,
              (SELECT MIN(v.price)::float FROM product_variants v WHERE v.product_id = p.id AND v.price > 0) AS min_variant_price,
              (SELECT COALESCE(SUM(v.quantity), 0)::int FROM product_variants v WHERE v.product_id = p.id) AS variant_stock,
              (SELECT COUNT(*)::int FROM product_variants v WHERE v.product_id = p.id) AS variant_count,
              pc.cost_price::float AS cost_price, pc.supplier_name, pc.notes, pc.updated_at AS cost_updated_at,
              COALESCE(sold.units, 0)::int AS units_sold_30d,
              COALESCE(sold.revenue, 0)::float AS revenue_30d
         FROM products p
         LEFT JOIN categories c ON c.id = p.category_id
         LEFT JOIN product_costs pc ON pc.product_id = p.id
         LEFT JOIN (
           SELECT oi.product_id, SUM(oi.quantity) AS units, SUM(oi.total_price) AS revenue
             FROM order_items oi
             JOIN orders o ON o.id = oi.order_id
            WHERE o.payment_status = 'paid'
              AND o.status NOT IN ('cancelled', 'refunded')
              AND o.created_at > now() - interval '30 days'
            GROUP BY oi.product_id
         ) sold ON sold.product_id = p.id
        WHERE p.status::text <> 'archived'
        ORDER BY p.name`
    );

    const products = rows.map((p: any) => {
      const regularPrice = Number(p.compare_at_price) > Number(p.price) ? Number(p.compare_at_price) : Number(p.price);
      const sellingPrice = p.min_variant_price != null ? Number(p.min_variant_price) : Number(p.price);
      const stock = p.variant_count > 0 ? Number(p.variant_stock) : Number(p.quantity);
      return {
        id: p.id,
        name: p.name,
        sku: p.sku,
        status: p.status,
        category: p.category,
        image: p.image,
        stock,
        regularPrice,
        sellingPrice,
        onPromotion: sellingPrice < regularPrice - 0.005,
        costPrice: p.cost_price == null ? null : Number(p.cost_price),
        supplierName: p.supplier_name,
        notes: p.notes,
        costUpdatedAt: p.cost_updated_at,
        unitsSold30d: p.units_sold_30d,
        revenue30d: p.revenue_30d,
      };
    });

    return NextResponse.json({ success: true, products });
  } catch (err) {
    console.error('[admin/profit] load failed:', err);
    return NextResponse.json({ success: false, message: 'Could not load products' }, { status: 500 });
  }
}

/** Admin only: save or clear the supplier cost for one product. */
export async function PUT(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  const productId = typeof body.productId === 'string' ? body.productId : '';
  if (!UUID.test(productId)) {
    return NextResponse.json({ success: false, message: 'Pick a product' }, { status: 400 });
  }
  const supplierName = typeof body.supplierName === 'string' ? body.supplierName.trim().slice(0, 120) : '';
  const notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 500) : '';
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;

  try {
    const named = await query<{ name: string }>(`SELECT name FROM products WHERE id = $1`, [productId]);
    const product = named.rows[0];
    if (!product) return NextResponse.json({ success: false, message: 'Product not found' }, { status: 404 });

    if (body.costPrice === null || body.costPrice === undefined || body.costPrice === '') {
      await query(`DELETE FROM product_costs WHERE product_id = $1`, [productId]);
      await query(
        `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details, ip_address)
         VALUES ($1, 'delete', 'product_costs', $2, $3, $4)`,
        [auth.userId, productId, JSON.stringify({ product: product.name }), ip]
      );
      return NextResponse.json({ success: true, message: `Cleared the cost for ${product.name}.` });
    }

    const cost = Number(body.costPrice);
    if (!Number.isFinite(cost) || cost < 0 || cost > 1_000_000) {
      return NextResponse.json({ success: false, message: 'Enter what you paid the supplier, in cedis' }, { status: 400 });
    }
    const rounded = Math.round(cost * 100) / 100;

    await query(
      `INSERT INTO product_costs (product_id, cost_price, supplier_name, notes, updated_by, updated_at)
       VALUES ($1, $2, NULLIF($3, ''), NULLIF($4, ''), $5, now())
       ON CONFLICT (product_id) DO UPDATE
         SET cost_price = EXCLUDED.cost_price, supplier_name = EXCLUDED.supplier_name,
             notes = EXCLUDED.notes, updated_by = EXCLUDED.updated_by, updated_at = now()`,
      [productId, rounded, supplierName, notes, auth.userId]
    );
    await query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details, ip_address)
       VALUES ($1, 'update', 'product_costs', $2, $3, $4)`,
      [auth.userId, productId, JSON.stringify({ product: product.name, cost_price: rounded, supplier_name: supplierName || null }), ip]
    );
    return NextResponse.json({ success: true, message: `Saved cost for ${product.name}.` });
  } catch (err) {
    console.error('[admin/profit] save failed:', err);
    return NextResponse.json({ success: false, message: 'Could not save the cost' }, { status: 500 });
  }
}
