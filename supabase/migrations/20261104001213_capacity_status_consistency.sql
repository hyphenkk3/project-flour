-- Add `confirmed` to the reservation set introduced by the DEV capacity
-- serialization migrations. Existing submitted/pending reservations remain
-- reservations; the staff confirmed-floor RPC remains its separate historic
-- three-status contract. This is deliberately a forward-only body correction.

do $migration$
declare
  v_item record;
  v_definition text;
  v_rewritten text;
  v_old_pattern text := $$'submitted'[[:space:]]*,[[:space:]]*'pending_confirmation'[[:space:]]*,[[:space:]]*'awaiting_payment'[[:space:]]*,[[:space:]]*'paid'$$;
  v_new_pattern text := $$'submitted'[[:space:]]*,[[:space:]]*'pending_confirmation'[[:space:]]*,[[:space:]]*'confirmed'[[:space:]]*,[[:space:]]*'awaiting_payment'[[:space:]]*,[[:space:]]*'paid'$$;
  v_expected text[] := array[
    '_assert_capacity_bucket|public._assert_capacity_bucket(uuid)|2fe623d8e5563808a166bca8447ca1f1|1|search_path=""',
    '_assert_order_capacity|public._assert_order_capacity(uuid)|e64765e09acc2b9f0350c08246fddf53|2|search_path=""',
    '_guest_preorder_item_fully_booked|public._guest_preorder_item_fully_booked(date,uuid,uuid,uuid,integer)|de2854270d3c0623abe3e0f9fbefc654|1|search_path=public',
    '_lock_capacity_order_item_row|public._lock_capacity_order_item_row()|8003abd4eb030e9500659142a148f9c8|4|search_path=""',
    '_lock_capacity_order_row|public._lock_capacity_order_row()|9527b7bab0ecaa5543a50b4a7710c8a6|2|search_path=""'
  ];
  v_contract text;
  v_parts text[];
  v_found integer := 0;
begin
  foreach v_contract in array v_expected loop
    v_parts := string_to_array(v_contract, '|');
    select p.oid, p.proname, pg_catalog.md5(pg_catalog.pg_get_functiondef(p.oid)) as body_md5,
      r.rolname as owner_name, p.prosecdef, p.proconfig,
      pg_catalog.regexp_count(pg_catalog.pg_get_functiondef(p.oid), v_old_pattern) as old_count,
      pg_catalog.regexp_count(pg_catalog.pg_get_functiondef(p.oid), v_new_pattern) as new_count
    into v_item
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    join pg_catalog.pg_roles r on r.oid = p.proowner
    where n.nspname = 'public'
      and p.oid = pg_catalog.to_regprocedure(v_parts[2]);

    if not found then
      raise exception 'Required capacity function is missing: %', v_parts[2];
    end if;
    if v_item.proname <> v_parts[1]
       or v_item.body_md5 <> v_parts[3]
       or v_item.owner_name <> 'postgres'
       or not v_item.prosecdef
       or v_item.proconfig is distinct from array[v_parts[5]]::text[]
       or v_item.old_count <> v_parts[4]::integer
       or v_item.new_count <> 0
       or has_function_privilege('anon', v_item.oid, 'EXECUTE')
       or has_function_privilege('authenticated', v_item.oid, 'EXECUTE') then
      raise exception 'Capacity function contract drift; refusing status rewrite for %', v_parts[2];
    end if;

    v_definition := pg_catalog.pg_get_functiondef(v_item.oid);
    v_rewritten := pg_catalog.regexp_replace(
      v_definition,
      v_old_pattern,
      '''submitted'', ''pending_confirmation'', ''confirmed'', ''awaiting_payment'', ''paid''',
      'g'
    );
    if v_rewritten = v_definition
       or pg_catalog.regexp_count(v_rewritten, v_new_pattern) <> v_parts[4]::integer
       or pg_catalog.regexp_count(v_rewritten, v_old_pattern) <> 0 then
      raise exception 'Could not make the reviewed capacity status rewrite for %', v_parts[2];
    end if;
    execute v_rewritten;
    v_found := v_found + 1;
  end loop;

  if v_found <> cardinality(v_expected) then
    raise exception 'Expected to update exactly five capacity functions';
  end if;
end;
$migration$;

-- Postflight checks: all reservation validators and transition locks now use
-- the five active preorder statuses, without changing grants or trigger state.
do $verification$
declare
  v_item record;
  v_expected text[] := array[
    'public._assert_capacity_bucket(uuid)|1',
    'public._assert_order_capacity(uuid)|2',
    'public._guest_preorder_item_fully_booked(date,uuid,uuid,uuid,integer)|1',
    'public._lock_capacity_order_item_row()|4',
    'public._lock_capacity_order_row()|2'
  ];
  v_contract text;
  v_parts text[];
begin
  foreach v_contract in array v_expected loop
    v_parts := string_to_array(v_contract, '|');
    select p.oid, p.proconfig, p.prosecdef, r.rolname as owner_name,
      pg_catalog.regexp_count(pg_catalog.pg_get_functiondef(p.oid),
        $$'submitted'[[:space:]]*,[[:space:]]*'pending_confirmation'[[:space:]]*,[[:space:]]*'confirmed'[[:space:]]*,[[:space:]]*'awaiting_payment'[[:space:]]*,[[:space:]]*'paid'$$) as new_count,
      pg_catalog.regexp_count(pg_catalog.pg_get_functiondef(p.oid),
        $$'submitted'[[:space:]]*,[[:space:]]*'pending_confirmation'[[:space:]]*,[[:space:]]*'awaiting_payment'[[:space:]]*,[[:space:]]*'paid'$$) as old_count
    into v_item
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    join pg_catalog.pg_roles r on r.oid = p.proowner
    where p.oid = pg_catalog.to_regprocedure(v_parts[1])
      and n.nspname = 'public';

    if not found
       or v_item.new_count <> v_parts[2]::integer
       or v_item.old_count <> 0
       or not v_item.prosecdef
       or v_item.owner_name <> 'postgres'
       or v_item.proconfig is distinct from array[
          case when v_parts[1] = 'public._guest_preorder_item_fully_booked(date,uuid,uuid,uuid,integer)'
            then 'search_path=public' else 'search_path=""' end
         ]::text[]
       or has_function_privilege('anon', v_item.oid, 'EXECUTE')
       or has_function_privilege('authenticated', v_item.oid, 'EXECUTE') then
      raise exception 'Capacity status postflight failed for % (owner %, SECURITY DEFINER %, search_path %, new list count % / expected %, old list count %, anon EXECUTE %, authenticated EXECUTE %)',
        v_parts[1], v_item.owner_name, v_item.prosecdef, v_item.proconfig,
        v_item.new_count, v_parts[2], v_item.old_count,
        has_function_privilege('anon', v_item.oid, 'EXECUTE'),
        has_function_privilege('authenticated', v_item.oid, 'EXECUTE');
    end if;
  end loop;

  if (select count(*) from pg_catalog.pg_trigger t
      join pg_catalog.pg_class c on c.oid = t.tgrelid
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and not t.tgisinternal
        and t.tgenabled = 'O'
        and t.tgname = any(array[
          'lock_production_capacity_orders',
          'lock_production_capacity_order_items',
          'lock_production_capacity_definitions',
          'lock_production_capacity_holds',
          'assert_production_capacity_orders',
          'assert_production_capacity_order_items',
          'assert_production_capacity_definitions',
          'assert_production_capacity_holds'
        ])) <> 8 then
    raise exception 'Expected all eight capacity lock/constraint triggers enabled';
  end if;
end;
$verification$;
