# AbbyGlow Essentials — Supabase → Postgres Migration Report

## Migration matrix

| Previous Supabase feature | Current replacement | Status | Remaining | Repair / notes |
|---------------------------|---------------------|--------|-----------|----------------|
| Hosted Postgres | `DATABASE_URL` → `store_abbyglow` via `pg` Pool | ✅ | Provision DB | Pool hardened |
| PostgREST `.from()` | `/rest/v1/*` + `supabase-compat` | ✅ | — | ACL replaces RLS |
| Supabase Auth | `/auth/v1/*` + `lib/db/auth.ts` (bcrypt/JWT) | ✅ | Create admin user | Stateless refresh |
| RLS | `lib/db/rest-acl.ts` + REST auth | ✅ | Continuous review | user_id spoof fixed; coupons locked |
| Storage | Local disk `STORAGE_ROOT` + `/storage/v1` | ✅ | Set path on VPS | HMAC signed URLs |
| Realtime | Not used | ⬜ N/A | — | No UI waiting on channels |
| RPC | PG functions + `/rest/v1/rpc` | ✅ | Apply new migration | `mark_order_paid`, `claim_order_confirmation` |
| Edge Functions | Next.js API routes (nodejs) | ✅ | — | Payments/SMS/cron |
| Scheduled jobs | `/api/cron/payment-reminders` + `CRON_SECRET` | ✅ | Wire cron | — |
| Auth email templates | App-owned Resend templates | ✅ | Configure `EMAIL_FROM` | No Supabase redirects |
| `@supabase/supabase-js` client | Kept as **protocol client** to app origin | ✅ intentional | Do not point at supabase.co | Dual-mode flag |

## Remaining Supabase references

- Package `@supabase/supabase-js` — intentional shim client  
- Env names `NEXT_PUBLIC_SUPABASE_URL` / `ANON_KEY` — must equal **app origin** + dummy anon string  
- Folder `supabase/migrations/` — schema source of truth (not hosted Supabase)

## Schema differences / additions

- Additive: `payment_attempts`, `callback_events`, `sms_attempts`  
- Function: `claim_order_confirmation(uuid)`  
- Existing: `orders.payment_status`, `mark_order_paid` idempotent

## Auth / storage / RLS

- Auth IDs remain UUID-compatible with `profiles` / `auth.users` tables in schema  
- Storage paths: `{STORAGE_ROOT}/{bucket}/{path}`  
- RLS policies in SQL are **not** the enforcement plane for HTTP; REST ACL is

## Data integrity

- Do not restore Anael/other-store data into `store_abbyglow` unless intentional  
- Checkout prices always from DB  
- Order payment updates via transactional RPC
