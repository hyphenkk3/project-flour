-- Canonical dine-in party composition (adults / kids / toddlers) and
-- Whitebird split-seating acknowledgement storage.
-- Does not reject Whitebird groups above 6. Pickup/delivery unchanged.
-- Apply to DEV only.

alter table public.order_dine_in_reservations
  disable trigger user;

alter table public.order_dine_in_reservations
  add column if not exists adult_count integer not null default 0,
  add column if not exists kid_count integer not null default 0,
  add column if not exists toddler_count integer not null default 0,
  add column if not exists whitebird_split_seating_acknowledged boolean
    not null default false;

update public.order_dine_in_reservations
set adult_count = guest_count
where adult_count is distinct from guest_count;

alter table public.order_dine_in_reservations
  drop constraint if exists order_dine_in_reservations_party_nonneg;
alter table public.order_dine_in_reservations
  add constraint order_dine_in_reservations_party_nonneg
  check (
    adult_count >= 0
    and kid_count >= 0
    and toddler_count >= 0
  );

alter table public.order_dine_in_reservations
  drop constraint if exists order_dine_in_reservations_party_total;
alter table public.order_dine_in_reservations
  add constraint order_dine_in_reservations_party_total
  check (guest_count = adult_count + kid_count + toddler_count);

alter table public.order_dine_in_reservations
  enable trigger user;

comment on column public.order_dine_in_reservations.adult_count is
  'Adult guests. Sum with kid_count and toddler_count must equal guest_count.';
comment on column public.order_dine_in_reservations.kid_count is
  'Child guests. Informational; no seating inventory.';
comment on column public.order_dine_in_reservations.toddler_count is
  'Toddler guests. Does not reserve or guarantee a baby chair.';
comment on column public.order_dine_in_reservations.whitebird_split_seating_acknowledged is
  'Customer acknowledgement for Whitebird groups above 6. Staff flows may store false.';

create or replace function public.dine_in_json_nonneg_int(
  p_dine jsonb,
  p_key text
)
returns integer
language plpgsql
immutable
as $$
declare
  v_raw jsonb;
  v_text text;
  v_num numeric;
