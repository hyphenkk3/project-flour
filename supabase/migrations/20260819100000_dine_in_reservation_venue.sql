-- Whole Cake dine-in venue (Hyphen | Whitebird).
-- Cake booking window: Mon/Tue/Thu 12:00–17:00; Fri–Sun 12:00–21:30.
-- Venue last bookable is 30 minutes before that outlet closes.
-- Extra submit_guest_extra_order is unchanged.
-- Pickup / Delivery RPC payloads are unchanged.
-- Wednesday: SQL still rejects every Wednesday (PICKUP_DATE_OVERRIDES is
-- TypeScript-only; do not add a second calendar here).

create type public.dine_in_venue as enum ('hyphen', 'whitebird');

alter table public.order_dine_in_reservations
  add column if not exists venue public.dine_in_venue;

do $$
begin
  if exists (
    select 1
    from public.order_dine_in_reservations
    where venue is null
  ) then
    raise exception
      'order_dine_in_reservations.venue must be backfilled before NOT NULL';
  end if;
end;
$$;

alter table public.order_dine_in_reservations
  alter column venue set not null;

comment on column public.order_dine_in_reservations.venue is
  'Customer-selected dine-in outlet: hyphen | whitebird.';

create or replace function public.is_valid_dine_in_slot(
  p_date date,
  p_time time
)
returns boolean
language plpgsql
stable
set search_path = public
as $$
declare
  v_dow integer;
begin
  if p_date is null or p_time is null then
    return false;
  end if;
  if not public._clock_on_30_min_grid(p_time) then
    return false;
  end if;
  v_dow := extract(dow from p_date)::integer;
  if v_dow = 3 then
    return false;
  end if;
  if p_time < time '12:00' then
    return false;
  end if;
  if v_dow in (1, 2, 4) then
    return p_time <= time '17:00';
  end if;
  if v_dow in (0, 5, 6) then
    return p_time <= time '21:30';
  end if;
  return false;
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
set search_path = public
as $$
begin
  if p_venue is null then
    return false;
  end if;
  if not public.is_valid_dine_in_slot(p_date, p_time) then
    return false;
  end if;
  if p_venue = 'hyphen' then
    return p_time <= time '17:00';
  end if;
  return true;
end;
$$;

grant execute on function public.is_valid_dine_in_slot(date, time)
  to anon, authenticated;
grant execute on function public.is_valid_dine_in_venue(
  date, time, public.dine_in_venue
) to anon, authenticated;

