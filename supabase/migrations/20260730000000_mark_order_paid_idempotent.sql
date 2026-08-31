-- Idempotent mark_order_paid: skip status rewrite / stock if already paid.
-- Safe for staging and production (function replace only).

CREATE OR REPLACE FUNCTION public.mark_order_paid(order_ref text, moolre_ref text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  updated_order orders;
BEGIN
  SELECT * INTO updated_order
  FROM orders
  WHERE order_number = order_ref
  FOR UPDATE;

  IF updated_order.id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Already paid: return as-is (idempotent). Do not re-reduce stock.
  IF updated_order.payment_status = 'paid' THEN
    RETURN to_jsonb(updated_order);
  END IF;

  UPDATE orders
  SET
    payment_status = 'paid',
    status = CASE
        WHEN status = 'pending' THEN 'processing'::order_status
        WHEN status = 'awaiting_payment' THEN 'processing'::order_status
        ELSE status
    END,
    metadata = COALESCE(metadata, '{}'::jsonb) ||
               jsonb_build_object(
                   'moolre_reference', moolre_ref,
                   'payment_verified_at', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
               )
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
