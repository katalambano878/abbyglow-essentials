# AbbyGlow Essentials Staging

Isolated staging stack — **not** linked to Anael Cosmetics.

## URLs / resources

| Resource | Value |
|----------|--------|
| Production URL | https://abbyglow.shop |
| Staging URL | https://abbyglow-staging.169-58-8-203.sslip.io |
| Coolify app | `abbyglow-staging` (create in Coolify; do not reuse another store’s app) |
| GitHub repo | https://github.com/your-org/abbyglow-essentials |
| Branch | `staging/plain-postgres` |
| Database | `store_abbyglow` (fleet-postgres / pgbouncer) |
| Uploads | `/data/abbyglow/storage` |
| DB secret file (VPS) | `/data/fleet/secrets/store_abbyglow.env` |

## Explicitly NOT used

- `anaelcosmetics-staging`
- `store_anaelcosmetics` (if present)
- `katalambano878/anaelcosmetics.git`
- Anael Moolre / Resend credentials

## Health

```bash
curl -s https://abbyglow-staging.169-58-8-203.sslip.io/api/health
```

Expect `mode: plain_postgres`, `database: ok`.

## Still to configure (in Coolify env)

- `MOOLRE_*` payment + callback secret
- `MOOLRE_SMS_API_KEY`
- `RESEND_API_KEY` / real `EMAIL_FROM` / `ADMIN_EMAIL`
- Create admin: `node scripts/create-admin-user.mjs` with `DATABASE_URL` (direct URL)

## Redeploy

```bash
sudo fleet deploy abbyglow-staging
```
