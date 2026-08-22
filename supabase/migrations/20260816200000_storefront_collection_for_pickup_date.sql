-- Customer catalogue for a pickup date — not Singapore today, and no
-- cross-month "latest active monthly" fallback.
-- Publication date ≠ applicability: an Active future monthly catalogue can
-- be ordered immediately, but only for pickup dates inside that month.

create or replace function public.storefront_collection_for_pickup_date(
  p_pickup_date date
)
returns public.collections
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  month_start date;
  selected public.collections;
  override_count integer;
begin
  if p_pickup_date is null then
    return selected;
  end if;

  select count(*)
  into override_count
  from public.collections c
  where c.status = 'active'
    and c.purpose = 'special'
    and c.website_override = true
    and c.start_date is not null
    and c.end_date is not null
    and p_pickup_date >= c.start_date
    and p_pickup_date <= c.end_date;

  if override_count > 1 then
    raise exception
      'Multiple published special website overrides cover %',
      p_pickup_date;
  end if;

  if override_count = 1 then
    select c.*
    into selected
    from public.collections c
    where c.status = 'active'
      and c.purpose = 'special'
      and c.website_override = true
      and c.start_date is not null
      and c.end_date is not null
      and p_pickup_date >= c.start_date
      and p_pickup_date <= c.end_date
    limit 1;
    return selected;
  end if;

  month_start := date_trunc('month', p_pickup_date)::date;

  select c.*
  into selected
  from public.collections c
  where c.status = 'active'
    and c.purpose = 'monthly'
    and c.month is not null
    and c.month = month_start
  order by c.created_at desc
  limit 1;

  return selected;
end;
$$;

comment on function public.storefront_collection_for_pickup_date(date) is
  'Authoritative customer catalogue for a pickup date. Prefer an active special '
  'catalogue with website_override covering that date; otherwise the active '
  'monthly catalogue whose month is that date''s calendar month. No fallback '
  'to another month. Timezone conversion to Asia/Singapore is the caller''s '
  'responsibility.';

create or replace function public.storefront_collection_for_date(target_date date)
returns public.collections
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return public.storefront_collection_for_pickup_date(target_date);
end;
$$;

comment on function public.storefront_collection_for_date(date) is
  'Alias of storefront_collection_for_pickup_date. Use that name for customer '
  'ordering. Does not fall back to another month''s catalogue.';

create or replace function public.storefront_current_collection()
returns public.collections
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return public.storefront_collection_for_pickup_date(
    timezone('Asia/Singapore', now())::date
  );
end;
$$;

comment on function public.storefront_current_collection() is
  'Singapore-today catalogue (homepage merchandising / current-month website). '
  'Guest submit_guest_preorder must use storefront_collection_for_pickup_date '
  'with the customer pickup date, not this wrapper. An Owner-published active '
  'special website override covering today takes priority over the monthly '
  'catalogue. Special catalogues without website_override are never selected.';

create or replace function public.submit_guest_preorder(
  p_customer_name text,
  p_phone text,
  p_email text,
  p_pickup_date date,
  p_pickup_time time,
  p_notes text,
  p_items jsonb,
  p_email_submission_receipt_requested boolean default false
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
  v_qty integer;
  v_cake_id uuid;
  v_size_id uuid;
  item_count integer := 0;
  complimentary_row record;
  v_email text;
  v_receipt_requested boolean;
  earliest_pickup date;
begin
  if char_length(trim(coalesce(p_customer_name, ''))) = 0 then
    raise exception 'Full name is required';
  end if;
  if char_length(trim(coalesce(p_phone, ''))) = 0 then
    raise exception 'Phone number is required';
  end if;

  v_email := nullif(trim(coalesce(p_email, '')), '');
  v_receipt_requested := coalesce(p_email_submission_receipt_requested, false);

  if v_receipt_requested and v_email is null then
    raise exception 'Email is required when requesting a copy of your preorder submission';
  end if;

  if p_pickup_date is null or p_pickup_time is null then
    raise exception 'Please choose a valid pickup time for that date.';
  end if;

  -- Same earliest date as PickupSlotFields (tomorrow, Asia/Singapore).
  earliest_pickup := timezone('Asia/Singapore', now())::date + 1;
  if p_pickup_date < earliest_pickup then
    raise exception 'Please choose a valid pickup time for that date.';
  end if;

  if public.is_pickup_orders_closed(p_pickup_date) then
    raise exception 'Orders are closed for that pickup date.';
  end if;

  if not public.is_valid_public_pickup_slot(p_pickup_date, p_pickup_time) then
    raise exception 'Please choose a valid pickup time for that date.';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one cake is required';
  end if;

  active_collection := public.storefront_collection_for_pickup_date(p_pickup_date);
  if active_collection.id is null then
    raise exception 'No published catalogue is available for that pickup date.';
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
    confirmation_needs_resend,
    order_source,
    email_submission_receipt_requested
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
    active_collection.id,
    false,
    'customer_website',
    v_receipt_requested
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

    select lc.*
    into cake_row
    from public.library_cakes lc
    where lc.id = v_cake_id;
    if not found then
      raise exception 'Cake is not available';
    end if;

    if cake_row.status not in ('active', 'seasonal') then
      raise exception 'Cake is not available for that pickup date';
    end if;

    if not exists (
      select 1
      from public.collection_cakes cc
      where cc.collection_id = active_collection.id
        and cc.library_cake_id = cake_row.id
        and cc.available = true
    ) then
      raise exception 'Cake is not available for that pickup date';
    end if;

    select lcs.*
    into size_row
    from public.library_cake_sizes lcs
    where lcs.id = v_size_id
      and lcs.cake_id = v_cake_id;
    if not found then
      raise exception 'Cake size is not available';
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
      cake_row.id,
      size_row.id,
      v_qty,
      size_row.price,
      cake_row.name,
      size_row.label
    );

    item_count := item_count + 1;
  end loop;

  if item_count = 0 then
    raise exception 'At least one cake is required';
  end if;

  for complimentary_row in
    select
      cci.complimentary_item_type_id,
      cit.name,
      cci.default_quantity,
      cci.sort_order
    from public.collection_complimentary_items cci
    join public.complimentary_item_types cit
      on cit.id = cci.complimentary_item_type_id
    where cci.collection_id = active_collection.id
      and cci.is_available = true
      and cci.is_default = true
      and cci.default_quantity > 0
    order by cci.sort_order asc, cit.name asc
  loop
    insert into public.order_complimentary_items (
      order_id,
      complimentary_item_type_id,
      name,
      quantity,
      sort_order
    )
    values (
      new_order.id,
      complimentary_row.complimentary_item_type_id,
      complimentary_row.name,
      complimentary_row.default_quantity,
      complimentary_row.sort_order
    );
  end loop;

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
      'item_count', item_count,
      'source', 'customer_website',
      'email_submission_receipt_requested', v_receipt_requested
    )
  );

  return new_order;
end;
$$;

revoke all on function public.storefront_collection_for_pickup_date(date)
  from public;
grant execute on function public.storefront_collection_for_pickup_date(date)
  to anon, authenticated;

revoke all on function public.storefront_collection_for_date(date) from public;
grant execute on function public.storefront_collection_for_date(date)
  to anon, authenticated;

revoke all on function public.storefront_current_collection() from public;
grant execute on function public.storefront_current_collection()
  to anon, authenticated;

revoke all on function public.submit_guest_preorder(
  text, text, text, date, time, text, jsonb, boolean
) from public;
grant execute on function public.submit_guest_preorder(
  text, text, text, date, time, text, jsonb, boolean
) to anon, authenticated;
