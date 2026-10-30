-- Extend the existing automatic Fresh Pick readiness reconciliation to
-- customer website Delivery orders. Preserve the established settlement,
-- exact-allocation, physical-readiness, lifecycle, undo-hold, and audit paths.
-- No rows are rewritten by this migration.

create or replace function public._sync_fresh_pick_order_readiness_unheld_impl(
  p_order_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  order_row public.orders;
  v_ready_at timestamptz;
  v_stock_ids uuid[];
  v_item_quantity bigint;
  v_fully_paid boolean;
  v_stock_ready boolean;
  v_order_eligible boolean;
  v_previous_ready_at timestamptz;
  v_previous_ready_by uuid;
begin
  if p_order_id is null then
    return;
  end if;

  select o.* into order_row
  from public.orders o
  where o.id = p_order_id
  for update;

  if not found
    or order_row.customer_id is not null
    or order_row.order_source is distinct from 'customer_website'
    or order_row.extra_stock_id is null
  then
    return;
  end if;

  v_order_eligible :=
    order_row.fulfilment_method in ('pickup', 'delivery', 'dine_in')
    and order_row.status in ('submitted', 'pending_confirmation', 'awaiting_payment', 'paid')
    and order_row.picked_up_at is null
    and order_row.out_for_delivery_at is null
    and order_row.delivered_at is null
    and order_row.production_started_at is null;

  v_fully_paid := public._fresh_pick_order_is_fully_paid(p_order_id);
  v_stock_ready := public._fresh_pick_order_items_are_ready(p_order_id);

  if v_order_eligible and v_fully_paid and v_stock_ready then
    if order_row.ready_at is not null then
      return;
    end if;

    select array_agg(e.id order by e.id)
    into v_stock_ids
    from public.extra_stock e
    where e.order_id = p_order_id;

    select coalesce(sum(oi.quantity), 0)::bigint
    into v_item_quantity
    from public.order_items oi
    where oi.order_id = p_order_id;

    v_ready_at := clock_timestamp();
    update public.orders o
    set ready_at = v_ready_at,
        ready_by = null,
        updated_at = v_ready_at
    where o.id = p_order_id
      and o.ready_at is null
    returning * into order_row;

    if not found then
      return;
    end if;

    insert into public.order_timeline_events (
      order_id, event_type, actor_staff_id, metadata
    ) values (
      p_order_id,
      'order_marked_ready',
      null,
      jsonb_build_object(
        'ready_at', order_row.ready_at,
        'source', 'fully_paid_prepared_fresh_pick_stock',
        'extra_stock_ids', to_jsonb(coalesce(v_stock_ids, array[]::uuid[])),
        'item_quantity', v_item_quantity,
        'amount_due', public.order_amount_due(p_order_id),
        'net_received', public.order_net_received(p_order_id)
      )
    );
    return;
  end if;

  -- Revoke only an unhanded Fresh Pick readiness assertion. Completed handoffs
  -- remain historical facts if payment is corrected or refunded afterward.
  if order_row.ready_at is null then
    return;
  end if;

  if v_fully_paid and (
    order_row.picked_up_at is not null
    or order_row.out_for_delivery_at is not null
    or order_row.delivered_at is not null
  ) then
    return;
  end if;

  v_previous_ready_at := order_row.ready_at;
  v_previous_ready_by := order_row.ready_by;

  update public.orders o
  set ready_at = null,
      ready_by = null,
      updated_at = clock_timestamp()
  where o.id = p_order_id
    and o.ready_at is not null;

  if not found then
    return;
  end if;

  insert into public.order_timeline_events (
    order_id, event_type, actor_staff_id, metadata
  ) values (
    p_order_id,
    'order_ready_undone',
    null,
    jsonb_build_object(
      'previous_ready_at', v_previous_ready_at,
      'previous_ready_by', v_previous_ready_by,
      'reason', case
        when not v_fully_paid then 'fresh_pick_not_fully_settled'
        when not v_stock_ready then 'fresh_pick_stock_not_ready'
        else 'fresh_pick_order_not_eligible'
      end,
      'source', 'fresh_pick_readiness_reconciliation',
      'amount_due', public.order_amount_due(p_order_id),
      'net_received', public.order_net_received(p_order_id)
    )
  );
end;
$$;

revoke all on function public._sync_fresh_pick_order_readiness_unheld_impl(uuid)
  from public, anon, authenticated, service_role;

-- Keep the current actor binding, role checks, stock-first row locking,
-- lifecycle guards, idempotence and stock event audit. Delivery is allowed
-- only for customer-website Fresh Pick orders; WhatsApp eligibility remains
-- unchanged for Pickup and Dine-in.
create or replace function public.mark_extra_stock_ready_for_collection(
  p_extra_stock_id uuid,
  p_actor_staff_id uuid,
  p_reason text default null
)
returns public.extra_stock
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_actor uuid;
  stock_row public.extra_stock;
  linked_order public.orders;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  v_actor := public._bind_rpc_actor(p_actor_staff_id);
  perform public._require_rpc_roles(
    v_actor,
    array['bakery', 'manager', 'owner'],
    'Not authorized to mark a Fresh Pick ready for collection.'
  );

  select e.* into stock_row
  from public.extra_stock e
  where e.id = p_extra_stock_id
  for update;

  if not found then raise exception 'Fresh Pick not found'; end if;
  if stock_row.lifecycle <> 'confirmed' then
    raise exception 'Only a confirmed Fresh Pick can be marked ready';
  end if;
  if stock_row.cut_into_slices_at is not null then
    raise exception 'A Fresh Pick cut into slices cannot be marked ready';
  end if;
  if public.extra_walk_in_hold_is_active(stock_row.walk_in_held_until, clock_timestamp()) then
    raise exception 'A Fresh Pick on walk-in hold cannot be marked ready';
  end if;

  if stock_row.sold_at is not null or stock_row.order_id is not null then
    if stock_row.sold_at is null or stock_row.order_id is null then
      raise exception 'Fresh Pick sale assignment is incomplete';
    end if;

    select o.* into linked_order
    from public.orders o
    where o.id = stock_row.order_id
      and o.extra_stock_id is not null
      and o.customer_id is null
      and o.order_source in ('customer_website', 'whatsapp')
      and (
        o.fulfilment_method in ('pickup', 'dine_in')
        or (o.fulfilment_method = 'delivery' and o.order_source = 'customer_website')
      )
      and o.status in ('submitted', 'pending_confirmation', 'awaiting_payment', 'paid')
      and o.picked_up_at is null
      and o.out_for_delivery_at is null
      and o.delivered_at is null
    for update;

    if not found then
      raise exception 'Fresh Pick is not assigned to an active customer order';
    end if;
  else
    if stock_row.pickup_through_at is null
      or clock_timestamp() > stock_row.pickup_through_at then
      raise exception 'This Fresh Pick order window has expired';
    end if;
  end if;

  if stock_row.ready_for_collection then
    return stock_row;
  end if;

  update public.extra_stock e
  set ready_for_collection = true,
      updated_at = clock_timestamp()
  where e.id = p_extra_stock_id
  returning * into stock_row;

  perform public._record_extra_stock_event(
    p_extra_stock_id,
    'ready_for_collection',
    v_actor,
    jsonb_build_object(
      'reason', v_reason,
      'assigned_order_id', stock_row.order_id,
      'physical_readiness_only', stock_row.order_id is not null
    )
  );
  return stock_row;
end;
$function$;

create or replace function public.undo_extra_stock_ready_for_collection(
  p_extra_stock_id uuid,
  p_actor_staff_id uuid,
  p_reason text default null
)
returns public.extra_stock
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_actor uuid;
  stock_row public.extra_stock;
  linked_order public.orders;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  v_actor := public._bind_rpc_actor(p_actor_staff_id);
  perform public._require_rpc_roles(
    v_actor,
    array['bakery', 'manager', 'owner'],
    'Not authorized to undo Fresh Pick readiness.'
  );

  select e.* into stock_row
  from public.extra_stock e
  where e.id = p_extra_stock_id
  for update;

  if not found then raise exception 'Fresh Pick not found'; end if;
  if stock_row.lifecycle <> 'confirmed'
     or stock_row.cut_into_slices_at is not null then
    raise exception 'This Fresh Pick is no longer eligible for a readiness change';
  end if;

  if stock_row.sold_at is not null or stock_row.order_id is not null then
    if stock_row.sold_at is null or stock_row.order_id is null then
      raise exception 'Fresh Pick sale assignment is incomplete';
    end if;

    select o.* into linked_order
    from public.orders o
    where o.id = stock_row.order_id
      and o.extra_stock_id is not null
      and o.customer_id is null
      and o.order_source in ('customer_website', 'whatsapp')
      and (
        o.fulfilment_method in ('pickup', 'dine_in')
        or (o.fulfilment_method = 'delivery' and o.order_source = 'customer_website')
      )
      and o.status in ('submitted', 'pending_confirmation', 'awaiting_payment', 'paid')
      and o.picked_up_at is null
      and o.out_for_delivery_at is null
      and o.delivered_at is null
    for update;

    if not found then
      raise exception 'Fresh Pick is not assigned to an active customer order';
    end if;
    if not stock_row.ready_for_collection then
      return stock_row;
    end if;
  else
    if not stock_row.ready_for_collection then
      raise exception 'This Fresh Pick is not marked ready';
    end if;
  end if;

  update public.extra_stock e
  set ready_for_collection = false,
      updated_at = now()
  where e.id = p_extra_stock_id
  returning * into stock_row;

  perform public._record_extra_stock_event(
    p_extra_stock_id,
    'ready_for_collection_undone',
    v_actor,
    jsonb_build_object('reason', v_reason)
  );
  return stock_row;
end;
$function$;
