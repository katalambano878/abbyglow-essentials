# AbbyGlow Essentials — Clean Break Report

## A. Initial findings
- Started from Anael Cosmetics Next.js storefront on `main` (Supabase-first).
- Switched working base to `staging/plain-postgres` (plain Postgres + local auth/storage shims).
- Old brand hardcoded in SEO, CMS defaults, notifications, PWA, admin UI, assets, and Anael-specific audit docs.

## B. Old website elements removed
- Brand strings: ANAEL / Anael Cosmetics / anaelcosmetics.com / old phones / socials / doctorbarns email
- Asset: `public/anael-logo.png` (replace `public/logo.png` with the AbbyGlow mark)
- Docs: Anael audits, proposals, SECURITY_RLS_SETUP, SECURITY_AUDIT_PROMPT, migration report, repair/performance/payment Anael reports
- Cosmetics marketing defaults and beauty-specific SEO/copy

## C. New website elements
- Identity: **AbbyGlow Essentials**, Accra, Ghana
- Phones / WhatsApp: not set yet (add in `lib/seo.ts` when available)
- SEO/CMS/notifications/manifest/PWA/logo wordmark
- Brand tokens: ink `#1C1917`, accent `#C2410C`, surface `#FAF7F2`
- `.env.example` + deploy guide retargeted to `store_abbyglow` / `/data/abbyglow/storage`

## D. Platform
- **Kept:** shop/cart/checkout/admin, Moolre, Resend, plain Postgres shims
- **Not used as cloud:** Supabase Auth/DB/Storage (client SDK only talks to this app)

## E. Testing
- Final repo search: zero Anael / old-phone / old-domain hits in source
- `npm run lint` — clean
- `npm run build` — success

## F. Remaining (new project)
- Client logo (replace text/KM placeholders)
- Real domain + email + social URLs
- Product catalog via admin
- Secrets: `DATABASE_URL`, Moolre, Resend, JWT/storage secrets
- VPS: provision `store_abbyglow`, set `STORAGE_ROOT`, deploy Coolify app
- Rename GitHub remote/repo away from `anaelcosmetics` (outside this codebase)

## G. Status
**Ready for staging review** as a new AbbyGlow Essentials codebase — not production-ready until env, DB, domain, logo, and catalog are supplied.
