-- M5-P3 — Bakery Ready Authority
-- Harden existing canonical Ready RPCs (role + Mark Ready terminal guards).
-- No new columns. Start-agnostic at SQL (Owner may Ready without Start).
-- Bakery Start requirement is enforced in Bakery app actions only.

-- ---------------------------------------------------------------------------
-- 1) mark_guest_order_ready
-- ---------------------------------------------------------------------------

create or replace function public.mark_guest_order_ready(
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
  if v_role is null or v_role not in ('bakery', 'manager', 'owner') then
    raise exception 'Not authorized to mark ready';
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

  if order_row.status not in (
    'submitted',
    'pending_confirmation',
    'awaiting_payment',
    'paid'
  ) then
    raise exception 'This order cannot be marked ready';
  end if;

  if order_row.picked_up_at is not null
    or order_row.out_for_delivery_at is not null
    or order_row.delivered_at is not null
  then
    raise exception 'This order has already left Bakery';
  end if;

  if order_row.ready_at is not null then
    raise exception 'Order is already marked ready';
  end if;

  update public.orders o
  set
    ready_at = now(),
    ready_by = p_actor_staff_id,
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
    'order_marked_ready',
    p_actor_staff_id,
    jsonb_build_object(
      'ready_at', order_row.ready_at
    )
  );

  return order_row;
end;
$$;

comment on function public.mark_guest_order_ready(uuid, uuid) is
  'M5-P3: Mark guest order Ready. Roles bakery|manager|owner. Start-agnostic (Owner may skip Start). Terminal handoff rejected.';

-- ---------------------------------------------------------------------------
-- 2) undo_guest_order_ready
-- ---------------------------------------------------------------------------

create or replace function public.undo_guest_order_ready(
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
  previous_ready_at timestamptz;
  previous_ready_by uuid;
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
  if v_role is null or v_role not in ('bakery', 'manager', 'owner') then
    raise exception 'Not authorized to undo ready';
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

  if order_row.ready_at is null then
    raise exception 'Order is not marked ready';
  end if;

  if order_row.picked_up_at is not null then
    raise exception 'Undo Ready is not allowed while the order is picked up';
  end if;

  if order_row.out_for_delivery_at is not null then
    raise exception 'Undo Ready is not allowed while the order is out for delivery';
  end if;

  if order_row.delivered_at is not null then
    raise exception 'Undo Ready is not allowed while the order is delivered';
  end if;

  previous_ready_at := order_row.ready_at;
  previous_ready_by := order_row.ready_by;

  update public.orders o
  set
    ready_at = null,
    ready_by = null,
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
    'order_ready_undone',
    p_actor_staff_id,
    jsonb_build_object(
      'previous_ready_at', previous_ready_at,
      'previous_ready_by', previous_ready_by
    )
  );

  return order_row;
end;
$$;

comment on function public.undo_guest_order_ready(uuid, uuid) is
  'M5-P3: Undo guest order Ready. Roles bakery|manager|owner. Preserves production_started_*. Terminal handoff rejected.';
