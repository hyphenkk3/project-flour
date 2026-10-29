begin;
set local lock_timeout = '2s';
set local statement_timeout = '30s';

do $preflight$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'orders'
      and column_name = 'order_source_other'
  ) then
    raise exception 'order_source_other already exists; reconcile instead of applying this migration';
  end if;
  if to_regprocedure('public.create_staff_guest_preorder_with_source_detail(uuid,text,text,text,text,text,boolean,date,time,text,jsonb,jsonb,boolean,boolean,text,text,text,jsonb,public.fulfilment_method,jsonb,jsonb)') is not null then
    raise exception 'Extended staff-order RPC already exists; reconcile instead of applying this migration';
  end if;
  if to_regprocedure('staff_preorder_private.create_waiting_list_preorder_with_source_detail(uuid,text,text,text,text,boolean,date,time,text,jsonb,jsonb,boolean,boolean,text,text,text,text,jsonb,public.fulfilment_method,jsonb,jsonb)') is not null then
    raise exception 'Extended private staff-order helper already exists; reconcile instead of applying this migration';
  end if;
  if not exists (
    select 1 from pg_proc p
    where p.oid = to_regprocedure('staff_preorder_private.create_waiting_list_preorder(uuid,text,text,text,text,boolean,date,time,text,jsonb,jsonb,boolean,boolean,text,text,text,jsonb,public.fulfilment_method,jsonb,jsonb)')
      and p.prosecdef and pg_get_userbyid(p.proowner) = 'postgres'
      and p.proconfig = array['search_path=""']
      and p.proacl::text = '{postgres=X/postgres}'
      and md5(regexp_replace(p.prosrc, '\s', '', 'g')) = 'bb247365bc1ea83c52d047d83f0c2c4e'
  ) then
    raise exception 'Private staff-order creation baseline mismatch; stop and reconcile';
  end if;
  if not exists (
    select 1 from pg_proc p
    where p.oid = to_regprocedure('public.create_staff_guest_preorder(uuid,text,text,text,text,boolean,date,time,text,jsonb,jsonb,boolean,boolean,text,text,text,jsonb,public.fulfilment_method,jsonb,jsonb)')
      and p.prosecdef and pg_get_userbyid(p.proowner) = 'postgres'
      and p.proconfig = array['search_path=""']
      and p.proacl::text = '{postgres=X/postgres,authenticated=X/postgres}'
      and md5(regexp_replace(p.prosrc, '\s', '', 'g')) = 'a5d5974aa48c46725c80d01a41bc4210'
  ) then
    raise exception 'Public staff-order RPC baseline mismatch; stop and reconcile';
  end if;
  if not exists (
    select 1 from pg_constraint c
    where c.conrelid = 'public.orders'::regclass
      and c.conname = 'orders_order_source_check'
      and pg_get_constraintdef(c.oid) = $constraint$CHECK ((order_source = ANY (ARRAY['customer_website'::text, 'jotform'::text, 'whatsapp'::text, 'whitebird_instagram'::text, 'wee'::text, 'lex'::text, 'walk_in'::text, 'last_minute'::text, 'other'::text])))$constraint$
  ) then
    raise exception 'Order-source check baseline mismatch; stop and reconcile';
  end if;
  if not has_table_privilege('authenticated', 'public.orders', 'select') then
    raise exception 'Authenticated order-read grant is missing; stop and reconcile';
  end if;
end;
$preflight$;

alter table public.orders add column order_source_other text;
comment on column public.orders.order_source_other is
  'Optional description for newly staff-created orders whose order_source is other. Historical rows remain null; no backfill.';
alter table public.orders add constraint orders_order_source_other_nonblank_check
  check (order_source_other is null or char_length(btrim(order_source_other)) > 0);

alter table public.orders drop constraint orders_order_source_check;
alter table public.orders add constraint orders_order_source_check check (
  order_source in (
    'customer_website', 'jotform', 'whatsapp', 'whitebird_instagram',
    'wee', 'lex', 'kin', 'walk_in', 'last_minute', 'other'
  )
);

