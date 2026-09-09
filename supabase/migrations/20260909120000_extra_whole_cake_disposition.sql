-- Fresh Pick whole-cake disposition (assign / move / cut into slices).
-- Additive. Does not change lifecycle enum, guest Extra checkout, or
-- customer-facing date progression. sold_at remains the sold/assigned stamp.
-- Identity stays on extra_stock.id so identical cake/size/date extras stay independent.

alter table public.extra_stock
  add column if not exists cut_into_slices_at timestamptz;

alter table public.extra_stock
  add column if not exists cut_into_slices_by uuid
    references public.staff_profiles (id) on delete set null;

comment on column public.extra_stock.cut_into_slices_at is
  'When this Extra stopped being offered as a whole cake because it was cut into slices. Independent of lifecycle and sold_at.';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'extra_stock_sold_or_sliced_mutex'
      and conrelid = 'public.extra_stock'::regclass
  ) then
    alter table public.extra_stock
      add constraint extra_stock_sold_or_sliced_mutex
      check (sold_at is null or cut_into_slices_at is null);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'extra_stock_sliced_requires_confirmed'
      and conrelid = 'public.extra_stock'::regclass
  ) then
    alter table public.extra_stock
      add constraint extra_stock_sliced_requires_confirmed
      check (
        cut_into_slices_at is null
        or (
          lifecycle = 'confirmed'
          and cut_into_slices_by is not null
        )
      );
  end if;
end
$$;

