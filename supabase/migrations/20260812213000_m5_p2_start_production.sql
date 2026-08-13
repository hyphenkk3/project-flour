-- M5-P2 — Start Production (whole-order)
-- Additive. Does not change Owner Ready RPCs or fabricate Start on Ready.
--
-- Start eligibility (Product lock):
--   guest only
--   status IN ('awaiting_payment', 'paid')
--   not already started / ready / terminal handoff
--   actor role IN ('bakery', 'manager', 'owner')
--
-- Undo Start is not payment-gated. Allowed while started, not Ready, not terminal.

-- ---------------------------------------------------------------------------
-- 1) Schema
-- ---------------------------------------------------------------------------

alter table public.orders
  add column if not exists production_started_at timestamptz,
  add column if not exists production_started_by uuid
    references public.staff_profiles (id) on delete set null;

comment on column public.orders.production_started_at is
  'Whole-order Start Production timestamp. Independent of payment. Not fabricated when Ready skips Start.';

comment on column public.orders.production_started_by is
  'Staff who started production. Cleared only by Undo Start. Preserved through Ready / Undo Ready.';

create index if not exists orders_production_started_at_idx
  on public.orders (production_started_at)
  where production_started_at is not null;

-- ---------------------------------------------------------------------------
-- 2) RPCs
-- ---------------------------------------------------------------------------

create or replace function public.mark_guest_order_production_started(
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
    raise exception 'Not authorized to start production';
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

  if order_row.status not in ('awaiting_payment', 'paid') then
    raise exception 'This order cannot be started';
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

  if order_row.production_started_at is not null then
    raise exception 'Order is already in production';
  end if;

  update public.orders o
  set
    production_started_at = now(),
    production_started_by = p_actor_staff_id,
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
    'order_production_started',
    p_actor_staff_id,
    jsonb_build_object(
      'production_started_at', order_row.production_started_at
    )
  );

  return order_row;
end;
$$;

create or replace function public.undo_guest_order_production_started(
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
  previous_started_at timestamptz;
  previous_started_by uuid;
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
    raise exception 'Not authorized to undo start production';
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

  if order_row.production_started_at is null then
    raise exception 'Order is not in production';
  end if;

  if order_row.ready_at is not null then
    raise exception 'Undo Start is not allowed while the order is ready';
  end if;

  if order_row.picked_up_at is not null
    or order_row.out_for_delivery_at is not null
    or order_row.delivered_at is not null
  then
    raise exception 'Undo Start is not allowed after handoff';
  end if;

  previous_started_at := order_row.production_started_at;
  previous_started_by := order_row.production_started_by;

  update public.orders o
  set
    production_started_at = null,
    production_started_by = null,
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
    'order_production_start_undone',
    p_actor_staff_id,
    jsonb_build_object(
      'previous_production_started_at', previous_started_at,
      'previous_production_started_by', previous_started_by
    )
  );

  return order_row;
end;
$$;

revoke all on function public.mark_guest_order_production_started(uuid, uuid) from public;
revoke all on function public.undo_guest_order_production_started(uuid, uuid) from public;
revoke all on function public.mark_guest_order_production_started(uuid, uuid) from anon;
revoke all on function public.undo_guest_order_production_started(uuid, uuid) from anon;

grant execute on function public.mark_guest_order_production_started(uuid, uuid) to authenticated;
grant execute on function public.undo_guest_order_production_started(uuid, uuid) to authenticated;
