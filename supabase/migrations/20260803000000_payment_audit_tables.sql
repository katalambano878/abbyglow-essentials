-- AbbyGlow Essentials — payment attempt + callback event audit tables
-- Safe for production: additive only, no destructive changes.

CREATE TABLE IF NOT EXISTS payment_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  order_number TEXT,
  user_id UUID,
  gateway TEXT NOT NULL DEFAULT 'moolre',
  internal_reference TEXT NOT NULL,
  gateway_reference TEXT,
  amount_expected NUMERIC(12, 2) NOT NULL,
  amount_paid NUMERIC(12, 2),
  currency TEXT NOT NULL DEFAULT 'GHS',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending', 'processing', 'successful', 'failed',
      'cancelled', 'expired', 'reversed', 'refunded', 'partially_refunded'
    )),
  initiation_payload JSONB DEFAULT '{}'::jsonb,
  gateway_response JSONB DEFAULT '{}'::jsonb,
  verification_status TEXT DEFAULT 'unverified',
  callback_received_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  failure_reason TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT payment_attempts_internal_reference_key UNIQUE (internal_reference)
);

CREATE INDEX IF NOT EXISTS idx_payment_attempts_order_id ON payment_attempts(order_id);
CREATE INDEX IF NOT EXISTS idx_payment_attempts_order_number ON payment_attempts(order_number);
CREATE INDEX IF NOT EXISTS idx_payment_attempts_gateway_ref ON payment_attempts(gateway_reference);
CREATE INDEX IF NOT EXISTS idx_payment_attempts_status ON payment_attempts(status);
CREATE INDEX IF NOT EXISTS idx_payment_attempts_created ON payment_attempts(created_at DESC);

CREATE TABLE IF NOT EXISTS callback_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gateway TEXT NOT NULL DEFAULT 'moolre',
  event_type TEXT NOT NULL DEFAULT 'payment_callback',
  external_event_id TEXT,
  reference TEXT,
  payload_hash TEXT,
  signature_status TEXT NOT NULL DEFAULT 'unknown'
    CHECK (signature_status IN ('valid', 'invalid', 'missing', 'unknown')),
  processing_status TEXT NOT NULL DEFAULT 'received'
    CHECK (processing_status IN ('received', 'processed', 'ignored', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 1,
  error_message TEXT,
  payload JSONB DEFAULT '{}'::jsonb,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_callback_events_dedupe
  ON callback_events (gateway, payload_hash);

CREATE INDEX IF NOT EXISTS idx_callback_events_reference ON callback_events(reference);
CREATE INDEX IF NOT EXISTS idx_callback_events_received ON callback_events(received_at DESC);

CREATE TABLE IF NOT EXISTS sms_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL DEFAULT 'moolre',
  recipient_masked TEXT NOT NULL,
  recipient_hash TEXT,
  message_type TEXT NOT NULL DEFAULT 'transactional',
  template_name TEXT,
  related_user_id UUID,
  related_order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  related_payment_id UUID REFERENCES payment_attempts(id) ON DELETE SET NULL,
  provider_message_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'failed', 'delivered', 'skipped')),
  attempts INTEGER NOT NULL DEFAULT 0,
  failure_reason TEXT,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sms_attempts_order ON sms_attempts(related_order_id);
CREATE INDEX IF NOT EXISTS idx_sms_attempts_created ON sms_attempts(created_at DESC);

-- Claim confirmation send once (reduces duplicate SMS/email races)
CREATE OR REPLACE FUNCTION claim_order_confirmation(p_order_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  meta JSONB;
  claimed BOOLEAN := FALSE;
BEGIN
  SELECT metadata INTO meta FROM orders WHERE id = p_order_id FOR UPDATE;
  IF meta IS NULL THEN
    meta := '{}'::jsonb;
  END IF;
  IF COALESCE((meta->>'confirmation_sent')::boolean, FALSE) THEN
    RETURN FALSE;
  END IF;
  UPDATE orders
  SET metadata = meta || jsonb_build_object(
    'confirmation_sent', TRUE,
    'confirmation_sent_at', NOW()
  ),
  updated_at = NOW()
  WHERE id = p_order_id;
  claimed := TRUE;
  RETURN claimed;
END;
$$;
