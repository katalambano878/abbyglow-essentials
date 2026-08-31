-- Part-payment / deposit plans (step 1): enum + columns only.
-- NOTE: New enum values must be committed before use in later statements.
-- apply_order_payment lives in 20260803140100_apply_order_payment.sql

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

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS payment_plan TEXT NOT NULL DEFAULT 'full',
  ADD COLUMN IF NOT EXISTS amount_due_now NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS balance_due NUMERIC(12, 2);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_payment_plan_check'
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_payment_plan_check
      CHECK (payment_plan IN ('full', 'deposit_50'));
  END IF;
END$$;

UPDATE orders
SET
  amount_due_now = COALESCE(amount_due_now, total),
  balance_due = COALESCE(balance_due, GREATEST(0, total - COALESCE(amount_paid, 0))),
  payment_plan = COALESCE(payment_plan, 'full')
WHERE amount_due_now IS NULL OR balance_due IS NULL;

ALTER TABLE payment_attempts
  ADD COLUMN IF NOT EXISTS purpose TEXT NOT NULL DEFAULT 'full';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payment_attempts_purpose_check'
  ) THEN
    ALTER TABLE payment_attempts
      ADD CONSTRAINT payment_attempts_purpose_check
      CHECK (purpose IN ('full', 'deposit', 'balance', 'admin_settle'));
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_orders_payment_plan ON orders(payment_plan);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status_partial ON orders(payment_status)
  WHERE payment_status IN ('pending', 'failed');

CREATE TABLE IF NOT EXISTS order_payment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  gateway TEXT NOT NULL,
  gateway_ref TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('checkout', 'balance', 'admin_settle')),
  amount NUMERIC(12, 2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (gateway, gateway_ref)
);

CREATE INDEX IF NOT EXISTS idx_order_payment_events_order ON order_payment_events(order_id);
