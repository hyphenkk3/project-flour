-- Keep row-trigger writers from deadlocking with workflows that acquire the
-- date lock first and then lock a production_capacity or order row. The core
-- guest checker and set_production_capacity still wait for the date lock
-- before they touch rows. Row triggers use try-lock and abort with a retryable
-- serialization error if a competing transaction already owns that date.
create or replace function public._try_lock_production_capacity_date(p_pickup_date date)
returns boolean
language sql
volatile
security definer
set search_path = ''
as $function$
  select pg_catalog.pg_try_advisory_xact_lock(
    1463951427,
    (p_pickup_date - date '2000-01-01')
  )
$function$;

alter function public._try_lock_production_capacity_date(date) owner to postgres;
revoke all on function public._try_lock_production_capacity_date(date)
  from public, anon, authenticated, service_role;

-- This correction is intentionally tied to the four trigger functions created
-- by 20261103140120. Refuse unexpected body/security drift rather than
-- transforming a different implementation.
do $migration$
declare
  v_item record;
  v_definition text;
  v_original text;
  v_expression text;
  v_old_call text;
  v_new_call text;
  v_lock_call text := 'perform public._lock_production_capacity_date(';
  v_expressions text[] := array[
    'new.pickup_date',
    'old.pickup_date',
    'old_date',
    'new_date'
  ];
begin
  for v_item in
    select p.oid, p.proname, md5(pg_catalog.pg_get_functiondef(p.oid)) as body_md5,
      r.rolname as owner, p.prosecdef, p.proconfig
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    join pg_catalog.pg_roles r on r.oid = p.proowner
    where n.nspname = 'public'
      and p.proname in (
        '_lock_capacity_order_row',
        '_lock_capacity_order_item_row',
        '_lock_capacity_definition_row',
        '_lock_capacity_hold_row'
      )
    order by p.proname
  loop
    if v_item.owner <> 'postgres'
       or not v_item.prosecdef
       or v_item.proconfig is distinct from array['search_path=""']::text[] then
      raise exception 'Capacity row trigger function security contract changed: %', v_item.proname;
    end if;

    if (v_item.proname = '_lock_capacity_order_row'
        and v_item.body_md5 <> '61949de36fdbff7206309b391d453507')
       or (v_item.proname = '_lock_capacity_order_item_row'
        and v_item.body_md5 <> 'a20cc8be072efc8b6baa62866120b4a7')
       or (v_item.proname = '_lock_capacity_definition_row'
        and v_item.body_md5 <> 'bcdcd685beb3b9a0bf0a632b577ff750')
       or (v_item.proname = '_lock_capacity_hold_row'
        and v_item.body_md5 <> '16096246c2497de13460677b38005391') then
      raise exception 'Capacity row trigger body differs from reviewed migration 20261103140120: %', v_item.proname;
    end if;

    v_definition := pg_catalog.pg_get_functiondef(v_item.oid);
    v_original := v_definition;
    foreach v_expression in array v_expressions loop
      v_old_call := v_lock_call || v_expression || ');';
      v_new_call :=
        'if not public._try_lock_production_capacity_date(' || v_expression ||
        ') then raise exception using errcode = ''40001'', message = ' ||
        '''Capacity changed concurrently. Please retry this operation.''; end if;';
      v_definition := replace(v_definition, v_old_call, v_new_call);
    end loop;

    if v_definition = v_original
       or position(v_lock_call in v_definition) > 0
       or position('public._try_lock_production_capacity_date(' in v_definition) = 0 then
      raise exception 'Could not safely convert capacity row trigger locks: %', v_item.proname;
    end if;

    execute v_definition;
  end loop;

  if (select count(*) from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname in (
        '_lock_capacity_order_row',
        '_lock_capacity_order_item_row',
        '_lock_capacity_definition_row',
        '_lock_capacity_hold_row'
      )) <> 4 then
    raise exception 'Expected all four capacity row trigger functions to be updated';
  end if;
end;
$migration$;
