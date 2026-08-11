-- M4-P2 Slice 1 — Fulfilment & Delivery order model (schema + RPC + DTO truth)
-- Additive. Does not amend M4-P1 migrations.
-- Reuses orders.fulfilment_method and orders.pickup_date / pickup_time.
-- Does NOT add delivery fees, Grab, lifecycle, or website Delivery.

-- ---------------------------------------------------------------------------
-- 1) Notify preference enum
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'recipient_notify_preference'
  ) then
    create type public.recipient_notify_preference as enum (
      'inform_recipient',
      'do_not_inform_recipient'
    );
  end if;
end
$$;

comment on type public.recipient_notify_preference is
  'Whether Whitebird may contact the Delivery recipient about this delivery. '
  'Not customer messaging consent or marketing preference.';

-- ---------------------------------------------------------------------------
-- 2) order_delivery_details (snapshot sibling; 0..1 per order)
-- ---------------------------------------------------------------------------

create table if not exists public.order_delivery_details (
  order_id uuid primary key
    references public.orders (id) on delete cascade,
  recipient_name text not null,
  recipient_phone text not null,
  address_line_1 text not null,
  address_line_2 text,
  postcode text not null,
  city text not null,
  state text not null,
  recipient_notify_preference public.recipient_notify_preference not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint order_delivery_details_recipient_name_not_blank
    check (char_length(trim(recipient_name)) > 0),
  constraint order_delivery_details_recipient_phone_not_blank
    check (char_length(trim(recipient_phone)) > 0),
  constraint order_delivery_details_address_line_1_not_blank
    check (char_length(trim(address_line_1)) > 0),
  constraint order_delivery_details_postcode_not_blank
    check (char_length(trim(postcode)) > 0),
  constraint order_delivery_details_city_not_blank
    check (char_length(trim(city)) > 0),
  constraint order_delivery_details_state_not_blank
    check (char_length(trim(state)) > 0)
);

comment on table public.order_delivery_details is
  'Snapshotted Delivery fulfilment details for an order. '
  'Exactly one row when fulfilment_method = delivery; zero rows otherwise. '
  'Not a live FK to customer_addresses.';

create trigger order_delivery_details_set_updated_at
before update on public.order_delivery_details
for each row
execute function public.set_updated_at();

alter table public.order_delivery_details enable row level security;

drop policy if exists order_delivery_details_authenticated_select
  on public.order_delivery_details;
create policy order_delivery_details_authenticated_select
  on public.order_delivery_details
  for select
  to authenticated
  using (true);

drop policy if exists order_delivery_details_authenticated_insert
  on public.order_delivery_details;
create policy order_delivery_details_authenticated_insert
  on public.order_delivery_details
  for insert
  to authenticated
  with check (true);

drop policy if exists order_delivery_details_authenticated_update
  on public.order_delivery_details;
create policy order_delivery_details_authenticated_update
  on public.order_delivery_details
  for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists order_delivery_details_authenticated_delete
  on public.order_delivery_details;
create policy order_delivery_details_authenticated_delete
  on public.order_delivery_details
  for delete
  to authenticated
  using (true);

grant select, insert, update, delete on public.order_delivery_details
  to authenticated;

revoke all on table public.order_delivery_details from anon;

-- ---------------------------------------------------------------------------
-- 3) Deferred invariant: Delivery ↔ exactly one details row
--    DEFERRABLE so atomic Pickup↔Delivery transitions within one TX succeed.
-- ---------------------------------------------------------------------------

create or replace function public.assert_order_delivery_details_invariant()
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
  else
    if tg_op = 'DELETE' then
      v_order_id := old.order_id;
    else
      v_order_id := new.order_id;
    end if;
  end if;

  select o.fulfilment_method
  into v_method
  from public.orders o
  where o.id = v_order_id;

  if not found then
    return null;
  end if;

  select count(*)::integer
  into v_count
  from public.order_delivery_details d
  where d.order_id = v_order_id;

  if v_method = 'delivery' then
    if v_count <> 1 then
      raise exception
        'Delivery orders require exactly one order_delivery_details row (found %)',
        v_count;
    end if;
  else
    -- pickup and drive_through (and any future non-delivery methods)
    if v_count <> 0 then
      raise exception
        'Non-delivery orders must not have order_delivery_details rows (found %)',
        v_count;
    end if;
  end if;

  return null;
