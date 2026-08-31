# DATABASE_SCHEMA_REFERENCE — AbbyGlow Essentials

Live reference from `store_abbyglow` (PostgreSQL 16.14), 2026-08-03.

## Schemas

| Schema | Purpose |
| ------ | ------- |
| `public` | Application tables |
| `auth` | Local users (`auth.users`) + `auth.uid()` / `auth.role()` |
| `extensions` | `pgcrypto`, `uuid-ossp` |
| `storage` | Stub buckets only (runtime files on disk via `STORAGE_ROOT`) |

## Enums (public)

| Enum | Values |
| ---- | ------ |
| `user_role` | admin, staff, customer |
| `product_status` | active, draft, archived |
| `category_status` | active, inactive |
| `order_status` | pending, awaiting_payment, processing, shipped, delivered, cancelled, refunded |
| `payment_status` | pending, paid, failed, refunded, partially_refunded, partially_paid |
| `discount_type` | percentage, fixed_amount, free_shipping |
| `review_status` | pending, approved, rejected |
| `return_status` | pending, approved, rejected, processing, completed |
| `ticket_status` | open, in_progress, waiting_customer, resolved, closed |
| `ticket_priority` | low, medium, high, urgent |
| `blog_status` | draft, published, archived |
| `address_type` | shipping, billing, both |
| `gender_type` | male, female, other, prefer_not_to_say |

Payment attempt / callback / SMS statuses use **text + CHECK** (not PG enums) for gateway flexibility.

## Active tables

### auth.users
- **Purpose:** Credentials + identity for local GoTrue-compatible auth
- **PK:** `id` uuid  
- **Unique:** `email`  
- **Key columns:** `encrypted_password`, `raw_user_meta_data`, `raw_app_meta_data`, `email_confirmed_at`, `phone`, timestamps  
- **Related:** profiles (1:1 by id), sessions via JWT (no session table)

### profiles
- **Purpose:** App roles and customer profile  
- **PK:** `id` uuid (matches auth.users)  
- **Unique:** email  
- **Columns:** role (`user_role`), full_name, phone, avatar_url, preferences jsonb, timestamps  
- **Pages/APIs:** admin layout, middleware, `/auth`, customer dashboards

### products / product_images / product_variants / categories
- Catalog. Money as `numeric`. Status enums. Slug/SKU unique on products. Stock column is `quantity` (not `stock_quantity`).  
- Preorder flag lives in `products.metadata.is_preorder` (app-layer).  
- Indexes: slug, status, status+created_at, category_id, featured, tags GIN; FKs on images/variants.  
- **Pages:** `/`, `/shop`, `/product/[slug]`, admin products/inventory  
- **APIs:** `/api/storefront/products`, `/api/storefront/categories`

### order_payment_events
- Idempotent payment application ledger (`gateway`, `gateway_ref` unique). Used by `apply_order_payment`.

### orders / order_items / order_status_history
- Checkout + fulfillment. `order_number` unique. `payment_status` enum separate from fulfillment `status`. `metadata` jsonb (confirmation claim flags).  
- **APIs:** checkout, moolre pay/callback/verify, order lookup, cron reminders  
- **Pages:** checkout, pay, order-success, account history, admin orders

### payment_attempts
- Multi-attempt payment ledger (Moolre).  
- **Unique:** `internal_reference`; partial unique `(gateway, gateway_reference)`  
- **Checks:** status set; amounts ≥ 0  
- **Trigger:** blocks demotion from `successful` to failed/cancelled/expired/pending/processing  
- **Indexes:** order_id, order_number, status, created_at, gateway_ref

### callback_events
- Webhook dedupe + audit.  
- **Unique:** `(gateway, payload_hash)`; partial `(gateway, external_event_id)`  
- **Checks:** signature_status, processing_status  
- **API:** `/api/payment/moolre/callback`

### sms_attempts
- SMS send audit (masked recipient).  
- **Partial unique:** `(related_order_id, message_type)` for order_confirmation pending/sent  
- **FK:** related_order_id → orders SET NULL; related_payment_id → payment_attempts SET NULL

### customers / coupons / cart_items / wishlist_items / addresses
- CRM + commerce helpers. Coupons **staff-only** via REST ACL (not public read).

### reviews / review_images / banners / cms_content / pages / blog_posts
- Content & social proof.

### store_modules / store_settings / site_settings / navigation_*
- Feature flags & CMS settings.

### notifications / support_tickets / support_messages / return_* / audit_logs
- Support & ops.

### schema_migrations
- Plain-PG ledger of applied SQL migration IDs.

## Key functions

| Function | Role |
| -------- | ---- |
| `auth.uid()` / `auth.role()` | JWT claim helpers for legacy policies |
| `mark_order_paid(order_ref, moolre_ref)` | Idempotent paid transition |
| `claim_order_confirmation(order_id)` | Atomic notification claim |
| `reduce_stock_on_order` | Inventory |
| `upsert_customer_from_order` / `update_customer_stats` | CRM |
| `handle_new_user` | Profile bootstrap trigger target |
| `is_admin_or_staff` | Role helper |

## Money / time conventions

- Amounts: `numeric(12,2)` (GHS). App parses numeric as JS number via `pg` type parser.  
- Timestamps: `timestamptz`, UTC-normalized in pool parsers.  
- Do not trust frontend prices for paid totals — checkout recomputes from DB products.
