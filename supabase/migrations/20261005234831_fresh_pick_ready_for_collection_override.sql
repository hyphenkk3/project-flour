-- Per-physical Fresh Pick Ready state and database-authoritative preparation bypass.
-- Only pickup and dine-in may bypass cutoff/lead, and only while item windows and
-- all other operating, inventory, hold, venue, and fulfilment checks remain valid.

alter table public.extra_stock
  add column if not exists ready_for_collection boolean not null default false;

comment on column public.extra_stock.ready_for_collection is
  'Whether this exact physical Fresh Pick is prepared and ready for collection.';

create or replace function public.mark_extra_stock_ready_for_collection(
  p_extra_stock_id uuid,
  p_actor_staff_id uuid,
  p_reason text default null
)
returns public.extra_stock
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  stock_row public.extra_stock;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  v_actor := public._bind_rpc_actor(p_actor_staff_id);
  perform public._require_rpc_roles(
    v_actor,
    array['bakery', 'manager', 'owner'],
    'Not authorized to mark a Fresh Pick ready for collection.'
  );

  select e.* into stock_row
  from public.extra_stock e
  where e.id = p_extra_stock_id
  for update;

  if not found then raise exception 'Fresh Pick not found'; end if;
  if stock_row.lifecycle <> 'confirmed' then
    raise exception 'Only a confirmed Fresh Pick can be marked ready';
  end if;
  if stock_row.sold_at is not null or stock_row.order_id is not null then
    raise exception 'This Fresh Pick has already been sold or assigned';
  end if;
  if stock_row.cut_into_slices_at is not null then
    raise exception 'A Fresh Pick cut into slices cannot be marked ready';
  end if;
  if public.extra_walk_in_hold_is_active(stock_row.walk_in_held_until, clock_timestamp()) then
    raise exception 'A Fresh Pick on walk-in hold cannot be marked ready';
  end if;
  if stock_row.pickup_through_at is null or clock_timestamp() > stock_row.pickup_through_at then
    raise exception 'This Fresh Pick order window has expired';
  end if;
  if stock_row.ready_for_collection then
    raise exception 'This Fresh Pick is already ready for collection';
  end if;

  update public.extra_stock e
  set ready_for_collection = true, updated_at = now()
  where e.id = p_extra_stock_id
  returning * into stock_row;

  perform public._record_extra_stock_event(
    p_extra_stock_id,
    'ready_for_collection',
    v_actor,
    jsonb_build_object('reason', v_reason)
  );
  return stock_row;
end;
$$;

revoke all on function public.mark_extra_stock_ready_for_collection(uuid, uuid, text)
  from public, anon;
grant execute on function public.mark_extra_stock_ready_for_collection(uuid, uuid, text)
  to authenticated, service_role;

create or replace function public.undo_extra_stock_ready_for_collection(
  p_extra_stock_id uuid,
  p_actor_staff_id uuid,
  p_reason text default null
)
returns public.extra_stock
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  stock_row public.extra_stock;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  v_actor := public._bind_rpc_actor(p_actor_staff_id);
  perform public._require_rpc_roles(
    v_actor,
    array['bakery', 'manager', 'owner'],
    'Not authorized to undo Fresh Pick readiness.'
  );

  select e.* into stock_row
  from public.extra_stock e
  where e.id = p_extra_stock_id
  for update;

  if not found then raise exception 'Fresh Pick not found'; end if;
  if stock_row.lifecycle <> 'confirmed'
     or stock_row.sold_at is not null
     or stock_row.order_id is not null
     or stock_row.cut_into_slices_at is not null then
    raise exception 'This Fresh Pick is no longer eligible for a readiness change';
  end if;
  if not stock_row.ready_for_collection then
    raise exception 'This Fresh Pick is not marked ready';
  end if;

  update public.extra_stock e
  set ready_for_collection = false, updated_at = now()
  where e.id = p_extra_stock_id
  returning * into stock_row;

  perform public._record_extra_stock_event(
    p_extra_stock_id,
    'ready_for_collection_undone',
    v_actor,
    jsonb_build_object('reason', v_reason)
  );
  return stock_row;
end;
$$;

revoke all on function public.undo_extra_stock_ready_for_collection(uuid, uuid, text)
  from public, anon;
grant execute on function public.undo_extra_stock_ready_for_collection(uuid, uuid, text)
  to authenticated, service_role;

