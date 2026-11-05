CREATE OR REPLACE FUNCTION public.waiting_list_convert_confirmation(p_actor_staff_id uuid, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_request public.waiting_list_requests;
  v_link public.waiting_list_confirmation_links;
  v_latest public.waiting_list_confirmation_links;
  v_item public.waiting_list_items;
  v_hold public.production_capacity_holds;
  v_order public.orders;
  v_payload jsonb;
  v_entry jsonb;
  v_item_id uuid;
  v_cake_id uuid;
  v_size_id uuid;
  v_qty integer;
  v_consume integer;
  v_date date;
  v_time time;
  v_method text;
  v_name text;
  v_phone text;
  v_email text;
  v_notes text;
  v_include_receipt boolean;
  v_delivery jsonb;
  v_dine jsonb;
  v_reservation time;
  v_venue public.dine_in_venue;
  v_guest integer;
  v_items jsonb := '[]'::jsonb;
  v_eligible_cakes integer:=0;
  v_complimentary jsonb := '[]'::jsonb;
  v_paid jsonb := '[]'::jsonb;
  v_addon jsonb;
begin
  p_actor_staff_id := public._bind_rpc_actor(p_actor_staff_id);
  -- Verified request identity survives nested SECURITY DEFINER calls.
  if auth.uid() is null or p_actor_staff_id is null or not exists (
    select 1 from public.staff_profiles sp
    join public.roles r on r.id = sp.role_id
    where sp.auth_user_id = auth.uid()
      and sp.id = p_actor_staff_id
      and sp.is_active = true
      and r.code in ('owner', 'manager', 'customer_operations', 'bakery')
  ) then
    raise exception using errcode = '42501', message = 'Not authorized: an active staff session with the required role is required';
  end if;
  perform public._waiting_list_assert_manage_staff(p_actor_staff_id);

  if p_request_id is null then
    raise exception 'Waiting-list request is required';
  end if;

  select r.*
  into v_request
  from public.waiting_list_requests r
  where r.id = p_request_id
  for update;
  if not found then
    raise exception 'Waiting-list request not found';
  end if;

  update public.waiting_list_confirmation_links
  set status = 'expired'
  where request_id = p_request_id
    and status = 'issued'
    and expires_at <= now();

  select l.*
  into v_link
  from public.waiting_list_confirmation_links l
  where l.request_id = p_request_id
    and l.status in ('submitted', 'converted')
  order by
    case l.status
      when 'submitted' then 0
      else 1
    end,
    l.issued_at desc
  limit 1
  for update;

  if not found then
    select l.*
    into v_latest
    from public.waiting_list_confirmation_links l
    where l.request_id = p_request_id
    order by l.issued_at desc
    limit 1
    for update;

    if not found then
      raise exception 'Confirmation link not found';
    end if;
    if v_latest.status = 'expired' then
      raise exception 'This confirmation link has expired';
    end if;
    if v_latest.status = 'invalidated' then
      raise exception 'This confirmation link has been invalidated';
    end if;
    raise exception 'This confirmation has not been submitted';
  end if;

  if v_link.status = 'converted' then
    select o.*
    into v_order
    from public.orders o
    where o.id = v_link.converted_order_id;
    if not found then
      raise exception 'This confirmation has already been converted';
    end if;
    return jsonb_build_object(
      'ok', true,
      'already_converted', true,
      'order_id', v_order.id,
      'order_number', v_order.order_number
    );
  end if;

  if v_link.status <> 'submitted' then
    raise exception 'This confirmation has not been submitted';
  end if;
  if v_link.submitted_payload is null
     or jsonb_typeof(v_link.submitted_payload) <> 'object' then
    raise exception 'Customer details are missing';
  end if;
  if v_link.converted_order_id is not null then
    raise exception 'This confirmation has already been converted';
  end if;

  if v_request.status in ('cancelled', 'closed') then
    raise exception 'This waiting-list request is no longer convertible';
  end if;

  v_payload := v_link.submitted_payload;

  -- Conversion consumes an already-held offered snapshot.
  -- Do not use waiting_list_items.remaining_quantity as availability.
  -- Do not use production_capacity remaining.
  for v_entry in
    select value from jsonb_array_elements(v_link.item_snapshot)
  loop
    begin
      v_item_id := (v_entry ->> 'waiting_list_item_id')::uuid;
      v_cake_id := (v_entry ->> 'cake_id')::uuid;
      v_size_id := (v_entry ->> 'cake_size_id')::uuid;
      v_qty := (v_entry ->> 'offered_quantity')::integer;
    exception when others then
      raise exception 'This confirmation no longer matches the waiting-list items';
    end;
    if v_item_id is null or v_cake_id is null or v_size_id is null
       or v_qty is null or v_qty < 1 then
      raise exception 'This confirmation no longer matches the waiting-list items';
    end if;

    select i.*
    into v_item
    from public.waiting_list_items i
    where i.id = v_item_id
      and i.request_id = p_request_id
    for update;
    if not found then
      raise exception 'This waiting-list request is no longer convertible';
    end if;
    if v_item.converted_order_id is not null then
      raise exception 'This waiting-list item has already been converted';
    end if;
    if v_item.status = 'converted' then
      raise exception 'This waiting-list item has already been converted';
    end if;
    if v_item.status not in ('contacted', 'accepted', 'partially_accepted') then
      raise exception 'This waiting-list request is no longer convertible';
    end if;
    if v_item.library_cake_id is distinct from v_cake_id
       or v_item.library_cake_size_id is distinct from v_size_id then
      raise exception 'This confirmation no longer matches the waiting-list items';
    end if;

    select h.*
    into v_hold
    from public.production_capacity_holds h
    where h.waiting_list_item_id = v_item.id
      and h.status = 'active'
    order by h.held_at desc
    limit 1
    for update;
    if not found then
      raise exception 'Hold no longer valid';
    end if;
    if v_hold.held_until <= now() then
      raise exception 'Hold no longer valid';
    end if;
    if v_hold.quantity is distinct from v_qty then
      raise exception 'Offered quantity is no longer available';
    end if;

    v_items := v_items || jsonb_build_array(
      jsonb_build_object(
        'cake_id', v_cake_id,
        'cake_size_id', v_size_id,
        'quantity', v_qty
      )
    );
    v_eligible_cakes:=v_eligible_cakes+v_qty;
  end loop;

  if jsonb_array_length(v_items) < 1 then
    raise exception 'This confirmation no longer matches the waiting-list items';
  end if;
  perform staff_preorder_private.assert_complimentary_entitlement(
    v_payload->'complimentary',v_eligible_cakes
  );

  v_date := v_request.pickup_date;
  begin
    if nullif(trim(coalesce(v_payload ->> 'pickup_date', '')), '')::date
       is distinct from v_date then
      raise exception 'Invalid fulfilment data';
    end if;
  exception
    when raise_exception then
      raise;
    when others then
      raise exception 'Invalid fulfilment data';
  end;

  v_method := lower(trim(coalesce(v_payload ->> 'fulfilment_method', '')));
  if v_method not in ('pickup', 'delivery', 'dine_in') then
    raise exception 'Invalid fulfilment data';
  end if;

  begin
    v_time := nullif(trim(coalesce(v_payload ->> 'pickup_time', '')), '')::time;
  exception when others then
    v_time := null;
  end;
  if v_time is null then
    raise exception 'Invalid fulfilment data';
  end if;

  if v_method = 'pickup' then
    if not public._pickup_slot_in_weekly_hours(v_date, v_time) then
      raise exception 'Invalid fulfilment data';
    end if;
    v_delivery := null;
    v_dine := null;
  elsif v_method = 'delivery' then
    if not public.is_valid_delivery_slot(v_date, v_time) then
      raise exception 'Invalid fulfilment data';
    end if;
    v_delivery := v_payload -> 'delivery';
    if v_delivery is null or jsonb_typeof(v_delivery) <> 'object' then
      raise exception 'Invalid fulfilment data';
    end if;
    v_dine := null;
  else
    v_dine := v_payload -> 'dine_in';
    if v_dine is null or jsonb_typeof(v_dine) <> 'object' then
      raise exception 'Invalid fulfilment data';
    end if;
    begin
      v_reservation := nullif(trim(coalesce(v_dine ->> 'reservation_time', '')), '')::time;
    exception when others then
      v_reservation := null;
    end;
    if v_reservation is null
       or not public.is_valid_dine_in_slot(v_date, v_reservation)
       or not public.is_valid_dine_in_slot(v_date, v_time)
       or not public.is_valid_dine_in_serving_window(v_reservation, v_time) then
      raise exception 'Invalid fulfilment data';
    end if;
    begin
      v_venue := lower(trim(coalesce(v_dine ->> 'venue', '')))::public.dine_in_venue;
    exception when others then
      raise exception 'Invalid fulfilment data';
    end;
    if not public.is_valid_dine_in_venue(v_date, v_reservation, v_venue)
       or not public.is_valid_dine_in_venue(v_date, v_time, v_venue) then
      raise exception 'Invalid fulfilment data';
    end if;
    begin
      v_guest := (v_dine ->> 'guest_count')::integer;
    exception when others then
      v_guest := null;
    end;
    if v_guest is null or v_guest < 1 or v_guest > 50 then
      raise exception 'Invalid fulfilment data';
    end if;
    v_delivery := null;
  end if;

  v_name := nullif(trim(coalesce(v_payload ->> 'customer_name', '')), '');
  if v_name is null then
    v_name := nullif(trim(coalesce(v_request.guest_name, '')), '');
  end if;
  v_phone := nullif(trim(coalesce(v_payload ->> 'phone', '')), '');
  if v_phone is null then
    v_phone := nullif(trim(coalesce(v_request.guest_phone, '')), '');
  end if;
  v_email := nullif(trim(coalesce(v_payload ->> 'email', '')), '');
  v_notes := nullif(trim(coalesce(v_payload ->> 'notes', '')), '');
  v_include_receipt := coalesce((v_payload ->> 'include_receipt')::boolean, false);

  if v_name is null then
    raise exception 'Customer details are missing';
  end if;

  if jsonb_typeof(v_payload -> 'complimentary') = 'array' then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'type_id', elem ->> 'type_id',
          'name', elem ->> 'name',
          'quantity', coalesce((elem ->> 'quantity')::integer, 1),
          'sort_order', coalesce((elem ->> 'sort_order')::integer, 0)
        )
        order by ordinality
      ),
      '[]'::jsonb
    )
    into v_complimentary
    from jsonb_array_elements(v_payload -> 'complimentary')
      with ordinality as t(elem, ordinality);
  end if;

  if jsonb_typeof(v_payload -> 'paid_addons') = 'array' then
    v_paid := '[]'::jsonb;
    for v_addon in
      select value
      from jsonb_array_elements(v_payload -> 'paid_addons')
    loop
      if nullif(trim(coalesce(v_addon ->> 'code', '')), '') is null then
        continue;
      end if;
      v_paid := v_paid || jsonb_build_array(
        jsonb_build_object(
          'code', v_addon ->> 'code',
          'quantity', coalesce((v_addon ->> 'quantity')::integer, 1),
          'messages', case
            when jsonb_typeof(v_addon -> 'messages') = 'array'
              then v_addon -> 'messages'
            else '[]'::jsonb
          end
        )
      );
    end loop;
  end if;

  -- Server-side catalogue prices only. Client unit_price / subtotal are ignored.
  v_order := staff_preorder_private.create_waiting_list_preorder(
    p_actor_staff_id,
    v_name,
    v_phone,
    v_email,
    'whatsapp',
    false,
    v_date,
    v_time,
    null,
    v_items,
    coalesce(v_complimentary, '[]'::jsonb),
    v_include_receipt,
    false,
    null,
    v_notes,
    'Converted from waiting list confirmation',
    coalesce(v_paid, '[]'::jsonb),
    v_method::public.fulfilment_method,
    v_delivery,
    v_dine
  );

  for v_entry in
    select value from jsonb_array_elements(v_link.item_snapshot)
  loop
    v_item_id := (v_entry ->> 'waiting_list_item_id')::uuid;
    v_qty := (v_entry ->> 'offered_quantity')::integer;

    select i.*
    into v_item
    from public.waiting_list_items i
    where i.id = v_item_id
    for update;

    select h.*
    into v_hold
    from public.production_capacity_holds h
    where h.waiting_list_item_id = v_item_id
      and h.status = 'active'
    order by h.held_at desc
    limit 1
    for update;

    if v_hold.id is not null then
      update public.production_capacity_holds h
      set
        status = 'converted',
        converted_order_id = v_order.id,
        released_at = now()
      where h.id = v_hold.id;
    end if;

    -- If Record response already consumed remaining_quantity for this offer,
    -- do not increment accepted_quantity again. Final accepted_quantity still
    -- reflects the converted offered quantity.
    v_consume := least(v_qty, v_item.remaining_quantity);

    update public.waiting_list_items i
    set
      accepted_quantity = i.accepted_quantity + v_consume,
      converted_order_id = v_order.id,
      status = case
        when i.remaining_quantity - v_consume <= 0 then 'converted'
        else 'partially_accepted'
      end
    where i.id = v_item_id;
    if not found then
      raise exception 'This waiting-list request is no longer convertible';
    end if;

    perform public._waiting_list_append_event(
      p_request_id,
      v_item_id,
      'converted_to_order',
      p_actor_staff_id,
      jsonb_build_object(
        'order_id', v_order.id,
        'order_number', v_order.order_number,
        'quantity', v_qty,
        'source', 'waiting_list_confirmation'
      )
    );
  end loop;

  if v_request.converted_order_id is null then
    update public.waiting_list_requests r
    set converted_order_id = v_order.id
    where r.id = v_request.id;
  end if;

  update public.waiting_list_confirmation_links
  set
    status = 'converted',
    converted_order_id = v_order.id
  where id = v_link.id
    and status = 'submitted'
    and converted_order_id is null;
  if not found then
    raise exception 'This confirmation has already been converted';
  end if;

  perform public._waiting_list_append_event(
    p_request_id,
    null,
    'confirmation_link_converted',
    p_actor_staff_id,
    jsonb_build_object(
      'confirmation_link_id', v_link.id,
      'order_id', v_order.id,
      'order_number', v_order.order_number
    )
  );

  perform public._waiting_list_sync_request_status(p_request_id);

  return jsonb_build_object(
    'ok', true,
    'already_converted', false,
    'order_id', v_order.id,
    'order_number', v_order.order_number
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.waiting_list_convert_item(p_actor_staff_id uuid, p_item_id uuid, p_quantity integer, p_pickup_time time without time zone, p_keep_remaining boolean DEFAULT true)
 RETURNS orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_item public.waiting_list_items;
  v_request public.waiting_list_requests;
  v_hold public.production_capacity_holds;
  v_order public.orders;
  v_qty integer;
  v_previously_converted integer;
  v_unconverted_accepted integer;
  v_recorded_acceptance boolean;
  v_source text;
begin
  p_actor_staff_id := public._bind_rpc_actor(p_actor_staff_id);
  -- Preserve the deployed correction: require an active staff identity bound
  -- to the supplied actor, then apply the existing staff-role policy.
  if auth.uid() is null or p_actor_staff_id is null or not exists (
    select 1
    from public.staff_profiles sp
    join public.roles r on r.id = sp.role_id
    where sp.auth_user_id = auth.uid()
      and sp.id = p_actor_staff_id
      and sp.is_active = true
      and r.code in ('owner', 'manager', 'customer_operations', 'bakery')
  ) then
    raise exception using
      errcode = '42501',
      message = 'Not authorized: an active staff session with the required role is required';
  end if;
  perform public._waiting_list_assert_manage_staff(p_actor_staff_id);

  select i.*
  into v_item
  from public.waiting_list_items i
  where i.id = p_item_id
  for update;
  if not found then
    raise exception 'Waiting-list item not found';
  end if;
  if public._waiting_list_item_has_submitted_confirmation(v_item.id) then
    raise exception 'Customer confirmation has already been submitted';
  end if;
  if v_item.status not in ('contacted', 'accepted', 'partially_accepted') then
    raise exception 'Convert only after the customer accepts an offered quantity';
  end if;

  select r.*
  into v_request
  from public.waiting_list_requests r
  where r.id = v_item.request_id
  for update;

  select h.*
  into v_hold
  from public.production_capacity_holds h
  where h.waiting_list_item_id = v_item.id
    and h.status = 'active'
  order by h.held_at desc
  limit 1
  for update;
  if v_hold.id is null then
    raise exception 'There is no active production hold for this offer';
  end if;

  v_qty := coalesce(p_quantity, v_hold.quantity);
  if v_qty < 1 or v_qty > v_hold.quantity then
    raise exception 'Convert quantity exceeds the held offer';
  end if;
  if p_pickup_time is null then
    raise exception 'Pickup time is required';
  end if;

  select coalesce(sum((e.metadata ->> 'quantity')::integer), 0)::integer
  into v_previously_converted
  from public.waiting_list_events e
  where e.item_id = v_item.id
    and e.event_type = 'converted_to_order'
    and coalesce(e.metadata ->> 'quantity', '') ~ '^[0-9]+$';

  -- Older accepted rows may have status='accepted' before accepted_quantity
  -- was populated. Treat only quantities newly recorded beyond prior converted
  -- events as an already-recorded acceptance.
  v_recorded_acceptance := v_item.status in ('accepted', 'partially_accepted')
    and v_item.accepted_quantity > v_previously_converted;
  if v_recorded_acceptance then
    v_unconverted_accepted := v_item.accepted_quantity - v_previously_converted;
    if v_qty > v_unconverted_accepted then
      raise exception 'Convert quantity exceeds the accepted offer';
    end if;
  elsif v_item.status = 'contacted' then
    if v_qty > v_item.remaining_quantity then
      raise exception 'Convert quantity exceeds the remaining request';
    end if;
  else
    raise exception 'There is no unconverted accepted quantity';
  end if;

  v_source := case
    when v_request.created_by_staff_id is null then 'customer_website'
    else 'other'
  end;

  v_order := staff_preorder_private.create_waiting_list_preorder(
    p_actor_staff_id,
    v_request.guest_name,
    v_request.guest_phone,
    null,
    v_source,
    false,
    v_item.pickup_date,
    p_pickup_time,
    null,
    jsonb_build_array(jsonb_build_object(
      'cake_id', v_item.library_cake_id,
      'cake_size_id', v_item.library_cake_size_id,
      'quantity', v_qty
    )),
    '[]'::jsonb,
    false,
    false,
    null,
    null,
    'Converted from waiting list',
    '[]'::jsonb,
    'pickup',
    null,
    null
  );

  update public.production_capacity_holds h
  set
    status = 'converted',
    converted_order_id = v_order.id,
    released_at = now()
  where h.id = v_hold.id;

  if v_recorded_acceptance then
    -- Acceptance already updated accepted_quantity and remaining_quantity.
    -- Conversion only links the order and closes or retains the unaccepted
    -- remainder; it must not count the accepted units a second time.
    update public.waiting_list_items i
    set
      converted_order_id = v_order.id,
      status = case
        when i.remaining_quantity = 0 then 'converted'
        when coalesce(p_keep_remaining, true) then 'partially_accepted'
        else 'closed'
      end
    where i.id = v_item.id
    returning * into v_item;
  else
    -- Converting directly from Contacted records the verbal acceptance here.
    update public.waiting_list_items i
    set
      accepted_quantity = i.accepted_quantity + v_qty,
      converted_order_id = v_order.id,
      status = case
        when i.remaining_quantity - v_qty <= 0 then 'converted'
        when coalesce(p_keep_remaining, true) then 'partially_accepted'
        else 'closed'
      end
    where i.id = v_item.id
    returning * into v_item;
  end if;

  if v_request.converted_order_id is null then
    update public.waiting_list_requests r
    set converted_order_id = v_order.id
    where r.id = v_request.id;
  end if;

  perform public._waiting_list_append_event(
    v_item.request_id,
    v_item.id,
    'converted_to_order',
    p_actor_staff_id,
    jsonb_build_object(
      'order_id', v_order.id,
      'quantity', v_qty,
      'recorded_acceptance', v_recorded_acceptance,
      'keep_remaining', coalesce(p_keep_remaining, true)
    )
  );
  if v_item.status = 'partially_accepted' then
    perform public._waiting_list_append_event(
      v_item.request_id,
      v_item.id,
      'remaining_kept',
      p_actor_staff_id,
      jsonb_build_object('remaining_quantity', v_item.remaining_quantity)
    );
  elsif v_item.remaining_quantity > 0 and v_item.status = 'closed' then
    perform public._waiting_list_append_event(
      v_item.request_id,
      v_item.id,
      'remaining_closed',
      p_actor_staff_id,
      jsonb_build_object('remaining_quantity', v_item.remaining_quantity)
    );
  end if;
  perform public._waiting_list_sync_request_status(v_item.request_id);
  return v_order;
end;
$function$;
