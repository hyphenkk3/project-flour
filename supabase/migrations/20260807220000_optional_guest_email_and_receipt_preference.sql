-- Milestone 3 Preview 2 refinement: optional guest email + submission receipt preference
-- Additive. Existing email values remain. Guest email no longer required for preorder.
-- Single submit_guest_preorder signature (avoids PostgREST overload ambiguity).

-- ---------------------------------------------------------------------------
-- 1) Allow guest orders without email (phone remains required)
-- ---------------------------------------------------------------------------

alter table public.orders
  drop constraint if exists orders_guest_or_customer;

alter table public.orders
  add constraint orders_guest_or_customer check (
    (
      customer_id is not null
    )
    or (
      customer_id is null
      and guest_name is not null
      and char_length(trim(guest_name)) > 0
      and guest_phone is not null
      and char_length(trim(guest_phone)) > 0
    )
  );

-- ---------------------------------------------------------------------------
-- 2) Preference: customer wants a copy of their preorder submission by email
-- Outbound delivery may be deferred until an email provider is configured.
-- ---------------------------------------------------------------------------

alter table public.orders
  add column if not exists email_submission_receipt_requested boolean not null default false;

comment on column public.orders.email_submission_receipt_requested is
  'Customer asked for a Preorder Submission Receipt by email. Delivery may be async/deferred.';

-- ---------------------------------------------------------------------------
-- 3) submit_guest_preorder — email optional; receipt preference stored
-- ---------------------------------------------------------------------------

drop function if exists public.submit_guest_preorder(
  text, text, text, date, time, text, jsonb
);

drop function if exists public.submit_guest_preorder(
  text, text, text, date, time, text, jsonb, boolean
);

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

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one cake is required';
  end if;

  select c.*
  into active_collection
  from public.collections c
  where c.status = 'active'
  order by c.month desc
  limit 1;

  if active_collection.id is null then
    raise exception 'No active collection is available';
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

    if not exists (
      select 1
      from public.collection_cakes cc
      where cc.collection_id = active_collection.id
        and cc.library_cake_id = cake_row.id
        and cc.available = true
    ) then
      raise exception 'Cake is not available in the current collection';
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

revoke all on function public.submit_guest_preorder(
  text, text, text, date, time, text, jsonb, boolean
) from public;
grant execute on function public.submit_guest_preorder(
  text, text, text, date, time, text, jsonb, boolean
) to anon, authenticated;
