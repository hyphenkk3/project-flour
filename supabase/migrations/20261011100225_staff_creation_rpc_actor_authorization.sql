-- Local reviewed security correction; no historical migrations are replayed.
begin;

do $check$ begin
  if (select count(*) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='create_staff_guest_preorder') <> 1
    or not exists(select 1 from pg_catalog.pg_proc p where p.oid=pg_catalog.to_regprocedure('public.create_staff_guest_preorder(uuid, text, text, text, text, boolean, date, time, text, jsonb, jsonb, boolean, boolean, text, text, text, jsonb, public.fulfilment_method, jsonb, jsonb)') and md5(regexp_replace(p.prosrc, '\s', '', 'g'))='e153d2fc4acc932d688ee250a6f29707' and p.prosecdef and pg_catalog.pg_get_userbyid(p.proowner)='postgres') then
    raise exception 'Unreviewed create_staff_guest_preorder definition/signature/owner; stop and reconcile';
  end if;
end $check$;

do $check$ begin
  if (select count(*) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='create_confirmed_extra_stock') <> 1
    or not exists(select 1 from pg_catalog.pg_proc p where p.oid=pg_catalog.to_regprocedure('public.create_confirmed_extra_stock(uuid, text, text, date, timestamptz, timestamptz, text, uuid, uuid)') and md5(regexp_replace(p.prosrc, '\s', '', 'g'))='29bc7e5e625faf7e16ebd586c074b538' and p.prosecdef and pg_catalog.pg_get_userbyid(p.proowner)='postgres') then
    raise exception 'Unreviewed create_confirmed_extra_stock definition/signature/owner; stop and reconcile';
  end if;
end $check$;

do $check$ begin
  if (select count(*) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='waiting_list_convert_item') <> 1
    or not exists(select 1 from pg_catalog.pg_proc p where p.oid=pg_catalog.to_regprocedure('public.waiting_list_convert_item(uuid, uuid, integer, time, boolean)') and md5(regexp_replace(p.prosrc, '\s', '', 'g'))='374273401a376b3afd5a01374e7bf033' and p.prosecdef and pg_catalog.pg_get_userbyid(p.proowner)='postgres') then
    raise exception 'Unreviewed waiting_list_convert_item definition/signature/owner; stop and reconcile';
  end if;
end $check$;

do $check$ begin
  if (select count(*) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='waiting_list_convert_confirmation') <> 1
    or not exists(select 1 from pg_catalog.pg_proc p where p.oid=pg_catalog.to_regprocedure('public.waiting_list_convert_confirmation(uuid, uuid)') and md5(regexp_replace(p.prosrc, '\s', '', 'g'))='c32f110068e9368e3230f2f078cb9f9b' and p.prosecdef and pg_catalog.pg_get_userbyid(p.proowner)='postgres') then
    raise exception 'Unreviewed waiting_list_convert_confirmation definition/signature/owner; stop and reconcile';
  end if;
end $check$;

-- This schema is not an API surface. No application role can use it.
create schema staff_preorder_private authorization postgres;
revoke all on schema staff_preorder_private from public, anon, authenticated, service_role;

