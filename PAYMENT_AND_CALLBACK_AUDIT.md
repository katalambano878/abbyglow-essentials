# AbbyGlow Essentials — Payment & Callback Audit

## Gateways

| Gateway | Status |
|---------|--------|
| **Moolre** | Implemented (initiate, verify, callback) |
| **Hubtel** | Not implemented |
| **Paystack** | Not implemented |

---

## Moolre flow

```
Customer → checkout (server prices) → pending order
       → /pay/[orderId] → POST /api/payment/moolre (DB amount)
       → Moolre hosted page
       → redirect /order-success (NOT trusted alone)
       → POST /api/payment/moolre/callback (secret + amount)
       → mark_order_paid (FOR UPDATE, idempotent)
       → claim_order_confirmation → SMS/email once
       → optional POST /api/payment/moolre/verify (poll status)
```

### Callback route

- URL: `/api/payment/moolre/callback`  
- Method: POST (GET returns readiness JSON)  
- Middleware: does **not** block (API only gets no-store)  
- Auth: shared secret `MOOLRE_CALLBACK_SECRET` (required in production)  
- Amount: compared to `orders.total` (±0.01)  
- Idempotency: `mark_order_paid` + `callback_events` payload hash  
- Duplicate protection: unique `(gateway, payload_hash)`  
- Audit: `payment_attempts`, `callback_events`

### Status mapping (internal)

`pending | processing | successful | failed | cancelled | expired | reversed | refunded | partially_refunded`  
via `lib/payments/status.ts` → order field uses `paid`/`failed`/`pending`.

### Amount / currency

- Initiate: amount from DB only, currency GHS  
- Callback/verify: amount must match order total  
- Frontend amount ignored

### Test results (code-level)

| Case | Status |
|------|--------|
| Valid callback path | Implemented |
| Invalid secret | 403 |
| Missing secret (prod) | 503 |
| Duplicate callback | Ignored via event dedupe + already-paid short-circuit |
| Amount mismatch | 400 reject |
| Unknown reference | 404 |
| Delayed fail after paid | Won't overwrite paid (`neq paid` / early return) |
| Live gateway E2E | **Requires credentials** — manual |

---

## Hubtel

Not in codebase. No initiation, callback, or verify routes. Do not register Hubtel callbacks until an adapter is built.

## Paystack

Not in codebase. Secret keys must never be added to `NEXT_PUBLIC_*`. Adapter not present.

---

## Reconciliation

- Cron: `/api/cron/payment-reminders` for unpaid reminders  
- Admin can use verify endpoint + order detail  
- Formal reconcile UI not built; audit tables enable investigation  

## Checkout default

Storefront checkout defaults to **WhatsApp** order handoff; Moolre remains available on `/pay/[orderId]` and POS.
