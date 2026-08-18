-- Fresh Picks: pickup-from vs order cutoff; sold-out; Extra guest order RPC.
-- Additive. Does not rewrite 20260813160000 / 20260817120000.
-- pickup_through_at remains ORDER CUTOFF (new-order window), not last pickup.
-- Do not touch catalogues, library cakes/prices, or Product monthly orders.

alter table public.extra_stock
  add column if not exists pickup_available_from_at timestamptz;

alter table public.extra_stock
  add column if not exists sold_at timestamptz;

comment on column public.extra_stock.pickup_through_at is
  'ORDER CUTOFF: latest instant a NEW customer may order this Extra. '
  'Not the last pickup time.';

comment on column public.extra_stock.pickup_available_from_at is
  'Earliest customer pickup instant. Independent of live/post and order cutoff.';

comment on column public.extra_stock.sold_at is
  'When this Extra unit was sold. Independent of lifecycle and order cutoff.';

comment on column public.extra_stock.confirmed_at is
  'When Bakery posted the Extra live. Customer visibility/order starts immediately.';

-- Backfill ONLY pickup_available_from_at, and ONLY after the column exists.
-- Earliest Extra operating pickup is 12:00 PM Asia/Singapore on prepared_on.
-- Rejected/proposed rows are excluded (lifecycle <> confirmed). Does not
-- rewrite pickup_through_at or any other Extra fields.
update public.extra_stock e
set pickup_available_from_at =
  ((e.prepared_on::timestamp + time '12:00') at time zone 'Asia/Singapore')
where e.lifecycle = 'confirmed'
  and e.pickup_available_from_at is null
  and e.prepared_on is not null;

alter table public.extra_stock
  drop constraint if exists extra_stock_confirmed_requires_fields;

alter table public.extra_stock
  add constraint extra_stock_confirmed_requires_fields check (
    lifecycle <> 'confirmed'
    or (
      prepared_on is not null
      and pickup_through_at is not null
      and pickup_available_from_at is not null
      and confirmed_at is not null
      and confirmed_by is not null
    )
  );

-- Pairing rule for the two window instants. After backfill, confirmed rows
-- have both; proposed/rejected may have neither. New confirms set both via RPC.
alter table public.extra_stock
  drop constraint if exists extra_stock_pickup_from_order_cutoff_fields;

alter table public.extra_stock
  add constraint extra_stock_pickup_from_order_cutoff_fields check (
    pickup_available_from_at is null
    or (
      pickup_through_at is not null
      and pickup_available_from_at <= pickup_through_at
    )
  );

alter table public.extra_stock
  drop constraint if exists extra_stock_sold_requires_confirmed;

alter table public.extra_stock
  add constraint extra_stock_sold_requires_confirmed check (
    sold_at is null or lifecycle = 'confirmed'
  );

alter table public.orders
  add column if not exists extra_stock_id uuid
    references public.extra_stock (id) on delete restrict;

comment on column public.orders.extra_stock_id is
  'Set for Fresh Picks Extra guest orders. Null for monthly catalogue preorders.';

create unique index if not exists orders_extra_stock_id_unique
  on public.orders (extra_stock_id)
  where extra_stock_id is not null;

create or replace function public._pickup_slot_in_weekly_hours(
  p_date date,
  p_time time
)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  dow integer;
  latest time;
  earliest time := time '12:00';
  minute_part integer;
begin
  if p_date is null or p_time is null then
    return false;
  end if;
  minute_part := extract(minute from p_time)::integer;
  if minute_part not in (0, 30) then
    return false;
  end if;
  if extract(second from p_time)::integer <> 0 then
    return false;
  end if;
  dow := extract(dow from p_date)::integer;
  if dow = 3 then
    latest := time '15:00';
  elsif dow in (0, 5, 6) then
    latest := time '21:30';
  else
    latest := time '17:30';
  end if;
  return p_time >= earliest and p_time <= latest;
end;
$$;

revoke all on function public._pickup_slot_in_weekly_hours(date, time) from public;
grant execute on function public._pickup_slot_in_weekly_hours(date, time)
  to anon, authenticated, service_role;

