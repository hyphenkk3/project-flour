-- Fix live website Submit Preorder:
--   column reference "item" is ambiguous
--
-- Cause: PL/pgSQL variable `item` collided with SQL aliases
--   from jsonb_array_elements(p_items) as item
-- in the Phase 3 lead-time EXISTS / MAX(preorder_days) queries.
-- Same class of Postgres 15+ name conflict as 20260818130000
-- (addon vs addon_row). Not the staff-notification claim RPC.
--
-- Safe replace of submit_guest_preorder only. Signature unchanged.
-- FOR-loop variable `item` is unchanged. Business rules unchanged.

create or replace function public.submit_guest_preorder(
  p_customer_name text,
  p_phone text,
  p_email text,
  p_pickup_date date,
  p_pickup_time time,
  p_notes text,
  p_items jsonb,
  p_email_submission_receipt_requested boolean default false,
  p_complimentary jsonb default '[]'::jsonb,
  p_paid_addons jsonb default '[]'::jsonb,
  p_include_receipt boolean default false,
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
  cake_row public.library_cakes;
  size_row public.library_cake_sizes;
  new_order public.orders;
  active_collection public.collections;
  item jsonb;
  complimentary jsonb;
  addon jsonb;
  v_qty integer;
  v_cake_id uuid;
  v_size_id uuid;
  item_count integer := 0;
  v_email text;
  v_receipt_requested boolean;
  v_include_receipt boolean;
  earliest_pickup date;
  v_max_days integer;
  v_payload_qty integer;
  v_type_id uuid;
  v_comp_code text;
  v_comp_name text;
  v_comp_sort integer;
  v_addon_code text;
  v_paid jsonb := '[]'::jsonb;
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
  v_method := coalesce(p_fulfilment_method, 'pickup'::public.fulfilment_method);
  if v_method = 'drive_through' then
    raise exception 'Please choose pickup, dine-in, or delivery.';
  end if;

  if v_receipt_requested and v_email is null then
    raise exception 'Email is required when requesting a copy of your preorder submission';
  end if;

  if p_pickup_date is null or p_pickup_time is null then
    raise exception 'Please choose a valid date and time.';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one cake is required';
  end if;

  -- Live size lead times. Never trust client preorderDays.
  if exists (
    select 1
    from jsonb_array_elements(p_items) as item_row
    where (item_row ->> 'cake_id') is null
       or (item_row ->> 'cake_size_id') is null
       or not exists (
         select 1
         from public.library_cake_sizes s
         where s.id = (item_row ->> 'cake_size_id')::uuid
           and s.cake_id = (item_row ->> 'cake_id')::uuid
       )
  ) then
    raise exception 'Cake size is not available';
  end if;

  select max(s.preorder_days)
  into v_max_days
  from jsonb_array_elements(p_items) as item_row
  join public.library_cake_sizes s
    on s.id = (item_row ->> 'cake_size_id')::uuid
   and s.cake_id = (item_row ->> 'cake_id')::uuid;

  earliest_pickup := public.earliest_preorder_collection_date(v_max_days, now());
  if p_pickup_date < earliest_pickup then
    raise exception 'Please choose a valid date and time.';
  end if;

  if public.is_pickup_orders_closed(p_pickup_date) then
    raise exception 'Orders are closed for that pickup date.';
  end if;

  if v_method = 'pickup' then
    if not public.is_valid_public_pickup_slot(p_pickup_date, p_pickup_time) then
      raise exception 'Please choose a valid pickup time for that date.';
    end if;
  elsif v_method = 'dine_in' then
    if not public.is_valid_dine_in_slot(p_pickup_date, p_pickup_time) then
      raise exception 'Please choose a valid dine-in time for that date.';
    end if;
  elsif v_method = 'delivery' then
    if not public.is_valid_delivery_slot(p_pickup_date, p_pickup_time) then
      raise exception 'Please choose a valid delivery time for that date.';
    end if;
  else
    raise exception 'Please choose pickup, dine-in, or delivery.';
  end if;

  active_collection := public.storefront_collection_for_pickup_date(p_pickup_date);
  if active_collection.id is null then
    raise exception 'No published catalogue is available for that pickup date.';
  end if;

  insert into public.orders (
    order_number, customer_id, guest_name, guest_phone, guest_email,
    fulfilment_method, pickup_date, pickup_time, status, payment_status,
    customer_notes, collection_id, confirmation_needs_resend, order_source,
    email_submission_receipt_requested, include_receipt
  ) values (
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
    active_collection.id,
    false,
    'customer_website',
    v_receipt_requested,
    v_include_receipt
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

    select lc.* into cake_row from public.library_cakes lc where lc.id = v_cake_id;
    if not found then raise exception 'Cake is not available'; end if;
    if cake_row.status not in ('active', 'seasonal') then
      raise exception 'Cake is not available for that pickup date';
    end if;
    if not exists (
      select 1 from public.collection_cakes cc
      where cc.collection_id = active_collection.id
        and cc.library_cake_id = cake_row.id
        and cc.available = true
    ) then
      raise exception 'Cake is not available for that pickup date';
    end if;

    select lcs.* into size_row
    from public.library_cake_sizes lcs
    where lcs.id = v_size_id and lcs.cake_id = v_cake_id;
    if not found then raise exception 'Cake size is not available'; end if;

    select coalesce(sum(coalesce((payload ->> 'quantity')::integer, 1)), 0)
    into v_payload_qty
    from jsonb_array_elements(p_items) as payload
    where (payload ->> 'cake_id')::uuid = v_cake_id
      and (payload ->> 'cake_size_id')::uuid = v_size_id;

    if public._guest_preorder_item_fully_booked(
      p_pickup_date,
      active_collection.id,
      v_cake_id,
      v_size_id,
      v_payload_qty
    ) then
      raise exception 'Fully Booked';
    end if;

    insert into public.order_items (
      order_id, cake_id, cake_size_id, quantity, unit_price, cake_name, size_label
    ) values (
      new_order.id, cake_row.id, size_row.id, v_qty, size_row.price,
      cake_row.name, size_row.label
    );
    item_count := item_count + 1;
  end loop;

  if item_count = 0 then
    raise exception 'At least one cake is required';
  end if;

  if p_complimentary is not null and jsonb_typeof(p_complimentary) = 'array' then
    for complimentary in select * from jsonb_array_elements(p_complimentary)
    loop
      v_qty := coalesce((complimentary ->> 'quantity')::integer, 1);
      if v_qty <= 0 then continue; end if;
      if v_qty <> 1 then
        raise exception 'Complimentary quantity for this order must be 1';
      end if;
      v_comp_name := null;
      v_comp_sort := 0;
      v_comp_code := nullif(lower(trim(coalesce(complimentary ->> 'code', ''))), '');
      begin
        v_type_id := nullif(trim(coalesce(complimentary ->> 'type_id', '')), '')::uuid;
      exception when others then
        v_type_id := null;
      end;
      select cit.id, cit.name, cci.sort_order
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
        order_id, complimentary_item_type_id, name, quantity, sort_order
      ) values (new_order.id, v_type_id, v_comp_name, 1, v_comp_sort);
    end loop;
  end if;

  if p_paid_addons is not null and jsonb_typeof(p_paid_addons) <> 'array' then
    raise exception 'Paid add-ons are invalid';
  end if;
  if p_paid_addons is not null and jsonb_typeof(p_paid_addons) = 'array' then
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

  select * into new_order from public.orders where id = new_order.id;

  insert into public.order_timeline_events (
    order_id, event_type, actor_staff_id, metadata
  ) values (
    new_order.id,
    'preorder_submitted',
    null,
    jsonb_build_object(
      'item_count', item_count,
      'source', 'customer_website',
      'email_submission_receipt_requested', v_receipt_requested,
      'fulfilment_method', v_method::text
    )
  );

  return new_order;
end;
$$;

comment on function public.submit_guest_preorder(
  text, text, text, date, time, text, jsonb, boolean, jsonb, jsonb, boolean,
  public.fulfilment_method, jsonb, jsonb
) is
  'Website Whole Cake preorder. Lead time is Malaysia DAY 0 + max size preorder_days. '
  'Capacity-full dates raise Fully Booked. Extra submit_guest_extra_order is unchanged.';