-- Original creation business body, with identity binding; only owner-definer wrappers can enter.
create or replace function staff_preorder_private.create_waiting_list_preorder(
  p_actor_staff_id uuid,
  p_customer_name text,
  p_phone text,
  p_email text,
  p_order_source text,
  p_crew_order boolean,
  p_pickup_date date,
  p_pickup_time time,
  p_pickup_instruction text,
  p_items jsonb,
  p_complimentary jsonb,
  p_include_receipt boolean,
  p_needs_bakery_attention boolean,
  p_bakery_attention_note text,
  p_customer_notes text,
  p_internal_notes text,
  p_paid_addons jsonb default '[]'::jsonb,
  p_fulfilment_method public.fulfilment_method default 'pickup',
  p_delivery jsonb default null,
  p_dine_in jsonb default null
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  cake_row public.library_cakes;
  size_row public.library_cake_sizes;
  new_order public.orders;
  active_collection public.collections;
  item jsonb;
  complimentary jsonb;
  v_qty integer;
  v_cake_id uuid;
  v_size_id uuid;
  item_count integer := 0;
  addon_count integer := 0;
  v_email text;
  v_phone text;
  v_source text;
  v_attention_note text;
  v_pickup_instruction text;
  v_type_id uuid;
  v_comp_name text;
  v_comp_qty integer;
  v_comp_sort integer;
  v_method public.fulfilment_method;
begin
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
  if p_actor_staff_id is null then
    raise exception 'Staff actor is required';
  end if;

  if not exists (
    select 1 from public.staff_profiles sp where sp.id = p_actor_staff_id
  ) then
    raise exception 'Staff actor not found';
  end if;

  if char_length(trim(coalesce(p_customer_name, ''))) = 0 then
    raise exception 'Customer name is required';
  end if;

  v_source := nullif(trim(coalesce(p_order_source, '')), '');
  if v_source is null then
    raise exception 'Order source is required';
  end if;
  if v_source = 'customer_website' then
    raise exception 'Staff-created orders cannot use customer_website source';
  end if;
  if v_source not in (
    'jotform',
    'whatsapp',
    'whitebird_instagram',
    'wee',
    'lex',
    'other',
    'walk_in',
    'last_minute'
  ) then
    raise exception 'Invalid order source';
  end if;

  if p_pickup_date is null or p_pickup_time is null then
    raise exception 'Pickup date and time are required';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one cake is required';
  end if;

  v_method := coalesce(p_fulfilment_method, 'pickup'::public.fulfilment_method);
  -- Whole Cake customer methods. Owner UI still sends pickup/delivery only.
  if v_method not in ('pickup', 'delivery', 'dine_in') then
    raise exception 'Staff guest create supports pickup, delivery, or dine-in';
  end if;

  v_phone := nullif(trim(coalesce(p_phone, '')), '');
  v_email := nullif(trim(coalesce(p_email, '')), '');
  v_attention_note := nullif(trim(coalesce(p_bakery_attention_note, '')), '');
  v_pickup_instruction := nullif(trim(coalesce(p_pickup_instruction, '')), '');

  if coalesce(p_needs_bakery_attention, false) = false then
    v_attention_note := null;
  end if;

  active_collection := public.storefront_collection_for_pickup_date(p_pickup_date);
  if active_collection.id is null then
    select c.*
    into active_collection
    from public.collections c
    where c.status = 'active'
    order by c.month desc
    limit 1;
  end if;

  -- Delivery still inserts as pickup until details sync.
  -- Dine-in inserts as dine_in so the deferred reservation invariant matches
  -- submit_guest_preorder (pickup-first + later reservation fails that trigger).
  insert into public.orders (
    order_number,
    customer_id,
    guest_name,
    guest_phone,
    guest_email,
    fulfilment_method,
    pickup_date,
    pickup_time,
    pickup_instruction,
    status,
    payment_status,
    customer_notes,
    internal_notes,
    collection_id,
    confirmation_needs_resend,
    order_source,
    crew_order,
    include_receipt,
    needs_bakery_attention,
    bakery_attention_note,
    email_submission_receipt_requested,
    created_by,
    updated_by
  )
  values (
    public.allocate_order_number(),
    null,
    trim(p_customer_name),
    v_phone,
    v_email,
    case
      when v_method = 'dine_in' then 'dine_in'::public.fulfilment_method
      else 'pickup'::public.fulfilment_method
    end,
    p_pickup_date,
    p_pickup_time,
    v_pickup_instruction,
    'submitted',
    'unpaid',
    nullif(trim(coalesce(p_customer_notes, '')), ''),
    nullif(trim(coalesce(p_internal_notes, '')), ''),
    active_collection.id,
    false,
    v_source,
    coalesce(p_crew_order, false),
    coalesce(p_include_receipt, false),
    coalesce(p_needs_bakery_attention, false),
    v_attention_note,
    false,
    p_actor_staff_id,
    p_actor_staff_id
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
    where lc.id = v_cake_id
      and lc.status in ('active', 'seasonal');
    if not found then
      raise exception 'Cake is not available in the Library';
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
      public.library_cake_size_price_on(size_row.id, p_pickup_date),
      cake_row.name,
      size_row.label
    );

    item_count := item_count + 1;
  end loop;

  if item_count = 0 then
    raise exception 'At least one cake is required';
  end if;

  if p_complimentary is not null
     and jsonb_typeof(p_complimentary) = 'array' then
    for complimentary in select * from jsonb_array_elements(p_complimentary)
    loop
      v_comp_qty := coalesce((complimentary ->> 'quantity')::integer, 0);
      if v_comp_qty <= 0 then
        continue;
      end if;

      v_comp_name := nullif(trim(coalesce(complimentary ->> 'name', '')), '');
      if v_comp_name is null then
        raise exception 'Complimentary item name is required';
      end if;

      begin
        v_type_id := nullif(trim(coalesce(complimentary ->> 'type_id', '')), '')::uuid;
      exception
        when others then
          v_type_id := null;
      end;

      v_comp_sort := coalesce((complimentary ->> 'sort_order')::integer, 0);

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
        v_comp_qty,
        v_comp_sort
      );
    end loop;
  end if;

  addon_count := public._sync_order_paid_addons_from_payload(
    new_order.id,
    coalesce(p_paid_addons, '[]'::jsonb)
  );

  -- Fulfilment + delivery details + dine-in reservation (existing sync helper).
  perform public._sync_order_fulfilment_from_payload(
    new_order.id,
    v_method,
    p_delivery,
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
    'staff_preorder_created',
    p_actor_staff_id,
    jsonb_build_object(
      'item_count', item_count,
      'paid_addon_count', addon_count,
      'order_source', v_source,
      'crew_order', coalesce(p_crew_order, false),
      'include_receipt', coalesce(p_include_receipt, false),
      'needs_bakery_attention', coalesce(p_needs_bakery_attention, false),
      'fulfilment_method', v_method::text,
      'created_via', 'owner_staff'
    )
  );

  select *
  into new_order
  from public.orders o
  where o.id = new_order.id;

  return new_order;
