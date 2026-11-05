-- Issue #9 follow-up: include archived status in the two existing waiting-list
-- conversion RPC actor checks while preserving their business logic and ACLs.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '60s';

DO $preflight$
DECLARE
  v_rows integer;
  v_distinct integer;
BEGIN
  SELECT count(*), count(DISTINCT version) INTO v_rows, v_distinct
  FROM supabase_migrations.schema_migrations;
  IF v_rows <> 191 OR v_distinct <> 191
     OR (SELECT count(*) FROM supabase_migrations.schema_migrations
         WHERE version='20261105030558'
           AND name='issue9_active_staff_orders_and_rpc_actor_binding') <> 1
     OR EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations
                WHERE name='issue9_waiting_list_archived_actor_binding') THEN
    RAISE EXCEPTION 'Issue #9 follow-up preflight failed: DEV migration history differs';
  END IF;
END;
$preflight$;

DO $bind_archived_actor$
DECLARE
  v_signature text;
  v_expected_md5 text;
  v_oid oid;
  v_definition text;
  v_replacement text;
  v_target record;
BEGIN
  FOR v_target IN
    SELECT * FROM (VALUES
      ('public.waiting_list_convert_confirmation(uuid,uuid)', 'd75338ec3ba9283dd8a50f4a945d417b'),
      ('public.waiting_list_convert_item(uuid,uuid,integer,time without time zone,boolean)', '583879c960b0e88b7f4b2dc9ba44ebc1')
    ) AS t(signature, expected_md5)
  LOOP
    v_signature := v_target.signature;
    v_expected_md5 := v_target.expected_md5;
    v_oid := to_regprocedure(v_signature);
    IF v_oid IS NULL THEN
      RAISE EXCEPTION 'Issue #9 follow-up preflight failed: missing function %', v_signature;
    END IF;
    SELECT pg_get_functiondef(p.oid) INTO v_definition
    FROM pg_proc p WHERE p.oid=v_oid;
    IF md5(v_definition) <> v_expected_md5
       OR NOT (SELECT p.prosecdef
                      AND pg_get_userbyid(p.proowner)='postgres'
                      AND p.proconfig=ARRAY['search_path=""']::text[]
                      AND has_function_privilege('authenticated',p.oid,'execute')
                      AND NOT has_function_privilege('anon',p.oid,'execute')
               FROM pg_proc p WHERE p.oid=v_oid)
       OR regexp_count(v_definition, E'\\nbegin\\n') <> 1 THEN
      RAISE EXCEPTION 'Issue #9 follow-up preflight failed: unexpected owner, grants, security or definition for %', v_signature;
    END IF;
    v_replacement := replace(
      v_definition,
      E'\nbegin\n',
      E'\nbegin\n  p_actor_staff_id := public._bind_rpc_actor(p_actor_staff_id);\n'
    );
    EXECUTE v_replacement;
  END LOOP;
END;
$bind_archived_actor$;

DO $postflight$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM pg_proc p
  WHERE p.oid IN (
    'public.waiting_list_convert_confirmation(uuid,uuid)'::regprocedure,
    'public.waiting_list_convert_item(uuid,uuid,integer,time without time zone,boolean)'::regprocedure
  )
    AND pg_get_userbyid(p.proowner)='postgres'
    AND p.prosecdef
    AND p.proconfig=ARRAY['search_path=""']::text[]
    AND has_function_privilege('authenticated',p.oid,'execute')
    AND NOT has_function_privilege('anon',p.oid,'execute')
    AND pg_get_functiondef(p.oid) LIKE '%_bind_rpc_actor%';
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'Issue #9 follow-up postflight failed: actor binding/ownership/grants mismatch';
  END IF;
END;
$postflight$;

commit;
