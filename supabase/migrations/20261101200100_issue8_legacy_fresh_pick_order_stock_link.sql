DO $migration$
DECLARE
  v_function_oid oid := to_regprocedure(
    'public.submit_guest_extra_order(text,text,text,date,time without time zone,text,uuid,boolean,boolean,jsonb)'
  )::oid;
  v_extended_oid oid := to_regprocedure(
    'public.submit_guest_extra_order(text,text,text,date,time without time zone,text,uuid,boolean,boolean,jsonb,jsonb,uuid[],public.fulfilment_method,jsonb,jsonb,jsonb)'
  )::oid;
  v_definition text;
  v_anchor text := E'  returning * into new_order;\n\n  insert into public.order_items (';
  v_replacement text := E'  returning * into new_order;\n\n  -- Complete the reverse physical-stock link required by the deferred\n  -- Fresh Pick integrity constraint. The stock row was already locked and\n  -- validated above; this remains in the same checkout transaction.\n  update public.extra_stock e\n  set order_id = new_order.id, updated_at = now()\n  where e.id = p_extra_stock_id\n    and e.order_id is null\n    and e.sold_at is not null\n    and e.lifecycle = ''confirmed''\n    and e.cut_into_slices_at is null;\n  get diagnostics v_updated = row_count;\n  if v_updated <> 1 then\n    raise exception ''This Extra cake has already been sold'';\n  end if;\n\n  insert into public.order_items (';
  v_occurrences integer;
  v_owner name;
  v_secdef boolean;
  v_config text[];
BEGIN
  IF v_extended_oid IS NULL THEN
    RAISE EXCEPTION 'Expected extended Fresh Pick RPC is missing';
  END IF;

  -- Fail closed if the deferred bidirectional stock/order integrity checks
  -- or their validated foreign keys are absent or no longer deferred.
  IF NOT EXISTS (
       SELECT 1 FROM pg_trigger t
       WHERE t.tgrelid='public.orders'::regclass
         AND t.tgname='orders_size_availability_final'
         AND t.tgconstraint <> 0 AND t.tgdeferrable AND t.tginitdeferred
     )
     OR NOT EXISTS (
       SELECT 1 FROM pg_trigger t
       WHERE t.tgrelid='public.order_items'::regclass
         AND t.tgname='order_items_stock_linkage_final'
         AND t.tgconstraint <> 0 AND t.tgdeferrable AND t.tginitdeferred
     )
     OR NOT EXISTS (
       SELECT 1 FROM pg_constraint c
       WHERE c.conrelid='public.orders'::regclass
         AND c.conname='orders_extra_stock_id_fkey'
         AND c.contype='f' AND c.convalidated
     )
     OR NOT EXISTS (
       SELECT 1 FROM pg_constraint c
       WHERE c.conrelid='public.extra_stock'::regclass
         AND c.conname='extra_stock_order_id_fkey'
         AND c.contype='f' AND c.convalidated
     ) THEN
    RAISE EXCEPTION 'Required deferred stock/order integrity triggers or validated foreign keys differ from the reviewed baseline';
  END IF;

  SELECT r.rolname,p.prosecdef,p.proconfig
    INTO v_owner,v_secdef,v_config
  FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner WHERE p.oid=v_extended_oid;
  IF v_owner IS DISTINCT FROM 'postgres'
     OR v_secdef IS DISTINCT FROM true
     OR v_config IS DISTINCT FROM ARRAY['search_path=public']::text[]
     OR NOT has_function_privilege('postgres',v_extended_oid,'EXECUTE')
     OR NOT has_function_privilege('anon',v_extended_oid,'EXECUTE')
     OR NOT has_function_privilege('authenticated',v_extended_oid,'EXECUTE')
     OR NOT has_function_privilege('service_role',v_extended_oid,'EXECUTE') THEN
    RAISE EXCEPTION 'Extended Fresh Pick RPC identity, security, or grants differ from the reviewed baseline';
  END IF;

  -- Actual DEV deliberately starts without this overload. In that supported
  -- state, record this migration as executed without manufacturing a dummy RPC.
  IF v_function_oid IS NULL THEN
    RAISE NOTICE 'Legacy 10-argument Fresh Pick RPC absent; no legacy body patch required';
    RETURN;
  END IF;

  SELECT r.rolname,p.prosecdef,p.proconfig
    INTO v_owner,v_secdef,v_config
  FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner WHERE p.oid=v_function_oid;
  IF v_owner IS DISTINCT FROM 'postgres'
     OR v_secdef IS DISTINCT FROM true
     OR v_config IS DISTINCT FROM ARRAY['search_path=public']::text[]
     OR NOT has_function_privilege('postgres',v_function_oid,'EXECUTE')
     OR NOT has_function_privilege('anon',v_function_oid,'EXECUTE')
     OR NOT has_function_privilege('authenticated',v_function_oid,'EXECUTE')
     OR NOT has_function_privilege('service_role',v_function_oid,'EXECUTE')
     OR (SELECT pronargs FROM pg_proc WHERE oid=v_function_oid) <> 10
     OR (SELECT pronargdefaults FROM pg_proc WHERE oid=v_function_oid) <> 3 THEN
    RAISE EXCEPTION 'Legacy Fresh Pick RPC ownership, security, signature, or grants differ from the reviewed Production baseline';
  END IF;

  v_definition := pg_get_functiondef(v_function_oid);
  IF md5(v_definition) IS DISTINCT FROM 'c9164af3edd6899c6c956e71af434cf4' THEN
    RAISE EXCEPTION 'Legacy RPC definition is not the reviewed post-catalogue-patch body';
  END IF;
  IF position('set order_id = new_order.id' IN v_definition) > 0 THEN
    RAISE EXCEPTION 'Legacy Fresh Pick stock-link correction is already present; refusing duplicate patch';
  END IF;

  v_occurrences :=
    (length(v_definition) - length(replace(v_definition,v_anchor,''))) / length(v_anchor);
  IF v_occurrences <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one reviewed order-insert anchor in legacy RPC; found %',v_occurrences;
  END IF;

  v_definition := replace(v_definition,v_anchor,v_replacement);
  EXECUTE v_definition;

  IF md5(pg_get_functiondef(v_function_oid)) IS DISTINCT FROM '0046749a0cfacff63de706567519438c'
     OR position('set order_id = new_order.id' IN pg_get_functiondef(v_function_oid)) = 0
     OR (SELECT proowner FROM pg_proc WHERE oid=v_function_oid) IS DISTINCT FROM (SELECT oid FROM pg_roles WHERE rolname='postgres')
     OR NOT (SELECT prosecdef FROM pg_proc WHERE oid=v_function_oid)
     OR (SELECT proconfig FROM pg_proc WHERE oid=v_function_oid) IS DISTINCT FROM ARRAY['search_path=public']::text[]
     OR NOT has_function_privilege('anon',v_function_oid,'EXECUTE')
     OR NOT has_function_privilege('authenticated',v_function_oid,'EXECUTE')
     OR NOT has_function_privilege('service_role',v_function_oid,'EXECUTE') THEN
    RAISE EXCEPTION 'Legacy Fresh Pick stock-link correction or function metadata verification failed';
  END IF;
END;
$migration$;
