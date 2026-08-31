#!/usr/bin/env bash
# Audit store_abbyglow on fleet-postgres (staging). No secrets printed.
set -euo pipefail

if [[ -n "${SUDO_PASS:-}" ]]; then
  printf '%s\n' "$SUDO_PASS" | sudo -S -v >/dev/null 2>&1
else
  sudo -v
fi

# Secrets file is root-owned; load into this shell without printing values.
set -a
# shellcheck disable=SC1090
source <(sudo cat /data/fleet/secrets/store_abbyglow.env)
set +a

: "${STORE_PASS:?STORE_PASS missing from secrets file}"

psqlc() {
  sudo docker exec -e PGPASSWORD="$STORE_PASS" fleet-postgres \
    psql -U store_abbyglow -d store_abbyglow -v ON_ERROR_STOP=1 "$@"
}

echo "==== CONNECTION (safe) ===="
psqlc -tAc "SELECT current_database() AS db, current_user AS role, version();"
psqlc -tAc "SELECT inet_server_addr() IS NOT NULL AS has_server_addr, pg_backend_pid();"

echo "==== SCHEMAS ===="
psqlc -c "SELECT schema_name FROM information_schema.schemata WHERE schema_name NOT IN ('pg_catalog','information_schema','pg_toast') ORDER BY 1;"

echo "==== EXTENSIONS ===="
psqlc -c "SELECT extname, extversion, nspname FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace ORDER BY 1;"

echo "==== TABLES + ROW COUNTS ===="
psqlc -c "
SELECT schemaname, relname AS table, n_live_tup AS approx_rows
FROM pg_stat_user_tables
ORDER BY schemaname, relname;"

echo "==== COLUMNS ===="
psqlc -c "
SELECT table_schema, table_name, column_name, data_type, udt_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema IN ('public','auth')
ORDER BY table_schema, table_name, ordinal_position;" > /tmp/abbyglow-columns.txt
wc -l /tmp/abbyglow-columns.txt
head -n 5 /tmp/abbyglow-columns.txt

echo "==== PRIMARY KEYS ===="
psqlc -c "
SELECT tc.table_schema, tc.table_name, kcu.column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema IN ('public','auth')
ORDER BY 1,2,3;"

echo "==== FOREIGN KEYS ===="
psqlc -c "
SELECT
  tc.table_schema, tc.table_name, kcu.column_name,
  ccu.table_schema AS foreign_table_schema,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name,
  rc.update_rule, rc.delete_rule
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
JOIN information_schema.referential_constraints AS rc
  ON rc.constraint_name = tc.constraint_name AND rc.constraint_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema IN ('public','auth')
ORDER BY 1,2,3;"

echo "==== UNIQUE CONSTRAINTS ===="
psqlc -c "
SELECT tc.table_schema, tc.table_name, tc.constraint_name, string_agg(kcu.column_name, ',' ORDER BY kcu.ordinal_position) AS cols
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
WHERE tc.constraint_type = 'UNIQUE' AND tc.table_schema IN ('public','auth')
GROUP BY 1,2,3
ORDER BY 1,2,3;"

echo "==== CHECK CONSTRAINTS ===="
psqlc -c "
SELECT n.nspname, c.relname, con.conname, pg_get_constraintdef(con.oid)
FROM pg_constraint con
JOIN pg_class c ON c.oid = con.conrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE con.contype = 'c' AND n.nspname IN ('public','auth')
ORDER BY 1,2,3;"

echo "==== INDEXES ===="
psqlc -c "
SELECT schemaname, tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname IN ('public','auth')
ORDER BY 1,2,3;" > /tmp/abbyglow-indexes.txt
wc -l /tmp/abbyglow-indexes.txt

echo "==== ENUMS ===="
psqlc -c "
SELECT t.typname, string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder) AS labels
FROM pg_type t
JOIN pg_enum e ON t.oid = e.enumtypid
JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname = 'public'
GROUP BY t.typname
ORDER BY 1;"

echo "==== FUNCTIONS (public/auth) ===="
psqlc -c "
SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname IN ('public','auth')
ORDER BY 1,2;"

echo "==== RLS ENABLED? ===="
psqlc -c "SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND relkind='r' ORDER BY 1;"

echo "==== CRITICAL TABLE EXISTS ===="
for t in profiles products orders order_items payment_attempts callback_events sms_attempts customers categories auth.users; do
  if [[ "$t" == *.* ]]; then
    schema=${t%%.*}; name=${t##*.}
  else
    schema=public; name=$t
  fi
  exists=$(psqlc -tAc "SELECT to_regclass('${schema}.${name}') IS NOT NULL")
  echo "$t => $exists"
done

echo "==== ORDERS/PAYMENTS SAMPLE INTEGRITY ===="
psqlc -c "SELECT count(*) AS orders FROM orders;"
psqlc -c "SELECT payment_status, count(*) FROM orders GROUP BY 1 ORDER BY 2 DESC;"
psqlc -c "SELECT count(*) AS payment_attempts FROM payment_attempts;"
psqlc -c "SELECT count(*) AS callback_events FROM callback_events;"
psqlc -c "SELECT count(*) AS sms_attempts FROM sms_attempts;"
psqlc -c "SELECT count(*) AS products FROM products;"
psqlc -c "SELECT count(*) AS profiles FROM profiles;"
psqlc -c "SELECT count(*) AS auth_users FROM auth.users;"

echo "==== ORPHAN CHECKS ===="
psqlc -c "SELECT count(*) AS orphan_order_items FROM order_items oi LEFT JOIN orders o ON o.id=oi.order_id WHERE o.id IS NULL;"
psqlc -c "SELECT count(*) AS orphan_payments FROM payment_attempts pa LEFT JOIN orders o ON o.id=pa.order_id WHERE pa.order_id IS NOT NULL AND o.id IS NULL;"
psqlc -c "SELECT count(*) AS profiles_missing_auth FROM profiles p LEFT JOIN auth.users u ON u.id=p.id WHERE u.id IS NULL;"

echo "==== MISSING HELPERS ===="
psqlc -tAc "SELECT 'auth.uid=' || EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='auth' AND p.proname='uid');"
psqlc -tAc "SELECT 'auth.role=' || EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='auth' AND p.proname='role');"
psqlc -tAc "SELECT 'mark_order_paid=' || EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='mark_order_paid');"
psqlc -tAc "SELECT 'claim_order_confirmation=' || EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='claim_order_confirmation');"
psqlc -tAc "SELECT 'storage.buckets=' || EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='storage' AND table_name='buckets');"

echo "DONE_AUDIT"

psqlc -c "
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema='public'
ORDER BY table_name, ordinal_position;" > /tmp/abbyglow-public-columns.txt

cp /tmp/abbyglow-public-columns.txt /home/tay/abbyglow-public-columns.txt
cp /tmp/abbyglow-indexes.txt /home/tay/abbyglow-indexes.txt
sudo chown tay:tay /home/tay/abbyglow-public-columns.txt /home/tay/abbyglow-indexes.txt 2>/dev/null || true

psqlc -c "
SELECT
  tc.table_name, kcu.column_name,
  ccu.table_name AS foreign_table_name, ccu.column_name AS foreign_column_name,
  rc.delete_rule
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
JOIN information_schema.referential_constraints AS rc
  ON rc.constraint_name = tc.constraint_name AND rc.constraint_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema='public'
ORDER BY 1,2;" > /home/tay/abbyglow-fks.txt
sudo chown tay:tay /home/tay/abbyglow-fks.txt 2>/dev/null || true