comment on function public._pickup_slot_in_weekly_hours(date, time) is
  'Weekly operating-hour 30-minute pickup slots. Extra pickup uses this without the monthly orders-closed overlay.';

grant select on table public.extra_stock to anon, authenticated;

drop policy if exists extra_stock_public_confirmed_select on public.extra_stock;
create policy extra_stock_public_confirmed_select
on public.extra_stock
for select
to anon
using (
  lifecycle = 'confirmed'
  and sold_at is null
  and confirmed_at is not null
  and pickup_through_at is not null
  and now() >= confirmed_at
  and now() <= pickup_through_at
);

drop function if exists public._assert_fresh_picks_confirm_window(date, timestamptz);

create or replace function public.is_valid_public_pickup_slot(
  p_date date,
  p_time time
)
returns boolean
language plpgsql
stable
set search_path = public
as $$
begin
  if public.is_pickup_orders_closed(p_date) then
    return false;
  end if;
  return public._pickup_slot_in_weekly_hours(p_date, p_time);
end;
$$;

create or replace function public._assert_fresh_picks_confirm_window(
  p_pickup_available_from_at timestamptz,
  p_pickup_through_at timestamptz
)
returns void
language plpgsql
as $$
declare
  v_sg_today date;
  v_sg_tomorrow date;
  v_from_sg timestamp;
  v_through_sg timestamp;
  v_from_date date;
  v_through_date date;
begin
  if p_pickup_available_from_at is null then
    raise exception 'Pickup available from is required';
  end if;
  if p_pickup_through_at is null then
    raise exception 'Order cutoff is required';
  end if;

  v_sg_today := (timezone('Asia/Singapore', now()))::date;
  v_sg_tomorrow := v_sg_today + 1;
  v_from_sg := timezone('Asia/Singapore', p_pickup_available_from_at);
  v_through_sg := timezone('Asia/Singapore', p_pickup_through_at);
  v_from_date := v_from_sg::date;
  v_through_date := v_through_sg::date;

  if v_from_date <> v_sg_today and v_from_date <> v_sg_tomorrow then
    raise exception 'Fresh Picks pickup and order-cutoff dates must be today or tomorrow.';
  end if;
  if v_through_date <> v_sg_today and v_through_date <> v_sg_tomorrow then
    raise exception 'Fresh Picks pickup and order-cutoff dates must be today or tomorrow.';
  end if;

  if not public._pickup_slot_in_weekly_hours(v_from_date, v_from_sg::time) then
    raise exception 'Pickup available from must be a valid bakery pickup time for that date.';
  end if;
  if not public._pickup_slot_in_weekly_hours(v_through_date, v_through_sg::time) then
    raise exception 'Orders available through must be a valid 30-minute time on that date.';
  end if;

  if p_pickup_available_from_at > p_pickup_through_at then
    raise exception 'Pickup available from must not be after the order cutoff.';
  end if;

  if p_pickup_through_at <= now() then
    raise exception 'That order cutoff has already passed. Choose a later time.';
  end if;
end;
$$;

drop function if exists public.create_confirmed_extra_stock(
  uuid, text, text, date, timestamptz, text, uuid, uuid
);

create or replace function public.create_confirmed_extra_stock(
  p_actor_staff_id uuid,
  p_cake_name text,
  p_size_label text,
  p_prepared_on date,
  p_pickup_available_from_at timestamptz,
  p_pickup_through_at timestamptz,
  p_note text default null,
  p_library_cake_id uuid default null,
  p_library_cake_size_id uuid default null
)
returns public.extra_stock
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  stock_row public.extra_stock;
  v_cake text;
  v_size text;
  v_note text;
  v_prepared date;