create table if not exists public.extra_stock_events (
  id uuid primary key default gen_random_uuid(),
  extra_stock_id uuid not null references public.extra_stock (id) on delete cascade,
  event_type text not null,
  actor_staff_id uuid references public.staff_profiles (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint extra_stock_events_type_not_blank check (
    char_length(trim(event_type)) > 0
  )
);

create index if not exists extra_stock_events_extra_created_idx
  on public.extra_stock_events (extra_stock_id, created_at asc);

alter table public.extra_stock_events enable row level security;

drop policy if exists extra_stock_events_authenticated_select
  on public.extra_stock_events;
create policy extra_stock_events_authenticated_select
  on public.extra_stock_events
  for select
  to authenticated
  using (true);

grant select on table public.extra_stock_events to authenticated, service_role;

create or replace function public._record_extra_stock_event(
  p_extra_stock_id uuid,
  p_event_type text,
  p_actor_staff_id uuid,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.extra_stock_events (
    extra_stock_id,
    event_type,
    actor_staff_id,
    metadata
  )
  values (
    p_extra_stock_id,
    p_event_type,
    p_actor_staff_id,
    coalesce(p_metadata, '{}'::jsonb)
  );
end;
$$;

revoke all on function public._record_extra_stock_event(uuid, text, uuid, jsonb)
  from public;
grant execute on function public._record_extra_stock_event(uuid, text, uuid, jsonb)
  to service_role;

-- Guest Extra checkout inserts the order after stamping sold_at.
-- Record sold when an order becomes linked to a specific Extra.
create or replace function public._extra_stock_event_on_order_link()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' and new.extra_stock_id is not null then
    perform public._record_extra_stock_event(
      new.extra_stock_id,
      'sold',
      null,
      jsonb_build_object(
        'order_id', new.id,
        'order_number', new.order_number,
        'source', 'order_link'
      )
    );
  elsif tg_op = 'UPDATE'
    and old.extra_stock_id is null
    and new.extra_stock_id is not null
  then
    perform public._record_extra_stock_event(
      new.extra_stock_id,
      'sold',
      null,
      jsonb_build_object(
        'order_id', new.id,
        'order_number', new.order_number,
        'source', 'order_link'
      )
    );
  end if;
  return new;
end;
$$;

drop trigger if exists extra_stock_event_on_order_link on public.orders;
create trigger extra_stock_event_on_order_link
after insert or update of extra_stock_id
on public.orders
for each row
execute function public._extra_stock_event_on_order_link();

create or replace function public.unconfirm_extra_stock(
  p_extra_stock_id uuid,
  p_actor_staff_id uuid
)
returns public.extra_stock
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  stock_row public.extra_stock;
begin
  if p_extra_stock_id is null then
    raise exception 'EXTRA stock is required';
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
    raise exception 'Not authorized to undo EXTRA availability';
  end if;

  select e.*
  into stock_row
  from public.extra_stock e
  where e.id = p_extra_stock_id
  for update;

  if not found then
    raise exception 'EXTRA stock not found';
  end if;

  if stock_row.lifecycle <> 'confirmed' then
    raise exception 'Only confirmed EXTRA can be unpublished';
  end if;

  if stock_row.sold_at is not null then
    raise exception 'Cannot undo a sold Extra';
  end if;

  if stock_row.cut_into_slices_at is not null then
    raise exception 'Cannot undo an Extra that was cut into slices';
  end if;

  update public.extra_stock e
  set
    lifecycle = 'proposed',
    pickup_through_at = null,
    pickup_available_from_at = null,
    confirmed_at = null,
    confirmed_by = null,
    updated_at = now()
  where e.id = p_extra_stock_id
    and e.sold_at is null
    and e.cut_into_slices_at is null
  returning * into stock_row;

  perform public._record_extra_stock_event(
    p_extra_stock_id,
    'unconfirmed',
    p_actor_staff_id,
    '{}'::jsonb
  );

  return stock_row;
end;
$$;

revoke all on function public.unconfirm_extra_stock(uuid, uuid) from public;
grant execute on function public.unconfirm_extra_stock(uuid, uuid)
  to authenticated, service_role;

-- Assign a specific Extra to an existing order. Does not insert order items.
create or replace function public.assign_extra_stock_to_order(
  p_extra_stock_id uuid,
  p_order_id uuid,
  p_actor_staff_id uuid
)
returns public.extra_stock
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  stock_row public.extra_stock;
  order_row public.orders;
  v_matching_items int;
  v_updated int;
begin
  if p_extra_stock_id is null then
    raise exception 'EXTRA stock is required';
  end if;
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
    raise exception 'Not authorized to assign EXTRA';
  end if;

  select e.*
  into stock_row
  from public.extra_stock e
  where e.id = p_extra_stock_id
  for update;

  if not found then
    raise exception 'EXTRA stock not found';
  end if;

  if stock_row.lifecycle <> 'confirmed' then
    raise exception 'Only a confirmed Fresh Pick can be assigned to an order';
  end if;
  if stock_row.sold_at is not null then
    raise exception 'This Fresh Pick has already been sold or assigned';
  end if;
  if stock_row.cut_into_slices_at is not null then
    raise exception 'This Fresh Pick was cut into slices';
  end if;

  select o.*
  into order_row
  from public.orders o
  where o.id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found';
  end if;

  if order_row.status = 'cancelled' then
    raise exception 'Cannot assign a Fresh Pick to a cancelled order';
  end if;

  if order_row.extra_stock_id is not null then
    if order_row.extra_stock_id = p_extra_stock_id then
      raise exception 'This Fresh Pick is already assigned to that order';
    end if;
    raise exception 'That order already has a Fresh Pick assigned';
  end if;

  select count(*)::int
  into v_matching_items
  from public.order_items oi
  where oi.order_id = p_order_id
    and (
      (
        stock_row.library_cake_id is not null
        and oi.cake_id is not null
        and oi.cake_id = stock_row.library_cake_id
        and (
          stock_row.library_cake_size_id is null
          or oi.cake_size_id is null
          or oi.cake_size_id = stock_row.library_cake_size_id
        )
      )
      or (
        lower(trim(oi.cake_name)) = lower(trim(stock_row.cake_name))
        and lower(trim(oi.size_label)) = lower(trim(stock_row.size_label))
      )
    );

  update public.extra_stock e
  set sold_at = now(), updated_at = now()
  where e.id = p_extra_stock_id
    and e.sold_at is null
    and e.cut_into_slices_at is null
    and e.lifecycle = 'confirmed';

  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    raise exception 'This Fresh Pick has already been sold or assigned';
  end if;

  update public.orders o
  set extra_stock_id = p_extra_stock_id, updated_at = now()
  where o.id = p_order_id
    and o.extra_stock_id is null;

  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    raise exception 'That order already has a Fresh Pick assigned';
  end if;

  insert into public.order_timeline_events (
    order_id,
    event_type,
    actor_staff_id,
    metadata
  )
  values (
    p_order_id,
    'extra_assigned',
    p_actor_staff_id,
    jsonb_build_object(
      'extra_stock_id', p_extra_stock_id,
      'matching_item_count', v_matching_items,
      'inserted_order_item', false
    )
  );

  perform public._record_extra_stock_event(
    p_extra_stock_id,
    'assigned',
    p_actor_staff_id,
    jsonb_build_object(
      'order_id', p_order_id,
      'order_number', order_row.order_number,
      'matching_item_count', v_matching_items,
      'inserted_order_item', false
    )
  );

  select e.* into stock_row from public.extra_stock e where e.id = p_extra_stock_id;
  return stock_row;
end;
$$;

revoke all on function public.assign_extra_stock_to_order(uuid, uuid, uuid)
  from public;
grant execute on function public.assign_extra_stock_to_order(uuid, uuid, uuid)
  to authenticated, service_role;

create or replace function public.move_extra_stock_fresh_pick_window(
  p_extra_stock_id uuid,
  p_actor_staff_id uuid,
  p_prepared_on date,
  p_pickup_available_from_at timestamptz,
  p_pickup_through_at timestamptz
)
returns public.extra_stock
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  stock_row public.extra_stock;
  v_from_pickup timestamptz;
  v_from_through timestamptz;
  v_from_prepared date;
  v_prepared date;
begin
  if p_extra_stock_id is null then
    raise exception 'EXTRA stock is required';
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
    raise exception 'Not authorized to move EXTRA';
  end if;

  perform public._assert_fresh_picks_confirm_window(
    p_pickup_available_from_at,
    p_pickup_through_at
  );

  select e.*
  into stock_row
  from public.extra_stock e
  where e.id = p_extra_stock_id
  for update;

  if not found then
    raise exception 'EXTRA stock not found';
  end if;

  if stock_row.lifecycle <> 'confirmed' then
    raise exception 'Only a confirmed Fresh Pick can be moved';
  end if;
  if stock_row.sold_at is not null then
    raise exception 'Cannot move a sold Extra';
  end if;
  if stock_row.cut_into_slices_at is not null then
    raise exception 'Cannot move an Extra that was cut into slices';
  end if;

  v_from_pickup := stock_row.pickup_available_from_at;
  v_from_through := stock_row.pickup_through_at;
  v_from_prepared := stock_row.prepared_on;

  if v_from_pickup is not distinct from p_pickup_available_from_at
    and v_from_through is not distinct from p_pickup_through_at
  then
    raise exception 'Choose a different pickup window';
  end if;

  v_prepared := coalesce(
    p_prepared_on,
    (timezone('Asia/Singapore', p_pickup_available_from_at))::date
  );

  update public.extra_stock e
  set
    prepared_on = v_prepared,
    pickup_available_from_at = p_pickup_available_from_at,
    pickup_through_at = p_pickup_through_at,
    updated_at = now()
  where e.id = p_extra_stock_id
    and e.sold_at is null
    and e.cut_into_slices_at is null
    and e.lifecycle = 'confirmed'
  returning * into stock_row;

  if not found then
    raise exception 'Cannot move this Fresh Pick';
  end if;

  perform public._record_extra_stock_event(
    p_extra_stock_id,
    'moved',
    p_actor_staff_id,
    jsonb_build_object(
      'from_prepared_on', v_from_prepared,
      'from_pickup_available_from_at', v_from_pickup,
      'from_pickup_through_at', v_from_through,
      'to_prepared_on', v_prepared,
      'to_pickup_available_from_at', p_pickup_available_from_at,
      'to_pickup_through_at', p_pickup_through_at
    )
  );

  return stock_row;
end;
$$;

revoke all on function public.move_extra_stock_fresh_pick_window(
  uuid, uuid, date, timestamptz, timestamptz
) from public;
grant execute on function public.move_extra_stock_fresh_pick_window(
  uuid, uuid, date, timestamptz, timestamptz
) to authenticated, service_role;

create or replace function public.cut_extra_stock_into_slices(
  p_extra_stock_id uuid,
  p_actor_staff_id uuid
)
returns public.extra_stock
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  stock_row public.extra_stock;
begin
  if p_extra_stock_id is null then
    raise exception 'EXTRA stock is required';
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
    raise exception 'Not authorized to cut EXTRA into slices';
  end if;

  select e.*
  into stock_row
  from public.extra_stock e
  where e.id = p_extra_stock_id
  for update;

  if not found then
    raise exception 'EXTRA stock not found';
  end if;

  if stock_row.lifecycle <> 'confirmed' then
    raise exception 'Only a confirmed Fresh Pick can be cut into slices';
  end if;
  if stock_row.sold_at is not null then
    raise exception 'Cannot cut a sold Extra into slices';
  end if;
  if stock_row.cut_into_slices_at is not null then
    raise exception 'This Extra was already cut into slices';
  end if;

  update public.extra_stock e
  set
    cut_into_slices_at = now(),
    cut_into_slices_by = p_actor_staff_id,
    updated_at = now()
  where e.id = p_extra_stock_id
    and e.sold_at is null
    and e.cut_into_slices_at is null
    and e.lifecycle = 'confirmed'
  returning * into stock_row;

  if not found then
    raise exception 'Cannot cut this Fresh Pick into slices';
  end if;

  perform public._record_extra_stock_event(
    p_extra_stock_id,
    'cut_into_slices',
    p_actor_staff_id,
    '{}'::jsonb
  );

  return stock_row;
end;
$$;

revoke all on function public.cut_extra_stock_into_slices(uuid, uuid) from public;
grant execute on function public.cut_extra_stock_into_slices(uuid, uuid)
  to authenticated, service_role;

-- Customer-safe guard: sliced extras cannot be sold (and sold extras cannot
-- be sliced). Guest Extra checkout still stamps sold_at on extra_stock.id.
-- The mutex CHECK also enforces this; the trigger supplies a clean message
-- so customers never see "cut into slices".
create or replace function public._extra_stock_guard_disposition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.sold_at is not null
     and coalesce(old.cut_into_slices_at, new.cut_into_slices_at) is not null then
    raise exception 'This Extra cake has already been sold';
  end if;
  if new.cut_into_slices_at is not null and old.sold_at is not null then
    raise exception 'Cannot cut a sold Extra into slices';
  end if;
  return new;
end;
$$;

drop trigger if exists extra_stock_guard_disposition on public.extra_stock;
create trigger extra_stock_guard_disposition
before update of sold_at, cut_into_slices_at
on public.extra_stock
for each row
execute function public._extra_stock_guard_disposition();

-- Created / confirmed / rejected history. Unconfirm is recorded by
-- unconfirm_extra_stock as 'unconfirmed' (do not also write 'proposed').
create or replace function public._extra_stock_event_on_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public._record_extra_stock_event(
      new.id,
      'created',
      new.proposed_by,
      jsonb_build_object('lifecycle', new.lifecycle)
    );
    if new.lifecycle = 'confirmed' then
      perform public._record_extra_stock_event(
        new.id,
        'confirmed',
        new.confirmed_by,
        jsonb_build_object('prepared_on', new.prepared_on)
      );
    end if;
    return new;
  end if;

  if old.lifecycle is distinct from new.lifecycle then
    if new.lifecycle = 'confirmed' then
      perform public._record_extra_stock_event(
        new.id,
        'confirmed',
        new.confirmed_by,
        jsonb_build_object('prepared_on', new.prepared_on)
      );
    elsif new.lifecycle = 'rejected' then
      perform public._record_extra_stock_event(
        new.id,
        'rejected',
        new.rejected_by,
        jsonb_build_object('reason', new.reject_reason)
      );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists extra_stock_event_on_row on public.extra_stock;
create trigger extra_stock_event_on_row
after insert or update of lifecycle
on public.extra_stock
for each row
execute function public._extra_stock_event_on_row();
