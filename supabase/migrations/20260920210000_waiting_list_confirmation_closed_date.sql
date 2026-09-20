-- Waiting List confirmation: do not reject solely because the storefront
-- orders_closed overlay applies to ordinary customer orders.
-- Pickup slots still use existing operating hours (_pickup_slot_in_weekly_hours).
-- Delivery / dine-in still use is_valid_delivery_slot / is_valid_dine_in_slot.
-- Does not create orders. Does not add Waiting List-specific hours or cutoffs.
-- Does not change the public pickup-slot overlay used by normal checkout.

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
    begin
      v_guest := (v_dine ->> 'guest_count')::integer;
    exception when others then
      v_guest := null;
    end;
    if v_guest is null or v_guest < 1 or v_guest > 50 then
      raise exception 'Please enter how many guests are dining in.';
    end if;
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
  'Does not apply the storefront orders_closed overlay; pickup uses operating hours.';

revoke all on function public.submit_waiting_list_confirmation(text, jsonb)
  from public;
grant execute on function public.submit_waiting_list_confirmation(text, jsonb)
  to anon, authenticated;
