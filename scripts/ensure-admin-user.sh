#!/usr/bin/env bash
set -euo pipefail
EMAIL="${1:-admin@example.com}"
PASS="${2:-}"

if [ -z "$PASS" ]; then
  echo "Usage: $0 <email> <password>"
  exit 1
fi

# Generate bcrypt hash with node (available on VPS or in app container)
HASH=$(node -e "const b=require('bcryptjs'); console.log(b.hashSync(process.argv[1], 10))" "$PASS" 2>/dev/null \
  || docker run --rm node:20-alpine node -e "const {execSync}=require('child_process'); execSync('npm i -g bcryptjs',{stdio:'ignore'}); const b=require('bcryptjs'); console.log(b.hashSync(process.argv[1],10))" "$PASS")

SQL=$(cat <<SQL
DO \$\$
DECLARE
  uid uuid;
BEGIN
  SELECT id INTO uid FROM auth.users WHERE lower(email) = lower('$EMAIL') LIMIT 1;
  IF uid IS NULL THEN
    uid := gen_random_uuid();
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, recovery_token,
      email_change_token_new, email_change
    ) VALUES (
      uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      lower('$EMAIL'), '$HASH', now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Admin"}'::jsonb,
      now(), now(), '', '', '', ''
    );
  ELSE
    UPDATE auth.users
    SET encrypted_password = '$HASH',
        email_confirmed_at = COALESCE(email_confirmed_at, now()),
        updated_at = now()
    WHERE id = uid;
  END IF;

  INSERT INTO public.profiles (id, email, full_name, role, created_at, updated_at)
  VALUES (uid, lower('$EMAIL'), 'Admin', 'admin', now(), now())
  ON CONFLICT (id) DO UPDATE
    SET role = 'admin',
        email = EXCLUDED.email,
        updated_at = now();
END
\$\$;

SELECT u.email, p.role, u.email_confirmed_at IS NOT NULL AS confirmed
FROM auth.users u
JOIN public.profiles p ON p.id = u.id
WHERE lower(u.email) = lower('$EMAIL');
SQL
)

# Prefer fleet-postgres
if sudo docker ps --format '{{.Names}}' | grep -qx fleet-postgres; then
  echo "$SQL" | sudo docker exec -i fleet-postgres psql -U postgres -d store_abbyglow
elif sudo docker ps --format '{{.Names}}' | grep -qi postgres; then
  C=$(sudo docker ps --format '{{.Names}}' | grep -i postgres | head -1)
  echo "$SQL" | sudo docker exec -i "$C" psql -U postgres -d store_abbyglow
else
  echo "No postgres container found"
  exit 1
fi

echo "OK: admin ready for $EMAIL"
