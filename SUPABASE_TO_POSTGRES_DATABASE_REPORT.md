# SUPABASE_TO_POSTGRES_DATABASE_REPORT — AbbyGlow Essentials

## Summary

Runtime data plane is **plain PostgreSQL**. Supabase cloud is not required. The browser still uses `@supabase/supabase-js` as an HTTP client against **this app’s** `/auth/v1`, `/rest/v1`, and `/storage/v1` shims.

## Feature matrix

| Supabase Feature | Previous Implementation | PostgreSQL Replacement | Status | Problem | Repair |
| ---------------- | ----------------------- | ---------------------- | ------ | ------- | ------ |
| Postgres DB | Hosted Supabase | fleet-postgres `store_abbyglow` | Done | — | — |
| PostgREST | Cloud REST | `app/rest/v1/*` + `supabase-compat` | Done | Aggregate `(count)` embeds + dotted related filters were incomplete | Fixed 2026-08-03 (count EXISTS, foreignTable order no-op) |
| GoTrue Auth | Supabase Auth | `lib/db/auth.ts` + `app/auth/v1` | Done | — | — |
| JWT | Supabase JWT | `AUTH_JWT_SECRET` (jose) | Done | — | — |
| RLS | PG policies | App ACL `lib/db/rest-acl.ts` (owner bypasses RLS) | Done | RLS still enabled in DB | Leave policies; ACL is authoritative for HTTP |
| Storage | Supabase Storage | Local disk `STORAGE_ROOT` + `/storage/v1` | Done | buckets table missing | Stubbed for migration compat |
| Realtime | Supabase Realtime | Not used | N/A | — | — |
| Edge functions | Supabase functions | Next.js route handlers | Done | — | — |
| `auth.uid()` | Built-in | Bootstrap SQL | Done | — | — |
| `auth.role()` | Built-in | Missing on staging | Fixed | Policy noise | Created function |
| Service role | Service key | `SUPABASE_SERVICE_ROLE_KEY` header check in REST auth | Done | Name retained for client compat | Documented |
| Generated types | supabase gen | Hand-maintained TS | Partial | — | Prefer smoke tests |
| RPC | `.rpc()` | `/rest/v1/rpc/[fn]` → SQL functions | Done | Staff ACL on sensitive RPCs | Verified |

## Remaining “supabase” references (intentional)

- Package `@supabase/supabase-js` (client SDK)
- Env names `NEXT_PUBLIC_SUPABASE_URL` / `ANON_KEY` / `SERVICE_ROLE_KEY` (point to app / ACL secrets)
- File names `lib/supabase.ts`, `lib/supabase-admin.ts`, `lib/db/supabase-compat.ts`
- Folder `supabase/migrations/` (SQL history only)

No runtime dependency on `*.supabase.co` for this staging deployment.

## RLS replacement

HTTP path: actor from JWT/anon/service key → `authorizeRestTable` / RPC ACL → parameterized SQL.  
Direct SQL as table owner `store_abbyglow` bypasses RLS (`FORCE ROW LEVEL SECURITY` is off).  
Do not expose DB credentials to the browser.

## Auth migration

Users live in `auth.users` with bcrypt hashes. Profiles in `public.profiles` with `user_role`. Admin via `profiles.role ∈ (admin, staff)`. Create admin: `npm run create-admin` with `DATABASE_URL`.

## Storage migration

Uploads written under `STORAGE_ROOT` (VPS `/data/abbyglow/storage`). Public URLs via app origin. `storage.buckets` is a stub for SQL re-runs only.
