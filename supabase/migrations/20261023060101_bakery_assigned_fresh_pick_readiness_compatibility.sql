-- Extend the existing physical-stock readiness actions to active WhatsApp
-- pickup/dine-in orders. Keep their signatures and existing EXECUTE ACLs.
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
      and o.fulfilment_method in ('pickup', 'dine_in')
      and o.status in ('submitted', 'pending_confirmation', 'awaiting_payment', 'paid')
      and o.picked_up_at is null
      and o.out_for_delivery_at is null
      and o.delivered_at is null
    for update;

    if not found then
      raise exception 'Fresh Pick is not assigned to an active pickup or dine-in order';
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
      and o.fulfilment_method in ('pickup', 'dine_in')
      and o.status in ('submitted', 'pending_confirmation', 'awaiting_payment', 'paid')
      and o.picked_up_at is null
      and o.out_for_delivery_at is null
      and o.delivered_at is null
    for update;

    if not found then
      raise exception 'Fresh Pick is not assigned to an active pickup or dine-in order';
    end if;
    -- Repeated assigned-stock undo is a no-op, with no duplicate audit event.
    if not stock_row.ready_for_collection then
      return stock_row;
    end if;
  else
    -- Preserve the original unassigned-stock error behavior.
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
