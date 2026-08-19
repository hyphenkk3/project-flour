-- Independent dine-in reservation start vs cake serving time.
-- Does not add tables. Reuses order_dine_in_reservations.reservation_time.
-- Do not apply automatically.

create or replace function public.is_valid_dine_in_serving_window(
  p_reservation_time time,
  p_serving_time time
)
returns boolean
language sql
immutable
as $$
  select
    p_reservation_time is not null
    and p_serving_time is not null
    and p_serving_time >= p_reservation_time
    and p_serving_time <= p_reservation_time + interval '60 minutes';
$$;

comment on function public.is_valid_dine_in_serving_window(time, time) is
  'Cake serving time must be the reservation start or up to 60 minutes later.';

grant execute on function public.is_valid_dine_in_serving_window(time, time)
  to anon, authenticated;

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
  v_reservation time;
  v_reservation_text text;
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
    v_reservation_text := nullif(trim(coalesce(v_dine ->> 'reservation_time', '')), '');
    if v_reservation_text is null then
      raise exception 'Dine-in reservation time is required';
    end if;
    begin
      v_reservation := v_reservation_text::time;
    exception when others then
      raise exception 'Please choose a valid dine-in reservation time.';
    end;

    select pickup_date, pickup_time into v_date, v_time
    from public.orders where id = p_order_id;
    if not found then raise exception 'Order not found'; end if;

    if not public.is_valid_dine_in_slot(v_date, v_reservation) then
      raise exception 'Please choose a valid dine-in reservation time for that date.';
    end if;
    if not public.is_valid_dine_in_slot(v_date, v_time) then
      raise exception 'Please choose a valid cake serving time for that date.';
    end if;
    if not public.is_valid_dine_in_serving_window(v_reservation, v_time) then
      raise exception 'Cake serving time must be within 1 hour of the reservation time.';
    end if;
    if not public.is_valid_dine_in_venue(v_date, v_reservation, v_venue) then
      raise exception 'Please choose a valid dine-in venue for the reservation time.';
    end if;
    if not public.is_valid_dine_in_venue(v_date, v_time, v_venue) then
      raise exception 'Please choose a valid dine-in venue for the cake serving time.';
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
      p_order_id, v_date, v_reservation, v_venue, v_guest, v_note, 'pending'
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
  'INTERNAL ONLY — fulfilment + delivery details + dine-in reservation sync. '
  'Dine-in reservation_time is independent of orders.pickup_time (cake serving).';
