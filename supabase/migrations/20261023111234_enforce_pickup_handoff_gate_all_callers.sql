-- Make the existing internal handoff implementation the authoritative
-- server-side gate for both Operations and Collection RPC entry points.
-- Keep its signature, SECURITY DEFINER context, owner, grants and audit write.
create or replace function public._mark_guest_order_picked_up_impl(
  p_order_id uuid,
  p_actor_staff_id uuid
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  order_row public.orders;
  v_role text;
  v_has_assigned_stock boolean;
begin
  if p_order_id is null then
    raise exception 'Order is required';
  end if;

  if p_actor_staff_id is null then
    raise exception 'Staff actor is required';
  end if;

  if not exists (
    select 1
    from public.staff_profiles sp
    where sp.id = p_actor_staff_id
  ) then
    raise exception 'Staff actor not found';
  end if;

  v_role := public._staff_role_code(p_actor_staff_id);

  if v_role is null
    or v_role not in (
      'owner',
      'manager',
      'collection',
      'customer_operations',
      'bakery'
    )
  then
    raise exception 'Not authorized to mark picked up';
  end if;

  select o.*
  into order_row
  from public.orders o
  where o.id = p_order_id
    and o.customer_id is null
  for update;

  if not found then
    raise exception 'Order not found';
  end if;

  if coalesce(order_row.fulfilment_method::text, 'pickup') not in ('pickup', 'dine_in') then
    raise exception 'Delivery orders use Out for Delivery / Delivered, not Picked Up';
  end if;

  if order_row.status::text <> 'paid'
    or order_row.payment_status::text <> 'paid'
    or not public._fresh_pick_order_is_fully_paid(p_order_id)
  then
    raise exception 'A fully paid order is required before pickup handoff';
  end if;

  if order_row.picked_up_at is not null or order_row.delivered_at is not null then
    raise exception 'Order is already handed off';
  end if;

  v_has_assigned_stock := exists (
    select 1
    from public.extra_stock e
    where e.order_id = p_order_id
       or e.id = order_row.extra_stock_id
  );

  if v_has_assigned_stock then
    if public._bakery_order_fresh_pick_allocation_state(p_order_id) <> 'fully_covered' then
      raise exception 'Every ordered cake quantity must be assigned to Fresh Pick stock';
    end if;
    if exists (
      select 1
      from public.extra_stock e
      where (e.order_id = p_order_id or e.id = order_row.extra_stock_id)
        and e.ready_for_collection is distinct from true
    ) then
      raise exception 'Every assigned Fresh Pick item must be ready for collection';
    end if;
  elsif order_row.ready_at is null then
    raise exception 'Order must be ready before pickup handoff';
  end if;

  -- Keep the existing one-time handoff and timeline audit behavior unchanged.
  update public.orders o
  set
    picked_up_at = now(),
    picked_up_by = p_actor_staff_id,
    updated_by = p_actor_staff_id,
    updated_at = now()
  where o.id = p_order_id
  returning * into order_row;

  insert into public.order_timeline_events (
    order_id,
    event_type,
    actor_staff_id,
    metadata
  )
  values (
    p_order_id,
    'order_picked_up',
    p_actor_staff_id,
    jsonb_build_object(
      'picked_up_at', order_row.picked_up_at,
      'was_ready', order_row.ready_at is not null,
      'ready_at', order_row.ready_at
    )
  );

  return order_row;
end;
$$;

comment on function public._mark_guest_order_picked_up_impl(uuid, uuid) is
  'Internal handoff implementation with payment, order, fulfillment, readiness, Fresh Pick allocation, stock readiness, role and duplicate-handoff checks shared by Operations and Collection.';
