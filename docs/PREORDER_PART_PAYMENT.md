# Full vs 50% checkout + Moolre / Hubtel

## Customer flow

1. Cart → Checkout (shipping → delivery → **payment**).
2. Choose **Full payment** or **50% now** (remainder when goods arrive).
3. Choose gateway: **Moolre** or **Hubtel** (only gateways with env credentials appear).
4. Order is created with `payment_plan`, `amount_due_now`, `balance_due`.
5. Customer is redirected to the gateway to pay `amount_due_now`.
6. Callback / verify calls `apply_order_payment`:
   - Full plan → `payment_status = paid`
   - 50% plan → `payment_status = partially_paid`, `balance_due` remaining
7. Balance can be paid later via `/pay/{orderId}` or recorded by admin on delivery.

## Order money fields

| Column | Meaning |
|--------|---------|
| `payment_plan` | `full` \| `deposit_50` |
| `amount_due_now` | Amount charged at checkout |
| `amount_paid` | Cumulative paid |
| `balance_due` | `total - amount_paid` |
| `payment_status` | includes `partially_paid` |

## Admin

- Confirmed tab includes `paid` and `partially_paid`.
- Order detail shows Paid / Balance, **Mark balance paid** (cash / MoMo / bank), and customer pay link.

## Env

```
# Moolre
MOOLRE_API_USER=
MOOLRE_API_PUBKEY=
MOOLRE_ACCOUNT_NUMBER=
MOOLRE_MERCHANT_EMAIL=
MOOLRE_CALLBACK_SECRET=

# Hubtel
HUBTEL_CLIENT_ID=
HUBTEL_CLIENT_SECRET=
HUBTEL_MERCHANT_ACCOUNT_NUMBER=
HUBTEL_CALLBACK_SECRET=
# optional overrides
# HUBTEL_CHECKOUT_URL=https://payproxyapi.hubtel.com/items/initiate
# HUBTEL_STATUS_URL=
```

## Migration

1. `supabase/migrations/20260803140000_part_payment_plans.sql` — enum `partially_paid`, order money columns, `order_payment_events`
2. `supabase/migrations/20260803140100_apply_order_payment.sql` — RPC `apply_order_payment` + `mark_order_paid` wrapper

Apply locally / staging:

```bash
node scripts/apply-part-payment-migration.mjs
```

(Enum must commit in a separate statement before RPC uses `partially_paid`.)

## API

- `GET /api/payment/gateways`
- `POST /api/payment/initiate` `{ orderId, gateway, purpose?: 'checkout'|'balance' }`
- `POST /api/payment/moolre|hubtel` (+ `/callback`, `/verify`)
- `POST /api/admin/orders/settle-balance` (staff JWT)
