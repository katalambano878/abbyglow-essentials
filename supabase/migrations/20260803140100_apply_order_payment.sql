-- Part-payment RPC (step 2): uses partially_paid after enum commit

CREATE OR REPLACE FUNCTION public.apply_order_payment(
  order_ref text,
  p_amount numeric,
  p_gateway text DEFAULT 'moolre',
  gateway_ref text DEFAULT NULL,
  kind text DEFAULT 'checkout'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
    WHERE gateway = COALESCE(NULLIF(trim(p_gateway), ''), 'manual')
      AND gateway_ref = gref
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
$$;

CREATE OR REPLACE FUNCTION public.mark_order_paid(order_ref text, moolre_ref text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  o orders;
  remaining numeric(12, 2);
BEGIN
  SELECT * INTO o FROM orders WHERE order_number = order_ref;
  IF o.id IS NULL THEN
    RETURN NULL;
  END IF;
  IF o.payment_status = 'paid' THEN
    RETURN to_jsonb(o);
  END IF;
  remaining := GREATEST(
    0,
    ROUND(COALESCE(o.total, 0) - COALESCE(o.amount_paid, 0), 2)
  );
  IF COALESCE(o.amount_paid, 0) <= 0 AND COALESCE(o.amount_due_now, 0) > 0 THEN
    remaining := LEAST(remaining, ROUND(o.amount_due_now::numeric, 2));
  END IF;
  RETURN public.apply_order_payment(
    order_ref,
    remaining,
    'moolre',
    COALESCE(moolre_ref, 'mark_order_paid-' || order_ref),
    CASE WHEN COALESCE(o.amount_paid, 0) > 0 THEN 'balance' ELSE 'checkout' END
  );
END;
$$;

-- Safer partial index now that enum value is committed
DROP INDEX IF EXISTS idx_orders_payment_status_partial;
CREATE INDEX IF NOT EXISTS idx_orders_payment_status_partial ON orders(payment_status)
  WHERE payment_status IN ('pending', 'partially_paid', 'failed');
