-- Post-payment one-time customer change guard.
-- Uses existing orders.post_payment_customer_change_* and
-- post_payment_change_override_* columns. Does not add a second lifecycle.

create or replace function public.guard_post_payment_customer_change(
  p_order_id uuid,
  p_actor_staff_id uuid,
  p_override boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  order_row public.orders;
  v_role text;
  v_now timestamptz := now();
  v_outcome text;
begin
  if p_order_id is null then
    raise exception 'Order is required';
  end if;
  if p_actor_staff_id is null then
    raise exception 'Staff actor is required';
  end if;

  v_role := public._staff_role_code(p_actor_staff_id);
  if v_role is null
    or v_role not in ('owner', 'manager', 'customer_operations')
  then
    raise exception 'Not authorized to change this order';
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

  if order_row.status is distinct from 'paid' then
    return jsonb_build_object(
      'outcome', 'not_applicable',
      'count', coalesce(order_row.post_payment_customer_change_count, 0)
    );
  end if;

  if p_override then
    if v_role not in ('owner', 'manager') then
      raise exception
        'Only Manager or Owner can override the one-time post-payment customer change restriction.';
    end if;

    update public.orders o
    set
      post_payment_customer_change_count =
        case
          when coalesce(o.post_payment_customer_change_count, 0) = 0 then 1
          else o.post_payment_customer_change_count
        end,
      post_payment_customer_change_used_at =
        coalesce(o.post_payment_customer_change_used_at, v_now),
      post_payment_change_override_at = v_now,
      post_payment_change_override_by = p_actor_staff_id,
      updated_by = p_actor_staff_id,
      updated_at = v_now
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
      'post_payment_customer_change_override',
      p_actor_staff_id,
      jsonb_build_object(
        'count', order_row.post_payment_customer_change_count,
        'intent', 'amend'
      )
    );

    v_outcome := 'overridden';
  else
    if coalesce(order_row.post_payment_customer_change_count, 0) >= 1 then
      raise exception
        'The one-time post-payment customer change has already been used. Manager or Owner override is required for any further change or cancellation.';
    end if;

    update public.orders o
    set
      post_payment_customer_change_count = 1,
      post_payment_customer_change_used_at = v_now,
      updated_by = p_actor_staff_id,
      updated_at = v_now
    where o.id = p_order_id
      and coalesce(o.post_payment_customer_change_count, 0) = 0
    returning * into order_row;

    if not found then
      raise exception
        'The one-time post-payment customer change has already been used. Manager or Owner override is required for any further change or cancellation.';
    end if;

    insert into public.order_timeline_events (
      order_id,
      event_type,
      actor_staff_id,
      metadata
    )
    values (
      p_order_id,
      'post_payment_customer_change',
      p_actor_staff_id,
      jsonb_build_object('count', 1, 'intent', 'amend')
    );

    v_outcome := 'consumed';
  end if;

  return jsonb_build_object(
    'outcome', v_outcome,
    'count', coalesce(order_row.post_payment_customer_change_count, 0),
    'used_at', order_row.post_payment_customer_change_used_at,
    'override_at', order_row.post_payment_change_override_at
  );
end;
$$;

comment on function public.guard_post_payment_customer_change(uuid, uuid, boolean) is
  'Lock a paid guest order and consume or override the one-time post-payment customer change. '
  'Unpaid orders are a no-op. Concurrent first changes cannot both succeed.';

revoke all on function public.guard_post_payment_customer_change(uuid, uuid, boolean)
  from public, anon;
grant execute on function public.guard_post_payment_customer_change(uuid, uuid, boolean)
  to authenticated;

drop function if exists public.cancel_guest_order(uuid, uuid);

create or replace function public.cancel_guest_order(
  p_order_id uuid,
  p_actor_staff_id uuid,
  p_override boolean default false
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
  v_now timestamptz := now();
  v_change_used boolean;
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

  v_change_used :=
    order_row.status = 'paid'
    and coalesce(order_row.post_payment_customer_change_count, 0) >= 1;

  if v_change_used then
    if not coalesce(p_override, false) then
      raise exception
        'The one-time post-payment customer change has already been used. Manager or Owner override is required for any further change or cancellation.';
    end if;
    if v_role not in ('owner', 'manager') then
      raise exception
        'Only Manager or Owner can override the one-time post-payment customer change restriction.';
    end if;
  end if;

  v_previous_status := order_row.status;

  update public.orders o
  set
    status = 'cancelled',
    post_payment_change_override_at =
      case
        when v_change_used then v_now
        else o.post_payment_change_override_at
      end,
    post_payment_change_override_by =
      case
        when v_change_used then p_actor_staff_id
        else o.post_payment_change_override_by
      end,
    updated_by = p_actor_staff_id,
    updated_at = v_now
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
      'ready_at', order_row.ready_at,
      'post_payment_change_used', v_change_used,
      'post_payment_change_override', v_change_used
    )
  );

  if v_change_used then
    insert into public.order_timeline_events (
      order_id,
      event_type,
      actor_staff_id,
      metadata
    )
    values (
      p_order_id,
      'post_payment_customer_change_override',
      p_actor_staff_id,
      jsonb_build_object('intent', 'cancel')
    );
  end if;

  return order_row;
end;
$$;

comment on function public.cancel_guest_order(uuid, uuid, boolean) is
  'Cancel a guest Whole Cake order. Roles owner|manager|customer_operations. '
  'Paid orders that already used the one-time post-payment change require Manager/Owner override. '
  'Completed orders require owner|manager.';

revoke all on function public.cancel_guest_order(uuid, uuid, boolean)
  from public, anon;
grant execute on function public.cancel_guest_order(uuid, uuid, boolean)
  to authenticated;