begin
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
    raise exception 'Not authorized to create confirmed EXTRA';
  end if;

  v_cake := nullif(trim(coalesce(p_cake_name, '')), '');
  v_size := nullif(trim(coalesce(p_size_label, '')), '');
  if v_cake is null or v_size is null then
    raise exception 'Cake and size are required';
  end if;

  perform public._assert_fresh_picks_confirm_window(
    p_pickup_available_from_at,
    p_pickup_through_at
  );

  v_prepared := coalesce(
    p_prepared_on,
    (timezone('Asia/Singapore', p_pickup_available_from_at))::date
  );
  v_note := nullif(trim(coalesce(p_note, '')), '');

  insert into public.extra_stock (
    lifecycle,
    cake_name,
    size_label,
    library_cake_id,
    library_cake_size_id,
    prepared_on,
    pickup_available_from_at,
    pickup_through_at,
    note,
    proposed_at,
    proposed_by,
    confirmed_at,
    confirmed_by
  )
  values (
    'confirmed',
    v_cake,
    v_size,
    p_library_cake_id,
    p_library_cake_size_id,
    v_prepared,
    p_pickup_available_from_at,
    p_pickup_through_at,
    v_note,
    now(),
    p_actor_staff_id,
    now(),
    p_actor_staff_id
  )
  returning * into stock_row;

  return stock_row;
end;
$$;

revoke all on function public.create_confirmed_extra_stock(
  uuid, text, text, date, timestamptz, timestamptz, text, uuid, uuid
) from public;
grant execute on function public.create_confirmed_extra_stock(
  uuid, text, text, date, timestamptz, timestamptz, text, uuid, uuid
) to authenticated, service_role;

drop function if exists public.confirm_extra_stock(
  uuid, uuid, date, timestamptz, text
);

create or replace function public.confirm_extra_stock(
  p_extra_stock_id uuid,
  p_actor_staff_id uuid,
  p_prepared_on date,
  p_pickup_available_from_at timestamptz,
  p_pickup_through_at timestamptz,
  p_note text default null
)
returns public.extra_stock
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  stock_row public.extra_stock;
  v_note text;
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
    raise exception 'Not authorized to confirm EXTRA';
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

  if stock_row.lifecycle <> 'proposed' then
    raise exception 'Only proposed EXTRA can be confirmed';
  end if;

  v_prepared := coalesce(
    p_prepared_on,
    (timezone('Asia/Singapore', p_pickup_available_from_at))::date
  );
  v_note := coalesce(
    nullif(trim(coalesce(p_note, '')), ''),
    stock_row.note
  );

  update public.extra_stock e
  set
    lifecycle = 'confirmed',
    prepared_on = v_prepared,
    pickup_available_from_at = p_pickup_available_from_at,
    pickup_through_at = p_pickup_through_at,
    note = v_note,
    confirmed_at = now(),
    confirmed_by = p_actor_staff_id,
    updated_at = now()
  where e.id = p_extra_stock_id
  returning * into stock_row;

  return stock_row;
end;
$$;

revoke all on function public.confirm_extra_stock(
  uuid, uuid, date, timestamptz, timestamptz, text
) from public;
grant execute on function public.confirm_extra_stock(
  uuid, uuid, date, timestamptz, timestamptz, text
) to authenticated, service_role;

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
  returning * into stock_row;

  return stock_row;
end;
$$;

revoke all on function public.unconfirm_extra_stock(uuid, uuid) from public;
grant execute on function public.unconfirm_extra_stock(uuid, uuid)
  to authenticated, service_role;

