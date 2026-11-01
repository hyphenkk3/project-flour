-- Repair the preserved legacy Fresh Pick submission overload.
-- The legacy 10-argument contract sells and references the selected stock in
-- orders.extra_stock_id, but historically omitted extra_stock.order_id. The
-- deferred Production constraint requires both directions to agree.
--
-- Keep this narrowly scoped: the RPC signature, grants, owner, security mode,
-- search_path, validation, snapshots and transaction boundary remain intact.
-- CREATE OR REPLACE preserves the existing function identity and ACL.
DO $migration$
DECLARE
  v_function_oid regprocedure :=
    'public.submit_guest_extra_order(text,text,text,date,time without time zone,text,uuid,boolean,boolean,jsonb)'::regprocedure;
  v_definition text;
  v_anchor text := E'  returning * into new_order;\n\n  insert into public.order_items (';
  v_replacement text := E'  returning * into new_order;\n\n  -- Complete the reverse physical-stock link required by the deferred\n  -- Fresh Pick integrity constraint. The stock row was already locked and\n  -- validated above; this remains in the same checkout transaction.\n  update public.extra_stock e\n  set order_id = new_order.id, updated_at = now()\n  where e.id = p_extra_stock_id\n    and e.order_id is null\n    and e.sold_at is not null\n    and e.lifecycle = ''confirmed''\n    and e.cut_into_slices_at is null;\n  get diagnostics v_updated = row_count;\n  if v_updated <> 1 then\n    raise exception ''This Extra cake has already been sold'';\n  end if;\n\n  insert into public.order_items (';
  v_occurrences integer;
BEGIN
  IF v_function_oid IS NULL THEN
    RAISE EXCEPTION 'Expected legacy 10-argument Fresh Pick RPC is missing';
  END IF;

  IF (SELECT prosecdef FROM pg_proc WHERE oid = v_function_oid) IS DISTINCT FROM true
     OR (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid = v_function_oid) <> 'postgres'
     OR (SELECT proconfig FROM pg_proc WHERE oid = v_function_oid) IS DISTINCT FROM ARRAY['search_path=public']::text[]
     OR NOT has_function_privilege('anon', v_function_oid, 'EXECUTE')
     OR NOT has_function_privilege('authenticated', v_function_oid, 'EXECUTE')
     OR NOT has_function_privilege('service_role', v_function_oid, 'EXECUTE')
     OR NOT has_function_privilege('postgres', v_function_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'Legacy Fresh Pick RPC ownership, security, or grants differ from the reviewed Production baseline';
  END IF;

  v_definition := pg_get_functiondef(v_function_oid);
  IF position('set order_id = new_order.id' IN v_definition) > 0 THEN
    RAISE EXCEPTION 'Legacy Fresh Pick stock-link correction is already present; refusing duplicate patch';
  END IF;

  v_occurrences :=
    (length(v_definition) - length(replace(v_definition, v_anchor, ''))) / length(v_anchor);
  IF v_occurrences <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one reviewed order-insert anchor in legacy RPC; found %', v_occurrences;
  END IF;

  v_definition := replace(v_definition, v_anchor, v_replacement);
  EXECUTE v_definition;

  IF position('set order_id = new_order.id' IN pg_get_functiondef(v_function_oid)) = 0 THEN
    RAISE EXCEPTION 'Legacy Fresh Pick stock-link correction did not persist';
  END IF;
END;
$migration$;
