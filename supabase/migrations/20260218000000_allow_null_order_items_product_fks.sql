-- Allow null product_id and variant_id on order_items so products can be deleted.
-- Order rows keep product_name, sku, quantity, unit_price, etc. for history.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'order_items' AND column_name = 'product_id' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.order_items ALTER COLUMN product_id DROP NOT NULL;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'order_items' AND column_name = 'variant_id' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.order_items ALTER COLUMN variant_id DROP NOT NULL;
  END IF;
END $$;
