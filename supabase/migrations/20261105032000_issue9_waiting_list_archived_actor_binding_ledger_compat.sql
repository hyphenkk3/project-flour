-- Issue #9: ledger-compatible follow-up for waiting-list actor binding.
--
-- The original 20261105031949 migration is already recorded in DEV, but its
-- absolute ledger-count preflight assumes the DEV-only migration history. This
-- forward-only migration preserves that history and supports both states:
--   * Production: M1 exists; original M2 is absent; bind the two actors here.
--   * DEV: M1 and original M2 exist; verify the already-bound definitions and
--     record this compatibility migration without changing function bodies.
--
-- The Supabase migration runner records this file's canonical version/name.

begin;
set local lock_timeout = '3s';
set local statement_timeout = '60s';

do $preflight$
declare
  v_m1_count integer;
  v_m1_name_count integer;
  v_original_m2_count integer;
  v_original_m2_name_count integer;
  v_new_version_count integer;
  v_new_name_count integer;
  v_duplicate_versions integer;
begin
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'Issue #9 compatibility preflight failed: canonical migration history is missing';
  end if;

  select count(*) into v_duplicate_versions
  from (
    select version
    from supabase_migrations.schema_migrations
    group by version
    having count(*) > 1
  ) duplicates;
  if v_duplicate_versions <> 0 then
    raise exception 'Issue #9 compatibility preflight failed: duplicate migration versions exist';
  end if;

  select count(*) into v_m1_count
  from supabase_migrations.schema_migrations
  where version = '20261105030558'
    and name = 'issue9_active_staff_orders_and_rpc_actor_binding';
  select count(*) into v_m1_name_count
  from supabase_migrations.schema_migrations
  where name = 'issue9_active_staff_orders_and_rpc_actor_binding';
  if v_m1_count <> 1 or v_m1_name_count <> 1 then
    raise exception 'Issue #9 compatibility preflight failed: required M1 history entry is missing or inconsistent';
  end if;

  select count(*) into v_original_m2_count
  from supabase_migrations.schema_migrations
  where version = '20261105031949'
    and name = 'issue9_waiting_list_archived_actor_binding';
  select count(*) into v_original_m2_name_count
  from supabase_migrations.schema_migrations
  where name = 'issue9_waiting_list_archived_actor_binding';
  if v_original_m2_count not in (0, 1)
     or v_original_m2_name_count <> v_original_m2_count then
    raise exception 'Issue #9 compatibility preflight failed: original M2 history is inconsistent';
  end if;

  select count(*) into v_new_version_count
  from supabase_migrations.schema_migrations
  where version = '20261105032000';
  select count(*) into v_new_name_count
  from supabase_migrations.schema_migrations
  where name = 'issue9_waiting_list_archived_actor_binding_ledger_compat';
  if v_new_version_count <> 0 or v_new_name_count <> 0 then
    raise exception 'Issue #9 compatibility preflight failed: compatibility migration is already or ambiguously recorded';
  end if;

  if to_regprocedure('public._bind_rpc_actor(uuid)') is null
     or to_regprocedure('public._require_rpc_roles(uuid,text[],text)') is null then
    raise exception 'Issue #9 compatibility preflight failed: required authorization helper is missing';
  end if;

  if not exists (
    select 1 from pg_proc p
    where p.oid = 'public._bind_rpc_actor(uuid)'::regprocedure
      and md5(pg_get_functiondef(p.oid)) = '030d35baf1701b9740b0a4628a751016'
      and pg_get_userbyid(p.proowner) = 'postgres'
      and p.prosecdef
      and p.proconfig = ARRAY['search_path=public']::text[]
      and p.proacl::text = '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'
      and has_function_privilege('authenticated', p.oid, 'execute')
      and has_function_privilege('service_role', p.oid, 'execute')
      and not has_function_privilege('anon', p.oid, 'execute')
      and not has_function_privilege('public', p.oid, 'execute')
  ) or not exists (
    select 1 from pg_proc p
    where p.oid = 'public._require_rpc_roles(uuid,text[],text)'::regprocedure
      and md5(pg_get_functiondef(p.oid)) = '993f866e7efbc9c96ed31b7519e30167'
      and pg_get_userbyid(p.proowner) = 'postgres'
      and p.prosecdef
      and p.proconfig = ARRAY['search_path=public']::text[]
      and p.proacl::text = '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'
      and has_function_privilege('authenticated', p.oid, 'execute')
      and has_function_privilege('service_role', p.oid, 'execute')
      and not has_function_privilege('anon', p.oid, 'execute')
      and not has_function_privilege('public', p.oid, 'execute')
  ) then
    raise exception 'Issue #9 compatibility preflight failed: authorization helper fingerprint, owner, security or grants changed';
  end if;
