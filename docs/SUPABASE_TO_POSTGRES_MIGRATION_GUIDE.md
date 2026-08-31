# AbbyGlow Essentials — Plain Postgres Deploy Guide

Playbook for running AbbyGlow Essentials on plain Postgres (big VPS / fleet), with local disk uploads. The browser still uses `@supabase/supabase-js` as a client SDK; requests are routed to in-app shims that speak PostgREST/GoTrue/Storage protocol over `pg`. There is **no** hosted Supabase project required at runtime.

**Branch:** `staging/plain-postgres`  
**Target DB name:** `store_abbyglow`

---

## Prerequisites

- Postgres database provisioned: `store_abbyglow` on fleet-postgres
- Schema applied from `supabase/migrations/` (start with `20260209000000_complete_schema.sql`)
- File storage directory on VPS (e.g. `/data/abbyglow/storage`)
- Coolify (or equivalent) app with env vars from `.env.example`

---

## Environment Mapping

| Legacy / client var | Plain Postgres meaning | Notes |
|---------------------|------------------------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | **App origin** | Points at this Next.js app, not a Supabase cloud URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Any non-empty string | Used by ACL to recognize anon clients |
| `SUPABASE_SERVICE_ROLE_KEY` | Strong random string | Bypasses REST ACL for server jobs |
| `DATABASE_URL` | Postgres connection | `postgresql://app_user@host:5432/store_abbyglow` |
| `AUTH_JWT_SECRET` | JWT signing secret | Required in production (`lib/db/mode.ts`) |
| `STORAGE_ROOT` + `STORAGE_PUBLIC_URL` | Local disk storage | Via `lib/db/storage.ts` |
| `STORAGE_SIGNING_SECRET` | HMAC for private objects | |
| `NEXT_PUBLIC_USE_PLAIN_PG=true` | Enables plain-PG middleware path | |
| `NEXT_PUBLIC_APP_URL` | Public site URL | Callbacks, emails, storage public URLs |

See `.env.example` for the full template (no real secrets).

---

## Shim Architecture

### 1. REST (`/rest/v1/[table]`, `/rest/v1/rpc/[fn]`)

- **Implementation:** `lib/db/supabase-compat.ts` + route handlers under `app/rest/v1/`
- **Database:** `pg` Pool from `lib/db/pool.ts` when `DATABASE_URL` set
- **ACL:** `lib/db/rest-acl.ts`
- **Auth resolution:** `lib/db/rest-auth.ts`

**Important:** In-process `supabaseAdmin` bypasses REST ACL. ACL only protects HTTP shim endpoints.

### 2. Auth (`/auth/v1/*`)

- **Implementation:** `app/auth/v1/[...path]/route.ts` + `lib/db/auth.ts`
- **Passwords:** bcrypt
- **Tokens:** JWT signed with `AUTH_JWT_SECRET` via `jose`
- **Roles:** `app_metadata.role` = `admin` | `staff`

### 3. Storage (`/storage/v1/object/*`)

- **Implementation:** `lib/db/storage.ts` + routes under `app/storage/v1/`
- **Uploads:** POST requires staff/admin/service_role

### 4. Server admin client

```typescript
// lib/supabase-admin.ts
isPlainPostgres() ? createPgClient() : createSupabaseJsClient(url, serviceKey)
```

Use only in API routes and server actions — never in client components.

---

## Cutover Steps (new AbbyGlow deploy)

1. Provision `store_abbyglow` via fleet (`sudo fleet db provision store_abbyglow` or project equivalent).
2. Apply schema from `supabase/migrations/`.
3. Set env vars per `.env.example` (AbbyGlow domain, `DATABASE_URL`, storage path, Moolre, Resend).
4. Deploy `staging/plain-postgres`.
5. Create admin: `node scripts/create-admin-user.mjs`
6. Apply payment helper if needed: `node scripts/apply-mark-order-paid.mjs`
7. Verify `/api/health`, checkout, admin login, image upload, Moolre callback.

Do **not** restore another store’s customer/order data into `store_abbyglow` unless intentionally migrating that catalog.

---

## Verification

| Check | Expected |
|-------|----------|
| `GET /api/health` | `mode: plain_postgres`, `database: ok` |
| Anon `GET /rest/v1/orders` | 403 |
| Anon `GET /rest/v1/products` | 200 |
| Login at `/admin/login` | JWT cookie set, dashboard loads |
| Checkout | Order created via `/api/storefront/checkout` |
| Image upload in admin | 200 with staff session |
| Moolre callback | `mark_order_paid` idempotent |

---

## Contact defaults (app)

- Phones / WhatsApp: set in `lib/seo.ts` and `NEXT_PUBLIC_WHATSAPP_NUMBER` when available
- Location: Accra, Ghana

---

## Related database audit docs (2026-08-03)

- `DATABASE_AUDIT_AND_REPAIR_REPORT.md`
- `DATABASE_SCHEMA_REFERENCE.md`
- `MIGRATION_STATUS_REPORT.md`
- `SUPABASE_TO_POSTGRES_DATABASE_REPORT.md`
- `PAYMENT_DATABASE_AUDIT.md`
- `DATABASE_PERFORMANCE_REPORT.md`
- `DATABASE_RECOVERY_GUIDE.md`

Apply latest corrective SQL: `supabase/migrations/20260803120000_db_health_repair.sql`  
Smoke: `npm run db:schema-smoke` (requires `DATABASE_URL`)
