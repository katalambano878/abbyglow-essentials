import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { checkRateLimit, getClientIdentifier } from '@/lib/rate-limit';
import { verifyAccessToken } from '@/lib/db/auth';
import { isPlainPostgres } from '@/lib/db/mode';
import { computePaymentPlan } from '@/lib/payments/plans';
import { isGatewayConfigured, parseGateway } from '@/lib/payments/gateways';
import { getPreorderShippingNote, isPreorderProduct } from '@/lib/preorder';
import { computeShipping, parseDeliveryMethod } from '@/lib/shipping';
import { getDeliveryRates } from '@/lib/shipping-server';
import { recordCouponUse, validateCoupon } from '@/lib/coupons';
import { generateOrderNumber, generateTrackingNumber } from '@/lib/order-number';

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
    const deliveryMethod = parseDeliveryMethod(body.deliveryMethod);
    const couponCode = typeof body.couponCode === 'string' ? body.couponCode.trim() : '';
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
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return NextResponse.json({ success: false, message: 'Invalid email' }, { status: 400 });
    }
    if (phone.replace(/\D/g, '').length < 9) {
      return NextResponse.json({ success: false, message: 'Enter a valid phone number' }, { status: 400 });
    }
    for (const [label, value] of [['name', firstName + lastName], ['address', address], ['city', city], ['region', region]] as const) {
      if (value.length > 200) {
        return NextResponse.json({ success: false, message: `The ${label} is too long` }, { status: 400 });
      }
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
        .select('id, name, slug, price, quantity, status, sku, metadata, product_images(url, position)');
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
      const images = Array.isArray(product.product_images) ? [...product.product_images] : [];
      images.sort((a: any, b: any) => Number(a?.position ?? 0) - Number(b?.position ?? 0));
      const meta: Record<string, unknown> = {
        is_preorder: productIsPreorder,
        preorder_shipping: getPreorderShippingNote(product.metadata),
        image: images[0]?.url || null,
        product_slug: product.slug || null,
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
        // Legacy carts only carry the variant label. Match it exactly; if the
        // product has variants and none matches, refuse rather than silently
        // charging the base price for a different option.
        const { data: variants } = await supabaseAdmin
          .from('product_variants')
          .select('id, name, price, quantity, sku, product_id')
          .eq('product_id', product.id);
        const list = (variants || []) as Array<{ id: string; name: string; price: number | null; quantity: number | null; sku: string | null }>;
        const wanted = variantName.toLowerCase();
        const variant = list.find((v) => {
          const n = String(v.name || '').toLowerCase();
          return n === wanted || wanted.endsWith(`/ ${n}`) || wanted.startsWith(`${n} /`);
        });
        if (variant) {
          unitPrice = Number(variant.price ?? unitPrice);
          variantName = variant.name;
          sku = variant.sku || sku;
          stock = Number(variant.quantity ?? stock);
          meta.variant_id = variant.id;
        } else if (list.length > 0) {
          return NextResponse.json(
            { success: false, message: `The selected option for ${product.name} is no longer available. Please choose it again.` },
            { status: 400 }
          );
        }
      }

      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        return NextResponse.json({ success: false, message: 'Invalid product price' }, { status: 400 });
      }
      // Pre-order products are sold ahead of stock arriving; everything else must be in stock.
      if (!productIsPreorder && stock < qty) {
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

    // Coupon (validated server-side against the staff-only coupons table)
    let discount = 0;
    let couponId: string | null = null;
    let couponApplied: string | null = null;
    let couponFreeShipping = false;
    if (couponCode) {
      const coupon = await validateCoupon(couponCode, subtotal, { email });
      if (!coupon.ok) {
        return NextResponse.json({ success: false, message: coupon.message, code: 'COUPON_INVALID' }, { status: 400 });
      }
      discount = coupon.discount;
      couponId = coupon.coupon.id;
      couponApplied = coupon.coupon.code;
      couponFreeShipping = coupon.freeShipping;
    }

    const discountedSubtotal = Math.max(0, Math.round((subtotal - discount) * 100) / 100);
    const deliveryRates = await getDeliveryRates();
    const shippingCost = couponFreeShipping ? 0 : computeShipping(discountedSubtotal, deliveryMethod, deliveryRates);
    const tax = 0;
    const total = Math.round((discountedSubtotal + shippingCost + tax) * 100) / 100;
    // The store takes full payment only; the plan columns stay for historical deposit orders.
    const planBreakdown = computePaymentPlan(total, 'full');

    const orderNumber = generateOrderNumber();
    const trackingNumber = generateTrackingNumber();

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
          discount_total: discount,
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
            channel: 'web',
            payment_gateway: paymentGateway,
            payment_plan: planBreakdown.plan,
            delivery_method: deliveryMethod,
            delivery_fee: shippingCost,
            coupon_code: couponApplied,
            coupon_discount: discount,
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

    if (couponId) await recordCouponUse(couponId);

    try {
      const { error: customerError } = await supabaseAdmin.rpc('upsert_customer_from_order', {
        p_email: email,
        p_phone: phone,
        p_full_name: `${firstName} ${lastName}`.trim(),
        p_first_name: firstName,
        p_last_name: lastName,
        p_user_id: userId,
        p_address: shippingAddress,
      });
      if (customerError) console.error('[Checkout] upsert_customer_from_order failed:', customerError.message || customerError);
    } catch (err: any) {
      console.error('[Checkout] upsert_customer_from_order threw:', err?.message || err);
    }

    return NextResponse.json({
      success: true,
      order: {
        id: order.id,
        order_number: order.order_number,
        total: order.total,
        subtotal,
        discount_total: discount,
        shipping_total: shippingCost,
        coupon_code: couponApplied,
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
