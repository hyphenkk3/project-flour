-- Fresh Picks: same-day preparation config, 15-minute dine-in slots,
-- and Extra customer fulfilment (pickup | dine-in | delivery).
-- Additive. Does not rewrite operating hours rows or Extra stock windows.

-- ---------------------------------------------------------------------------
-- 1) Configurable same-day preparation (singleton)
-- ---------------------------------------------------------------------------

alter table public.business_operating_config
  add column if not exists fresh_picks_same_day_preparation_cutoff_time
    time not null default time '16:00:00';

alter table public.business_operating_config
  add column if not exists fresh_picks_same_day_preparation_lead_minutes
    integer not null default 60;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'business_operating_config_fresh_picks_lead_range'
  ) then
    alter table public.business_operating_config
      add constraint business_operating_config_fresh_picks_lead_range
      check (
        fresh_picks_same_day_preparation_lead_minutes >= 0
        and fresh_picks_same_day_preparation_lead_minutes <= 1440
      );
  end if;
end
$$;

comment on column public.business_operating_config.fresh_picks_same_day_preparation_cutoff_time is
  'Fresh Picks same-day bakery preparation cutoff in business local time. '
  'Not store close, pickup close, dine-in latest, or delivery close. '
  'Orders at or after this instant cannot choose today.';

comment on column public.business_operating_config.fresh_picks_same_day_preparation_lead_minutes is
  'Minimum minutes between Fresh Picks order placement and same-day fulfilment. Default 60.';

create or replace function public.fresh_picks_preparation_config()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'cutoffTime', to_char(
      coalesce(c.fresh_picks_same_day_preparation_cutoff_time, time '16:00:00'),
      'HH24:MI'
    ),
    'leadMinutes', coalesce(c.fresh_picks_same_day_preparation_lead_minutes, 60)
  )
  from public.business_operating_config c
  where c.id = 1;
$$;

comment on function public.fresh_picks_preparation_config() is
  'Public Fresh Picks same-day preparation cutoff and lead. Defaults 16:00 / 60.';

revoke all on function public.fresh_picks_preparation_config() from public;
grant execute on function public.fresh_picks_preparation_config()
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2) Dine-in 15-minute grid (whole-cake + Fresh Picks)
-- ---------------------------------------------------------------------------

create or replace function public._clock_on_minute_grid(
  p_time time,
  p_minutes integer
)
returns boolean
language sql
immutable
as $$
  select
    p_time is not null
    and p_minutes is not null
    and p_minutes > 0
    and extract(second from p_time) = 0
    and (extract(minute from p_time)::integer % p_minutes) = 0;
$$;