end;
$preflight$;

do $bind_archived_actor$
declare
  v_original_m2_count integer;
  v_signature text;
  v_expected_md5 text;
  v_oid oid;
  v_definition text;
  v_replacement text;
  v_target record;
begin
  select count(*) into v_original_m2_count
  from supabase_migrations.schema_migrations
  where version = '20261105031949'
    and name = 'issue9_waiting_list_archived_actor_binding';

  for v_target in
    select * from (values
      (
        'public.waiting_list_convert_confirmation(uuid,uuid)',
        case when v_original_m2_count = 1
          then '5210846e7356ca2d4d4f6064341b73d0'
          else 'd75338ec3ba9283dd8a50f4a945d417b'
        end
      ),
      (
        'public.waiting_list_convert_item(uuid,uuid,integer,time without time zone,boolean)',
        case when v_original_m2_count = 1
          then '654dfcf9673d71337772fbbd34b7a70f'
          else '583879c960b0e88b7f4b2dc9ba44ebc1'
        end
      )
    ) as t(signature, expected_md5)
  loop
    v_signature := v_target.signature;
    v_expected_md5 := v_target.expected_md5;
    v_oid := to_regprocedure(v_signature);
    if v_oid is null then
      raise exception 'Issue #9 compatibility preflight failed: missing function %', v_signature;
    end if;

    select pg_get_functiondef(p.oid) into v_definition
    from pg_proc p where p.oid = v_oid;

    if md5(v_definition) <> v_expected_md5
       or not (
         select p.prosecdef
           and pg_get_userbyid(p.proowner) = 'postgres'
           and p.proconfig = ARRAY['search_path=""']::text[]
           and p.proacl::text = '{postgres=X/postgres,authenticated=X/postgres}'
           and has_function_privilege('authenticated', p.oid, 'execute')
           and not has_function_privilege('anon', p.oid, 'execute')
           and not has_function_privilege('service_role', p.oid, 'execute')
           and not has_function_privilege('public', p.oid, 'execute')
         from pg_proc p where p.oid = v_oid
       ) then
      raise exception 'Issue #9 compatibility preflight failed: unexpected function definition, owner, security or grants for %', v_signature;
    end if;

    if v_original_m2_count = 0 then
      if regexp_count(v_definition, E'\\nbegin\\n') <> 1 then
        raise exception 'Issue #9 compatibility preflight failed: cannot safely bind actor in %', v_signature;
      end if;
      v_replacement := replace(
        v_definition,
        E'\nbegin\n',
        E'\nbegin\n  p_actor_staff_id := public._bind_rpc_actor(p_actor_staff_id);\n'
      );
      execute v_replacement;
    elsif position('public._bind_rpc_actor(p_actor_staff_id)' in v_definition) = 0 then
      raise exception 'Issue #9 compatibility preflight failed: recorded original M2 is not reflected in %', v_signature;
    end if;
  end loop;
end;
$bind_archived_actor$;

do $postflight$
declare
  v_count integer;
begin
  select count(*) into v_count
  from pg_proc p
  where p.oid in (
    'public.waiting_list_convert_confirmation(uuid,uuid)'::regprocedure,
    'public.waiting_list_convert_item(uuid,uuid,integer,time without time zone,boolean)'::regprocedure
  )
    and pg_get_userbyid(p.proowner) = 'postgres'
    and p.prosecdef
    and p.proconfig = ARRAY['search_path=""']::text[]
    and p.proacl::text = '{postgres=X/postgres,authenticated=X/postgres}'
    and has_function_privilege('authenticated', p.oid, 'execute')
    and not has_function_privilege('anon', p.oid, 'execute')
    and not has_function_privilege('service_role', p.oid, 'execute')
    and not has_function_privilege('public', p.oid, 'execute')
    and position('public._bind_rpc_actor(p_actor_staff_id)' in pg_get_functiondef(p.oid)) > 0;
  if v_count <> 2 then
    raise exception 'Issue #9 compatibility postflight failed: actor binding, ownership, security or grants mismatch';
  end if;
end;
$postflight$;

commit;