create function staff_preorder_private.create_waiting_list_preorder_with_source_detail(
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
  p_order_source_other text,
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
  v_source_other text;
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
    'kin',
    'other',
    'walk_in',
    'last_minute'
  ) then
    raise exception 'Invalid order source';
  end if;

  v_source_other := nullif(trim(coalesce(p_order_source_other, '')), '');
  if v_source_other is not null and v_source is distinct from 'other' then
    raise exception 'A source description is only valid for Other';
  end if;
  if v_source = 'jotform' and pg_catalog.transaction_timestamp() >= timestamptz '2026-10-31 16:00:00+00' then
    raise exception 'Jotform is no longer available for new orders';
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
    order_source_other,
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
    v_source_other,
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
alter function staff_preorder_private.create_waiting_list_preorder_with_source_detail(uuid, text, text, text, text, boolean, date, time, text, jsonb, jsonb, boolean, boolean, text, text, text, text, jsonb, public.fulfilment_method, jsonb, jsonb) owner to postgres;
revoke all on function staff_preorder_private.create_waiting_list_preorder_with_source_detail(uuid, text, text, text, text, boolean, date, time, text, jsonb, jsonb, boolean, boolean, text, text, text, text, jsonb, public.fulfilment_method, jsonb, jsonb) from public, anon, authenticated, service_role;

-- Keep the original private signature and its positional/default-argument
-- resolution for existing waiting-list and historical callers.
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
language sql
security definer
set search_path = ''
as $$
  select staff_preorder_private.create_waiting_list_preorder_with_source_detail(
    p_actor_staff_id, p_customer_name, p_phone, p_email, p_order_source,
    p_crew_order, p_pickup_date, p_pickup_time, p_pickup_instruction,
    p_items, p_complimentary, p_include_receipt, p_needs_bakery_attention,
    p_bakery_attention_note, p_customer_notes, p_internal_notes, null,
    p_paid_addons, p_fulfilment_method, p_delivery, p_dine_in
  );
