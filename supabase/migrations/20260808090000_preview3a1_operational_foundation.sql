-- Milestone 3 Preview 3A-1 — operational foundation (additive)
-- Owner-only app mutations for now. Actor FKs remain for future staff access.
-- Does not edit previously applied Preview 2 migrations.
-- Does not enable Bakery/Counter access or Calendar UI.

-- ---------------------------------------------------------------------------
-- 1) Expand order_source CHECK (keep all existing legitimate values)
-- Previous: customer_website | whatsapp | walk_in | last_minute | other
-- ---------------------------------------------------------------------------

alter table public.orders
  drop constraint if exists orders_order_source_check;

alter table public.orders
  add constraint orders_order_source_check check (
    order_source in (
      'customer_website',
      'jotform',
      'whatsapp',
      'whitebird_instagram',
      'wee',
      'lex',
      'walk_in',
      'last_minute',
      'other'
    )
  );

comment on column public.orders.order_source is
  'Explicit intake channel. Website storefront stamps customer_website. '
  'August Promo remains customer_website-only. Historical jotform values are retained after retirement.';

-- ---------------------------------------------------------------------------
-- 2) Crew Order (not an order source)
-- ---------------------------------------------------------------------------

alter table public.orders
  add column if not exists crew_order boolean not null default false;

comment on column public.orders.crew_order is
  'Staff-created crew order flag. Display precedence later: (crew) over source suffix. '
  'Does not affect payment, discounts, settlement, or pickup rules.';

-- ---------------------------------------------------------------------------
-- 3) Optional guest phone at DB level (website RPC still requires phone)
-- ---------------------------------------------------------------------------

alter table public.orders
  drop constraint if exists orders_guest_or_customer;

alter table public.orders
  add constraint orders_guest_or_customer check (
    (
      customer_id is not null
    )
    or (
      customer_id is null
      and guest_name is not null
      and char_length(trim(guest_name)) > 0
    )
  );

comment on constraint orders_guest_or_customer on public.orders is
  'Guest orders require a non-blank guest_name. guest_phone may be blank for Owner-created '
  'orders (e.g. lex-mediated). Website submit_guest_preorder still requires phone.';

-- ---------------------------------------------------------------------------
-- 4) Physical Include Receipt (independent of email submission preference)
-- ---------------------------------------------------------------------------

alter table public.orders
  add column if not exists include_receipt boolean not null default false;

comment on column public.orders.include_receipt is
  'Include the physical purchase receipt with the cake at pickup. '
  'Independent of email_submission_receipt_requested.';

-- ---------------------------------------------------------------------------
-- 5) Needs Bakery Attention
-- ---------------------------------------------------------------------------

alter table public.orders
  add column if not exists needs_bakery_attention boolean not null default false,
  add column if not exists bakery_attention_note text;

comment on column public.orders.needs_bakery_attention is
  'Explicit bakery attention flag. Do not infer from free-text notes.';

comment on column public.orders.bakery_attention_note is
  'Reason shown in Quick View / Bakery detail when needs_bakery_attention is true.';

-- ---------------------------------------------------------------------------
-- 6) Ready / Picked Up — independent of financial status
-- Actor FKs follow existing staff_profiles convention (created_by / verified_by).
-- ---------------------------------------------------------------------------

alter table public.orders
  add column if not exists ready_at timestamptz,
  add column if not exists ready_by uuid
    references public.staff_profiles (id) on delete set null,
  add column if not exists picked_up_at timestamptz,
  add column if not exists picked_up_by uuid
    references public.staff_profiles (id) on delete set null;

comment on column public.orders.ready_at is
  'Operational ready timestamp. Independent of payment/order status.';
comment on column public.orders.ready_by is
  'Staff who marked Ready. Preserved after Picked Up; cleared only by Undo Ready.';
comment on column public.orders.picked_up_at is
  'Operational picked-up timestamp. Payment does not gate this. Order remains on Calendar.';
comment on column public.orders.picked_up_by is
  'Staff who marked Picked Up.';

create index if not exists orders_ready_at_idx
  on public.orders (ready_at)
  where ready_at is not null;

create index if not exists orders_picked_up_at_idx
  on public.orders (picked_up_at)
  where picked_up_at is not null;

-- ---------------------------------------------------------------------------
-- 7) Operational RPCs — narrow field updates + timeline only
-- App layer: requireOwner for Preview 3. Actor recorded for future staff access.
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

  if order_row.status not in (
    'submitted',
    'pending_confirmation',
    'awaiting_payment',
    'paid'
  ) then
    raise exception 'This order cannot be marked ready';
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

  -- Ready is NOT required before Picked Up (Product decision).

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

revoke all on function public.mark_guest_order_ready(uuid, uuid) from public;
revoke all on function public.undo_guest_order_ready(uuid, uuid) from public;
revoke all on function public.mark_guest_order_picked_up(uuid, uuid) from public;
revoke all on function public.undo_guest_order_picked_up(uuid, uuid) from public;

grant execute on function public.mark_guest_order_ready(uuid, uuid) to authenticated;
grant execute on function public.undo_guest_order_ready(uuid, uuid) to authenticated;
grant execute on function public.mark_guest_order_picked_up(uuid, uuid) to authenticated;
grant execute on function public.undo_guest_order_picked_up(uuid, uuid) to authenticated;
