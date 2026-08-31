# SMS & Payment Integration Notes — AbbyGlow Essentials

## Required environment variables

See `.env.example` for the full list. Key groups:

- **Plain Postgres:** `DATABASE_URL`, `NEXT_PUBLIC_USE_PLAIN_PG`, auth/storage JWT secrets
- **Client shim URL:** `NEXT_PUBLIC_SUPABASE_URL` must be the **app origin** (not a Supabase cloud project)
- **Moolre SMS / payments:** `MOOLRE_*` keys, `MOOLRE_SMS_SENDER_ID=ABBYGLOW`
- **Email:** `RESEND_API_KEY`, `EMAIL_FROM`, `ADMIN_EMAIL`
- **WhatsApp:** `NEXT_PUBLIC_WHATSAPP_NUMBER=`

No real secrets belong in this repository.
