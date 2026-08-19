-- Whole Cake customer Pickup | Dine-in | Delivery.
-- Extra submit_guest_extra_order is unchanged (pickup-only).
-- Existing Pickup/Delivery staff orders remain valid.
-- No table-allocation / capacity model.

create table if not exists public.order_dine_in_reservations (
  order_id uuid primary key
    references public.orders (id) on delete cascade,
  reservation_date date not null,
  reservation_time time not null,
  guest_count integer not null,
  reservation_note text,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint order_dine_in_reservations_guest_count_positive
    check (guest_count >= 1 and guest_count <= 50),
  constraint order_dine_in_reservations_status_known
    check (status in ('pending', 'seated', 'completed', 'cancelled'))
);

comment on table public.order_dine_in_reservations is
  'Dine-in reservation created with the Whole Cake order. '
  'Exactly one row when fulfilment_method = dine_in; zero rows otherwise. '
  'Staff assign the table later — no customer table selection.';

create trigger order_dine_in_reservations_set_updated_at
before update on public.order_dine_in_reservations
for each row
execute function public.set_updated_at();

alter table public.order_dine_in_reservations enable row level security;

drop policy if exists order_dine_in_reservations_authenticated_select
  on public.order_dine_in_reservations;
create policy order_dine_in_reservations_authenticated_select
  on public.order_dine_in_reservations
  for select
  to authenticated
  using (true);

grant select on public.order_dine_in_reservations to authenticated;
revoke all on table public.order_dine_in_reservations from anon;

create or replace function public.assert_order_dine_in_reservation_invariant()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_order_id uuid;
  v_method public.fulfilment_method;
  v_count integer;
begin
  if tg_table_name = 'orders' then
    if tg_op = 'DELETE' then
      return null;
    end if;
    v_order_id := new.id;
    v_method := new.fulfilment_method;
  else
    v_order_id := coalesce(new.order_id, old.order_id);
    select o.fulfilment_method into v_method
    from public.orders o
    where o.id = v_order_id;
    if not found then
      return null;
    end if;
  end if;

  select count(*) into v_count
  from public.order_dine_in_reservations r
  where r.order_id = v_order_id;

  if v_method = 'dine_in' and v_count <> 1 then
    raise exception
      'Dine-in orders require exactly one reservation (found %)',
      v_count;
  end if;
  if v_method is distinct from 'dine_in' and v_count <> 0 then
    raise exception
      'Dine-in reservation is not allowed when fulfilment is %',
      v_method;
  end if;
  return null;
end;
$$;

drop trigger if exists orders_assert_dine_in_reservation_invariant
  on public.orders;
create constraint trigger orders_assert_dine_in_reservation_invariant
after insert or update of fulfilment_method on public.orders
deferrable initially deferred
for each row
execute function public.assert_order_dine_in_reservation_invariant();

drop trigger if exists order_dine_in_reservations_assert_invariant
  on public.order_dine_in_reservations;
create constraint trigger order_dine_in_reservations_assert_invariant
after insert or update or delete on public.order_dine_in_reservations
deferrable initially deferred
for each row
execute function public.assert_order_dine_in_reservation_invariant();

-- Clock helpers (30-minute grid). Weekly rules; Wednesday dine-in closed here.
-- Special-open Wednesday hours are enforced in the website action via the
-- existing pickup-schedule override map (not a second calendar).
create or replace function public._clock_on_30_min_grid(p_time time)
returns boolean
language sql
immutable
as $$
  select (extract(minute from p_time)::integer % 30) = 0
     and extract(second from p_time) = 0;
$$;

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
  if v_dow in (0, 5, 6) then
    return p_time >= time '12:00' and p_time <= time '21:30';
  end if;
  return p_time >= time '12:00' and p_time <= time '17:30';
end;
$$;

create or replace function public.is_valid_delivery_slot(
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
  return p_time >= time '12:00' and p_time <= time '15:00';
end;
$$;

grant execute on function public.is_valid_dine_in_slot(date, time)
  to anon, authenticated;
grant execute on function public.is_valid_delivery_slot(date, time)
  to anon, authenticated;

drop function if exists public._sync_order_fulfilment_from_payload(
  uuid, public.fulfilment_method, jsonb
);

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
    select pickup_date, pickup_time into v_date, v_time
    from public.orders where id = p_order_id;
    if not found then raise exception 'Order not found'; end if;

    perform public._clear_delivery_finance_for_order(p_order_id, null);
    delete from public.order_delivery_details where order_id = p_order_id;

    update public.orders
    set fulfilment_method = 'dine_in', updated_at = now()
    where id = p_order_id;

    insert into public.order_dine_in_reservations (
      order_id, reservation_date, reservation_time,
      guest_count, reservation_note, status
    ) values (
      p_order_id, v_date, v_time, v_guest, v_note, 'pending'
    )
    on conflict (order_id) do update set
      reservation_date = excluded.reservation_date,
      reservation_time = excluded.reservation_time,
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

drop function if exists public.submit_guest_preorder(
  text, text, text, date, time, text, jsonb, boolean, jsonb, jsonb, boolean
);

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

  -- Same Whole Cake floor as earliestPickupDateYmd: Singapore today + 2 calendar days.
  -- Extra submit_guest_extra_order is unchanged.
  earliest_pickup := timezone('Asia/Singapore', now())::date + 2;
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

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one cake is required';
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
  'Website Whole Cake preorder. Pickup remains the default. '
  'Optional p_fulfilment_method (pickup|dine_in|delivery) with method payload. '
  'Extra submit_guest_extra_order is unchanged.';

revoke all on function public.submit_guest_preorder(
  text, text, text, date, time, text, jsonb, boolean, jsonb, jsonb, boolean,
  public.fulfilment_method, jsonb, jsonb
) from public;
grant execute on function public.submit_guest_preorder(
  text, text, text, date, time, text, jsonb, boolean, jsonb, jsonb, boolean,
  public.fulfilment_method, jsonb, jsonb
) to anon, authenticated;
