-- M4-P5 — Delivery operational lifecycle (four states).
-- Additive timestamps + Delivery-only RPCs. Pickup ready/picked_up RPCs unchanged
-- except: undo Ready also blocks while Out for Delivery / Delivered; mark Picked Up
-- refuses Delivery fulfilment (undo Picked Up still allowed to clear accidental
-- pre-P5 Delivery picked_up_at).
--
-- Delivery states (do not overload picked_up_at):
--   not_ready → ready_at
--             → out_for_delivery_at   (rider handoff)
--             → delivered_at          (completion)
-- Pickup unchanged: ready_at / picked_up_at only.
--
-- No backfill. Existing Delivery picked_up_at (if any) is ignored by Delivery
-- derivation after TS lands; not migrated into Out/Delivered.
--
-- Reverse:
--   drop function public.undo_guest_order_delivered(uuid, uuid);
--   drop function public.mark_guest_order_delivered(uuid, uuid);
--   drop function public.undo_guest_order_out_for_delivery(uuid, uuid);
--   drop function public.mark_guest_order_out_for_delivery(uuid, uuid);
--   restore undo_guest_order_ready / mark_guest_order_picked_up from
--     20260808090000_preview3a1_operational_foundation.sql;
--   alter table public.orders drop column if exists delivered_by;
--   alter table public.orders drop column if exists delivered_at;
--   alter table public.orders drop column if exists out_for_delivery_by;
--   alter table public.orders drop column if exists out_for_delivery_at;

-- ---------------------------------------------------------------------------
-- 1) Timestamps
-- ---------------------------------------------------------------------------

alter table public.orders
  add column if not exists out_for_delivery_at timestamptz,
  add column if not exists out_for_delivery_by uuid
    references public.staff_profiles (id) on delete set null,
  add column if not exists delivered_at timestamptz,
  add column if not exists delivered_by uuid
    references public.staff_profiles (id) on delete set null;

comment on column public.orders.out_for_delivery_at is
  'Delivery only: rider has physically taken the order. Independent of payment. '
  'Not used for Pickup. Distinct from delivered_at.';
comment on column public.orders.out_for_delivery_by is
  'Staff who marked Out for Delivery.';
comment on column public.orders.delivered_at is
  'Delivery only: delivery actually completed. Independent of payment. '
  'Not used for Pickup. Distinct from out_for_delivery_at and picked_up_at.';
comment on column public.orders.delivered_by is
  'Staff who marked Delivered.';

create index if not exists orders_out_for_delivery_at_idx
  on public.orders (out_for_delivery_at)
  where out_for_delivery_at is not null;

create index if not exists orders_delivered_at_idx
  on public.orders (delivered_at)
  where delivered_at is not null;

-- ---------------------------------------------------------------------------
-- 2) undo Ready — also block while Out for Delivery / Delivered
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

-- ---------------------------------------------------------------------------
-- 3) mark Picked Up — refuse Delivery (Pickup path only)
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

-- ---------------------------------------------------------------------------
-- 4) Out for Delivery (Delivery only)
-- ---------------------------------------------------------------------------

create or replace function public.mark_guest_order_out_for_delivery(
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

  select o.*
  into order_row
  from public.orders o
  where o.id = p_order_id
    and o.customer_id is null
  for update;

  if not found then
    raise exception 'Order not found';
  end if;

  if coalesce(order_row.fulfilment_method, 'pickup') <> 'delivery' then
    raise exception 'Out for Delivery is only for Delivery orders';
  end if;

  if order_row.status not in (
    'submitted',
    'pending_confirmation',
    'awaiting_payment',
    'paid'
  ) then
    raise exception 'This order cannot be marked out for delivery';
  end if;

  if order_row.out_for_delivery_at is not null then
    raise exception 'Order is already out for delivery';
  end if;

  if order_row.delivered_at is not null then
    raise exception 'Out for Delivery is not allowed after Delivered';
  end if;

  -- Ready is NOT required (parallel to Pickup: Ready not required before Picked Up).

  update public.orders o
  set
    out_for_delivery_at = now(),
    out_for_delivery_by = p_actor_staff_id,
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
    'order_out_for_delivery',
    p_actor_staff_id,
    jsonb_build_object(
      'out_for_delivery_at', order_row.out_for_delivery_at,
      'was_ready', order_row.ready_at is not null,
      'ready_at', order_row.ready_at
    )
  );

  return order_row;
end;
$$;

