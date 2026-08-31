# MIGRATION_STATUS_REPORT — AbbyGlow Essentials

**Tool:** Manual SQL via `scripts/run-migration.mjs` / container `psql`/`node`+`pg` (not hosted Supabase CLI for prod DB)  
**Ledger table:** `public.schema_migrations (id text PK, applied_at, notes)`

## Applied (store_abbyglow)

| id | notes |
| -- | ----- |
| 20260209000000_complete_schema | baseline ecommerce schema |
| 20260218000000_allow_null_order_items_product_fks | soft-delete products |
| 20260730000000_mark_order_paid_idempotent | idempotent paid RPC |
| 20260803000000_payment_audit_tables | payment/callback/sms audit |
| 20260803120000_db_health_repair | auth.role, storage stub, payment guards |
| 20260803140000_part_payment_plans | order payment_plan columns + order_payment_events |
| 20260803140100_apply_order_payment | apply_order_payment RPC |
| 20260803230000_audit_repair_order_payment_events | audit repair: events/indexes/ledger |

## Pending

None for known repo migrations.

## Corrective migration this pass

`supabase/migrations/20260803230000_audit_repair_order_payment_events.sql`

- Idempotent `CREATE TABLE IF NOT EXISTS order_payment_events`
- Ensures part-payment columns/checks
- Product/FK indexes
- Ledger inserts `ON CONFLICT DO NOTHING`

## Destructive operations

None. No drops, no truncate, no data deletion.

## Rollback

1. Indexes: `DROP INDEX IF EXISTS idx_products_status_created;` (etc.)  
2. Do **not** drop `order_payment_events` if any rows exist.  
3. Ledger row can remain (harmless).  
4. Code rollback: redeploy previous git SHA.
