import { createHash } from 'crypto';
import { query } from '@/lib/db/pool';
import { isPlainPostgres } from '@/lib/db/mode';
import type { InternalPaymentStatus } from './status';

function hashPayload(payload: unknown): string {
  return createHash('sha256').update(JSON.stringify(payload ?? {})).digest('hex');
}

export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return '***';
  return `${digits.slice(0, 3)}****${digits.slice(-3)}`;
}

/** Record a payment initiation (best-effort; never throws to callers). */
export async function recordPaymentAttempt(input: {
  orderId: string;
  orderNumber: string;
  userId?: string | null;
  gateway?: string;
  internalReference: string;
  amountExpected: number;
  currency?: string;
  purpose?: 'full' | 'deposit' | 'balance' | 'admin_settle';
  initiationPayload?: Record<string, unknown>;
}): Promise<void> {
  if (!isPlainPostgres()) return;
  try {
    await query(
      `INSERT INTO payment_attempts (
        order_id, order_number, user_id, gateway, internal_reference,
        amount_expected, currency, status, initiation_payload, purpose
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,'pending',$8,$9)
      ON CONFLICT (internal_reference) DO UPDATE SET
        updated_at = NOW(),
        retry_count = payment_attempts.retry_count + 1,
        purpose = EXCLUDED.purpose,
        amount_expected = EXCLUDED.amount_expected`,
      [
        input.orderId,
        input.orderNumber,
        input.userId ?? null,
        input.gateway || 'moolre',
        input.internalReference,
        input.amountExpected,
        input.currency || 'GHS',
        JSON.stringify(input.initiationPayload || {}),
        input.purpose || 'full',
      ]
    );
  } catch (err: any) {
    console.error('[payment-audit] recordPaymentAttempt failed:', err?.message);
  }
}

/** Record callback event; returns false if duplicate (already processed). */
export async function recordCallbackEvent(input: {
  gateway?: string;
  eventType?: string;
  externalEventId?: string | null;
  reference?: string | null;
  payload: unknown;
  signatureStatus: 'valid' | 'invalid' | 'missing' | 'unknown';
}): Promise<{ isDuplicate: boolean; eventId?: string }> {
  if (!isPlainPostgres()) return { isDuplicate: false };
  const payloadHash = hashPayload(input.payload);
  try {
    const { rows } = await query<{ id: string }>(
      `INSERT INTO callback_events (
        gateway, event_type, external_event_id, reference, payload_hash,
        signature_status, processing_status, payload
      ) VALUES ($1,$2,$3,$4,$5,$6,'received',$7)
      ON CONFLICT (gateway, payload_hash) DO NOTHING
      RETURNING id`,
      [
        input.gateway || 'moolre',
        input.eventType || 'payment_callback',
        input.externalEventId || null,
        input.reference || null,
        payloadHash,
        input.signatureStatus,
        JSON.stringify(input.payload ?? {}),
      ]
    );
    if (!rows[0]) {
      return { isDuplicate: true };
    }
    return { isDuplicate: false, eventId: rows[0].id };
  } catch (err: any) {
    console.error('[payment-audit] recordCallbackEvent failed:', err?.message);
    return { isDuplicate: false };
  }
}

export async function markCallbackProcessed(
  eventId: string | undefined,
  status: 'processed' | 'ignored' | 'failed',
  errorMessage?: string
): Promise<void> {
  if (!eventId || !isPlainPostgres()) return;
  try {
    await query(
      `UPDATE callback_events
       SET processing_status = $2, error_message = $3, processed_at = NOW()
       WHERE id = $1`,
      [eventId, status, errorMessage || null]
    );
  } catch (err: any) {
    console.error('[payment-audit] markCallbackProcessed failed:', err?.message);
  }
}

export async function updatePaymentAttemptStatus(input: {
  internalReference?: string | null;
  gatewayReference?: string | null;
  status: InternalPaymentStatus;
  amountPaid?: number | null;
  failureReason?: string | null;
}): Promise<void> {
  if (!isPlainPostgres()) return;
  try {
    if (input.internalReference) {
      // Never demote a successful attempt via application UPDATE either
      // (DB trigger is the second line of defense).
      await query(
        `UPDATE payment_attempts SET
          status = CASE
            WHEN status = 'successful' AND $2::text <> 'successful' THEN status
            ELSE $2
          END,
          gateway_reference = COALESCE($3, gateway_reference),
          amount_paid = COALESCE($4, amount_paid),
          failure_reason = CASE
            WHEN status = 'successful' AND $2::text <> 'successful' THEN failure_reason
            ELSE COALESCE($5, failure_reason)
          END,
          callback_received_at = NOW(),
          verified_at = CASE
            WHEN $2 = 'successful' OR status = 'successful' THEN COALESCE(verified_at, NOW())
            ELSE verified_at
          END,
          verification_status = CASE
            WHEN $2 = 'successful' OR status = 'successful' THEN 'verified'
            ELSE verification_status
          END,
          updated_at = NOW()
         WHERE internal_reference = $1 OR order_number = regexp_replace($1, '-R\\d+$', '')`,
        [
          input.internalReference,
          input.status,
          input.gatewayReference || null,
          input.amountPaid ?? null,
          input.failureReason || null,
        ]
      );
    }
  } catch (err: any) {
    console.error('[payment-audit] updatePaymentAttemptStatus failed:', err?.message);
  }
}

/** Atomically claim confirmation send; returns true if this caller should send. */
export async function claimOrderConfirmation(orderId: string): Promise<boolean> {
  if (!isPlainPostgres()) {
    return true; // fallback: let caller use metadata check
  }
  try {
    const { rows } = await query<{ claim_order_confirmation: boolean }>(
      `SELECT claim_order_confirmation($1::uuid) AS claim_order_confirmation`,
      [orderId]
    );
    return Boolean(rows[0]?.claim_order_confirmation);
  } catch (err: any) {
    // Migration may not be applied yet — allow send (legacy metadata race risk).
    console.error('[payment-audit] claimOrderConfirmation failed:', err?.message);
    return true;
  }
}

export async function recordSmsAttempt(input: {
  recipient: string;
  messageType: string;
  relatedOrderId?: string | null;
  status: 'sent' | 'failed' | 'skipped';
  failureReason?: string;
}): Promise<void> {
  if (!isPlainPostgres()) return;
  try {
    await query(
      `INSERT INTO sms_attempts (
        recipient_masked, message_type, related_order_id, status, attempts, failure_reason, sent_at
      ) VALUES ($1,$2,$3,$4,1,$5, CASE WHEN $4 = 'sent' THEN NOW() ELSE NULL END)`,
      [
        maskPhone(input.recipient),
        input.messageType,
        input.relatedOrderId || null,
        input.status,
        input.failureReason || null,
      ]
    );
  } catch (err: any) {
    console.error('[payment-audit] recordSmsAttempt failed:', err?.message);
  }
}
