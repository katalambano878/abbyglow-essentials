-- Fix: apply_order_payment() failed with `column reference "gateway_ref" is
-- ambiguous` because the function parameter shares its name with the
-- order_payment_events column used in the idempotency check. Every gateway
-- callback / verify call therefore returned "Database update failed".
-- Same body as 20260803140100, with the column references table-qualified.

CREATE OR REPLACE FUNCTION public.apply_order_payment(order_ref text, p_amount numeric, p_gateway text DEFAULT 'moolre'::text, gateway_ref text DEFAULT NULL::text, kind text DEFAULT 'checkout'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  updated_order orders;
  pay_amount numeric(12, 2);
  new_paid numeric(12, 2);
  new_balance numeric(12, 2);
  gref text;
  pay_kind text;
BEGIN
  pay_kind := COALESCE(NULLIF(trim(kind), ''), 'checkout');
  IF pay_kind NOT IN ('checkout', 'balance', 'admin_settle') THEN
    pay_kind := 'checkout';
  END IF;

  gref := COALESCE(NULLIF(trim(gateway_ref), ''), pay_kind || '-' || order_ref || '-' || extract(epoch from now())::bigint::text);

  SELECT * INTO updated_order
  FROM orders
  WHERE order_number = order_ref
  FOR UPDATE;

  IF updated_order.id IS NULL THEN
    RETURN NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM order_payment_events
    WHERE order_payment_events.gateway = COALESCE(NULLIF(trim(p_gateway), ''), 'manual')
      AND order_payment_events.gateway_ref = gref
  ) THEN
    RETURN to_jsonb(updated_order);
  END IF;

  IF updated_order.payment_status = 'paid' THEN
    RETURN to_jsonb(updated_order);
  END IF;

  pay_amount := ROUND(COALESCE(p_amount, 0)::numeric, 2);
  IF pay_amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be positive';
  END IF;

  new_balance := GREATEST(0, ROUND(COALESCE(updated_order.total, 0) - COALESCE(updated_order.amount_paid, 0), 2));
  IF pay_amount > new_balance + 0.01 THEN
    pay_amount := new_balance;
  END IF;

  IF pay_amount <= 0 THEN
    RETURN to_jsonb(updated_order);
  END IF;

  INSERT INTO order_payment_events (order_id, gateway, gateway_ref, kind, amount)
  VALUES (
    updated_order.id,
    COALESCE(NULLIF(trim(p_gateway), ''), 'manual'),
    gref,
    pay_kind,
    pay_amount
  );

  new_paid := ROUND(COALESCE(updated_order.amount_paid, 0) + pay_amount, 2);
  new_balance := GREATEST(0, ROUND(COALESCE(updated_order.total, 0) - new_paid, 2));

  UPDATE orders
  SET
    amount_paid = new_paid,
    balance_due = new_balance,
    amount_due_now = COALESCE(amount_due_now, total),
    payment_status = CASE
      WHEN new_balance <= 0.01 THEN 'paid'::payment_status
      WHEN new_paid > 0 THEN 'partially_paid'::payment_status
      ELSE payment_status
    END,
    status = CASE
      WHEN status IN ('pending'::order_status, 'awaiting_payment'::order_status)
        AND new_paid > 0 THEN 'processing'::order_status
      ELSE status
    END,
    payment_provider = COALESCE(NULLIF(trim(p_gateway), ''), payment_provider),
    metadata = COALESCE(metadata, '{}'::jsonb) ||
               jsonb_build_object(
                 'last_payment_gateway', COALESCE(NULLIF(trim(p_gateway), ''), 'manual'),
                 'last_payment_ref', gref,
                 'last_payment_kind', pay_kind,
                 'last_payment_amount', pay_amount,
                 'payment_verified_at', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
               ) ||
               CASE
                 WHEN pay_kind = 'admin_settle' THEN jsonb_build_object(
                   'balance_settled_at', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                   'balance_settled_by', 'admin'
                 )
                 ELSE '{}'::jsonb
               END,
    updated_at = NOW()
  WHERE id = updated_order.id
  RETURNING * INTO updated_order;

  IF (updated_order.metadata->>'stock_reduced') IS NULL THEN
    UPDATE products p
    SET quantity = GREATEST(0, p.quantity - oi.quantity)
    FROM order_items oi
    WHERE oi.order_id = updated_order.id
      AND oi.product_id = p.id;

    UPDATE product_variants pv
    SET quantity = GREATEST(0, pv.quantity - oi.quantity)
    FROM order_items oi
    WHERE oi.order_id = updated_order.id
      AND oi.product_id = pv.product_id
      AND oi.variant_name IS NOT NULL
      AND oi.variant_name = pv.name;

    UPDATE orders
    SET metadata = metadata || '{"stock_reduced": true}'::jsonb
    WHERE id = updated_order.id
    RETURNING * INTO updated_order;
  END IF;

  RETURN to_jsonb(updated_order);
END;
$function$;