create or replace function public._assert_fresh_picks_customer_fulfilment(
  p_date date,
  p_time time,
  p_method public.fulfilment_method,
  p_extra_stock_ids uuid[]
)
returns void
language plpgsql
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
  v_ready_bypass boolean := false;
  v_ready_count integer := 0;
  v_now timestamptz := clock_timestamp();
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
  v_cutoff := coalesce(v_cutoff, time '16:00:00');
  v_lead := coalesce(v_lead, 60);

  v_today := (timezone('Asia/Singapore', v_now))::date;
  v_fulfilment_at := timezone(
    'Asia/Singapore',
    (p_date::text || ' ' || p_time::text)::timestamp
  );

  if p_method in ('pickup', 'dine_in')
     and p_date = v_today
     and coalesce(array_length(p_extra_stock_ids, 1), 0) > 0 then
    select count(*)::integer into v_ready_count
    from public.extra_stock e
    where e.id = any(p_extra_stock_ids)
      and e.ready_for_collection is true;
    v_ready_bypass := v_ready_count = array_length(p_extra_stock_ids, 1);
  end if;

  if p_date = v_today then
    if not v_ready_bypass then
      v_cutoff_at := timezone(
        'Asia/Singapore',
        (v_today::text || ' ' || v_cutoff::text)::timestamp
      );
      if v_now >= v_cutoff_at then
        v_cutoff_label := trim(to_char(v_cutoff, 'FMHH12:MI AM'));
        raise exception
          'Same-day orders must be placed before %. Please select another date for your order.',
          v_cutoff_label;
      end if;
    elsif v_fulfilment_at <= v_now then
      raise exception 'Please choose a future pickup or dine-in time.';
    end if;

    if not v_ready_bypass then
      v_boundary := v_now + make_interval(mins => v_lead);
      if p_method = 'dine_in' then
        if v_fulfilment_at <= v_boundary then
          raise exception 'Please choose a valid fulfilment time for that date.';
        end if;
      elsif v_fulfilment_at < v_boundary then
        raise exception 'Please choose a valid fulfilment time for that date.';
      end if;
    end if;
  elsif v_fulfilment_at < v_now then
    raise exception 'Please choose a pickup time from the Extra pickup window.';
  end if;
end;
$$;

revoke all on function public._assert_fresh_picks_customer_fulfilment(
  date, time, public.fulfilment_method, uuid[]
) from public, anon, authenticated;

-- Preserve the original internal call contract for any existing database caller.
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
begin
  perform public._assert_fresh_picks_customer_fulfilment(
    p_date, p_time, p_method, null::uuid[]
  );
end;
$$;

revoke all on function public._assert_fresh_picks_customer_fulfilment(
  date, time, public.fulfilment_method
) from public, anon, authenticated;

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
  p_dine_in jsonb default null,
  p_delivery_processing_fee_ack jsonb default null
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
  v_proc_ack numeric(10, 2);
  v_proc_ack_method text;
  v_proc_default numeric(10, 2);
  v_delivery_proc_ack_required text :=
    'Please acknowledge the RM5 delivery processing fee before submitting your order.';
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

  if v_method = 'delivery' then
    v_proc_default := public.current_delivery_processing_fee_default();
    if p_delivery_processing_fee_ack is null
       or jsonb_typeof(p_delivery_processing_fee_ack) <> 'object' then
      raise exception '%', v_delivery_proc_ack_required;
    end if;
    v_proc_ack_method := lower(nullif(trim(coalesce(
      p_delivery_processing_fee_ack ->> 'fulfilment_method', ''
    )), ''));
    if v_proc_ack_method is distinct from 'delivery' then
      raise exception '%', v_delivery_proc_ack_required;
    end if;
    begin
      v_proc_ack := (p_delivery_processing_fee_ack ->> 'processing_fee')::numeric;
    exception when others then
      raise exception '%', v_delivery_proc_ack_required;
    end;
    if v_proc_ack is null
       or round(v_proc_ack, 2) is distinct from round(v_proc_default, 2) then
      raise exception '%', v_delivery_proc_ack_required;
    end if;
  end if;

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
    if stock_row.sold_at is not null or stock_row.order_id is not null then
      raise exception 'This Extra cake has already been sold';
    end if;
    if stock_row.cut_into_slices_at is not null then
      raise exception 'This Extra cake has already been sold';
    end if;
    if public.extra_walk_in_hold_is_active(stock_row.walk_in_held_until, clock_timestamp()) then
      raise exception 'This Fresh Pick is currently on walk-in hold.';
    end if;
    if stock_row.confirmed_at is not null and clock_timestamp() < stock_row.confirmed_at then
      raise exception 'Extra is not available';
    end if;
    if stock_row.pickup_through_at is null or clock_timestamp() > stock_row.pickup_through_at then
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

  -- Ready is evaluated only after each submitted physical unit is row-locked.
  perform public._assert_fresh_picks_customer_fulfilment(
    p_pickup_date,
    p_pickup_time,
    v_method,
    v_ids
  );

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
    and e.order_id is null
    and e.lifecycle = 'confirmed'
    and e.cut_into_slices_at is null
    and (e.walk_in_held_until is null or e.walk_in_held_until < clock_timestamp());
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
      coalesce(public.library_cake_size_price_on(size_row.id, p_pickup_date), 0),
      stock_row.cake_name,
      stock_row.size_label
    );
  end loop;

  update public.extra_stock e
  set order_id = new_order.id, updated_at = now()
  where e.id = any(v_ids)
    and e.order_id is null
    and e.sold_at is not null;
  get diagnostics v_updated = row_count;
  if v_updated <> v_expected then
    raise exception 'This Extra cake has already been sold';
  end if;

  for v_id in
    select extra_id
    from unnest(v_ids) as extra_id
    where extra_id <> v_primary
  loop
    perform public._record_extra_stock_event(
      v_id,
      'sold',
      null,
      jsonb_build_object(
        'order_id', new_order.id,
        'order_number', new_order.order_number,
        'source', 'order_link'
      )
    );
  end loop;

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
      'fulfilment_method', v_method::text,
      'delivery_processing_fee_acknowledged', (v_method = 'delivery'),
      'delivery_processing_fee', case
        when v_method = 'delivery'
          then public.current_delivery_processing_fee_default()
        else null
      end
    )
  );

  select * into new_order from public.orders where id = new_order.id;
  return new_order;
exception
  when unique_violation then
    raise exception 'This Extra cake has already been sold';
end;
$$;