end;
$$;
alter function staff_preorder_private.create_waiting_list_preorder(uuid, text, text, text, text, boolean, date, time, text, jsonb, jsonb, boolean, boolean, text, text, text, jsonb, public.fulfilment_method, jsonb, jsonb) owner to postgres;
revoke all on function staff_preorder_private.create_waiting_list_preorder(uuid, text, text, text, text, boolean, date, time, text, jsonb, jsonb, boolean, boolean, text, text, text, jsonb, public.fulfilment_method, jsonb, jsonb) from public, anon, authenticated, service_role;

create or replace function public.create_staff_guest_preorder(
  p_actor_staff_id uuid,
  p_customer_name text,
  p_phone text,
  p_email text,
  p_order_source text,
  p_crew_order boolean,
  p_pickup_date date,
  p_pickup_time time,
  p_pickup_instruction text,
  p_items jsonb,
  p_complimentary jsonb,
  p_include_receipt boolean,
  p_needs_bakery_attention boolean,
  p_bakery_attention_note text,
  p_customer_notes text,
  p_internal_notes text,
  p_paid_addons jsonb default '[]'::jsonb,
  p_fulfilment_method public.fulfilment_method default 'pickup',
  p_delivery jsonb default null,
  p_dine_in jsonb default null
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Verified request identity survives nested SECURITY DEFINER calls.
  if auth.uid() is null or p_actor_staff_id is null or not exists (
    select 1 from public.staff_profiles sp
    join public.roles r on r.id = sp.role_id
    where sp.auth_user_id = auth.uid()
      and sp.id = p_actor_staff_id
      and sp.is_active = true
      and r.code in ('owner', 'manager', 'customer_operations')
  ) then
    raise exception using errcode = '42501', message = 'Not authorized: an active staff session with the required role is required';
  end if;
  return staff_preorder_private.create_waiting_list_preorder(
    p_actor_staff_id,
    p_customer_name,
    p_phone,
    p_email,
    p_order_source,
    p_crew_order,
    p_pickup_date,
    p_pickup_time,
    p_pickup_instruction,
    p_items,
    p_complimentary,
    p_include_receipt,
    p_needs_bakery_attention,
    p_bakery_attention_note,
    p_customer_notes,
    p_internal_notes,
    p_paid_addons,
    p_fulfilment_method,
    p_delivery,
    p_dine_in
  );
end;
$$;

revoke execute on function public.create_staff_guest_preorder(uuid, text, text, text, text, boolean, date, time, text, jsonb, jsonb, boolean, boolean, text, text, text, jsonb, public.fulfilment_method, jsonb, jsonb) from public, anon, service_role;
grant execute on function public.create_staff_guest_preorder(uuid, text, text, text, text, boolean, date, time, text, jsonb, jsonb, boolean, boolean, text, text, text, jsonb, public.fulfilment_method, jsonb, jsonb) to authenticated;

create or replace function public.create_confirmed_extra_stock(
  p_actor_staff_id uuid,
  p_cake_name text,
  p_size_label text,
  p_prepared_on date,
  p_pickup_available_from_at timestamptz,
  p_pickup_through_at timestamptz,
  p_note text default null,
  p_library_cake_id uuid default null,
  p_library_cake_size_id uuid default null
)
returns public.extra_stock
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  stock_row public.extra_stock;
  v_cake text;
  v_size text;
  v_note text;
  v_prepared date;
begin
  -- Verified request identity survives nested SECURITY DEFINER calls.
  if auth.uid() is null or p_actor_staff_id is null or not exists (
    select 1 from public.staff_profiles sp
    join public.roles r on r.id = sp.role_id
    where sp.auth_user_id = auth.uid()
      and sp.id = p_actor_staff_id
      and sp.is_active = true
      and r.code in ('owner', 'manager', 'bakery')
  ) then
    raise exception using errcode = '42501', message = 'Not authorized: an active staff session with the required role is required';
  end if;
  if p_actor_staff_id is null then
    raise exception 'Staff actor is required';
  end if;
  if not exists (
    select 1 from public.staff_profiles sp where sp.id = p_actor_staff_id
  ) then
    raise exception 'Staff actor not found';
  end if;

  v_role := public._staff_role_code(p_actor_staff_id);
  if v_role is null or v_role not in ('bakery', 'manager', 'owner') then
    raise exception 'Not authorized to create confirmed EXTRA';
  end if;

  v_cake := nullif(trim(coalesce(p_cake_name, '')), '');
  v_size := nullif(trim(coalesce(p_size_label, '')), '');
  if v_cake is null or v_size is null then
    raise exception 'Cake and size are required';
  end if;

  perform public._assert_fresh_picks_confirm_window(
    p_pickup_available_from_at,
    p_pickup_through_at
  );

  v_prepared := coalesce(
    p_prepared_on,
    (timezone('Asia/Singapore', p_pickup_available_from_at))::date
  );
  v_note := nullif(trim(coalesce(p_note, '')), '');

  insert into public.extra_stock (
    lifecycle,
    cake_name,
    size_label,
    library_cake_id,
    library_cake_size_id,
    prepared_on,
    pickup_available_from_at,
    pickup_through_at,
    note,
    proposed_at,
    proposed_by,
    confirmed_at,
    confirmed_by
  )
  values (
    'confirmed',
    v_cake,
    v_size,
    p_library_cake_id,
    p_library_cake_size_id,
    v_prepared,
    p_pickup_available_from_at,
    p_pickup_through_at,
    v_note,
    now(),
    p_actor_staff_id,
    now(),
    p_actor_staff_id
  )
  returning * into stock_row;

  return stock_row;
end;
$$;

revoke execute on function public.create_confirmed_extra_stock(uuid, text, text, date, timestamptz, timestamptz, text, uuid, uuid) from public, anon, service_role;
grant execute on function public.create_confirmed_extra_stock(uuid, text, text, date, timestamptz, timestamptz, text, uuid, uuid) to authenticated;

create or replace function public.waiting_list_convert_item(
  p_actor_staff_id uuid,
  p_item_id uuid,
  p_quantity integer,
  p_pickup_time time,
  p_keep_remaining boolean default true
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.waiting_list_items;
  v_request public.waiting_list_requests;
  v_hold public.production_capacity_holds;
  v_order public.orders;
  v_qty integer;
  v_source text;
begin
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
  select i.* into v_item from public.waiting_list_items i where i.id = p_item_id for update;
  if not found then
    raise exception 'Waiting-list item not found';
  end if;
  if public._waiting_list_item_has_submitted_confirmation(v_item.id) then
    raise exception 'Customer confirmation has already been submitted';
  end if;
  if v_item.status not in ('contacted', 'accepted', 'partially_accepted') then
    raise exception 'Convert only after the customer accepts an offered quantity';
  end if;
  select r.* into v_request from public.waiting_list_requests r where r.id = v_item.request_id for update;
  select h.*
  into v_hold
  from public.production_capacity_holds h
  where h.waiting_list_item_id = v_item.id
    and h.status = 'active'
  order by h.held_at desc
  limit 1
  for update;

  v_qty := coalesce(p_quantity, v_hold.quantity, v_item.remaining_quantity);
  if v_qty < 1 or v_qty > v_item.remaining_quantity then
    raise exception 'Convert quantity is not valid';
  end if;
  if p_pickup_time is null then
    raise exception 'Pickup time is required';
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
    null
  );

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
      when coalesce(p_keep_remaining, true) then 'partially_accepted'
      else 'closed'
    end
  where i.id = v_item.id
  returning * into v_item;

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
$$;

revoke execute on function public.waiting_list_convert_item(uuid, uuid, integer, time, boolean) from public, anon, service_role;
grant execute on function public.waiting_list_convert_item(uuid, uuid, integer, time, boolean) to authenticated;

create or replace function public.waiting_list_convert_confirmation(
  p_actor_staff_id uuid,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
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
  v_complimentary jsonb := '[]'::jsonb;
  v_paid jsonb := '[]'::jsonb;
  v_addon jsonb;
begin
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
$$;

revoke execute on function public.waiting_list_convert_confirmation(uuid, uuid) from public, anon, service_role;
grant execute on function public.waiting_list_convert_confirmation(uuid, uuid) to authenticated;

commit;