end;
$$;

drop trigger if exists order_delivery_details_invariant_aiud
  on public.order_delivery_details;
create constraint trigger order_delivery_details_invariant_aiud
after insert or update or delete on public.order_delivery_details
deferrable initially deferred
for each row
execute function public.assert_order_delivery_details_invariant();

drop trigger if exists orders_delivery_details_invariant_au
  on public.orders;
create constraint trigger orders_delivery_details_invariant_au
after insert or update of fulfilment_method on public.orders
deferrable initially deferred
for each row
execute function public.assert_order_delivery_details_invariant();

-- ---------------------------------------------------------------------------
-- 4) Internal sync helper (SECURITY DEFINER) — not a client RPC
-- ---------------------------------------------------------------------------

create or replace function public._sync_order_fulfilment_from_payload(
  p_order_id uuid,
  p_fulfilment_method public.fulfilment_method,
  p_delivery jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_method public.fulfilment_method;
  v_delivery jsonb;
  v_name text;
  v_phone text;
  v_line1 text;
  v_line2 text;
  v_postcode text;
  v_city text;
  v_state text;
  v_notify text;
  v_notify_pref public.recipient_notify_preference;
  v_has_payload boolean;
begin
  if p_order_id is null then
    raise exception 'Order id is required';
  end if;

  if p_fulfilment_method is null then
    raise exception 'Fulfilment method is required';
  end if;

  v_method := p_fulfilment_method;
  v_delivery := p_delivery;
  v_has_payload := (
    v_delivery is not null
    and jsonb_typeof(v_delivery) = 'object'
    and v_delivery <> '{}'::jsonb
  );

  if v_method = 'delivery' then
    if not v_has_payload then
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

    if v_name is null then
      raise exception 'Recipient name is required';
    end if;
    if v_phone is null then
      raise exception 'Recipient phone is required';
    end if;
    if v_line1 is null then
      raise exception 'Address line 1 is required';
    end if;
    if v_postcode is null then
      raise exception 'Postcode is required';
    end if;
    if v_city is null then
      raise exception 'City is required';
    end if;
    if v_state is null then
      raise exception 'State is required';
    end if;
    if v_notify is null then
      raise exception 'Recipient notification preference is required';
    end if;
    if v_notify not in ('inform_recipient', 'do_not_inform_recipient') then
      raise exception 'Invalid recipient notification preference';
    end if;

    v_notify_pref := v_notify::public.recipient_notify_preference;

    update public.orders
    set
      fulfilment_method = 'delivery',
      updated_at = now()
    where id = p_order_id;

    if not found then
      raise exception 'Order not found';
    end if;

    insert into public.order_delivery_details (
      order_id,
      recipient_name,
      recipient_phone,
      address_line_1,
      address_line_2,
      postcode,
      city,
      state,
      recipient_notify_preference
    )
    values (
      p_order_id,
      v_name,
      v_phone,
      v_line1,
      v_line2,
      v_postcode,
      v_city,
      v_state,
      v_notify_pref
    )
    on conflict (order_id) do update
    set
      recipient_name = excluded.recipient_name,
      recipient_phone = excluded.recipient_phone,
      address_line_1 = excluded.address_line_1,
      address_line_2 = excluded.address_line_2,
      postcode = excluded.postcode,
      city = excluded.city,
      state = excluded.state,
      recipient_notify_preference = excluded.recipient_notify_preference,
      updated_at = now();
  else
    -- pickup / drive_through: reject contradictory delivery payload
    if v_has_payload then
      raise exception
        'Delivery details payload is not allowed when fulfilment is %',
        v_method;
    end if;

    update public.orders
    set
      fulfilment_method = v_method,
      updated_at = now()
    where id = p_order_id;

    if not found then
      raise exception 'Order not found';
    end if;

    delete from public.order_delivery_details d
    where d.order_id = p_order_id;
  end if;
end;
$$;

revoke all on function public._sync_order_fulfilment_from_payload(
  uuid, public.fulfilment_method, jsonb
) from public;

revoke all on function public._sync_order_fulfilment_from_payload(
  uuid, public.fulfilment_method, jsonb
) from anon;

revoke all on function public._sync_order_fulfilment_from_payload(
  uuid, public.fulfilment_method, jsonb
) from authenticated;

comment on function public._sync_order_fulfilment_from_payload(
  uuid, public.fulfilment_method, jsonb
) is
  'INTERNAL ONLY — atomic fulfilment method + delivery-details sync. '
  'Not a client RPC. Called by create_staff_guest_preorder and '
  'sync_guest_order_fulfilment (SECURITY DEFINER). '
  'EXECUTE revoked from public/anon/authenticated.';

-- ---------------------------------------------------------------------------
-- 5) Client RPC: sync_guest_order_fulfilment
-- ---------------------------------------------------------------------------

