-- Waiting List customer confirmation lookup + one-time submit (Phase B).
-- Does not create orders. Does not add Waiting List-specific hours or slots.
-- Fulfilment times are validated with the existing public slot functions:
-- is_valid_public_pickup_slot / is_valid_delivery_slot / is_valid_dine_in_slot
-- plus is_valid_dine_in_serving_window / is_valid_dine_in_venue.
-- Link expiry remains waiting_list_confirmation_links.expires_at
-- (existing response_deadline_at). Not fulfilment-time minus 30 minutes.

create or replace function public._waiting_list_confirmation_snapshot_matches(
  p_request_id uuid,
  p_snapshot jsonb
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_entry jsonb;
  v_item public.waiting_list_items;
  v_hold public.production_capacity_holds;
  v_item_id uuid;
  v_cake_id uuid;
  v_size_id uuid;
  v_qty integer;
  v_count integer := 0;
begin
  if p_request_id is null
     or p_snapshot is null
     or jsonb_typeof(p_snapshot) <> 'array'
     or jsonb_array_length(p_snapshot) < 1 then
    return false;
  end if;

  for v_entry in
    select value from jsonb_array_elements(p_snapshot)
  loop
    begin
      v_item_id := (v_entry ->> 'waiting_list_item_id')::uuid;
      v_cake_id := (v_entry ->> 'cake_id')::uuid;
      v_size_id := (v_entry ->> 'cake_size_id')::uuid;
      v_qty := (v_entry ->> 'offered_quantity')::integer;
    exception when others then
      return false;
    end;
    if v_item_id is null or v_cake_id is null or v_size_id is null or v_qty is null then
      return false;
    end if;
    if v_qty < 1 then
      return false;
    end if;

    select i.*
    into v_item
    from public.waiting_list_items i
    where i.id = v_item_id
      and i.request_id = p_request_id;

    if not found then
      return false;
    end if;
    if v_item.status <> 'contacted' then
      return false;
    end if;
    if v_item.library_cake_id is distinct from v_cake_id then
      return false;
    end if;
    if v_item.library_cake_size_id is distinct from v_size_id then
      return false;
    end if;
    if v_item.remaining_quantity < v_qty then
      return false;
    end if;

    select h.*
    into v_hold
    from public.production_capacity_holds h
    where h.waiting_list_item_id = v_item.id
      and h.status = 'active'
    order by h.held_at desc
    limit 1;
    if not found then
      return false;
    end if;
    if v_hold.held_until <= now() then
      return false;
    end if;
    if v_hold.quantity is distinct from v_qty then
      return false;
    end if;

    v_count := v_count + 1;
  end loop;

  return v_count = jsonb_array_length(p_snapshot);
end;
$$;

revoke all on function public._waiting_list_confirmation_snapshot_matches(uuid, jsonb)
  from public, anon, authenticated;

create or replace function public.lookup_waiting_list_confirmation_link(
  p_token_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link public.waiting_list_confirmation_links;
  v_request public.waiting_list_requests;
  v_items jsonb := '[]'::jsonb;
  v_entry jsonb;
  v_cake_name text;
  v_size_label text;
  v_unit_price numeric;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('outcome', 'unavailable');
  end if;

  select l.*
  into v_link
  from public.waiting_list_confirmation_links l
  where l.token_hash = p_token_hash
  for update;
  if not found then
    return jsonb_build_object('outcome', 'unavailable');
  end if;

  if v_link.status = 'submitted' then
    return jsonb_build_object(
      'outcome', 'submitted',
      'expires_at', v_link.expires_at
    );
  end if;

  if v_link.status = 'issued' and v_link.expires_at <= now() then
    update public.waiting_list_confirmation_links
    set status = 'expired'
    where id = v_link.id
      and status = 'issued';
    v_link.status := 'expired';
  end if;

  if v_link.status = 'expired' then
    return jsonb_build_object(
      'outcome', 'expired',
      'expires_at', v_link.expires_at
    );
  end if;

  if v_link.status <> 'issued' then
    return jsonb_build_object('outcome', 'unavailable');
  end if;

  select r.*
  into v_request
  from public.waiting_list_requests r
  where r.id = v_link.request_id
  for update;
  if not found or v_request.status in ('cancelled', 'closed', 'converted') then
    return jsonb_build_object('outcome', 'unavailable');
  end if;

  if not public._waiting_list_confirmation_snapshot_matches(
    v_link.request_id,
    v_link.item_snapshot
  ) then
    return jsonb_build_object('outcome', 'unavailable');
  end if;

  for v_entry in
    select value from jsonb_array_elements(v_link.item_snapshot)
  loop
    select c.name, s.label, s.price
    into v_cake_name, v_size_label, v_unit_price
    from public.library_cakes c
    join public.library_cake_sizes s
      on s.id = (v_entry ->> 'cake_size_id')::uuid
     and s.cake_id = c.id
    where c.id = (v_entry ->> 'cake_id')::uuid;
    if v_cake_name is null then
      return jsonb_build_object('outcome', 'unavailable');
    end if;
    v_items := v_items || jsonb_build_array(
      jsonb_build_object(
        'cake_name', v_cake_name,
        'size_label', v_size_label,
        'quantity', (v_entry ->> 'offered_quantity')::integer,
        'unit_price', v_unit_price
      )
    );
  end loop;

  return jsonb_build_object(
    'outcome', 'usable',
    'expires_at', v_link.expires_at,
    'guest_name', v_request.guest_name,
    'guest_phone', v_request.guest_phone,
    'pickup_date', v_request.pickup_date,
    'items', v_items
  );
end;
$$;

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

  if public.is_pickup_orders_closed(v_date) then
    raise exception 'Orders are closed for that pickup date.';
  end if;

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
    if not public.is_valid_public_pickup_slot(v_date, v_time) then
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

comment on function public.lookup_waiting_list_confirmation_link(text) is
  'Capability lookup by SHA-256 token hash. Does not return token_hash or request_id.';

comment on function public.submit_waiting_list_confirmation(text, jsonb) is
  'One-time Waiting List confirmation submit. Stores payload only. Does not create an order.';

revoke all on function public.lookup_waiting_list_confirmation_link(text)
  from public;
grant execute on function public.lookup_waiting_list_confirmation_link(text)
  to anon, authenticated;

revoke all on function public.submit_waiting_list_confirmation(text, jsonb)
  from public;
grant execute on function public.submit_waiting_list_confirmation(text, jsonb)
  to anon, authenticated;
