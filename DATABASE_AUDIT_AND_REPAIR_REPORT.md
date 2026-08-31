# DATABASE_AUDIT_AND_REPAIR_REPORT — AbbyGlow Essentials

**Date:** 2026-08-03 (second full pass)  
**Target DB (confirmed):** `store_abbyglow` @ private fleet-postgres (`10.0.1.7`) via Coolify app `abbyglow-staging`  
**Host role:** `store_abbyglow` (non-superuser app role)  
**PostgreSQL:** 16.14 (Debian)  
**App mode:** plain Postgres (`NEXT_PUBLIC_USE_PLAIN_PG` / `DATABASE_URL`)

## 1. Executive summary

Admin **Products** showed **0** even though the database had **10 active products**. Root cause was not missing data: the admin list query used PostgREST aggregate embed `product_variants(count)`, which the plain-Postgres compatibility layer treated as a real column and failed with `column "count" does not exist`. The UI swallowed the error and rendered an empty catalog.

This pass repaired the compat layer (aggregate `count` embeds, related-table filters, foreignTable order no-op), fixed shop/admin query patterns that hard-broke under plain PG, ensured `order_payment_events` + product indexes + migration ledger entries, and re-verified health/REST.

## 2. Architecture found

| Layer | Implementation |
| ----- | -------------- |
| ORM | None |
| Driver | `pg` Pool (`lib/db/pool.ts`, singleton on `globalThis`) |
| Browser client | `@supabase/supabase-js` → **app origin** `/rest/v1`, `/auth/v1`, `/storage/v1` |
| Server compat | `lib/db/supabase-compat.ts` |
| Auth | bcrypt + JWT against `auth.users` (`lib/db/auth.ts`) |
| Authorization | `lib/db/rest-acl.ts` (RLS present on 30 tables but app role is table owner; ACL is the HTTP gate) |
| Migrations | SQL under `supabase/migrations/` + `schema_migrations(id, notes, applied_at)` |
| Storage | Local disk (`STORAGE_ROOT`), not Supabase Storage |

## 3. Baseline (this pass)

| Check | Result |
| ----- | ------ |
| DB name / role | `store_abbyglow` / `store_abbyglow` |
| Public+auth+storage tables | 37 |
| Products | **10** (all `active`) |
| Categories | 6 |
| Product images | 10 |
| Product variants | 0 |
| Orders / payments / SMS | 0 |
| Admin users | 1 (`admin@example.com`) |
| REST `products?select=id,name` | OK |
| REST admin embed with `(count)` | **Failed before repair** |
| `/api/health` | healthy; Hubtel missing; Paystack not implemented |
| `order_payment_events` | Present |
| Helpers | `auth.uid`, `auth.role`, `mark_order_paid`, `claim_order_confirmation`, `apply_order_payment` |

## 4. Schema-drift / defects repaired

| Object | Problem | Repair |
| ------ | ------- | ------ |
| Admin products list | `product_variants(count)` → SQL error → empty UI | Compat aggregate count + clearer admin error |
| Shop category filter | `categories.slug` / `!inner` unsafe under compat | Filter via `category_id`; soft embed; status=active |
| ProductSalesStats | `orders.payment_status` dotted filters | Two-step: paid order IDs → order_items |
| Analytics embeds | `products!inner` unnecessary | Use `products(...)` |
| Compat `foreignTable` order | Ordered parent by `position` | No-op when `foreignTable` set |
| Compat related filters | Dotted columns threw unsafe identifier | EXISTS subquery via FK map |
| Indexes | Missing some product/FK helpers | Added in `20260803230000_...` |
| Migration ledger | Part-payment entries missing | Inserted into `schema_migrations` |

## 5. Table classification (public)

- **Healthy:** products, categories, product_images, product_variants, profiles, orders, order_items, customers, coupons, banners, pages, reviews*, carts*, wishlists*, navigation*, cms*, site_settings, store_*, addresses, notifications, support*, returns*, blog_posts, audit_logs  
- **Repaired / confirmed:** payment_attempts, callback_events, sms_attempts, order_payment_events, schema_migrations  
- **Obsolete:** none deleted  
- **Manual review:** RLS still enabled on ~30 tables (legacy Supabase policies); runtime relies on REST ACL + owner bypass. Consider disabling RLS later after ACL soak.

## 6. Data integrity

| Check | Result |
| ----- | ------ |
| Profiles missing auth | 0 |
| Auth missing profile | 0 |
| Orphan order_items → products | 0 |
| Orphan payments → orders | 0 |
| Duplicate product slug/sku | 0 |
| Bad product category FK | 0 |
| Duplicate successful payments | N/A (0 attempts) |

## 7. Payment / SMS / auth

- **Moolre:** configured in health; tables ready (`payment_attempts`, `callback_events`, amount CHECKs, success-protect trigger from earlier repair).  
- **Hubtel:** env missing; code present.  
- **Paystack:** not implemented.  
- **SMS:** `sms_attempts` present; Moolre SMS env configured.  
- **Auth:** local JWT; admin user verified via `/auth/v1/token`.

## 8. Performance

Added/confirmed indexes: `idx_products_status_created`, `idx_products_category_id`, `idx_product_images_product_id`, `idx_product_variants_product_id`, plus existing slug/status/featured indexes. No slow-query evidence on empty order tables. Pool uses statement timeout.

## 9. Security notes (no secrets)

- App DB role is least-privilege store role (not postgres superuser).  
- REST ACL replaces RLS for HTTP.  
- Payment success not trusted from browser redirects alone (callback/verify + RPC).  
- Do not commit `.env.dburl` / Coolify tokens.

## 10. Final readiness

**Database fully ready for staging testing** for catalog/admin/auth/checkout schema.  
**Ready after listed manual actions** for live Hubtel (keys) and end-to-end paid-order smoke with real Moolre.

### Manual actions

1. Refresh Admin → Products (should show 10).  
2. Toggle Available / Pre-order on products as needed.  
3. Configure Hubtel keys if that gateway is required.  
4. Run a test checkout + Moolre callback in staging.
