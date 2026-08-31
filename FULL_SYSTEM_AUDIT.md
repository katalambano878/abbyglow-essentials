# AbbyGlow Essentials — Full System Audit

**Branch:** `staging/plain-postgres`  
**Date:** 2026-08-03  
**Mode:** Plain Postgres (no hosted Supabase runtime)

## Architecture summary

| Layer | Implementation |
|-------|----------------|
| App | Next.js 15, React 19, Node.js runtime for DB routes |
| Data | `pg` Pool → `lib/db/supabase-compat.ts` + `/rest/v1`, `/auth/v1`, `/storage/v1` |
| Auth | Local JWT (bcrypt + jose), cookies; middleware role check |
| ACL | `lib/db/rest-acl.ts` (replaces Supabase RLS) |
| Storage | Local disk (`STORAGE_ROOT`) |
| Payments | **Moolre only** (Hubtel/Paystack not implemented) |
| SMS/Email | Moolre SMS + Resend |
| Realtime | Not used |

## Route inventory

### Store (34)
`/`, `/about`, `/account`, `/account/privacy`, `/account/verify-email`, `/account/verify-phone`, `/auth/*`, `/blog`, `/blog/[id]`, `/cart`, `/categories`, `/checkout`, `/contact`, `/faqs`, `/help`, `/help/article/[id]`, `/maintenance`, `/offline`, `/order-success`, `/order-tracking`, `/pay/[orderId]`, `/privacy`, `/product/[slug]`, `/pwa-settings`, `/returns`, `/returns/confirmation`, `/shipping`, `/shop`, `/support/ticket`, `/support/tickets`, `/terms`, `/wishlist`

### Admin (20)
`/admin`, `/admin/analytics`, `/admin/blog`, `/admin/categories`, `/admin/coupons`, `/admin/customer-insights`, `/admin/customers`, `/admin/customers/[id]`, `/admin/inventory`, `/admin/login`, `/admin/modules`, `/admin/notifications`, `/admin/orders`, `/admin/orders/[id]`, `/admin/pos`, `/admin/products`, `/admin/products/new`, `/admin/products/[id]`, `/admin/reviews`, `/admin/test-sms`

### API (11) + shims
Health, notifications, recaptcha, cron reminders, storefront products/categories/checkout/lookup, Moolre payment/callback/verify, plus `/auth/v1`, `/rest/v1`, `/storage/v1`.

## Database architecture

- Singleton pool with `globalThis` HMR guard
- Timeouts: connection 10s, idle 30s, statement 30s (env-overridable)
- Additive migration: `payment_attempts`, `callback_events`, `sms_attempts`, `claim_order_confirmation()`

## Authentication architecture

- Browser supabase-js → app `/auth/v1`
- Access JWT 7d / refresh 30d (stateless; logout = client cookie clear)
- Admin: middleware + server `verifyAdminToken`

## Payment architecture

1. Checkout (server-priced) → pending order  
2. Optional `/pay/[orderId]` → Moolre initiate (DB amount)  
3. Callback secret check → amount match → `mark_order_paid` (FOR UPDATE, idempotent)  
4. Atomic `claim_order_confirmation` → SMS/email once  
5. Audit rows in `payment_attempts` / `callback_events`

Default checkout path is **WhatsApp**; Moolre is the card/MoMo gateway path.

## SMS architecture

- `lib/notifications.ts` → Moolre VAS API with 15s timeout  
- Confirmation gated by `claim_order_confirmation`  
- Admin test SMS requires admin token + timeout

## Performance findings

| Issue | Status |
|-------|--------|
| HMR pool leak risk | **Fixed** (`globalThis` singleton) |
| Missing connection/statement timeouts | **Fixed** |
| Client → direct `pg` | None (OK) |
| Large admin product pages | Known; paginate when catalog grows |
| No realtime | N/A |

## Security findings & fixes

| Finding | Fix |
|---------|-----|
| Guest could spoof `orders.user_id` | Forced to session user or null |
| Coupons enumerable by anon | Removed from public GET |
| Pay lookup leaked email/phone | Masked PII |
| Callback/SMS races | Audit tables + claim RPC |
| SSL `rejectUnauthorized:false` | Documented; optional strict via `PGSSL_REJECT_UNAUTHORIZED=true` |

## Remaining risks

- Hubtel/Paystack not in codebase  
- Stateless refresh JWT (no server revoke list)  
- Role baked into JWT until expiry  
- Live gateway/SMS tests require credentials + `store_abbyglow`  
- Hero images are generic stock (not brand photography)

## Broken features discovered

- None that block build; DB-backed flows need `DATABASE_URL` + migration apply

## Fixes applied

See `REPAIR_CHANGELOG.md`.