$$;
alter function staff_preorder_private.create_waiting_list_preorder(uuid, text, text, text, text, boolean, date, time, text, jsonb, jsonb, boolean, boolean, text, text, text, jsonb, public.fulfilment_method, jsonb, jsonb) owner to postgres;
revoke all on function staff_preorder_private.create_waiting_list_preorder(uuid, text, text, text, text, boolean, date, time, text, jsonb, jsonb, boolean, boolean, text, text, text, jsonb, public.fulfilment_method, jsonb, jsonb) from public, anon, authenticated, service_role;
-- The existing public create_staff_guest_preorder signature and body are left
-- untouched. This keeps currently deployed callers working; the revised staff
-- application uses the explicit-detail RPC below for new orders.
create function public.create_staff_guest_preorder_with_source_detail(
  p_actor_staff_id uuid,
  p_customer_name text,
  p_phone text,
  p_email text,
  p_order_source text,
  p_order_source_other text,
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
  v_source text;
  v_source_other text;
  v_order public.orders;
begin
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

  v_source := nullif(trim(coalesce(p_order_source, '')), '');
  if v_source is null then
    raise exception 'Order source is required';
  end if;
  v_source_other := nullif(trim(coalesce(p_order_source_other, '')), '');
  if v_source = 'other' and v_source_other is null then
    raise exception 'Please specify the order source';
  end if;
  if v_source is distinct from 'other' and v_source_other is not null then
    raise exception 'A source description is only valid for Other';
  end if;

  v_order := staff_preorder_private.create_waiting_list_preorder_with_source_detail(
    p_actor_staff_id,
    p_customer_name,
    p_phone,
    p_email,
    v_source,
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
    v_source_other,
    p_paid_addons,
    p_fulfilment_method,
    p_delivery,
    p_dine_in
  );
  return v_order;
end;
$$;
alter function public.create_staff_guest_preorder_with_source_detail(uuid, text, text, text, text, text, boolean, date, time, text, jsonb, jsonb, boolean, boolean, text, text, text, jsonb, public.fulfilment_method, jsonb, jsonb) owner to postgres;
revoke all on function public.create_staff_guest_preorder_with_source_detail(uuid, text, text, text, text, text, boolean, date, time, text, jsonb, jsonb, boolean, boolean, text, text, text, jsonb, public.fulfilment_method, jsonb, jsonb) from public, anon, service_role;
grant execute on function public.create_staff_guest_preorder_with_source_detail(uuid, text, text, text, text, text, boolean, date, time, text, jsonb, jsonb, boolean, boolean, text, text, text, jsonb, public.fulfilment_method, jsonb, jsonb) to authenticated;

do $postflight$
begin
  if not exists (
    select 1 from pg_proc p
    where p.oid = to_regprocedure('staff_preorder_private.create_waiting_list_preorder(uuid,text,text,text,text,boolean,date,time,text,jsonb,jsonb,boolean,boolean,text,text,text,jsonb,public.fulfilment_method,jsonb,jsonb)')
      and p.prosecdef and pg_get_userbyid(p.proowner) = 'postgres'
      and p.proconfig = array['search_path=""']
      and p.proacl::text = '{postgres=X/postgres}'
  ) then
    raise exception 'Legacy private helper signature/security changed';
  end if;
  if not exists (
    select 1 from pg_proc p
    where p.oid = to_regprocedure('staff_preorder_private.create_waiting_list_preorder_with_source_detail(uuid,text,text,text,text,boolean,date,time,text,jsonb,jsonb,boolean,boolean,text,text,text,text,jsonb,public.fulfilment_method,jsonb,jsonb)')
      and p.prosecdef and pg_get_userbyid(p.proowner) = 'postgres'
      and p.proconfig = array['search_path=""']
      and p.proacl::text = '{postgres=X/postgres}'
  ) then
    raise exception 'New private helper signature/security mismatch';
  end if;
  if not exists (
    select 1 from pg_proc p
    where p.oid = to_regprocedure('public.create_staff_guest_preorder(uuid,text,text,text,text,boolean,date,time,text,jsonb,jsonb,boolean,boolean,text,text,text,jsonb,public.fulfilment_method,jsonb,jsonb)')
      and p.prosecdef and pg_get_userbyid(p.proowner) = 'postgres'
      and p.proconfig = array['search_path=""']
      and p.proacl::text = '{postgres=X/postgres,authenticated=X/postgres}'
      and md5(regexp_replace(p.prosrc, '\s', '', 'g')) = 'a5d5974aa48c46725c80d01a41bc4210'
  ) then
    raise exception 'Legacy public RPC changed; existing application compatibility check failed';
  end if;
  if not exists (
    select 1 from pg_proc p
    where p.oid = to_regprocedure('public.create_staff_guest_preorder_with_source_detail(uuid,text,text,text,text,text,boolean,date,time,text,jsonb,jsonb,boolean,boolean,text,text,text,jsonb,public.fulfilment_method,jsonb,jsonb)')
      and p.prosecdef and pg_get_userbyid(p.proowner) = 'postgres'
      and p.proconfig = array['search_path=""']
      and p.proacl::text = '{postgres=X/postgres,authenticated=X/postgres}'
      and p.proargnames[6] = 'p_order_source_other'
      and p.pronargdefaults = 4
  ) then
    raise exception 'New authenticated RPC signature/security mismatch';
  end if;
  if not has_column_privilege('authenticated', 'public.orders', 'order_source_other', 'select') then
    raise exception 'Authenticated order-source detail read grant is missing';
  end if;
  if not exists (
    select 1 from pg_constraint c
    where c.conrelid = 'public.orders'::regclass
      and c.conname = 'orders_order_source_check'
      and c.convalidated
      and pg_get_constraintdef(c.oid) like '%''kin''%'
  ) then
    raise exception 'Kin source constraint postflight failed';
  end if;
  if not exists (
    select 1 from pg_constraint c
    where c.conrelid = 'public.orders'::regclass
      and c.conname = 'orders_order_source_other_nonblank_check'
      and c.convalidated
  ) then
    raise exception 'Other source-detail constraint postflight failed';
  end if;
end;
$postflight$;

notify pgrst, 'reload schema';
commit;
