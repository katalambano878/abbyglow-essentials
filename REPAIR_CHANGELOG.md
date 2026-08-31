# AbbyGlow Essentials — Repair Changelog

## Files changed (this audit pass)

### Connection / env
- `lib/db/pool.ts` — globalThis pool, connection/idle/statement timeouts, SSL opt-in strict
- `lib/env.ts` — env check helpers (no secret values)
- `app/api/health/route.ts` — env status + hubtel/paystack not_implemented
- `.env.example` — pool timeout vars

### Authorization
- `lib/db/rest-acl.ts` — coupons no longer public read
- `app/rest/v1/[table]/route.ts` — stop guest `user_id` spoofing; strip totals/payment_status on insert

### Payments / SMS
- `lib/payments/status.ts` — internal status model + Moolre mapper
- `lib/payments/audit.ts` — payment_attempts / callback_events / SMS audit helpers + claim confirmation
- `app/api/payment/moolre/route.ts` — record payment attempt
- `app/api/payment/moolre/callback/route.ts` — secret audit, dedupe events, claim notifications
- `app/api/storefront/orders/lookup/route.ts` — mask PII on pay mode
- `app/admin/test-sms/actions.ts` — fetchWithTimeout
- `supabase/migrations/20260803000000_payment_audit_tables.sql` — new tables + claim function

### Docs
- `FULL_SYSTEM_AUDIT.md`
- `SUPABASE_TO_POSTGRES_MIGRATION_REPORT.md`
- `PAYMENT_AND_CALLBACK_AUDIT.md`
- `PERFORMANCE_REPORT.md`
- `REPAIR_CHANGELOG.md` (this file)
- Updated `docs/SUPABASE_TO_POSTGRES_MIGRATION_GUIDE.md` (earlier AbbyGlow pass)

## Bugs fixed

1. Guest order INSERT could set another user’s `user_id`
2. Anon clients could list coupon codes
3. Pay lookup returned full email/phone/address
4. Dev pool leak risk under hot reload
5. Missing DB connection/statement timeouts
6. Confirmation SMS/email race (callback vs verify)
7. Admin test SMS could hang indefinitely
8. No durable payment/callback audit trail

## Migrations

| File | Safe for production? |
|------|----------------------|
| `20260803000000_payment_audit_tables.sql` | **Yes** — additive tables/indexes/function only |

Apply with `npm run db:migrate` or `node scripts/run-migration.mjs` when `DATABASE_URL` is set.

## Packages

- None added/removed in this pass

## Manual actions required

1. Provision `store_abbyglow` and set `DATABASE_URL`
2. Apply all migrations including payment audit
3. Set Moolre + Resend + JWT + storage secrets
4. Register Moolre callback URL to app origin
5. Create admin via `node scripts/create-admin-user.mjs`
6. Rename GitHub remote from anaelcosmetics when ready
7. Hubtel/Paystack: not available until explicitly implemented
