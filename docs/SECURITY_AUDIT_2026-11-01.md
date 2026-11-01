# Security & bug audit — 1 November 2026

Full pass over every page, API route and button of the AbbyGlow storefront and admin.
This file records what was wrong, what changed, and what still needs the owner.

## Needs the owner (cannot be fixed from code)

1. **Rotate these credentials now.** They were committed in `.env.example` and are in the
   git history on GitHub: Moolre API public key + account number, Moolre callback secret,
   Moolre SMS key, Resend API key. Generate new ones in each provider, update the Coolify
   env for `abbyglow-app`, and redeploy. The template now holds placeholders only.
2. Set in Coolify: `NEXT_PUBLIC_CONTACT_EMAIL` (public contact address — `ADMIN_EMAIL` is no
   longer rendered into page markup), optionally `RECAPTCHA_SECRET_KEY` +
   `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` (sign-in/sign-up/reset are then verified server-side),
   `NEXT_PUBLIC_DELIVERY_FEE` / `NEXT_PUBLIC_FREE_DELIVERY_THRESHOLD` if delivery is charged.
3. Apply the new SQL migrations to the production database (`supabase/migrations/2026110100*`):
   `apply_order_payment()` had an ambiguous column reference that made every gateway
   callback / verify fail with "Database update failed"; and a `newsletter_subscribers` table.
4. A copy of the old template appeared as `.env.local` on the dev machine during the audit
   (gitignored). Delete it or replace it with real local values.

## Security fixes (server)

| Area | Problem | Fix |
|---|---|---|
| REST shim ACL | Anyone could insert `orders`, `order_items` (any price, any order), `reviews` (approved + verified + any user), set `refund_amount`/`status` on returns and tickets | Orders/items only via server checkout and admin; reviews need login and are forced to `pending` with server-computed `verified_purchase`; protected columns stripped per table; ownership columns pinned to the caller (`lib/db/rest-acl.ts`) |
| REST embeds | `products?select=*,order_items(*,orders(*))` walked from a public table into every order | Embed allow-list for non-staff (`authorizeEmbeds`) |
| REST misc | No write rate limit, unbounded page size, public RPC `upsert_customer_from_order`, `upsert` silently did a plain insert | 30 writes/min/IP, 500-row cap for non-staff, RPC now staff-only, staff-only real upsert |
| Staff role | Role came only from a 7-day JWT; demoted staff kept access | Role re-checked against `profiles` (60 s cache); access tokens now 24 h |
| Auth shim | No rate limit on login/signup, 6-char passwords, password reset was a no-op, logout returned 500 (204 + JSON body), signup metadata could carry `role`, welcome email posted from the client (always 401) | Per-IP and per-account throttles, 8-char minimum, real hashed single-use reset tokens (1 h) + `/auth/reset-password`, 204 fixed, metadata allow-list, welcome email sent server-side, optional server-verified reCAPTCHA |
| Storage | Any bucket readable, bucket name unvalidated, no upload type/size limit | Public-bucket list, bucket/path validation, images only, 10 MB cap, `nosniff` |
| Notifications | `order_created` sent emails/SMS to **client-supplied** phone/email with spoofed totals (SMS credit burn / phishing) | Only the order number is accepted; recipient and amounts come from the DB; unpaid orders get payment instructions, paid orders get the confirmation once |
| Email templates | Customer name / email / status interpolated unescaped into admin and customer HTML | `escapeHtml` on every user value; SMS keeps raw text |
| Order lookup | Order number alone revealed phone, street address and gateway refs | Full view only with the checkout email; otherwise masked summary; tracking numbers (`SLI-…`) now resolve |
| Payments | Hubtel verify applied any amount; unsigned Hubtel callbacks accepted; secrets compared non-constant-time; masked emails sent to gateways; cancelled orders still chargeable; unlimited initiate calls per order | Expected-amount check, unsigned callbacks confirmed with Hubtel's API first, `timingSafeEqual`, masked emails ignored, closed orders refused, 6 initiations / 10 min per order |
| Checkout | Variant matched by label (wrong price/stock for colour variants), pre-orders unbuyable at zero stock, predictable order numbers, coupons/shipping never applied server-side | `variantId` preferred and strict label match, pre-order stock skip, random order suffix, coupon validation (`lib/coupons.ts`) and shipping (`lib/shipping.ts`) computed server-side and reported back |
| Headers / middleware | Conflicting `X-Frame-Options`, middleware failed open in hosted-Supabase mode, `X-Powered-By`, no HSTS | Unified headers, fail-closed, `poweredByHeader:false`, HSTS + Permissions-Policy |
| Service worker | Cached `/rest`, `/auth`, signed storage and all `/api` responses on disk (PII + admin data served to the next visitor), force-reloaded every tab on deploy | Never caches auth/REST/private pages, offline page precached separately, update is opt-in |
| Scripts | `ensure-admin-user.mjs` defaulted to password `admin123` | Password required, 12+ chars |
| Scheduling | `vercel.json` cron never ran on Coolify, so payment reminders never sent | In-process scheduler (`lib/jobs.ts`), external cron still supported |

## Storefront & admin fixes

See the commit for the per-file list. Highlights: fake flows replaced with real ones
(password reset, support tickets, returns, address book, newsletter, blog from
`blog_posts`, coupon CRUD, POS stock and payment events), dead links/buttons removed or
wired, duplicate headers removed, placeholder image hosted locally, review moderation copy,
admin login redirect/error handling, cookie consent gating analytics.

## Admin click-through (second pass)

Every control on every admin page was exercised against the local database: dashboard
range/links; orders stats, tabs, filters, sort, search, bulk status, CSV export, resend
payment link; order detail status/cancel (with stock restore), notes, resend
notifications; products search/filters/sort/view, create → edit (price, variants, stock)
→ preview → delete; categories create/edit/delete; inventory filters, import dialog,
export, selection; coupons create/edit/enable/disable/copy/delete and storefront
validation; reviews approve/reject/bulk/sort; blog create/publish/unpublish/edit/delete
and storefront visibility; modules toggle (sidebar updates); customers filter/sort/
select/export/email, customer detail inline edit; insights segments/export; analytics
range/export; notifications campaign (batched send with progress); POS add/quantity/
charge/cash checkout (payment event + stock); SMS credit (unconfigured state); SMS
debugger (clean failure without keys); sidebar, user menu, logout.

Fixed in this pass:

- Order detail: picking a status in the dropdown saved immediately and the Update button
  then re-saved the stale status, so quick clicks reverted the change. The dropdown now
  only stages the status; the button applies it. `awaiting_payment` is labelled properly.
- Inventory had no way to change a quantity despite its heading; each row now has an
  inline stock editor (variant products link to the editor instead).
- Product editor: variants created with the base price now follow later base-price edits
  instead of silently keeping the old price.
- POS success panel showed the tendered amount as "change due"; change is now
  snapshotted at completion.
- RPC shim CORS preflight rejected supabase-js's `content-profile` header (only hit
  cross-origin, e.g. a dev host); it now matches the table shim.

## Verified locally

Against a fresh local Postgres (`abbyglow_dev`): ACL denials, embed block, role escalation
attempts, signup/login throttling, logout, recovery-token exchange (single use), server
checkout with coupon + delivery, masked vs verified success lookup, Moolre callback amount
mismatch / success / replay (stock reduced once), staff upsert, storage upload limits.