create or replace function public.sync_guest_order_fulfilment(
  p_order_id uuid,
  p_fulfilment_method public.fulfilment_method,
  p_delivery jsonb default null
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
begin
  if p_order_id is null then
    raise exception 'Order id is required';
  end if;

  select *
  into v_order
  from public.orders o
  where o.id = p_order_id
    and o.customer_id is null;

  if not found then
    raise exception 'Guest order not found';
  end if;

  perform public._sync_order_fulfilment_from_payload(
    p_order_id,
    p_fulfilment_method,
    p_delivery
  );

  select *
  into v_order
  from public.orders o
  where o.id = p_order_id;

  return v_order;
end;
$$;

revoke all on function public.sync_guest_order_fulfilment(
  uuid, public.fulfilment_method, jsonb
) from public;

grant execute on function public.sync_guest_order_fulfilment(
  uuid, public.fulfilment_method, jsonb
) to authenticated;

comment on function public.sync_guest_order_fulfilment(
  uuid, public.fulfilment_method, jsonb
) is
  'Owner guest-order fulfilment sync. Atomically sets fulfilment_method and '
  'upserts/deletes order_delivery_details. Does not mutate cakes, paid add-ons, '
  'payments, adjustments, or confirmation state.';

-- ---------------------------------------------------------------------------
-- 6) Extend create_staff_guest_preorder (preserve M4-P1 signature + defaults)
-- ---------------------------------------------------------------------------

drop function if exists public.create_staff_guest_preorder(
  uuid, text, text, text, text, boolean, date, time, text, jsonb, jsonb,
  boolean, boolean, text, text, text, jsonb
);

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
  p_delivery jsonb default null
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
  -- Owner P2 creates Pickup or Delivery only (drive_through not via this path).
  if v_method not in ('pickup', 'delivery') then
    raise exception 'Staff guest create supports pickup or delivery only';
  end if;

  v_phone := nullif(trim(coalesce(p_phone, '')), '');
  v_email := nullif(trim(coalesce(p_email, '')), '');
  v_attention_note := nullif(trim(coalesce(p_bakery_attention_note, '')), '');
  v_pickup_instruction := nullif(trim(coalesce(p_pickup_instruction, '')), '');

  if coalesce(p_needs_bakery_attention, false) = false then
    v_attention_note := null;
  end if;

  select c.*
  into active_collection
  from public.collections c
  where c.status = 'active'
  order by c.month desc
  limit 1;

  -- Insert as pickup first so deferred invariant is satisfied until fulfilment sync.
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
    'pickup',
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
      size_row.price,
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

  -- Fulfilment + delivery details (may upgrade pickup → delivery atomically).
  perform public._sync_order_fulfilment_from_payload(
    new_order.id,
    v_method,
    p_delivery
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

revoke all on function public.create_staff_guest_preorder(
  uuid, text, text, text, text, boolean, date, time, text, jsonb, jsonb,
  boolean, boolean, text, text, text, jsonb, public.fulfilment_method, jsonb
) from public;

grant execute on function public.create_staff_guest_preorder(
  uuid, text, text, text, text, boolean, date, time, text, jsonb, jsonb,
  boolean, boolean, text, text, text, jsonb, public.fulfilment_method, jsonb
) to authenticated;

comment on function public.create_staff_guest_preorder(
  uuid, text, text, text, text, boolean, date, time, text, jsonb, jsonb,
  boolean, boolean, text, text, text, jsonb, public.fulfilment_method, jsonb
) is
  'Owner staff-created guest preorder. Optional p_paid_addons (default []). '
  'Optional p_fulfilment_method (default pickup) and p_delivery (Delivery snapshot). '
  'Omitted P2 args create Pickup with no delivery-details row. '
  'Website submit_guest_preorder is intentionally unchanged.';
