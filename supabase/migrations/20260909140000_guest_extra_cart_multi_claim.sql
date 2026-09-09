-- Fresh Pick cart: claim one or more extra_stock units atomically on submit.
-- Adding to cart does not touch extra_stock. Only this RPC sets sold_at.

alter table public.extra_stock
  add column if not exists order_id uuid references public.orders (id) on delete set null;

create index if not exists extra_stock_order_id_idx
  on public.extra_stock (order_id)
  where order_id is not null;

comment on column public.extra_stock.order_id is
  'Order that claimed this Extra unit. Set only when sold_at is set.';

drop function if exists public.submit_guest_extra_order(
  text, text, text, date, time, text, uuid, boolean, boolean, jsonb, jsonb
);

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
  p_extra_stock_ids uuid[] default null
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
  if p_pickup_date is null or p_pickup_time is null then
    raise exception 'Please choose a valid pickup time for that date.';
  end if;

  if not public._pickup_slot_in_weekly_hours(p_pickup_date, p_pickup_time) then
    raise exception 'Please choose a valid pickup time for that date.';
  end if;

  v_pickup_at := timezone(
    'Asia/Singapore',
    (p_pickup_date::text || ' ' || p_pickup_time::text)::timestamp
  );
  if v_pickup_at < now() then
    raise exception 'Please choose a pickup time from the Extra pickup window.';
  end if;

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
    if stock_row.sold_at is not null then
      raise exception 'This Extra cake has already been sold';
    end if;
    if stock_row.cut_into_slices_at is not null then
      raise exception 'This Extra cake has already been sold';
    end if;
    if stock_row.confirmed_at is not null and now() < stock_row.confirmed_at then
      raise exception 'Extra is not available';
    end if;
    if stock_row.pickup_through_at is null or now() > stock_row.pickup_through_at then
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
    and e.lifecycle = 'confirmed'
    and e.cut_into_slices_at is null;
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
    'pickup',
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
      coalesce(size_row.price, 0),
      stock_row.cake_name,
      stock_row.size_label
    );
  end loop;

  update public.extra_stock e
  set order_id = new_order.id, updated_at = now()
  where e.id = any(v_ids);

  -- Customer-selected complimentary only. Do not auto-insert collection defaults.
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
      'email_submission_receipt_requested', v_receipt_requested
    )
  );

  return new_order;
exception
  when unique_violation then
    raise exception 'This Extra cake has already been sold';
end;
$$;

comment on function public.submit_guest_extra_order(
  text, text, text, date, time, text, uuid, boolean, boolean, jsonb, jsonb, uuid[]
) is
  'Website Extra preorder. Claims exact extra_stock.id values only on submit. '
  'p_extra_stock_ids claims multiple units atomically; p_extra_stock_id remains '
  'the single-unit fallback. Adding to a cart must not call this function.';

revoke all on function public.submit_guest_extra_order(
  text, text, text, date, time, text, uuid, boolean, boolean, jsonb, jsonb, uuid[]
) from public;
grant execute on function public.submit_guest_extra_order(
  text, text, text, date, time, text, uuid, boolean, boolean, jsonb, jsonb, uuid[]
) to anon, authenticated, service_role;
