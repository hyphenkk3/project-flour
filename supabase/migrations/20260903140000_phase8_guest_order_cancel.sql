-- Phase 8 — guest order cancellation (lifecycle).
-- Focused RPC only. Does not add a second lifecycle column.
-- Cancelled rows are retained with history. FOR UPDATE prevents
-- conflicting payment / production transitions.

create or replace function public.cancel_guest_order(
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
  v_previous_status text;
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
      'customer_operations'
    )
  then
    raise exception 'Not authorized to cancel this order';
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

  if order_row.status = 'cancelled' then
    raise exception 'Order is already cancelled';
  end if;

  if (
    order_row.picked_up_at is not null
    or order_row.delivered_at is not null
  )
    and v_role not in ('owner', 'manager')
  then
    raise exception
      'Completed orders cannot be cancelled without Manager or Owner override';
  end if;

  v_previous_status := order_row.status;

  update public.orders o
  set
    status = 'cancelled',
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
    'order_cancelled',
    p_actor_staff_id,
    jsonb_build_object(
      'previous_status', v_previous_status,
      'picked_up_at', order_row.picked_up_at,
      'delivered_at', order_row.delivered_at,
      'ready_at', order_row.ready_at
    )
  );

  return order_row;
end;
$$;

comment on function public.cancel_guest_order(uuid, uuid) is
  'Cancel a guest Whole Cake order. Roles owner|manager|customer_operations. '
  'Retains the row and history. Completed orders require owner|manager.';

revoke all on function public.cancel_guest_order(uuid, uuid)
  from public, anon;
grant execute on function public.cancel_guest_order(uuid, uuid)
  to authenticated;
