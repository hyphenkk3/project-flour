-- Extra Preorder: physical receipt + customer-selected complimentary items.
-- Smallest compatible change to submit_guest_extra_order:
--   p_include_receipt (default false) -> orders.include_receipt
--   p_complimentary (default []) -> order_complimentary_items
-- Complimentary availability uses the existing collection complimentary
-- catalogue for the Extra pickup date. Extra orders stay collection_id null.
-- Does not change Extra pricing, pickup window, Fresh Picks, or Whole Cake.

drop function if exists public.submit_guest_extra_order(
  text, text, text, date, time, text, uuid, boolean
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
  p_complimentary jsonb default '[]'::jsonb
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
  if p_extra_stock_id is null then
    raise exception 'Extra is required';
  end if;
  if p_pickup_date is null or p_pickup_time is null then
    raise exception 'Please choose a valid pickup time for that date.';
  end if;

  select e.*
  into stock_row
  from public.extra_stock e
  where e.id = p_extra_stock_id
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
  if stock_row.confirmed_at is not null and now() < stock_row.confirmed_at then
    raise exception 'Extra is not available';
  end if;
  if stock_row.pickup_through_at is null or now() > stock_row.pickup_through_at then
    raise exception 'This Extra is no longer available to order';
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

  select lcs.*
  into size_row
  from public.library_cake_sizes lcs
  where lcs.id = stock_row.library_cake_size_id
    and lcs.cake_id = stock_row.library_cake_id;
  if not found then
    raise exception 'This Extra cake cannot be ordered';
  end if;

  if p_complimentary is not null
     and jsonb_typeof(p_complimentary) <> 'array' then
    raise exception 'Complimentary items are invalid';
  end if;

  active_collection := public.storefront_collection_for_pickup_date(p_pickup_date);

  update public.extra_stock e
  set sold_at = now(), updated_at = now()
  where e.id = p_extra_stock_id
    and e.sold_at is null
    and e.lifecycle = 'confirmed';
  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
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
    p_extra_stock_id,
    false,
    'customer_website',
    v_receipt_requested,
    v_include_receipt
  )
  returning * into new_order;

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

  -- Customer-selected complimentary only. Do not auto-insert collection defaults.
  -- Availability follows the published complimentary catalogue for this pickup date.
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
      'item_count', 1,
      'source', 'customer_website_extra',
      'extra_stock_id', p_extra_stock_id,
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
  text, text, text, date, time, text, uuid, boolean, boolean, jsonb
) is
  'Website Extra preorder. Pickup window and Extra pricing unchanged. '
  'p_include_receipt persists orders.include_receipt (physical receipt at pickup). '
  'Independent of p_email_submission_receipt_requested. '
  'p_complimentary persists customer-selected complimentary items from the '
  'pickup-date collection catalogue. Empty array means none selected.';

revoke all on function public.submit_guest_extra_order(
  text, text, text, date, time, text, uuid, boolean, boolean, jsonb
) from public;
grant execute on function public.submit_guest_extra_order(
  text, text, text, date, time, text, uuid, boolean, boolean, jsonb
) to anon, authenticated, service_role;
