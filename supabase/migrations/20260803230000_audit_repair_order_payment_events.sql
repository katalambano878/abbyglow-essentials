-- Corrective migration: ensure payment event table + indexes + ledger entries.
-- Idempotent for store_abbyglow. Uses schema_migrations(id, notes) from db_health_repair.

CREATE TABLE IF NOT EXISTS public.order_payment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  gateway TEXT NOT NULL,
  gateway_ref TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('checkout', 'balance', 'admin_settle')),
  amount NUMERIC(12, 2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (gateway, gateway_ref)
);

CREATE INDEX IF NOT EXISTS idx_order_payment_events_order ON public.order_payment_events(order_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'payment_status' AND e.enumlabel = 'partially_paid'
  ) THEN
    ALTER TYPE payment_status ADD VALUE 'partially_paid';
  END IF;
END$$;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_plan TEXT NOT NULL DEFAULT 'full',
  ADD COLUMN IF NOT EXISTS amount_due_now NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS balance_due NUMERIC(12, 2);

ALTER TABLE public.payment_attempts
  ADD COLUMN IF NOT EXISTS purpose TEXT NOT NULL DEFAULT 'full';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_payment_plan_check') THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_payment_plan_check
      CHECK (payment_plan IN ('full', 'deposit_50'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_attempts_purpose_check') THEN
    ALTER TABLE public.payment_attempts
      ADD CONSTRAINT payment_attempts_purpose_check
      CHECK (purpose IN ('full', 'deposit', 'balance', 'admin_settle'));
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_orders_payment_plan ON public.orders(payment_plan);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status_partial ON public.orders(payment_status)
  WHERE payment_status IN ('pending', 'failed');

CREATE INDEX IF NOT EXISTS idx_products_status_created ON public.products(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_category_id ON public.products(category_id);
CREATE INDEX IF NOT EXISTS idx_product_images_product_id ON public.product_images(product_id);
CREATE INDEX IF NOT EXISTS idx_product_variants_product_id ON public.product_variants(product_id);

CREATE TABLE IF NOT EXISTS public.schema_migrations (
  id text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT NOW(),
  notes text
);

INSERT INTO public.schema_migrations (id, notes) VALUES
  ('20260803140000_part_payment_plans', 'order payment_plan columns + order_payment_events'),
  ('20260803140100_apply_order_payment', 'apply_order_payment RPC'),
  ('20260803230000_audit_repair_order_payment_events', 'god-level audit repair: events/indexes/ledger')
ON CONFLICT (id) DO NOTHING;
