-- Project Flour: versioned read-only continuation for the November 7
-- Production Fresh Pick metadata capture. Does not repeat function or relation
-- metadata queries that completed in the preserved partial capture.
-- Contains catalog metadata and migration version/name rows only.
\set ON_ERROR_STOP on

BEGIN READ ONLY;
SET LOCAL statement_timeout = '10s';
SET LOCAL lock_timeout = '2s';

-- 1. Dependency metadata for the nine approved prerequisite relations.
SELECT target.oid::regclass AS target_relation,
       pg_describe_object(d.classid,d.objid,d.objsubid) AS dependent_object,
       d.deptype AS dependency_type
FROM pg_depend d
JOIN pg_class target ON d.refclassid='pg_class'::regclass AND d.refobjid=target.oid
JOIN pg_namespace n ON n.oid=target.relnamespace
WHERE n.nspname='public'
  AND target.relname IN ('complimentary_item_types','collection_complimentary_items',
    'paid_addon_types','collection_paid_addon_types','order_complimentary_items',
    'order_paid_addons','extra_stock','orders','order_items')
ORDER BY 1, 2;

-- 2. Non-internal trigger definitions for the same relations.
SELECT t.tgrelid::regclass AS relation,
       t.tgname AS trigger_name,
       t.tgenabled AS enabled_state,
       t.tgfoid::regprocedure AS trigger_function,
       pg_get_triggerdef(t.oid, true) AS definition
FROM pg_trigger t
WHERE NOT t.tgisinternal
  AND t.tgrelid IN (
    SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public'
      AND c.relname IN ('complimentary_item_types','collection_complimentary_items',
        'paid_addon_types','collection_paid_addon_types','order_complimentary_items',
        'order_paid_addons','extra_stock','orders','order_items')
  )
ORDER BY t.tgrelid::regclass::text, t.tgname;

-- 3. Migration-history table shape only.
SELECT column_name, data_type, udt_name, is_nullable
FROM information_schema.columns
WHERE table_schema='supabase_migrations'
  AND table_name='schema_migrations'
ORDER BY ordinal_position;

-- 4. Migration-history counts and target presence only.
SELECT count(*) AS ledger_rows,
       count(DISTINCT version) AS distinct_versions,
       max(version) AS latest_version,
       count(*) FILTER (WHERE version='20261106104602') AS target_version_rows,
       count(*) FILTER (WHERE name='fresh_pick_checkout_idempotency_v3') AS target_name_rows
FROM supabase_migrations.schema_migrations;

-- 5. Complete migration version/name manifest only.
SELECT version, name
FROM supabase_migrations.schema_migrations
ORDER BY version;

ROLLBACK;
