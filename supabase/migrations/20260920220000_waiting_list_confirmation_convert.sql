-- Waiting List confirmation → real order conversion (Phase D).
-- Staff converts ONE submitted confirmation into ONE normal order with
-- ALL offered/confirmed items as normal order_items.
-- Reuses create_staff_guest_preorder. Does not call submit_guest_preorder.
-- Does not trust browser quantities, prices, fulfilment, or customer details.
-- Quantity comes from item_snapshot.offered_quantity, never requested quantity.
-- Payment remains unpaid. Does not invent a payment flow.
-- Closed-date confirmations stay convertible: pickup uses weekly hours only.
-- Do not reject solely because is_pickup_orders_closed is true.

alter table public.waiting_list_confirmation_links
  add column if not exists converted_order_id uuid
  references public.orders (id) on delete restrict;

comment on column public.waiting_list_confirmation_links.converted_order_id is
  'Order created from this submitted confirmation. Null until converted.';

alter table public.waiting_list_confirmation_links
  drop constraint if exists waiting_list_confirmation_links_status_check;

alter table public.waiting_list_confirmation_links
  add constraint waiting_list_confirmation_links_status_check
  check (
    status in ('issued', 'submitted', 'expired', 'invalidated', 'converted')
  );

alter table public.waiting_list_confirmation_links
  drop constraint if exists waiting_list_confirmation_links_submitted_consistent;

alter table public.waiting_list_confirmation_links
  add constraint waiting_list_confirmation_links_submitted_consistent
  check (
    (
      status = 'issued'
      and submitted_at is null
      and converted_order_id is null
    )
    or (
      status = 'submitted'
      and submitted_at is not null
      and converted_order_id is null
    )
    or (
      status = 'converted'
      and submitted_at is not null
      and converted_order_id is not null
    )
    or (
      status in ('expired', 'invalidated')
      and converted_order_id is null
    )
  );

create unique index if not exists waiting_list_confirmation_links_converted_order_uidx
  on public.waiting_list_confirmation_links (converted_order_id)
  where converted_order_id is not null;

create or replace function public.staff_list_waiting_list_confirmation_links(
  p_actor_staff_id uuid,
  p_request_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb := '[]'::jsonb;
begin
  perform public._waiting_list_assert_manage_staff(p_actor_staff_id);

  if p_request_ids is null or coalesce(cardinality(p_request_ids), 0) = 0 then
    return v_result;
  end if;

  update public.waiting_list_confirmation_links
  set status = 'expired'
  where request_id = any(p_request_ids)
    and status = 'issued'
    and expires_at <= now();

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', ranked.id,
        'request_id', ranked.request_id,
        'status', ranked.status,
        'expires_at', ranked.expires_at,
        'issued_at', ranked.issued_at,
        'submitted_at', ranked.submitted_at,
        'converted_order_id', ranked.converted_order_id,
        'converted_order_number', ranked.converted_order_number,
        'items', ranked.items,
        'submitted_payload', ranked.submitted_payload
      )
      order by ranked.request_id
    ),
    '[]'::jsonb
  )
  into v_result
  from (
    select distinct on (l.request_id)
      l.id,
      l.request_id,
      l.status,
      l.expires_at,
      l.issued_at,
      l.submitted_at,
      l.converted_order_id,
      o.order_number as converted_order_number,
      case
        when l.status in ('submitted', 'converted') then l.submitted_payload
        else null
      end as submitted_payload,
      (
        select coalesce(
          jsonb_agg(
            jsonb_build_object(
              'cake_name', c.name,
              'size_label', s.label,
              'quantity', (entry.elem ->> 'offered_quantity')::integer,
              'unit_price', s.price
            )
            order by entry.ordinality
          ),
          '[]'::jsonb
        )
        from jsonb_array_elements(l.item_snapshot)
          with ordinality as entry(elem, ordinality)
        join public.library_cakes c
          on c.id = (entry.elem ->> 'cake_id')::uuid
        join public.library_cake_sizes s
          on s.id = (entry.elem ->> 'cake_size_id')::uuid
         and s.cake_id = c.id
      ) as items
    from public.waiting_list_confirmation_links l
    left join public.orders o
      on o.id = l.converted_order_id
    where l.request_id = any(p_request_ids)
    order by
      l.request_id,
      case l.status
        when 'issued' then 0
        when 'submitted' then 1
        when 'converted' then 2
        else 3
      end,
      l.issued_at desc
  ) ranked;

  return v_result;
end;
$$;

comment on function public.staff_list_waiting_list_confirmation_links(uuid, uuid[]) is
  'Staff review of request-level Waiting List confirmation links. '
  'Does not return token_hash. Prefers issued, then submitted, then converted.';

revoke all on function public.staff_list_waiting_list_confirmation_links(uuid, uuid[])
  from public, anon;
grant execute on function public.staff_list_waiting_list_confirmation_links(uuid, uuid[])
  to authenticated;

create or replace function public.waiting_list_convert_confirmation(
  p_actor_staff_id uuid,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
  v_remaining integer;
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
  v_complimentary jsonb := '[]'::jsonb;
  v_paid jsonb := '[]'::jsonb;
  v_addon jsonb;
begin
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
    if v_item.status not in ('contacted', 'accepted', 'partially_accepted') then
      raise exception 'This waiting-list request is no longer convertible';
    end if;
    if v_item.library_cake_id is distinct from v_cake_id
       or v_item.library_cake_size_id is distinct from v_size_id then
      raise exception 'This confirmation no longer matches the waiting-list items';
    end if;

    v_remaining := v_item.remaining_quantity;
    if v_remaining < v_qty then
      raise exception 'Offered quantity is no longer available';
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
  end loop;

  if jsonb_array_length(v_items) < 1 then
    raise exception 'This confirmation no longer matches the waiting-list items';
  end if;

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
  v_order := public.create_staff_guest_preorder(
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

    update public.waiting_list_items i
    set
      accepted_quantity = i.accepted_quantity + v_qty,
      converted_order_id = v_order.id,
      status = case
        when i.remaining_quantity - v_qty <= 0 then 'converted'
        else 'partially_accepted'
      end
    where i.id = v_item_id;

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
$$;

comment on function public.waiting_list_convert_confirmation(uuid, uuid) is
  'Staff conversion of a submitted Waiting List confirmation into one unpaid '
  'guest order via create_staff_guest_preorder. Snapshot quantities only. '
  'Idempotent: a second call returns already_converted.';

revoke all on function public.waiting_list_convert_confirmation(uuid, uuid)
  from public, anon;
grant execute on function public.waiting_list_convert_confirmation(uuid, uuid)
  to authenticated;