-- Guest Extra order: same-day pickup allowed. Not monthly catalogue.
create or replace function public.submit_guest_extra_order(
  p_customer_name text,
  p_phone text,
  p_email text,
  p_pickup_date date,
  p_pickup_time time,
  p_notes text,
  p_extra_stock_id uuid,
  p_email_submission_receipt_requested boolean default false
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  stock_row public.extra_stock;
  size_row public.library_cake_sizes;
  new_order public.orders;
  v_email text;
  v_receipt_requested boolean;
  v_pickup_at timestamptz;
  v_updated int;
begin
  if char_length(trim(coalesce(p_customer_name, ''))) = 0 then
    raise exception 'Full name is required';
  end if;
  if char_length(trim(coalesce(p_phone, ''))) = 0 then
    raise exception 'Phone number is required';
  end if;
  v_email := nullif(trim(coalesce(p_email, '')), '');
  v_receipt_requested := coalesce(p_email_submission_receipt_requested, false);
  if v_receipt_requested and v_email is null then
    raise exception 'Email is required when requesting a copy of your preorder submission';
  end if;
  if p_extra_stock_id is null then
    raise exception 'Extra is required';
  end if;
  if p_pickup_date is null or p_pickup_time is null then
    raise exception 'Please choose a valid pickup time for that date.';
  end if;

  select e.*
  into stock_row
  from public.extra_stock e
  where e.id = p_extra_stock_id
  for update;

  if not found then
    raise exception 'Extra is not available';
  end if;
  if stock_row.lifecycle <> 'confirmed' then
    raise exception 'Extra is not available';
  end if;
  if stock_row.sold_at is not null then
    raise exception 'This Extra cake has already been sold';
  end if;
  if stock_row.confirmed_at is not null and now() < stock_row.confirmed_at then
    raise exception 'Extra is not available';
  end if;
  if stock_row.pickup_through_at is null or now() > stock_row.pickup_through_at then
    raise exception 'This Extra is no longer available to order';
  end if;

  if not public._pickup_slot_in_weekly_hours(p_pickup_date, p_pickup_time) then
    raise exception 'Please choose a valid pickup time for that date.';
  end if;

  v_pickup_at := timezone(
    'Asia/Singapore',
    (p_pickup_date::text || ' ' || p_pickup_time::text)::timestamp
  );
  if v_pickup_at < now() then
    raise exception 'Please choose a pickup time from the Extra pickup window.';
  end if;
  if v_pickup_at < stock_row.pickup_available_from_at then
    raise exception 'Please choose a pickup time from the Extra pickup window.';
  end if;
  if p_pickup_date < (timezone('Asia/Singapore', stock_row.pickup_available_from_at))::date
    or p_pickup_date > (timezone('Asia/Singapore', stock_row.pickup_through_at))::date
  then
    raise exception 'Please choose a pickup time from the Extra pickup window.';
  end if;

  if stock_row.library_cake_id is null or stock_row.library_cake_size_id is null then
    raise exception 'This Extra cake cannot be ordered';
  end if;

  select lcs.*
  into size_row
  from public.library_cake_sizes lcs
  where lcs.id = stock_row.library_cake_size_id
    and lcs.cake_id = stock_row.library_cake_id;
  if not found then
    raise exception 'This Extra cake cannot be ordered';
  end if;

  update public.extra_stock e
  set sold_at = now(), updated_at = now()
  where e.id = p_extra_stock_id
    and e.sold_at is null
    and e.lifecycle = 'confirmed';
  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    raise exception 'This Extra cake has already been sold';
  end if;

  insert into public.orders (
    order_number,
    customer_id,
    guest_name,
    guest_phone,
    guest_email,
    fulfilment_method,
    pickup_date,
    pickup_time,
    status,
    payment_status,
    customer_notes,
    collection_id,
    extra_stock_id,
    confirmation_needs_resend,
    order_source,
    email_submission_receipt_requested
  )
  values (
    public.allocate_order_number(),
    null,
    trim(p_customer_name),
    trim(p_phone),
    v_email,
    'pickup',
    p_pickup_date,
    p_pickup_time,
    'submitted',
    'unpaid',
    nullif(trim(coalesce(p_notes, '')), ''),
    null,
    p_extra_stock_id,
    false,
    'customer_website',
    v_receipt_requested
  )
  returning * into new_order;

  insert into public.order_items (
    order_id,
    cake_id,
    cake_size_id,
    quantity,
    unit_price,
    cake_name,
    size_label
  )
  values (
    new_order.id,
    stock_row.library_cake_id,
    stock_row.library_cake_size_id,
    1,
    coalesce(size_row.price, 0),
    stock_row.cake_name,
    stock_row.size_label
  );

  insert into public.order_timeline_events (
    order_id,
    event_type,
    actor_staff_id,
    metadata
  )
  values (
    new_order.id,
    'preorder_submitted',
    null,
    jsonb_build_object(
      'item_count', 1,
      'source', 'customer_website_extra',
      'extra_stock_id', p_extra_stock_id
    )
  );

  return new_order;
exception
  when unique_violation then
    raise exception 'This Extra cake has already been sold';
end;
$$;

revoke all on function public.submit_guest_extra_order(
  text, text, text, date, time, text, uuid, boolean
) from public;
grant execute on function public.submit_guest_extra_order(
  text, text, text, date, time, text, uuid, boolean
) to anon, authenticated, service_role;
