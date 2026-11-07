-- Project Flour: narrowly scoped Production metadata capture.
-- READ ONLY. Execute only after separate authorization to connect to Production.
-- No business-table rows are selected. Outputs are limited to catalog metadata,
-- function source definitions, security metadata, and migration version/name rows.
-- Recommended invocation: psql -X -v ON_ERROR_STOP=1 -f this-file
-- Connection policy: use the approved Production TLS-verified connection;
-- do not put credentials in command arguments, shell history, or this artifact.

BEGIN READ ONLY;
SET LOCAL statement_timeout = '10s';
SET LOCAL lock_timeout = '2s';

-- 1. Connection identity. Compare project/database/role/version to the
-- separately approved expected Production identity before interpreting output.
SELECT current_database() AS database_name,
       current_user AS effective_role,
       current_setting('server_version') AS server_version,
       current_setting('transaction_read_only') AS transaction_read_only,
       inet_server_addr() AS server_address,
       inet_server_port() AS server_port;

-- 2. Exact definitions and metadata for every overload of the target RPC.
-- The result intentionally includes function bodies; retain it as restricted
-- schema evidence and do not publish it if it contains sensitive implementation
-- details. It contains no application records or function argument values.
SELECT p.oid::regprocedure AS exact_signature,
       pg_get_function_arguments(p.oid) AS arguments_with_defaults,
       pg_get_function_result(p.oid) AS result_type,
       md5(pg_get_functiondef(p.oid)) AS pg_get_functiondef_md5,
       pg_get_functiondef(p.oid) AS exact_definition,
       owner.rolname AS owner,
       p.prosecdef AS security_definer,
       p.proconfig AS function_settings,
       p.proacl AS raw_acl,
       has_function_privilege('postgres', p.oid, 'EXECUTE') AS postgres_execute,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute,
       has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN pg_roles owner ON owner.oid = p.proowner
WHERE n.nspname = 'public'
  AND p.proname = 'submit_guest_extra_order'
ORDER BY p.pronargs, p.oid;

-- 3. Issue #8 prerequisite relations: structure, constraints, indexes,
-- RLS state and ACLs. No table contents are read.
WITH wanted(relname) AS (
  VALUES ('complimentary_item_types'),
         ('collection_complimentary_items'),
         ('paid_addon_types'),
         ('collection_paid_addon_types'),
         ('order_complimentary_items'),
         ('order_paid_addons'),
         ('extra_stock'),
         ('orders'),
         ('order_items')
)
SELECT w.relname,
       c.oid::regclass AS relation,
       c.relkind,
       c.relrowsecurity AS rls_enabled,
       c.relforcerowsecurity AS rls_forced,
       pg_get_userbyid(c.relowner) AS owner,
       c.relacl AS raw_acl,
       COALESCE(grants.items, '[]'::jsonb) AS effective_acl_entries,
       COALESCE(cols.items, '[]'::jsonb) AS columns,
       COALESCE(cons.items, '[]'::jsonb) AS constraints,
       COALESCE(idxs.items, '[]'::jsonb) AS indexes,
       COALESCE(pols.items, '[]'::jsonb) AS policies
FROM wanted w
LEFT JOIN pg_namespace n ON n.nspname = 'public'
LEFT JOIN pg_class c ON c.relnamespace = n.oid AND c.relname = w.relname
LEFT JOIN LATERAL (
  SELECT jsonb_agg(jsonb_build_object(
    'name', a.attname, 'type', format_type(a.atttypid,a.atttypmod),
    'not_null', a.attnotnull, 'default', pg_get_expr(d.adbin,d.adrelid)
  ) ORDER BY a.attnum) AS items
  FROM pg_attribute a
  LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
  WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
) cols ON true
LEFT JOIN LATERAL (
  SELECT jsonb_agg(jsonb_build_object(
    'name', con.conname, 'type', con.contype,
    'definition', pg_get_constraintdef(con.oid, true),
    'validated', con.convalidated, 'deferrable', con.condeferrable,
    'initially_deferred', con.condeferred
  ) ORDER BY con.conname) AS items
  FROM pg_constraint con WHERE con.conrelid = c.oid
) cons ON true
LEFT JOIN LATERAL (
  SELECT jsonb_agg(jsonb_build_object(
    'name', ic.relname, 'definition', pg_get_indexdef(i.indexrelid)
  ) ORDER BY ic.relname) AS items
  FROM pg_index i JOIN pg_class ic ON ic.oid = i.indexrelid
  WHERE i.indrelid = c.oid
) idxs ON true
LEFT JOIN LATERAL (
  SELECT jsonb_agg(jsonb_build_object(
    'name', pol.polname, 'command', pol.polcmd,
    'permissive', pol.polpermissive, 'roles', pol.polroles,
    'using', pg_get_expr(pol.polqual,pol.polrelid),
    'check', pg_get_expr(pol.polwithcheck,pol.polrelid)
  ) ORDER BY pol.polname) AS items
  FROM pg_policy pol WHERE pol.polrelid = c.oid
) pols ON true
LEFT JOIN LATERAL (
  SELECT jsonb_agg(jsonb_build_object(
    'grantee', CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE gr.rolname END,
    'privilege', a.privilege_type, 'grantable', a.is_grantable
  ) ORDER BY a.grantee,a.privilege_type) AS items
  FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
  LEFT JOIN pg_roles gr ON gr.oid=a.grantee
) grants ON true
ORDER BY w.relname;

-- Catalog dependency edges for the same relations (views, rules, triggers,
-- constraints, and other catalog objects). No business rows are read.
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
ORDER BY target_relation::text, dependent_object;

-- 4. Relevant Issue #8 functions and triggers associated with the prerequisite
-- relations. This returns definitions/metadata only, not execution results.
SELECT p.oid::regprocedure AS signature,
       md5(pg_get_functiondef(p.oid)) AS definition_md5,
       pg_get_functiondef(p.oid) AS exact_definition,
       pg_get_userbyid(p.proowner) AS owner,
       p.prosecdef AS security_definer,
       p.proconfig AS function_settings,
       p.proacl AS raw_acl,
       (SELECT jsonb_agg(jsonb_build_object(
          'grantee', CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE gr.rolname END,
          'privilege', a.privilege_type, 'grantable', a.is_grantable
        ) ORDER BY a.grantee,a.privilege_type)
        FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
        LEFT JOIN pg_roles gr ON gr.oid=a.grantee) AS effective_acl_entries
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND (p.proname ILIKE '%complimentary%'
       OR p.proname ILIKE '%paid_addon%'
       OR p.proname ILIKE '%guest_extra_order%')
ORDER BY p.proname, p.pronargs, p.oid;

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

-- 5. Migration history shape and current ledger summary, then recent
-- version/name entries. This reads metadata only; it does not alter history.
SELECT column_name, data_type, udt_name, is_nullable
FROM information_schema.columns
WHERE table_schema='supabase_migrations'
  AND table_name='schema_migrations'
ORDER BY ordinal_position;

SELECT count(*) AS ledger_rows,
       count(DISTINCT version) AS distinct_versions,
       max(version) AS latest_version,
       count(*) FILTER (WHERE version='20261106104602') AS target_version_rows,
       count(*) FILTER (WHERE name='fresh_pick_checkout_idempotency_v3') AS target_name_rows
FROM supabase_migrations.schema_migrations;

SELECT version, name
FROM supabase_migrations.schema_migrations
ORDER BY version DESC
LIMIT 12;

ROLLBACK;