create or replace function public.undo_guest_order_out_for_delivery(
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
  previous_at timestamptz;
  previous_by uuid;
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

  select o.*
  into order_row
  from public.orders o
  where o.id = p_order_id
    and o.customer_id is null
  for update;

  if not found then
    raise exception 'Order not found';
  end if;

  if coalesce(order_row.fulfilment_method, 'pickup') <> 'delivery' then
    raise exception 'Out for Delivery is only for Delivery orders';
  end if;

  if order_row.out_for_delivery_at is null then
    raise exception 'Order is not out for delivery';
  end if;

  if order_row.delivered_at is not null then
    raise exception 'Undo Out for Delivery is not allowed while the order is delivered';
  end if;

  previous_at := order_row.out_for_delivery_at;
  previous_by := order_row.out_for_delivery_by;

  update public.orders o
  set
    out_for_delivery_at = null,
    out_for_delivery_by = null,
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
    'order_out_for_delivery_undone',
    p_actor_staff_id,
    jsonb_build_object(
      'previous_out_for_delivery_at', previous_at,
      'previous_out_for_delivery_by', previous_by,
      'ready_at_preserved', order_row.ready_at,
      'ready_by_preserved', order_row.ready_by
    )
  );

  return order_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5) Delivered (Delivery only)
-- ---------------------------------------------------------------------------

create or replace function public.mark_guest_order_delivered(
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

  select o.*
  into order_row
  from public.orders o
  where o.id = p_order_id
    and o.customer_id is null
  for update;

  if not found then
    raise exception 'Order not found';
  end if;

  if coalesce(order_row.fulfilment_method, 'pickup') <> 'delivery' then
    raise exception 'Delivered is only for Delivery orders';
  end if;

  if order_row.status not in (
    'submitted',
    'pending_confirmation',
    'awaiting_payment',
    'paid'
  ) then
    raise exception 'This order cannot be marked delivered';
  end if;

  if order_row.delivered_at is not null then
    raise exception 'Order is already marked delivered';
  end if;

  -- Out for Delivery is NOT required (UI happy path still Ready → Out → Delivered).

  update public.orders o
  set
    delivered_at = now(),
    delivered_by = p_actor_staff_id,
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
    'order_delivered',
    p_actor_staff_id,
    jsonb_build_object(
      'delivered_at', order_row.delivered_at,
      'was_ready', order_row.ready_at is not null,
      'ready_at', order_row.ready_at,
      'was_out_for_delivery', order_row.out_for_delivery_at is not null,
      'out_for_delivery_at', order_row.out_for_delivery_at
    )
  );

  return order_row;
end;
$$;

create or replace function public.undo_guest_order_delivered(
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
  previous_at timestamptz;
  previous_by uuid;
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

  select o.*
  into order_row
  from public.orders o
  where o.id = p_order_id
    and o.customer_id is null
  for update;

  if not found then
    raise exception 'Order not found';
  end if;

  if coalesce(order_row.fulfilment_method, 'pickup') <> 'delivery' then
    raise exception 'Delivered is only for Delivery orders';
  end if;

  if order_row.delivered_at is null then
    raise exception 'Order is not marked delivered';
  end if;

  previous_at := order_row.delivered_at;
  previous_by := order_row.delivered_by;

  update public.orders o
  set
    delivered_at = null,
    delivered_by = null,
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
    'order_delivered_undone',
    p_actor_staff_id,
    jsonb_build_object(
      'previous_delivered_at', previous_at,
      'previous_delivered_by', previous_by,
      'out_for_delivery_at_preserved', order_row.out_for_delivery_at,
      'out_for_delivery_by_preserved', order_row.out_for_delivery_by,
      'ready_at_preserved', order_row.ready_at,
      'ready_by_preserved', order_row.ready_by
    )
  );

  return order_row;
end;
$$;

revoke all on function public.mark_guest_order_out_for_delivery(uuid, uuid) from public;
revoke all on function public.undo_guest_order_out_for_delivery(uuid, uuid) from public;
revoke all on function public.mark_guest_order_delivered(uuid, uuid) from public;
revoke all on function public.undo_guest_order_delivered(uuid, uuid) from public;

grant execute on function public.mark_guest_order_out_for_delivery(uuid, uuid) to authenticated;
grant execute on function public.undo_guest_order_out_for_delivery(uuid, uuid) to authenticated;
grant execute on function public.mark_guest_order_delivered(uuid, uuid) to authenticated;
grant execute on function public.undo_guest_order_delivered(uuid, uuid) to authenticated;