create or replace function public._sync_order_fulfilment_from_payload(
  p_order_id uuid,
  p_fulfilment_method public.fulfilment_method,
  p_delivery jsonb default null,
  p_dine_in jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_method public.fulfilment_method;
  v_delivery jsonb;
  v_dine jsonb;
  v_name text;
  v_phone text;
  v_line1 text;
  v_line2 text;
  v_postcode text;
  v_city text;
  v_state text;
  v_notify text;
  v_notify_pref public.recipient_notify_preference;
  v_has_delivery boolean;
  v_has_dine boolean;
  v_existing boolean;
  v_default_proc numeric(10, 2);
  v_guest integer;
  v_note text;
  v_date date;
  v_time time;
  v_venue_text text;
  v_venue public.dine_in_venue;
begin
  if p_order_id is null then
    raise exception 'Order id is required';
  end if;
  if p_fulfilment_method is null then
    raise exception 'Fulfilment method is required';
  end if;

  v_method := p_fulfilment_method;
  v_delivery := p_delivery;
  v_dine := p_dine_in;
  v_has_delivery := (
    v_delivery is not null
    and jsonb_typeof(v_delivery) = 'object'
    and v_delivery <> '{}'::jsonb
  );
  v_has_dine := (
    v_dine is not null
    and jsonb_typeof(v_dine) = 'object'
    and v_dine <> '{}'::jsonb
  );

  if v_method = 'delivery' then
    if v_has_dine then
      raise exception 'Dine-in payload is not allowed for delivery orders';
    end if;
    if not v_has_delivery then
      raise exception 'Delivery details payload is required for delivery orders';
    end if;

    v_name := nullif(trim(coalesce(v_delivery ->> 'recipient_name', '')), '');
    v_phone := nullif(trim(coalesce(v_delivery ->> 'recipient_phone', '')), '');
    v_line1 := nullif(trim(coalesce(v_delivery ->> 'address_line_1', '')), '');
    v_line2 := nullif(trim(coalesce(v_delivery ->> 'address_line_2', '')), '');
    v_postcode := nullif(trim(coalesce(v_delivery ->> 'postcode', '')), '');
    v_city := nullif(trim(coalesce(v_delivery ->> 'city', '')), '');
    v_state := nullif(trim(coalesce(v_delivery ->> 'state', '')), '');
    v_notify := nullif(
      trim(coalesce(v_delivery ->> 'recipient_notify_preference', '')),
      ''
    );
    if v_name is null then raise exception 'Recipient name is required'; end if;
    if v_phone is null then raise exception 'Recipient phone is required'; end if;
    if v_line1 is null then raise exception 'Address line 1 is required'; end if;
    if v_postcode is null then raise exception 'Postcode is required'; end if;
    if v_city is null then raise exception 'City is required'; end if;
    if v_state is null then raise exception 'State is required'; end if;
    if v_notify is null then
      raise exception 'Recipient notification preference is required';
    end if;
    if v_notify not in ('inform_recipient', 'do_not_inform_recipient') then
      raise exception 'Invalid recipient notification preference';
    end if;
    v_notify_pref := v_notify::public.recipient_notify_preference;

    update public.orders
    set fulfilment_method = 'delivery', updated_at = now()
    where id = p_order_id;
    if not found then raise exception 'Order not found'; end if;

    delete from public.order_dine_in_reservations where order_id = p_order_id;

    select exists (
      select 1 from public.order_delivery_details d where d.order_id = p_order_id
    ) into v_existing;
    v_default_proc := public.current_delivery_processing_fee_default();

    if v_existing then
      update public.order_delivery_details
      set
        recipient_name = v_name,
        recipient_phone = v_phone,
        address_line_1 = v_line1,
        address_line_2 = v_line2,
        postcode = v_postcode,
        city = v_city,
        state = v_state,
        recipient_notify_preference = v_notify_pref,
        updated_at = now()
      where order_id = p_order_id;
    else
      insert into public.order_delivery_details (
        order_id, recipient_name, recipient_phone,
        address_line_1, address_line_2, postcode, city, state,
        recipient_notify_preference, delivery_finance_enabled,
        processing_fee_applicable_amount, processing_fee_override_amount,
        processing_fee_waived, delivery_fee_status,
        delivery_fee_quoted_amount, delivery_fee_waived
      ) values (
        p_order_id, v_name, v_phone, v_line1, v_line2, v_postcode, v_city, v_state,
        v_notify_pref, true, v_default_proc, null, false, 'not_set', null, false
      );
      perform public._sync_delivery_finance_adjustments(p_order_id, null);
    end if;
    return;
  end if;

  if v_method = 'dine_in' then
    if v_has_delivery then
      raise exception 'Delivery details payload is not allowed for dine-in orders';
    end if;
    if not v_has_dine then
      raise exception 'Dine-in reservation payload is required for dine-in orders';
    end if;
    begin
      v_guest := (v_dine ->> 'guest_count')::integer;
    exception when others then
      v_guest := null;
    end;
    if v_guest is null or v_guest < 1 or v_guest > 50 then
      raise exception 'Guest count is required';
    end if;
    v_note := nullif(trim(coalesce(v_dine ->> 'reservation_note', '')), '');
    v_venue_text := lower(trim(coalesce(v_dine ->> 'venue', '')));
    if v_venue_text not in ('hyphen', 'whitebird') then
      raise exception 'Please choose where you would like to sit.';
    end if;
    v_venue := v_venue_text::public.dine_in_venue;
    select pickup_date, pickup_time into v_date, v_time
    from public.orders where id = p_order_id;
    if not found then raise exception 'Order not found'; end if;
    if not public.is_valid_dine_in_venue(v_date, v_time, v_venue) then
      raise exception 'Please choose a valid dine-in venue for that date and time.';
    end if;

    perform public._clear_delivery_finance_for_order(p_order_id, null);
    delete from public.order_delivery_details where order_id = p_order_id;

    update public.orders
    set fulfilment_method = 'dine_in', updated_at = now()
    where id = p_order_id;

    insert into public.order_dine_in_reservations (
      order_id, reservation_date, reservation_time,
      venue, guest_count, reservation_note, status
    ) values (
      p_order_id, v_date, v_time, v_venue, v_guest, v_note, 'pending'
    )
    on conflict (order_id) do update set
      reservation_date = excluded.reservation_date,
      reservation_time = excluded.reservation_time,
      venue = excluded.venue,
      guest_count = excluded.guest_count,
      reservation_note = excluded.reservation_note,
      updated_at = now();
    return;
  end if;

  if v_has_delivery then
    raise exception
      'Delivery details payload is not allowed when fulfilment is %',
      v_method;
  end if;
  if v_has_dine then
    raise exception
      'Dine-in payload is not allowed when fulfilment is %',
      v_method;
  end if;

  update public.orders
  set fulfilment_method = v_method, updated_at = now()
  where id = p_order_id;
  if not found then raise exception 'Order not found'; end if;

  perform public._clear_delivery_finance_for_order(p_order_id, null);
  delete from public.order_delivery_details where order_id = p_order_id;
  delete from public.order_dine_in_reservations where order_id = p_order_id;
end;
$$;

revoke all on function public._sync_order_fulfilment_from_payload(
  uuid, public.fulfilment_method, jsonb, jsonb
) from public, anon, authenticated;

comment on function public._sync_order_fulfilment_from_payload(
  uuid, public.fulfilment_method, jsonb, jsonb
) is
  'INTERNAL ONLY — fulfilment + delivery details + dine-in reservation sync.';

comment on function public.is_valid_dine_in_slot(date, time) is
  'Cake dine-in booking window. Wednesday always false in SQL; '
  'special-open Wednesdays are enforced in TypeScript via PICKUP_DATE_OVERRIDES.';

comment on function public.is_valid_dine_in_venue(
  date, time, public.dine_in_venue
) is
  'Venue must be bookable for the selected cake dine-in date/time. '
  'Hyphen last bookable 17:00; Whitebird follows the cake window.';
