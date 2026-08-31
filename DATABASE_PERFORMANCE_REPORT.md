# DATABASE_PERFORMANCE_REPORT — AbbyGlow Essentials

**Environment:** staging `store_abbyglow`, PostgreSQL 16.14, catalog seeded (10 products), empty orders/payments.

## Connection pool

| Setting | Default | Source |
| ------- | ------- | ------ |
| Max clients | 10 | `PG_POOL_MAX` |
| Idle timeout | 30s | `PG_IDLE_TIMEOUT_MS` |
| Connect timeout | 10s | `PG_CONNECTION_TIMEOUT_MS` |
| Statement timeout | 30s | `PG_STATEMENT_TIMEOUT_MS` per connect |
| Singleton | `globalThis.__abbyglowPgPool` | Survives Next hot reload |

**Improvement (already in tree):** one shared pool; no per-request `new Pool()`.

## Indexes added

**Payment pass:**
- `idx_payment_attempts_gateway_ref_uq` (unique partial)
- `idx_callback_events_external_uq` (unique partial)
- `idx_callback_events_processing`
- `idx_sms_attempts_order_confirm_uq` (unique partial)

**Catalog audit pass (20260803230000):**
- `idx_products_status_created`
- `idx_products_category_id`
- `idx_product_images_product_id`
- `idx_product_variants_product_id`

Existing coverage already strong for orders (user, status, order_number, reminder partial), products (slug/status/category/tags GIN), profiles email/role.

## Indexes removed

None (no proven unused indexes on empty staging).

## Query notes

| Area | Observation | Action |
| ---- | ----------- | ------ |
| Storefront products | Indexed status/slug; empty set returns fast | Keep pagination in admin lists |
| Admin dashboards | Multiple parallel `.from()` calls | Acceptable at low volume; watch N+1 if reviews/images expand |
| Callback path | Point lookups by order_number + unique refs | Indexed |
| REST embed | order_items blocked for direct anon list | Prevents wide scans |
| Freezing risk | Was pool duplication; mitigated by singleton | Monitor `too many clients` |

## Before / after

| Metric | Before repair | After |
| ------ | ------------- | ----- |
| Staging `/api/health` DB ping | ok | ok |
| Missing auth.role | yes | no |
| Payment demotion race | app-only | app + trigger |
| Home/shop/products HTTP | 200 | 200 |
| Build | pass | pass |

No slow-query traces on empty tables; re-run `EXPLAIN ANALYZE` after catalog load.

## Infrastructure recommendations

1. Keep Postgres on same VPS as Coolify app (current).  
2. Do not expose Postgres publicly.  
3. After seed, add monitoring for pool wait + p95 checkout/callback.  
4. Cap admin unbounded `.select('*')` if tables grow >10k rows.
