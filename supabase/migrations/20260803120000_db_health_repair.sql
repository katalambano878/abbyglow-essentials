-- AbbyGlow Essentials — corrective DB health repair (additive, reversible)
-- Confirmed against live store_abbyglow (PostgreSQL 16) on 2026-08-03.
-- Does NOT drop data. Safe for empty or populated staging.

-- ---------------------------------------------------------------------------
-- 1) Missing Supabase-compat helper used by legacy RLS policies
-- ---------------------------------------------------------------------------
-- Prefer claim from JWT; fallback anon (matches PostgREST-style defaults)
CREATE OR REPLACE FUNCTION auth.role()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claim.role', true), ''),
    'anon'
  );
$$;

GRANT EXECUTE ON FUNCTION auth.uid() TO store_abbyglow, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.role() TO store_abbyglow, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2) Optional storage stub (app uses local disk; keeps re-runnable migrations)
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS storage;

CREATE TABLE IF NOT EXISTS storage.buckets (
  id text PRIMARY KEY,
  name text NOT NULL,
  public boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

INSERT INTO storage.buckets (id, name, public) VALUES
  ('products', 'products', true),
  ('avatars', 'avatars', true),
  ('blog', 'blog', true),
  ('media', 'media', true),
  ('reviews', 'reviews', true)
ON CONFLICT (id) DO NOTHING;

GRANT USAGE ON SCHEMA storage TO store_abbyglow;
GRANT SELECT ON ALL TABLES IN SCHEMA storage TO store_abbyglow;

-- ---------------------------------------------------------------------------
-- 3) Payment integrity constraints / indexes
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payment_attempts_amount_expected_nonneg'
  ) THEN
    ALTER TABLE payment_attempts
      ADD CONSTRAINT payment_attempts_amount_expected_nonneg
      CHECK (amount_expected >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payment_attempts_amount_paid_nonneg'
  ) THEN
    ALTER TABLE payment_attempts
      ADD CONSTRAINT payment_attempts_amount_paid_nonneg
      CHECK (amount_paid IS NULL OR amount_paid >= 0);
  END IF;
END$$;

-- Gateway references unique when present (prevents duplicate provider txs)
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_attempts_gateway_ref_uq
  ON payment_attempts (gateway, gateway_reference)
  WHERE gateway_reference IS NOT NULL AND gateway_reference <> '';

CREATE INDEX IF NOT EXISTS idx_callback_events_processing
  ON callback_events (processing_status, received_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_callback_events_external_uq
  ON callback_events (gateway, external_event_id)
  WHERE external_event_id IS NOT NULL AND external_event_id <> '';

-- One successful order-confirmation SMS per order (dedupe layer)
CREATE UNIQUE INDEX IF NOT EXISTS idx_sms_attempts_order_confirm_uq
  ON sms_attempts (related_order_id, message_type)
  WHERE related_order_id IS NOT NULL
    AND message_type = 'order_confirmation'
    AND status IN ('sent', 'pending');

-- ---------------------------------------------------------------------------
-- 4) Protect successful payment_attempts from delayed failure overwrites
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION protect_successful_payment_attempt()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'successful'
     AND NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status IN ('failed', 'cancelled', 'expired', 'pending', 'processing') THEN
    NEW.status := OLD.status;
    NEW.verified_at := COALESCE(OLD.verified_at, NEW.verified_at);
    NEW.verification_status := COALESCE(OLD.verification_status, 'verified');
    NEW.failure_reason := COALESCE(OLD.failure_reason, NEW.failure_reason);
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_successful_payment_attempt ON payment_attempts;
CREATE TRIGGER trg_protect_successful_payment_attempt
  BEFORE UPDATE ON payment_attempts
  FOR EACH ROW
  EXECUTE FUNCTION protect_successful_payment_attempt();

-- ---------------------------------------------------------------------------
-- 5) Schema migration ledger (plain-PG friendly; not supabase_migrations)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS schema_migrations (
  id text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT NOW(),
  notes text
);

INSERT INTO schema_migrations (id, notes) VALUES
  ('20260209000000_complete_schema', 'baseline ecommerce schema'),
  ('20260218000000_allow_null_order_items_product_fks', 'soft-delete products'),
  ('20260730000000_mark_order_paid_idempotent', 'idempotent paid RPC'),
  ('20260803000000_payment_audit_tables', 'payment/callback/sms audit'),
  ('20260803120000_db_health_repair', 'auth.role, storage stub, payment guards')
ON CONFLICT (id) DO NOTHING;
