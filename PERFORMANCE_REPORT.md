# AbbyGlow Essentials — Performance Report

## Baseline (code audit)

| Area | Finding |
|------|---------|
| Pool | Shared singleton; previously no HMR guard / connection timeout |
| Client DB | Browser → REST shim only (no direct pg) |
| Realtime | None |
| Payment/SMS | `fetchWithTimeout` 15–20s |
| Build | Production build succeeds (~106 kB shared First Load JS) |

## Freezing / slowness causes addressed

| Cause | Fix |
|-------|-----|
| Dev hot-reload orphaning `pg` pools → “too many clients” | `globalThis.__abbyglowPgPool` |
| Hung DB connections | `connectionTimeoutMillis` default 10s |
| Runaway queries | `statement_timeout` default 30s |
| SMS hang in admin test | 15s timeout |
| Callback + verify double work | Deduped notifications via claim RPC |

## Slow query / index recommendations

Applied indexes (new migration):

- `payment_attempts(order_id|order_number|gateway_reference|status|created_at)`
- `callback_events(reference|received_at)` + unique `(gateway, payload_hash)`
- `sms_attempts(related_order_id|created_at)`

Existing schema already indexes common order/product lookups (see complete schema).

## Rendering / bundle

- Storefront uses client components for cart/shop (expected)  
- Admin product list is heavy — paginate when catalog grows  
- No artificial memoization pass (no measured win without metrics)

## Before / after (architecture)

| Metric | Before | After |
|--------|--------|-------|
| Pool HMR safety | Module-only singleton | `globalThis` guarded |
| Connection timeout | None | 10s |
| Statement timeout | None | 30s |
| Payment audit trail | Order metadata only | Dedicated tables |
| Notification race | Check-then-set metadata | Atomic claim function |

## Infrastructure recommendations

- Keep Postgres on same VPS / private network  
- `PG_POOL_MAX` ≤ available Postgres `max_connections` / app instances  
- Apply `20260803000000_payment_audit_tables.sql` before relying on audit helpers  
- CDN for public product images when traffic grows  

## Measurements still needed (manual)

- Lighthouse / TTFB with real `DATABASE_URL`  
- EXPLAIN ANALYZE on admin order list under load  
- Concurrent Moolre callback soak test
