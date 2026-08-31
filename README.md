# AbbyGlow Essentials

Next.js e-commerce storefront for **AbbyGlow Essentials** — Accra, Ghana.

## Quick Start

```bash
npm install
npm run dev
```

Open `http://localhost:3005`.

## Stack

- Next.js 15 + React 19 + Tailwind
- Plain Postgres via `DATABASE_URL` (local auth / REST / storage shims)
- Moolre payments & SMS, Resend email

## Customize

- Brand defaults: `context/CMSContext.tsx`, `lib/seo.ts`
- Env template: `.env.example` (variable names only)
- Deploy guide: `docs/SUPABASE_TO_POSTGRES_MIGRATION_GUIDE.md`

## Contact

- Accra, Ghana
- Add phones and WhatsApp in `lib/seo.ts` and `.env.example` when you have them
