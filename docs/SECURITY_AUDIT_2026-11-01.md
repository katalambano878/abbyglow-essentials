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
3. ~~Apply the new SQL migrations to the production database~~ **Done 2026-11-02** on
   `store_abbyglow` (fleet-postgres, big-vps) and logged in `schema_migrations`:
   `apply_order_payment()` had an ambiguous column reference that made every gateway
   callback / verify fail with "Database update failed"; and a `newsletter_subscribers` table.
5. **Rotate the big-vps sudo password.** It was hard-coded in `scripts/abbyglow-redeploy.sh`,
   `scripts/abbyglow-fix-proxy.sh` and `scripts/abbyglow-debug-runtime.sh` (since 2026-09-02)
   and is in the GitHub history. The scripts now read it from `SUDO_PASS` like the others.
6. The GitHub push webhook did not queue a Coolify build for `abbyglow-app` on 2026-11-02;
   the deploy was queued through the Coolify API instead. Check the GitHub App / webhook
   wiring in Coolify if auto-deploy is expected.
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

## Delivery methods, fees and order channel (2026-11-02)

- **Three delivery methods:** `pickup` (free), `delivery` (doorstep within Accra) and
  `outside_accra` (courier to other regions). `lib/shipping.ts` is the single source of truth
  (labels, parsing of the old POS value `doorstep`, order channel helpers).
- **Delivery comes at a fee the admin agrees with the customer after the order.** The online
  checkout shows "Fee applies" on both delivery options, charges the goods only, and records
  `metadata.delivery_fee_pending = true`. Orders list / detail flag "fee to agree with customer";
  My Orders, tracking, success page, emails and the Shipping / FAQ pages say the fee is confirmed
  by the team. The POS has a "Delivery fee agreed with customer" field that is added to the sale.
  (A fixed-fee version with an admin Delivery Fees page was built and then removed the same day;
  the `store_settings.delivery_rates` row it seeded was deleted from production.)
- **Orders record how they came in:** `metadata.channel` is `web` or `pos`
  (older orders fall back to `checkout_source`), `shipping_method` holds the delivery method and
  `shipping_total` any recorded fee. Admin → Orders has Channel (Web / POS) and Delivery chips with
  counts, a Channel / Delivery column, matching filters and CSV columns; the order detail shows
  method, fee status and channel.
- **Payment plan removed from checkout.** The store takes full payment only, so the
  "Payment Plan / Full Payment" step is gone and the API ignores any `paymentPlan` sent by a
  client. The DB columns stay for historical deposit orders, and those still show their plan.
- **Dev fix:** the one-year `immutable` cache header on `/_next/static` now applies to production
  builds only; in `next dev` it made browsers keep running stale chunks.

## Profit margins and End of Day (2026-11-07, modelled on mkgadgets)

- **Supplier costs** live in a new `product_costs` table (`cost_price`, `supplier_name`, `notes`,
  `updated_by`), not on `products`, because the public catalog shim returns whole product rows.
  The REST shim refuses `product_costs` to anyone who is not an admin, staff included
  (`lib/db/rest-acl.ts`). Migration `20261107000000_product_costs.sql` also adds indexes on
  `orders.created_at` and `order_items.order_id` for the daily queries.
- **Admin → Profit Margins** (`/admin/profit`, admin role only): every product with supplier cost,
  current selling price (lowest variant price when variants exist), profit per item and margin %,
  with filters (no cost yet / under 25% / sold in 30 days), totals (average margin, 30-day profit,
  stock at cost, profit in stock) and an inline editor. `GET/PUT /api/admin/profit`; every save
  is written to `audit_logs`.
- **Admin → End of Day** (`/admin/end-of-day`, staff and admin): pick a day (Accra time) and see
  paid sales with yesterday / last-week comparison, average order, website vs POS split, sales by
  hour, how customers paid, sales by staff (POS), stock movement with stock left and low-stock
  warnings, a to-do list (to package, delivery fee to agree, awaiting payment, partly paid,
  cancelled, discounts, delivery fees) and every order of the day. Profit per item and total
  profit appear for admins only. "Print close" prints the report without the admin chrome.
  `GET /api/admin/end-of-day?date=YYYY-MM-DD`.
- **POS** now stamps `metadata.sold_by_id / sold_by_name / sold_by_email / sold_by_role` from the
  signed-in staff profile so the End of Day report can attribute in-store sales.
