# PAYMENT_DATABASE_AUDIT — AbbyGlow Essentials

## Gateways

| Gateway | Code | DB support | Staging credentials |
| ------- | ---- | ---------- | ------------------- |
| **Moolre** | Implemented (`/api/payment/moolre*`) | Full audit tables | Configured (health OK) |
| **Hubtel** | Implemented (`/api/payment/hubtel*`) | Shared audit tables | **Missing** keys in Coolify |
| **Paystack** | Not implemented | N/A | N/A |

Checkout often routes to WhatsApp; Moolre is used from `/pay/[orderId]`.

---

## Shared tables

### payment_attempts
- Unique `internal_reference`
- Partial unique `(gateway, gateway_reference)` when ref present
- Amounts `numeric(12,2)`, currency default `GHS`, non-negative checks
- Status CHECK includes pending→successful/failed/…  
- Trigger + app logic: **successful cannot be demoted** by delayed failure
- Written by `lib/payments/audit.ts` on initiate/callback/verify

### callback_events
- Dedupe: unique `(gateway, payload_hash)` and partial `(gateway, external_event_id)`
- Signature status: valid/invalid/missing/unknown
- Processing: received/processed/ignored/failed
- Callback route records sanitized payload subset (not full secrets)

### orders
- Trusted `total` from server checkout
- `payment_status` enum; paid via `mark_order_paid` RPC (idempotent)
- Confirmation SMS/email claimed via `claim_order_confirmation`

### sms_attempts
- Masked recipient; order_confirmation dedupe index

---

## Moolre

| Concern | Implementation |
| ------- | -------------- |
| Tables | payment_attempts, callback_events, orders, sms_attempts |
| References | internal = order_number / `-R#` attempt; gateway = transactionid |
| Amount validation | Callback compares provider amount to `orders.total` (±0.01); mismatch rejects + marks failed |
| Currency | GHS default on attempts |
| Status mapping | `lib/payments/status.ts` → internal statuses |
| Callback | Secret required in production; rate limited; dedupe; RPC mark paid; claim notifications |
| Duplicate protection | payload hash unique + already-paid short circuit + confirmation claim |
| Verification | `/api/payment/moolre/verify` + callback path; redirect alone must not be sole trust (callback/verify) |
| Test results | Live Moolre not callable (env missing). Schema constraints verified. Unit path: smoke unique insert rolled back. |

---

## Hubtel

Not present in codebase. No tables reserved. Do not configure Hubtel callbacks against this app until implemented.

---

## Paystack

Not present in codebase. No amount kobo conversion layer. Same as Hubtel.

---

## Reconciliation recommendations

1. Query `payment_attempts` where status=successful but order.payment_status≠paid  
2. Query paid orders without successful payment_attempts (legacy WhatsApp/manual)  
3. Unprocessed `callback_events` older than N minutes  

Staging currently has **0** payment rows (clean slate).