begin
  if p_dine is null or p_key is null then
    return null;
  end if;
  v_raw := p_dine -> p_key;
  if v_raw is null or v_raw = 'null'::jsonb then
    return null;
  end if;
  if jsonb_typeof(v_raw) = 'number' then
    v_num := (v_raw #>> '{}')::numeric;
    if v_num is null or v_num <> trunc(v_num) or v_num < 0 or v_num > 2147483647 then
      return null;
    end if;
    return v_num::integer;
  end if;
  v_text := btrim(v_raw #>> '{}');
  if v_text is null or v_text = '' then
    return null;
  end if;
  if v_text !~ '^[0-9]+$' then
    return null;
  end if;
  return v_text::integer;
exception when others then
  return null;
end;
$$;

comment on function public.dine_in_json_nonneg_int(jsonb, text) is
  'Parse a non-negative integer from a dine-in JSON field. Rejects decimals.';

create or replace function public.dine_in_json_acknowledged(p_dine jsonb)
returns boolean
language sql
immutable
as $$
  select coalesce(
    case
      when p_dine is null then false
      when jsonb_typeof(p_dine -> 'whitebird_split_seating_acknowledged') = 'boolean'
        then (p_dine ->> 'whitebird_split_seating_acknowledged')::boolean
      when lower(btrim(coalesce(
        p_dine ->> 'whitebird_split_seating_acknowledged',
        ''
      ))) in ('true', 'on', '1', 'yes') then true
      else false
    end,
    false
  );
$$;

create or replace function public.assert_dine_in_party_payload(
  p_dine jsonb,
  p_require_acknowledgement boolean default false
)
returns table (
  venue public.dine_in_venue,
  adult_count integer,
  kid_count integer,
  toddler_count integer,
  guest_count integer,
  whitebird_split_seating_acknowledged boolean,
  reservation_note text
)
language plpgsql
immutable
as $$
declare
  v_venue_text text;
  v_venue public.dine_in_venue;
  v_adult integer;
  v_kid integer;
  v_toddler integer;
  v_guest integer;
  v_ack boolean;
  v_has_breakdown boolean;
begin
  if p_dine is null or jsonb_typeof(p_dine) <> 'object' then
    raise exception 'Dine-in reservation payload is required for dine-in orders';
  end if;

  v_venue_text := lower(btrim(coalesce(p_dine ->> 'venue', '')));
  if v_venue_text not in ('hyphen', 'whitebird') then
    raise exception 'Please choose where you would like to sit.';
  end if;
  v_venue := v_venue_text::public.dine_in_venue;

  v_adult := public.dine_in_json_nonneg_int(p_dine, 'adult_count');
  v_kid := public.dine_in_json_nonneg_int(p_dine, 'kid_count');
  v_toddler := public.dine_in_json_nonneg_int(p_dine, 'toddler_count');
  v_has_breakdown := (v_adult is not null or v_kid is not null or v_toddler is not null);

  if v_has_breakdown then
    v_adult := coalesce(v_adult, 0);
    v_kid := coalesce(v_kid, 0);
    v_toddler := coalesce(v_toddler, 0);
    v_guest := v_adult + v_kid + v_toddler;
  else
    v_guest := public.dine_in_json_nonneg_int(p_dine, 'guest_count');
    if v_guest is null then
      raise exception 'Please enter how many guests are dining in.';
    end if;
    v_adult := v_guest;
    v_kid := 0;
    v_toddler := 0;
  end if;

  if v_guest is null or v_guest < 1 or v_guest > 50 then
    raise exception 'Please enter how many guests are dining in.';
  end if;

  v_ack := public.dine_in_json_acknowledged(p_dine);
  if v_venue = 'whitebird'
     and v_guest > 6
     and coalesce(p_require_acknowledgement, false)
     and v_ack is not true then
    raise exception
      'Please confirm you understand Whitebird seating for groups above 6 guests.';
  end if;

  venue := v_venue;
  adult_count := v_adult;
  kid_count := v_kid;
  toddler_count := v_toddler;
  guest_count := v_guest;
  whitebird_split_seating_acknowledged := (v_venue = 'whitebird' and v_guest > 6 and v_ack);
  reservation_note := nullif(btrim(coalesce(p_dine ->> 'reservation_note', '')), '');
  return next;
end;
$$;

comment on function public.assert_dine_in_party_payload(jsonb, boolean) is
  'Canonical dine-in party parse. Whitebird groups above 6 are allowed. '
  'Customer acknowledgement is required only when p_require_acknowledgement is true. '
  'guest_count is derived from adult/kid/toddler when those fields are present.';

revoke all on function public.assert_dine_in_party_payload(jsonb, boolean)
  from public, anon, authenticated;
grant execute on function public.dine_in_json_nonneg_int(jsonb, text)
  to anon, authenticated;
grant execute on function public.dine_in_json_acknowledged(jsonb)
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
  v_adult integer;
  v_kid integer;
  v_toddler integer;
  v_ack boolean;
  v_note text;
  v_date date;
  v_time time;
  v_reservation time;
  v_reservation_text text;
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

    select
      a.venue, a.adult_count, a.kid_count, a.toddler_count,
      a.guest_count, a.whitebird_split_seating_acknowledged, a.reservation_note
    into
      v_venue, v_adult, v_kid, v_toddler, v_guest, v_ack, v_note
    from public.assert_dine_in_party_payload(v_dine, false) a;

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
      venue, guest_count, adult_count, kid_count, toddler_count,
      whitebird_split_seating_acknowledged, reservation_note, status
    ) values (
      p_order_id, v_date, v_reservation, v_venue, v_guest,
      v_adult, v_kid, v_toddler, coalesce(v_ack, false), v_note, 'pending'
    )
    on conflict (order_id) do update set
      reservation_date = excluded.reservation_date,
      reservation_time = excluded.reservation_time,
      venue = excluded.venue,
      guest_count = excluded.guest_count,
      adult_count = excluded.adult_count,
      kid_count = excluded.kid_count,
      toddler_count = excluded.toddler_count,
      whitebird_split_seating_acknowledged =
        excluded.whitebird_split_seating_acknowledged,
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
  'Dine-in reservation_time is independent of orders.pickup_time (cake serving). '
  'Party totals are derived server-side. Whitebird groups above 6 are allowed.';

create or replace function public.submit_waiting_list_confirmation(
  p_token_hash text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link public.waiting_list_confirmation_links;
  v_request public.waiting_list_requests;
  v_method text;
  v_date date;
  v_time time;
  v_reservation time;
  v_venue public.dine_in_venue;
  v_guest integer;
  v_delivery jsonb;
  v_dine jsonb;
  v_stored jsonb;
  v_items jsonb := '[]'::jsonb;
  v_entry jsonb;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'This confirmation link is no longer available.';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Please complete your confirmation details.';
  end if;

  select l.*
  into v_link
  from public.waiting_list_confirmation_links l
  where l.token_hash = p_token_hash
  for update;
  if not found then
    raise exception 'This confirmation link is no longer available.';
  end if;

  if v_link.status = 'submitted' then
    raise exception 'Your confirmation has already been submitted.';
  end if;

  if v_link.status = 'issued' and v_link.expires_at <= now() then
    update public.waiting_list_confirmation_links
    set status = 'expired'
    where id = v_link.id
      and status = 'issued';
    raise exception 'This confirmation link has expired.';
  end if;

  if v_link.status <> 'issued' or v_link.expires_at <= now() then
    raise exception 'This confirmation link is no longer available.';
  end if;

  select r.*
  into v_request
  from public.waiting_list_requests r
  where r.id = v_link.request_id
  for update;
  if not found or v_request.status in ('cancelled', 'closed', 'converted') then
    raise exception 'This confirmation link is no longer available.';
  end if;

  if not public._waiting_list_confirmation_snapshot_matches(
    v_link.request_id,
    v_link.item_snapshot
  ) then
    raise exception 'This confirmation link is no longer available.';
  end if;

  begin
    v_date := nullif(trim(coalesce(p_payload ->> 'pickup_date', '')), '')::date;
  exception when others then
    v_date := null;
  end;
  if v_date is null or v_date is distinct from v_request.pickup_date then
    raise exception 'Please keep the requested collection date.';
  end if;

  -- Waiting List confirmation is not a new normal customer order.
  -- Do not reject solely because is_pickup_orders_closed is true.

  v_method := lower(trim(coalesce(p_payload ->> 'fulfilment_method', 'pickup')));
  if v_method not in ('pickup', 'delivery', 'dine_in') then
    raise exception 'Please choose pickup, dine-in, or delivery.';
  end if;

  begin
    v_time := nullif(trim(coalesce(p_payload ->> 'pickup_time', '')), '')::time;
  exception when others then
    v_time := null;
  end;
  if v_time is null then
    raise exception 'Please choose a valid date and time.';
  end if;

  if v_method = 'pickup' then
    -- Operating hours only. The public pickup-slot overlay that also
    -- applies storefront orders_closed must not be used here.
    if not public._pickup_slot_in_weekly_hours(v_date, v_time) then
      raise exception 'Please choose a valid pickup time for that date.';
    end if;
    if p_payload -> 'delivery' is not null and jsonb_typeof(p_payload -> 'delivery') = 'object'
       and coalesce(p_payload -> 'delivery', '{}'::jsonb) <> '{}'::jsonb then
      raise exception 'Delivery details are not used for pickup.';
    end if;
    if p_payload -> 'dine_in' is not null and jsonb_typeof(p_payload -> 'dine_in') = 'object'
       and coalesce(p_payload -> 'dine_in', '{}'::jsonb) <> '{}'::jsonb then
      raise exception 'Dine-in details are not used for pickup.';
    end if;
  elsif v_method = 'delivery' then
    if not public.is_valid_delivery_slot(v_date, v_time) then
      raise exception 'Please choose a valid delivery time for that date.';
    end if;
    v_delivery := p_payload -> 'delivery';
    if v_delivery is null or jsonb_typeof(v_delivery) <> 'object' then
      raise exception 'Please enter the delivery details.';
    end if;
    if char_length(trim(coalesce(v_delivery ->> 'recipient_name', ''))) = 0 then
      raise exception 'Please enter the recipient name.';
    end if;
    if char_length(trim(coalesce(v_delivery ->> 'recipient_phone', ''))) = 0 then
      raise exception 'Please enter the recipient phone.';
    end if;
    if char_length(trim(coalesce(v_delivery ->> 'address_line_1', ''))) = 0 then
      raise exception 'Please enter address line 1.';
    end if;
    if char_length(trim(coalesce(v_delivery ->> 'postcode', ''))) = 0 then
      raise exception 'Please enter the postcode.';
    end if;
  else
    v_dine := p_payload -> 'dine_in';
    if v_dine is null or jsonb_typeof(v_dine) <> 'object' then
      raise exception 'Dine-in reservation details are required.';
    end if;
    begin
      v_reservation := nullif(trim(coalesce(v_dine ->> 'reservation_time', '')), '')::time;
    exception when others then
      v_reservation := null;
    end;
    if v_reservation is null then
      raise exception 'Please choose a valid dine-in reservation time for that date.';
    end if;
    if not public.is_valid_dine_in_slot(v_date, v_reservation) then
      raise exception 'Please choose a valid dine-in reservation time for that date.';
    end if;
    if not public.is_valid_dine_in_slot(v_date, v_time) then
      raise exception 'Please choose a valid cake serving time for that date.';
    end if;
    if not public.is_valid_dine_in_serving_window(v_reservation, v_time) then
      raise exception
        'Cake serving time must be within 1 hour of the reservation time.';
    end if;
    begin
      v_venue := lower(trim(coalesce(v_dine ->> 'venue', '')))::public.dine_in_venue;
    exception when others then
      raise exception 'Please choose where you would like to sit.';
    end;
    if not public.is_valid_dine_in_venue(v_date, v_reservation, v_venue) then
      raise exception 'Please choose a valid dine-in venue for the reservation time.';
    end if;
    if not public.is_valid_dine_in_venue(v_date, v_time, v_venue) then
      raise exception 'Please choose a valid dine-in venue for the cake serving time.';
    end if;
    select a.guest_count
    into v_guest
    from public.assert_dine_in_party_payload(v_dine, true) a;
  end if;

  if char_length(trim(coalesce(p_payload ->> 'customer_name', ''))) = 0 then
    raise exception 'Please fill in your name and WhatsApp phone number.';
  end if;
  if char_length(trim(coalesce(p_payload ->> 'phone', ''))) = 0 then
    raise exception 'Please fill in your name and WhatsApp phone number.';
  end if;

  for v_entry in
    select value from jsonb_array_elements(v_link.item_snapshot)
  loop
    v_items := v_items || jsonb_build_array(
      jsonb_build_object(
        'waiting_list_item_id', v_entry ->> 'waiting_list_item_id',
        'cake_id', v_entry ->> 'cake_id',
        'cake_size_id', v_entry ->> 'cake_size_id',
        'quantity', (v_entry ->> 'offered_quantity')::integer
      )
    );
  end loop;

  v_stored := coalesce(p_payload, '{}'::jsonb)
    || jsonb_build_object(
      'items', v_items,
      'pickup_date', v_request.pickup_date,
      'pickup_time', v_time,
      'fulfilment_method', v_method
    );
  -- Never persist a client-supplied item list. Snapshot quantities are locked.
  v_stored := v_stored - 'token' - 'token_hash' - 'request_id';

  update public.waiting_list_confirmation_links
  set
    status = 'submitted',
    submitted_at = now(),
    submitted_payload = v_stored
  where id = v_link.id
    and status = 'issued'
    and expires_at > now();
  if not found then
    raise exception 'Your confirmation has already been submitted.';
  end if;

  perform public._waiting_list_append_event(
    v_link.request_id,
    null,
    'confirmation_link_submitted',
    null,
    jsonb_build_object(
      'confirmation_link_id', v_link.id,
      'fulfilment_method', v_method
    )
  );

  return jsonb_build_object('ok', true);
end;
$$;

comment on function public.submit_waiting_list_confirmation(text, jsonb) is
  'One-time Waiting List confirmation submit. Stores payload only. Does not create an order. '
  'Does not apply the storefront orders_closed overlay; pickup uses operating hours. '
  'Dine-in uses canonical party validation; Whitebird groups above 6 require acknowledgement.';

revoke all on function public.submit_waiting_list_confirmation(text, jsonb)
  from public;
grant execute on function public.submit_waiting_list_confirmation(text, jsonb)
  to anon, authenticated;
