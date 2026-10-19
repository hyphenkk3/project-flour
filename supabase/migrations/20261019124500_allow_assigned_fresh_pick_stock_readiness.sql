-- Allow Bakery staff to record physical readiness after a Fresh Pick has
-- already been assigned to a customer order. The existing deferred readiness
-- reconciler still decides whether the order itself may enter Collection:
-- full net settlement and all linked physical units must be ready.
-- No order or inventory rows are backfilled by this migration.

create or replace function public.mark_extra_stock_ready_for_collection(
  p_extra_stock_id uuid,
  p_actor_staff_id uuid,
  p_reason text default null
)
returns public.extra_stock
language plpgsql
security definer
set search_path = public
as $$
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
      -- Orders can contain several Fresh Pick units; extra_stock.order_id is
      -- the per-unit linkage while orders.extra_stock_id identifies the
      -- Fresh Pick order family.
      and o.extra_stock_id is not null
      and o.customer_id is null
      and o.order_source = 'customer_website'
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

  -- A repeated request is a no-op. The row lock makes concurrent calls
  -- serialize, so only the first transition records an audit event.
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
$$;

revoke all on function public.mark_extra_stock_ready_for_collection(uuid, uuid, text)
  from public, anon;
grant execute on function public.mark_extra_stock_ready_for_collection(uuid, uuid, text)
  to authenticated, service_role;