create or replace function public._time_within_operating_hours_grid(
  p_capability public.operating_hours_capability,
  p_date date,
  p_time time,
  p_grid_minutes integer
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_enabled boolean;
  v_opens time;
  v_closes time;
  v_latest time;
  v_last time;
begin
  if p_date is null or p_time is null then
    return false;
  end if;
  if not public._clock_on_minute_grid(p_time, p_grid_minutes) then
    return false;
  end if;
  select r.enabled, r.opens_at, r.closes_at, r.latest_bookable
    into v_enabled, v_opens, v_closes, v_latest
  from public.operating_hours_resolved(p_capability, p_date) r;
  if not found or v_enabled is not true or v_opens is null then
    return false;
  end if;
  v_last := public._operating_hours_last_bookable(v_latest, v_closes);
  if v_last is null then
    return false;
  end if;
  return p_time >= v_opens and p_time <= v_last;
end;
$$;

create or replace function public.is_valid_dine_in_slot(
  p_date date,
  p_time time
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public._time_within_operating_hours_grid('dine_in', p_date, p_time, 15) then
    return false;
  end if;
  return public._time_within_operating_hours_grid('hyphen', p_date, p_time, 15)
      or public._time_within_operating_hours_grid('whitebird', p_date, p_time, 15);
end;
$$;

create or replace function public.is_valid_dine_in_venue(
  p_date date,
  p_time time,
  p_venue public.dine_in_venue
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_venue is null then
    return false;
  end if;
  if not public._time_within_operating_hours_grid('dine_in', p_date, p_time, 15) then
    return false;
  end if;
  if p_venue = 'hyphen' then
    return public._time_within_operating_hours_grid('hyphen', p_date, p_time, 15);
  end if;
  return public._time_within_operating_hours_grid('whitebird', p_date, p_time, 15);
end;
$$;

comment on function public.is_valid_dine_in_slot(date, time) is
  'Cake dine-in booking window on a 15-minute grid from operating_hours_weekly / overrides. '
  'Pickup and delivery remain on the 30-minute grid.';

-- ---------------------------------------------------------------------------
-- 3) Fresh Picks same-day + method validation (RPC authority)
-- ---------------------------------------------------------------------------

create or replace function public._assert_fresh_picks_customer_fulfilment(
  p_date date,
  p_time time,
  p_method public.fulfilment_method
)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cutoff time;
  v_lead integer;
  v_today date;
  v_cutoff_at timestamptz;
  v_fulfilment_at timestamptz;
  v_boundary timestamptz;
  v_cutoff_label text;
begin
  if p_date is null or p_time is null then
    raise exception 'Please choose a valid fulfilment time for that date.';
  end if;
  if p_method is null or p_method not in ('pickup', 'dine_in', 'delivery') then
    raise exception 'Please choose a valid fulfilment method.';
  end if;

  if p_method = 'pickup' then
    if not public._pickup_slot_in_weekly_hours(p_date, p_time) then
      raise exception 'Please choose a valid pickup time for that date.';
    end if;
  elsif p_method = 'dine_in' then
    if not public.is_valid_dine_in_slot(p_date, p_time) then
      raise exception 'Please choose a valid dine-in reservation time for that date.';
    end if;
  else
    if not public.is_valid_delivery_slot(p_date, p_time) then
      raise exception 'Please choose a valid delivery time for that date.';
    end if;
  end if;

  select
    coalesce(c.fresh_picks_same_day_preparation_cutoff_time, time '16:00:00'),
    coalesce(c.fresh_picks_same_day_preparation_lead_minutes, 60)
  into v_cutoff, v_lead
  from public.business_operating_config c
  where c.id = 1;
  if v_cutoff is null then
    v_cutoff := time '16:00:00';
  end if;
  if v_lead is null then
    v_lead := 60;
  end if;

  v_today := (timezone('Asia/Singapore', now()))::date;
  v_fulfilment_at := timezone(
    'Asia/Singapore',
    (p_date::text || ' ' || p_time::text)::timestamp
  );

  if p_date = v_today then
    v_cutoff_at := timezone(
      'Asia/Singapore',
      (v_today::text || ' ' || v_cutoff::text)::timestamp
    );
    if now() >= v_cutoff_at then
      v_cutoff_label := trim(to_char(v_cutoff, 'FMHH12:MI AM'));
      raise exception
        'Same-day orders must be placed before %. Please select another date for your order.',
        v_cutoff_label;
    end if;
    v_boundary := now() + make_interval(mins => v_lead);
    if p_method = 'dine_in' then
      if v_fulfilment_at <= v_boundary then
        raise exception 'Please choose a valid fulfilment time for that date.';
      end if;
    elsif v_fulfilment_at < v_boundary then
      raise exception 'Please choose a valid fulfilment time for that date.';
    end if;
  elsif v_fulfilment_at < now() then
    raise exception 'Please choose a pickup time from the Extra pickup window.';
  end if;
end;
$$;

revoke all on function public._assert_fresh_picks_customer_fulfilment(
  date, time, public.fulfilment_method
) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4) Extra submit RPC accepts fulfilment method
-- ---------------------------------------------------------------------------

drop function if exists public.submit_guest_extra_order(
  text, text, text, date, time, text, uuid, boolean, boolean, jsonb, jsonb, uuid[]
);

create or replace function public.submit_guest_extra_order(
  p_customer_name text,
  p_phone text,
  p_email text,
  p_pickup_date date,
  p_pickup_time time,
  p_notes text,
  p_extra_stock_id uuid,
  p_email_submission_receipt_requested boolean default false,
  p_include_receipt boolean default false,
  p_complimentary jsonb default '[]'::jsonb,
  p_paid_addons jsonb default '[]'::jsonb,
  p_extra_stock_ids uuid[] default null,
  p_fulfilment_method public.fulfilment_method default 'pickup',
  p_delivery jsonb default null,
  p_dine_in jsonb default null
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
  active_collection public.collections;
  complimentary jsonb;
  addon jsonb;
  v_email text;
  v_receipt_requested boolean;
  v_include_receipt boolean;
  v_pickup_at timestamptz;
  v_updated int;
  v_qty integer;
  v_type_id uuid;
  v_comp_code text;
  v_comp_name text;
  v_comp_sort integer;
  v_addon_code text;
  v_paid jsonb := '[]'::jsonb;
  v_ids uuid[];
  v_id uuid;
  v_primary uuid;
  v_expected int;
  v_method public.fulfilment_method;
begin
  if char_length(trim(coalesce(p_customer_name, ''))) = 0 then
    raise exception 'Full name is required';
  end if;
  if char_length(trim(coalesce(p_phone, ''))) = 0 then
    raise exception 'Phone number is required';
  end if;
  v_email := nullif(trim(coalesce(p_email, '')), '');
  v_receipt_requested := coalesce(p_email_submission_receipt_requested, false);
  v_include_receipt := coalesce(p_include_receipt, false);
  if v_receipt_requested and v_email is null then
    raise exception 'Email is required when requesting a copy of your preorder submission';
  end if;
  if p_extra_stock_ids is not null
     and coalesce(array_length(p_extra_stock_ids, 1), 0) > 0 then
    v_ids := p_extra_stock_ids;
  else
    if p_extra_stock_id is null then
      raise exception 'Extra is required';
    end if;
    v_ids := array[p_extra_stock_id];
  end if;
  if exists (
    select 1 from unnest(v_ids) as extra_id group by extra_id having count(*) > 1
  ) then
    raise exception 'Extra is required';
  end if;
  v_primary := v_ids[1];
  v_expected := array_length(v_ids, 1);
  v_method := coalesce(p_fulfilment_method, 'pickup'::public.fulfilment_method);

  perform public._assert_fresh_picks_customer_fulfilment(
    p_pickup_date,
    p_pickup_time,
    v_method
  );

  v_pickup_at := timezone(
    'Asia/Singapore',
    (p_pickup_date::text || ' ' || p_pickup_time::text)::timestamp
  );

  for v_id in
    select extra_id from unnest(v_ids) as extra_id order by extra_id
  loop
    select e.*
    into stock_row
    from public.extra_stock e
    where e.id = v_id
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
    if stock_row.cut_into_slices_at is not null then
      raise exception 'This Extra cake has already been sold';
    end if;
    if stock_row.confirmed_at is not null and now() < stock_row.confirmed_at then
      raise exception 'Extra is not available';
    end if;
    if stock_row.pickup_through_at is null or now() > stock_row.pickup_through_at then
      raise exception 'This Extra is no longer available to order';
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
  end loop;

  if p_complimentary is not null
     and jsonb_typeof(p_complimentary) <> 'array' then
    raise exception 'Complimentary items are invalid';
  end if;
  if p_paid_addons is not null
     and jsonb_typeof(p_paid_addons) <> 'array' then
    raise exception 'Paid add-ons are invalid';
  end if;

  active_collection := public.storefront_collection_for_pickup_date(p_pickup_date);

  update public.extra_stock e
  set sold_at = now(), updated_at = now()
  where e.id = any(v_ids)
    and e.sold_at is null
    and e.lifecycle = 'confirmed'
    and e.cut_into_slices_at is null;
  get diagnostics v_updated = row_count;
  if v_updated <> v_expected then
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
    email_submission_receipt_requested,
    include_receipt
  )
  values (
    public.allocate_order_number(),
    null,
    trim(p_customer_name),
    trim(p_phone),
    v_email,
    v_method,
    p_pickup_date,
    p_pickup_time,
    'submitted',
    'unpaid',
    nullif(trim(coalesce(p_notes, '')), ''),
    null,
    v_primary,
    false,
    'customer_website',
    v_receipt_requested,
    v_include_receipt
  )
  returning * into new_order;

  foreach v_id in array v_ids
  loop
    select e.* into stock_row from public.extra_stock e where e.id = v_id;
    select lcs.*
    into size_row
    from public.library_cake_sizes lcs
    where lcs.id = stock_row.library_cake_size_id
      and lcs.cake_id = stock_row.library_cake_id;
    if not found then
      raise exception 'This Extra cake cannot be ordered';
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
      stock_row.library_cake_id,
      stock_row.library_cake_size_id,
      1,
      coalesce(size_row.price, 0),
      stock_row.cake_name,
      stock_row.size_label
    );
  end loop;

  update public.extra_stock e
  set order_id = new_order.id, updated_at = now()
  where e.id = any(v_ids);

  if p_complimentary is not null
     and jsonb_typeof(p_complimentary) = 'array' then
    for complimentary in select * from jsonb_array_elements(p_complimentary)
    loop
      v_qty := coalesce((complimentary ->> 'quantity')::integer, 1);
      if v_qty <= 0 then
        continue;
      end if;
      if v_qty <> 1 then
        raise exception 'Complimentary quantity for this order must be 1';
      end if;

      if active_collection.id is null then
        raise exception 'Complimentary item is not available';
      end if;

      v_comp_name := null;
      v_comp_sort := 0;
      v_comp_code := nullif(lower(trim(coalesce(complimentary ->> 'code', ''))), '');
      begin
        v_type_id := nullif(trim(coalesce(complimentary ->> 'type_id', '')), '')::uuid;
      exception
        when others then
          v_type_id := null;
      end;

      select
        cit.id,
        cit.name,
        cci.sort_order
      into v_type_id, v_comp_name, v_comp_sort
      from public.complimentary_item_types cit
      join public.collection_complimentary_items cci
        on cci.complimentary_item_type_id = cit.id
      where cci.collection_id = active_collection.id
        and cci.is_available = true
        and cit.code in ('birthday_topper', 'candle', 'knife')
        and (
          (v_type_id is not null and cit.id = v_type_id)
          or (v_comp_code is not null and cit.code = v_comp_code)
        )
      limit 1;

      if v_comp_name is null then
        raise exception 'Complimentary item is not available';
      end if;

      insert into public.order_complimentary_items (
        order_id,
        complimentary_item_type_id,
        name,
        quantity,
        sort_order
      )
      values (
        new_order.id,
        v_type_id,
        v_comp_name,
        1,
        v_comp_sort
      );
    end loop;
  end if;

  if p_paid_addons is not null
     and jsonb_typeof(p_paid_addons) <> 'array' then
    raise exception 'Paid add-ons are invalid';
  end if;

  if p_paid_addons is not null
     and jsonb_typeof(p_paid_addons) = 'array' then
    for addon in select * from jsonb_array_elements(p_paid_addons)
    loop
      v_addon_code := nullif(lower(trim(coalesce(addon ->> 'code', ''))), '');
      if v_addon_code is null
         or v_addon_code not in ('birthday_card', 'wishing_card') then
        raise exception 'Paid add-on is not available';
      end if;
      v_qty := coalesce((addon ->> 'quantity')::integer, 1);
      if v_qty <> 1 then
        raise exception 'Paid add-on quantity for this order must be 1';
      end if;
    end loop;

    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'code', trim(addon_row ->> 'code'),
          'quantity', 1,
          'messages', case
            when addon_row ? 'messages' and jsonb_typeof(addon_row -> 'messages') = 'array'
              then jsonb_build_array(addon_row -> 'messages' -> 0)
            when addon_row ? 'written_message'
              then jsonb_build_array(addon_row -> 'written_message')
            else '[]'::jsonb
          end
        )
        order by trim(addon_row ->> 'code')
      ),
      '[]'::jsonb
    )
    into v_paid
    from jsonb_array_elements(p_paid_addons) as addon_row;
  end if;

  perform public._sync_order_paid_addons_from_payload(
    new_order.id,
    coalesce(v_paid, '[]'::jsonb)
  );

  perform public._sync_order_fulfilment_from_payload(
    new_order.id,
    v_method,
    case when v_method = 'delivery' then p_delivery else null end,
    case when v_method = 'dine_in' then p_dine_in else null end
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
      'item_count', v_expected,
      'source', 'customer_website_extra',
      'extra_stock_id', v_primary,
      'extra_stock_ids', to_jsonb(v_ids),
      'email_submission_receipt_requested', v_receipt_requested,
      'fulfilment_method', v_method::text
    )
  );

  select * into new_order from public.orders where id = new_order.id;
  return new_order;
exception
  when unique_violation then
    raise exception 'This Extra cake has already been sold';
end;
$$;

comment on function public.submit_guest_extra_order(
  text, text, text, date, time, text, uuid, boolean, boolean, jsonb, jsonb, uuid[],
  public.fulfilment_method, jsonb, jsonb
) is
  'Website Extra preorder. Claims exact extra_stock.id values only on submit. '
  'Validates Extra window, operating hours, same-day preparation cutoff/lead, '
  'and selected fulfilment method. Adding to a cart must not call this function.';

revoke all on function public.submit_guest_extra_order(
  text, text, text, date, time, text, uuid, boolean, boolean, jsonb, jsonb, uuid[],
  public.fulfilment_method, jsonb, jsonb
) from public;
grant execute on function public.submit_guest_extra_order(
  text, text, text, date, time, text, uuid, boolean, boolean, jsonb, jsonb, uuid[],
  public.fulfilment_method, jsonb, jsonb
) to anon, authenticated, service_role;
