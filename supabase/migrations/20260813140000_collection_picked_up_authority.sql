-- Live Collection workspace activation
-- Harden canonical Picked Up RPCs with role gates for Collection desk.
-- Allowed: owner | manager | collection
-- Denied: bakery | customer_operations | other
-- Preserve guest-only, pickup-only (mark), timeline, Owner Ops compatibility.
-- Ready is NOT required at SQL (Owner may still Collect without Ready).
-- Collection UI enforces Ready before Mark Collected.
-- No new columns. No Arrive / Verify RPCs.

-- ---------------------------------------------------------------------------
-- 1) mark_guest_order_picked_up
-- ---------------------------------------------------------------------------

create or replace function public.mark_guest_order_picked_up(
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
begin
  if p_order_id is null then
    raise exception 'Order is required';
  end if;
  if p_actor_staff_id is null then
    raise exception 'Staff actor is required';
  end if;

  if not exists (
    select 1 from public.staff_profiles sp where sp.id = p_actor_staff_id
  ) then
    raise exception 'Staff actor not found';
  end if;

  v_role := public._staff_role_code(p_actor_staff_id);
  if v_role is null or v_role not in ('owner', 'manager', 'collection') then
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

  if coalesce(order_row.fulfilment_method, 'pickup') = 'delivery' then
    raise exception 'Delivery orders use Out for Delivery / Delivered, not Picked Up';
  end if;

  if order_row.status not in (
    'submitted',
    'pending_confirmation',
    'awaiting_payment',
    'paid'
  ) then
    raise exception 'This order cannot be marked picked up';
  end if;

  if order_row.picked_up_at is not null then
    raise exception 'Order is already marked picked up';
  end if;

  -- Ready is NOT required before Picked Up (Owner Ops compatibility).
  -- Collection workspace enforces Ready in app actions only.

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
  ) values (
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

comment on function public.mark_guest_order_picked_up(uuid, uuid) is
  'Collection activation: Mark guest Pickup order Picked Up. Roles owner|manager|collection. Ready not required at SQL. Delivery refused.';

-- ---------------------------------------------------------------------------
-- 2) undo_guest_order_picked_up
-- ---------------------------------------------------------------------------

create or replace function public.undo_guest_order_picked_up(
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
  previous_picked_up_at timestamptz;
  previous_picked_up_by uuid;
  v_role text;
begin
  if p_order_id is null then
    raise exception 'Order is required';
  end if;
  if p_actor_staff_id is null then
    raise exception 'Staff actor is required';
  end if;

  if not exists (
    select 1 from public.staff_profiles sp where sp.id = p_actor_staff_id
  ) then
    raise exception 'Staff actor not found';
  end if;

  v_role := public._staff_role_code(p_actor_staff_id);
  if v_role is null or v_role not in ('owner', 'manager', 'collection') then
    raise exception 'Not authorized to undo picked up';
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

  if coalesce(order_row.fulfilment_method, 'pickup') = 'delivery' then
    raise exception 'Delivery orders use Out for Delivery / Delivered, not Picked Up';
  end if;

  if order_row.picked_up_at is null then
    raise exception 'Order is not marked picked up';
  end if;

  previous_picked_up_at := order_row.picked_up_at;
  previous_picked_up_by := order_row.picked_up_by;

  -- Preserve ready_at / ready_by.
  update public.orders o
  set
    picked_up_at = null,
    picked_up_by = null,
    updated_by = p_actor_staff_id,
    updated_at = now()
  where o.id = p_order_id
  returning * into order_row;

  insert into public.order_timeline_events (
    order_id,
    event_type,
    actor_staff_id,
    metadata
  ) values (
    p_order_id,
    'order_picked_up_undone',
    p_actor_staff_id,
    jsonb_build_object(
      'previous_picked_up_at', previous_picked_up_at,
      'previous_picked_up_by', previous_picked_up_by,
      'ready_at_preserved', order_row.ready_at,
      'ready_by_preserved', order_row.ready_by
    )
  );

  return order_row;
end;
$$;

comment on function public.undo_guest_order_picked_up(uuid, uuid) is
  'Collection activation: Undo guest Pickup Picked Up. Roles owner|manager|collection. Preserves Ready. Delivery refused.';

revoke all on function public.mark_guest_order_picked_up(uuid, uuid) from public;
revoke all on function public.undo_guest_order_picked_up(uuid, uuid) from public;

grant execute on function public.mark_guest_order_picked_up(uuid, uuid) to authenticated;
grant execute on function public.undo_guest_order_picked_up(uuid, uuid) to authenticated;
grant execute on function public.mark_guest_order_picked_up(uuid, uuid) to service_role;
grant execute on function public.undo_guest_order_picked_up(uuid, uuid) to service_role;
