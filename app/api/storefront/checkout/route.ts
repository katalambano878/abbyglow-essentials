import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { checkRateLimit, getClientIdentifier } from '@/lib/rate-limit';
import { verifyAccessToken } from '@/lib/db/auth';
import { isPlainPostgres } from '@/lib/db/mode';
import { computePaymentPlan, type PaymentPlan } from '@/lib/payments/plans';
import { isGatewayConfigured, parseGateway } from '@/lib/payments/gateways';
import { getPreorderShippingNote, isPreorderProduct } from '@/lib/preorder';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type CartLine = {
  productId: string;
  variantId?: string | null;
  variantName?: string | null;
  quantity: number;
};

/**
 * Server-side checkout: recalculates totals from DB prices.
 * Never trusts client-provided unit prices or totals.
 */
export async function POST(req: Request) {
  try {
    const clientId = getClientIdentifier(req);
    const rl = checkRateLimit(`checkout:${clientId}`, {
      maxRequests: 10,
      windowSeconds: 60,
    });
    if (!rl.success) {
      return NextResponse.json({ success: false, message: 'Too many requests' }, { status: 429 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ success: false, message: 'Invalid body' }, { status: 400 });
    }

    const items = Array.isArray(body.items) ? (body.items as CartLine[]) : [];
    if (items.length === 0) {
      return NextResponse.json({ success: false, message: 'Cart is empty' }, { status: 400 });
    }
    if (items.length > 50) {
      return NextResponse.json({ success: false, message: 'Too many line items' }, { status: 400 });
    }

    const shipping = body.shipping || {};
    const email = String(shipping.email || '').trim().toLowerCase();
    const phone = String(shipping.phone || '').trim();
    const firstName = String(shipping.firstName || '').trim();
    const lastName = String(shipping.lastName || '').trim();
    const address = String(shipping.address || '').trim();
    const city = String(shipping.city || '').trim();
    const region = String(shipping.region || '').trim();
    const deliveryMethod = String(body.deliveryMethod || 'pickup');
    const paymentPlanRaw = String(body.paymentPlan || 'full');
    const paymentGateway = parseGateway(body.paymentGateway || body.paymentMethod);
    if (!paymentGateway || !isGatewayConfigured(paymentGateway)) {
      return NextResponse.json(
        { success: false, message: 'Select a configured online payment gateway (Moolre or Hubtel)' },
        { status: 400 }
      );
    }
    const paymentMethod = paymentGateway;

    if (!email || !phone || !firstName || !lastName || !address || !city || !region) {
      return NextResponse.json({ success: false, message: 'Incomplete shipping details' }, { status: 400 });
    }
    if (!/\S+@\S+\.\S+/.test(email)) {
      return NextResponse.json({ success: false, message: 'Invalid email' }, { status: 400 });
    }

    // Optional auth — attach user_id when JWT present
    let userId: string | null = null;
    const auth = req.headers.get('authorization') || '';
    const m = auth.match(/^Bearer\s+(.+)$/i);
    if (m?.[1] && isPlainPostgres()) {
      const verified = await verifyAccessToken(m[1]);
      if (verified) userId = verified.userId;
    }

    const lineRows: Array<{
      product_id: string;
      product_name: string;
      variant_name: string | null;
      sku: string | null;
      quantity: number;
      unit_price: number;
      total_price: number;
      metadata: Record<string, unknown>;
    }> = [];

    let subtotal = 0;

    for (const line of items) {
      const productId = String(line.productId || '');
      const qty = Math.floor(Number(line.quantity) || 0);
      if (!productId || qty < 1 || qty > 99) {
        return NextResponse.json({ success: false, message: 'Invalid cart line' }, { status: 400 });
      }

      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(productId);
      let productQuery = supabaseAdmin
        .from('products')
        .select('id, name, price, quantity, status, sku, metadata');
      productQuery = isUuid
        ? productQuery.eq('id', productId)
        : productQuery.eq('slug', productId);

      const { data: product, error: pErr } = await productQuery.maybeSingle();

      if (pErr || !product || product.status === 'draft' || product.status === 'archived') {
        return NextResponse.json({ success: false, message: 'A product in your cart is unavailable' }, { status: 400 });
      }

      let unitPrice = Number(product.price);
      let variantName: string | null = line.variantName ? String(line.variantName) : null;
      let sku: string | null = product.sku || null;
      let stock = Number(product.quantity ?? 0);
      const productIsPreorder = isPreorderProduct(product.metadata);
      const meta: Record<string, unknown> = {
        is_preorder: productIsPreorder,
        preorder_shipping: getPreorderShippingNote(product.metadata),
      };

      if (line.variantId) {
        const { data: variant } = await supabaseAdmin
          .from('product_variants')
          .select('id, name, price, quantity, sku, product_id')
          .eq('id', String(line.variantId))
          .eq('product_id', product.id)
          .maybeSingle();

        if (!variant) {
          return NextResponse.json({ success: false, message: 'Invalid product variant' }, { status: 400 });
        }
        unitPrice = Number(variant.price ?? unitPrice);
        variantName = variant.name || variantName;
        sku = variant.sku || sku;
        stock = Number(variant.quantity ?? stock);
        meta.variant_id = variant.id;
      } else if (variantName) {
        const { data: variant } = await supabaseAdmin
          .from('product_variants')
          .select('id, name, price, quantity, sku, product_id')
          .eq('product_id', product.id)
          .eq('name', variantName)
          .maybeSingle();
        if (variant) {
          unitPrice = Number(variant.price ?? unitPrice);
          sku = variant.sku || sku;
          stock = Number(variant.quantity ?? stock);
          meta.variant_id = variant.id;
        }
      }

      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        return NextResponse.json({ success: false, message: 'Invalid product price' }, { status: 400 });
      }
      if (stock < qty) {
        return NextResponse.json(
          { success: false, message: `Insufficient stock for ${product.name}` },
          { status: 400 }
        );
      }

      const lineTotal = Math.round(unitPrice * qty * 100) / 100;
      subtotal += lineTotal;
      lineRows.push({
        product_id: product.id,
        product_name: product.name,
        variant_name: variantName,
        sku,
        quantity: qty,
        unit_price: unitPrice,
        total_price: lineTotal,
        metadata: meta,
      });
    }

    subtotal = Math.round(subtotal * 100) / 100;
    const shippingCost = 0;
    const tax = 0;
    const total = Math.round((subtotal + shippingCost + tax) * 100) / 100;
    const cartHasPreorder = lineRows.some((line) => line.metadata.is_preorder === true);
    const paymentPlan: PaymentPlan =
      paymentPlanRaw === 'deposit_50' && cartHasPreorder ? 'deposit_50' : 'full';
    const planBreakdown = computePaymentPlan(total, paymentPlan);

    const orderNumber = `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const trackingId = Array.from({ length: 6 }, () =>
      'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]
    ).join('');
    const trackingNumber = `SLI-${trackingId}`;

    const shippingAddress = {
      firstName,
      lastName,
      email,
      phone,
      address,
      city,
      region,
    };

    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .insert([
        {
          order_number: orderNumber,
          user_id: userId,
          email,
          phone,
          status: 'awaiting_payment',
          payment_status: 'pending',
          currency: 'GHS',
          subtotal,
          tax_total: tax,
          shipping_total: shippingCost,
          discount_total: 0,
          total,
          payment_plan: planBreakdown.plan,
          amount_due_now: planBreakdown.amountDueNow,
          amount_paid: 0,
          balance_due: planBreakdown.balanceDue,
          shipping_method: deliveryMethod,
          payment_method: paymentMethod,
          payment_provider: paymentGateway,
          shipping_address: shippingAddress,
          billing_address: shippingAddress,
          metadata: {
            guest_checkout: !userId,
            first_name: firstName,
            last_name: lastName,
            tracking_number: trackingNumber,
            checkout_source: 'server_checkout',
            payment_gateway: paymentGateway,
            payment_plan: planBreakdown.plan,
          },
        },
      ])
      .select(
        'id, order_number, total, payment_status, status, payment_plan, amount_due_now, amount_paid, balance_due, metadata'
      )
      .single();

    if (orderError || !order) {
      console.error('[Checkout] Order insert failed:', orderError?.message);
      return NextResponse.json({ success: false, message: 'Failed to create order' }, { status: 500 });
    }

    const itemsPayload = lineRows.map((row) => ({
      ...row,
      order_id: order.id,
    }));

    const { error: itemsError } = await supabaseAdmin.from('order_items').insert(itemsPayload);
    if (itemsError) {
      console.error('[Checkout] Items insert failed:', itemsError.message);
      // Best-effort cleanup
      await supabaseAdmin.from('orders').delete().eq('id', order.id);
      return NextResponse.json({ success: false, message: 'Failed to create order items' }, { status: 500 });
    }

    try {
      await supabaseAdmin.rpc('upsert_customer_from_order', {
        p_email: email,
        p_phone: phone,
        p_full_name: `${firstName} ${lastName}`.trim(),
        p_first_name: firstName,
        p_last_name: lastName,
        p_user_id: userId,
        p_address: shippingAddress,
      });
    } catch {
      // non-fatal
    }

    return NextResponse.json({
      success: true,
      order: {
        id: order.id,
        order_number: order.order_number,
        total: order.total,
        tracking_number: trackingNumber,
        payment_status: order.payment_status,
        status: order.status,
        payment_plan: order.payment_plan,
        amount_due_now: order.amount_due_now,
        amount_paid: order.amount_paid,
        balance_due: order.balance_due,
        payment_gateway: paymentGateway,
      },
    });
  } catch (err: any) {
    console.error('[Checkout] error:', err?.message || err);
    return NextResponse.json({ success: false, message: 'Checkout failed' }, { status: 500 });
  }
}
