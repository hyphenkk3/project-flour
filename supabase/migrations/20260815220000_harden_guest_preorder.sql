-- Harden website guest pickup preorder (additive function replace).
-- One collection resolver for storefront + submit_guest_preorder.
-- Public pickup slots must match src/engines/business-calendar/pickup-schedule.ts
-- weekly profiles (PICKUP_DATE_OVERRIDES is currently empty — no closed dates).
-- Does not change staff create_staff_guest_preorder.

create or replace function public.storefront_current_collection()
returns public.collections
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  month_start date;
  selected public.collections;
begin
  month_start := date_trunc(
    'month',
    timezone('Asia/Singapore', now())
  )::date;

  select c.*
  into selected
  from public.collections c
  where c.status = 'active'
    and c.month = month_start
  order by c.created_at desc
  limit 1;

  if selected.id is not null then
    return selected;
  end if;

  select c.*
  into selected
  from public.collections c
  where c.status = 'active'
  order by c.month desc, c.created_at desc
  limit 1;

  return selected;
end;
$$;

comment on function public.storefront_current_collection() is
  'Storefront and submit_guest_preorder share this active/current collection. '
  'Prefer Asia/Singapore calendar month; otherwise latest active by month.';

revoke all on function public.storefront_current_collection() from public;
grant execute on function public.storefront_current_collection() to anon, authenticated;

-- Weekly public slots. MUST stay aligned with WEEKLY_PROFILES in pickup-schedule.ts:
-- Mon/Tue/Thu 12:00–17:30; Wed 12:00–15:00; Fri/Sat/Sun 12:00–21:30; 30-minute grid.
-- Closed-date overrides live in pickup-date-overrides.ts and are currently empty.
create or replace function public.is_valid_public_pickup_slot(
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
  if extract(second from p_time) <> 0 then
    return false;
  end if;

  -- PostgreSQL DOW: 0 Sunday … 6 Saturday (matches JS Date#getDay).
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

comment on function public.is_valid_public_pickup_slot(date, time) is
  'Customer public pickup slot membership. Same weekly windows as '
  'getEffectivePickupSchedule with empty PICKUP_DATE_OVERRIDES.';

revoke all on function public.is_valid_public_pickup_slot(date, time) from public;
grant execute on function public.is_valid_public_pickup_slot(date, time)
  to anon, authenticated;

create or replace function public.submit_guest_preorder(
  p_customer_name text,
  p_phone text,
  p_email text,
  p_pickup_date date,
  p_pickup_time time,
  p_notes text,
  p_items jsonb,
  p_email_submission_receipt_requested boolean default false
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  cake_row public.library_cakes;
  size_row public.library_cake_sizes;
  new_order public.orders;
  active_collection public.collections;
  item jsonb;
  v_qty integer;
  v_cake_id uuid;
  v_size_id uuid;
  item_count integer := 0;
  complimentary_row record;
  v_email text;
  v_receipt_requested boolean;
  earliest_pickup date;
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

  if p_pickup_date is null or p_pickup_time is null then
    raise exception 'Please choose a valid pickup time for that date.';
  end if;

  -- Same earliest date as PickupSlotFields (tomorrow, Asia/Singapore).
  earliest_pickup := timezone('Asia/Singapore', now())::date + 1;
  if p_pickup_date < earliest_pickup then
    raise exception 'Please choose a valid pickup time for that date.';
  end if;

  if not public.is_valid_public_pickup_slot(p_pickup_date, p_pickup_time) then
    raise exception 'Please choose a valid pickup time for that date.';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one cake is required';
  end if;

  active_collection := public.storefront_current_collection();
  if active_collection.id is null then
    raise exception 'No active collection is available';
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
    active_collection.id,
    false,
    'customer_website',
    v_receipt_requested
  )
  returning * into new_order;

  for item in select * from jsonb_array_elements(p_items)
  loop
    v_cake_id := (item ->> 'cake_id')::uuid;
    v_size_id := (item ->> 'cake_size_id')::uuid;
    v_qty := coalesce((item ->> 'quantity')::integer, 1);

    if v_qty < 1 then
      raise exception 'Quantity must be at least 1';
    end if;

    select lc.*
    into cake_row
    from public.library_cakes lc
    where lc.id = v_cake_id;
    if not found then
      raise exception 'Cake is not available';
    end if;

    if cake_row.status not in ('active', 'seasonal') then
      raise exception 'Cake is not available in the current collection';
    end if;

    if not exists (
      select 1
      from public.collection_cakes cc
      where cc.collection_id = active_collection.id
        and cc.library_cake_id = cake_row.id
        and cc.available = true
    ) then
      raise exception 'Cake is not available in the current collection';
    end if;

    select lcs.*
    into size_row
    from public.library_cake_sizes lcs
    where lcs.id = v_size_id
      and lcs.cake_id = v_cake_id;
    if not found then
      raise exception 'Cake size is not available';
    end if;

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
      cake_row.id,
      size_row.id,
      v_qty,
      size_row.price,
      cake_row.name,
      size_row.label
    );

    item_count := item_count + 1;
  end loop;

  if item_count = 0 then
    raise exception 'At least one cake is required';
  end if;

  for complimentary_row in
    select
      cci.complimentary_item_type_id,
      cit.name,
      cci.default_quantity,
      cci.sort_order
    from public.collection_complimentary_items cci
    join public.complimentary_item_types cit
      on cit.id = cci.complimentary_item_type_id
    where cci.collection_id = active_collection.id
      and cci.is_available = true
      and cci.is_default = true
      and cci.default_quantity > 0
    order by cci.sort_order asc, cit.name asc
  loop
    insert into public.order_complimentary_items (
      order_id,
      complimentary_item_type_id,
      name,
      quantity,
      sort_order
    )
    values (
      new_order.id,
      complimentary_row.complimentary_item_type_id,
      complimentary_row.name,
      complimentary_row.default_quantity,
      complimentary_row.sort_order
    );
  end loop;

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
      'item_count', item_count,
      'source', 'customer_website',
      'email_submission_receipt_requested', v_receipt_requested
    )
  );

  return new_order;
end;
$$;

revoke all on function public.submit_guest_preorder(
  text, text, text, date, time, text, jsonb, boolean
) from public;
grant execute on function public.submit_guest_preorder(
  text, text, text, date, time, text, jsonb, boolean
) to anon, authenticated;
