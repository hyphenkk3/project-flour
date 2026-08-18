-- Fresh Picks confirm window + reversible unconfirm.
-- Additive: do not rewrite 20260813160000 / 20260813170000.

-- Singapore today/tomorrow, 30-minute through slots, today must be future.
-- Unconfirm restores confirmed Extra to proposed (not rejected/Past).
-- Does not touch library_cakes.

create or replace function public._assert_fresh_picks_confirm_window(
  p_prepared_on date,
  p_pickup_through_at timestamptz
)
returns void
language plpgsql
as $$
declare
  v_sg_today date;
  v_sg_tomorrow date;
  v_through_sg timestamp;
  v_through_date date;
  v_minute int;
begin
  if p_prepared_on is null then
    raise exception 'Prepared date is required';
  end if;
  if p_pickup_through_at is null then
    raise exception 'Pickup-through datetime is required';
  end if;

  v_sg_today := (timezone('Asia/Singapore', now()))::date;
  v_sg_tomorrow := v_sg_today + 1;

  if p_prepared_on <> v_sg_today and p_prepared_on <> v_sg_tomorrow then
    raise exception 'Fresh Picks can only be confirmed for today or tomorrow.';
  end if;

  v_through_sg := timezone('Asia/Singapore', p_pickup_through_at);
  v_through_date := v_through_sg::date;
  if v_through_date <> p_prepared_on then
    raise exception 'Available-through time must be on the selected Fresh Picks date.';
  end if;

  v_minute := extract(minute from v_through_sg)::int;
  if v_minute not in (0, 30) or extract(second from v_through_sg)::int <> 0 then
    raise exception 'Available-through time must be a 30-minute interval.';
  end if;

  if p_prepared_on = v_sg_today and p_pickup_through_at <= now() then
    raise exception 'That available-through time has already passed. Choose a later time.';
  end if;
end;
$$;

revoke all on function public._assert_fresh_picks_confirm_window(date, timestamptz)
  from public;
grant execute on function public._assert_fresh_picks_confirm_window(date, timestamptz)
  to authenticated, service_role;

create or replace function public.create_confirmed_extra_stock(
  p_actor_staff_id uuid,
  p_cake_name text,
  p_size_label text,
  p_prepared_on date,
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
    p_prepared_on,
    p_pickup_through_at
  );

  v_note := nullif(trim(coalesce(p_note, '')), '');

  insert into public.extra_stock (
    lifecycle,
    cake_name,
    size_label,
    library_cake_id,
    library_cake_size_id,
    prepared_on,
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
    p_prepared_on,
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
  uuid, text, text, date, timestamptz, text, uuid, uuid
) from public;
grant execute on function public.create_confirmed_extra_stock(
  uuid, text, text, date, timestamptz, text, uuid, uuid
) to authenticated, service_role;

create or replace function public.confirm_extra_stock(
  p_extra_stock_id uuid,
  p_actor_staff_id uuid,
  p_prepared_on date,
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
    p_prepared_on,
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

  v_note := coalesce(
    nullif(trim(coalesce(p_note, '')), ''),
    stock_row.note
  );

  update public.extra_stock e
  set
    lifecycle = 'confirmed',
    prepared_on = p_prepared_on,
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
  uuid, uuid, date, timestamptz, text
) from public;
grant execute on function public.confirm_extra_stock(
  uuid, uuid, date, timestamptz, text
) to authenticated, service_role;

-- Restore confirmed Extra to proposed. Same row. No library delete. Not Past.
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

  update public.extra_stock e
  set
    lifecycle = 'proposed',
    pickup_through_at = null,
    confirmed_at = null,
    confirmed_by = null,
    updated_at = now()
  where e.id = p_extra_stock_id
  returning * into stock_row;

  return stock_row;
end;
$$;

revoke all on function public.unconfirm_extra_stock(uuid, uuid) from public;
grant execute on function public.unconfirm_extra_stock(uuid, uuid)
  to authenticated, service_role;
