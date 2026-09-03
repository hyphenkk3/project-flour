-- Phase 7 — Waiting-list engine RPCs, holds, enablement, RLS.
-- Reuses Phase 2 waiting_list_* / production_capacity_holds / collections flags.
-- Does not alter production_capacity quantity semantics or Fresh Picks.

-- ---------------------------------------------------------------------------
-- Role helpers (strengthen waiting-list RLS; Collection denied)
-- ---------------------------------------------------------------------------

create or replace function public._current_staff_role_code()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select r.code
  from public.staff_profiles sp
  join public.roles r on r.id = sp.role_id
  where sp.auth_user_id = auth.uid()
    and sp.is_active is distinct from false
  limit 1;
$$;

revoke all on function public._current_staff_role_code() from public, anon;
grant execute on function public._current_staff_role_code() to authenticated;

create or replace function public._waiting_list_can_manage(p_role text)
returns boolean
language sql
immutable
as $$
  select p_role in (
    'owner',
    'manager',
    'bakery',
    'customer_operations'
  );
$$;

create or replace function public._waiting_list_can_configure(p_role text)
returns boolean
language sql
immutable
as $$
  select p_role in ('owner', 'manager', 'bakery');
$$;

revoke all on function public._waiting_list_can_manage(text) from public, anon;
revoke all on function public._waiting_list_can_configure(text) from public, anon;
grant execute on function public._waiting_list_can_manage(text) to authenticated;
grant execute on function public._waiting_list_can_configure(text) to authenticated;

create or replace function public._waiting_list_assert_manage_staff(
  p_actor_staff_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  if p_actor_staff_id is null then
    raise exception 'Staff actor is required';
  end if;
  if not exists (
    select 1 from public.staff_profiles sp where sp.id = p_actor_staff_id
  ) then
    raise exception 'Staff actor not found';
  end if;
  v_role := public._staff_role_code(p_actor_staff_id);
  if not public._waiting_list_can_manage(v_role) then
    raise exception 'Not authorized to manage the waiting list';
  end if;
  return v_role;
end;
$$;

create or replace function public._waiting_list_assert_configure_staff(
  p_actor_staff_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  v_role := public._waiting_list_assert_manage_staff(p_actor_staff_id);
  if not public._waiting_list_can_configure(v_role) then
    raise exception 'Not authorized to configure waiting-list enablement';
  end if;
  return v_role;
end;
$$;

revoke all on function public._waiting_list_assert_manage_staff(uuid)
  from public, anon, authenticated;
revoke all on function public._waiting_list_assert_configure_staff(uuid)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RLS: staff roles only (Collection cannot read waiting-list master data)
-- ---------------------------------------------------------------------------

drop policy if exists waiting_list_requests_authenticated_all
  on public.waiting_list_requests;
create policy waiting_list_requests_staff_all
on public.waiting_list_requests
for all to authenticated
using (public._waiting_list_can_manage(public._current_staff_role_code()))
with check (public._waiting_list_can_manage(public._current_staff_role_code()));

drop policy if exists waiting_list_items_authenticated_all
  on public.waiting_list_items;
create policy waiting_list_items_staff_all
on public.waiting_list_items
for all to authenticated
using (public._waiting_list_can_manage(public._current_staff_role_code()))
with check (public._waiting_list_can_manage(public._current_staff_role_code()));

drop policy if exists waiting_list_events_authenticated_select
  on public.waiting_list_events;
drop policy if exists waiting_list_events_authenticated_insert
  on public.waiting_list_events;
create policy waiting_list_events_staff_select
on public.waiting_list_events
for select to authenticated
using (public._waiting_list_can_manage(public._current_staff_role_code()));
create policy waiting_list_events_staff_insert
on public.waiting_list_events
for insert to authenticated
with check (public._waiting_list_can_manage(public._current_staff_role_code()));

drop policy if exists production_capacity_holds_authenticated_all
  on public.production_capacity_holds;
create policy production_capacity_holds_staff_all
on public.production_capacity_holds
for all to authenticated
using (public._waiting_list_can_manage(public._current_staff_role_code()))
with check (public._waiting_list_can_manage(public._current_staff_role_code()));

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------

create or replace function public._waiting_list_digits(p_value text)
returns text
language sql
immutable
as $$
  select regexp_replace(coalesce(p_value, ''), '[^0-9]', '', 'g');
$$;

create or replace function public._waiting_list_append_event(
  p_request_id uuid,
  p_item_id uuid,
  p_event_type text,
  p_actor_staff_id uuid,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.waiting_list_events (
    request_id,
    item_id,
    event_type,
    actor_staff_id,
    metadata
  ) values (
    p_request_id,
    p_item_id,
    p_event_type,
    p_actor_staff_id,
    coalesce(p_metadata, '{}'::jsonb)
  );
end;
$$;

create or replace function public._waiting_list_next_queue_position(
  p_pickup_date date,
  p_cake_id uuid,
  p_size_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_max integer;
begin
  select coalesce(max(i.queue_position), 0)
  into v_max
  from public.waiting_list_items i
  where i.pickup_date = p_pickup_date
    and i.library_cake_id = p_cake_id
    and i.library_cake_size_id is not distinct from p_size_id
    and i.status in ('active', 'contacted', 'partially_accepted');
  return v_max + 1;
end;
$$;

create or replace function public._waiting_list_response_minutes(
  p_collection_id uuid
)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_collection integer;
  v_business integer;
begin
  if p_collection_id is not null then
    select c.waiting_list_response_minutes
    into v_collection
    from public.collections c
    where c.id = p_collection_id;
  end if;
  if v_collection is not null and v_collection > 0 then
    return v_collection;
  end if;
  select b.waiting_list_response_minutes
  into v_business
  from public.business_operating_config b
  where b.id = 1;
  if v_business is not null and v_business > 0 then
    return v_business;
  end if;
  return 30;
end;
$$;

create or replace function public._waiting_list_matching_capacity(
  p_pickup_date date,
  p_cake_id uuid,
  p_size_id uuid,
  p_collection_id uuid
)
returns public.production_capacity
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_row public.production_capacity;
begin
  select c.*
  into v_row
  from public.production_capacity c
  where c.pickup_date = p_pickup_date
    and c.library_cake_id = p_cake_id
    and (c.library_cake_size_id is null or c.library_cake_size_id = p_size_id)
    and (c.collection_id is null or c.collection_id = p_collection_id)
  order by
    (c.library_cake_size_id is not null) desc,
    (c.collection_id is not null) desc
  limit 1;
  return v_row;
end;
$$;

create or replace function public._waiting_list_held_quantity(
  p_capacity_id uuid
)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(h.quantity), 0)::integer
  from public.production_capacity_holds h
  where h.capacity_id = p_capacity_id
    and h.status = 'active';
$$;

create or replace function public._waiting_list_sync_request_status(
  p_request_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_any_queue boolean;
  v_any_converted boolean;
  v_all_cancelled boolean;
  v_all_terminal boolean;
  v_status text;
begin
  select
    coalesce(bool_or(i.status in ('active', 'contacted', 'partially_accepted')), false),
    coalesce(bool_or(i.status in ('converted', 'partially_accepted', 'accepted')), false),
    coalesce(bool_and(i.status = 'cancelled'), false),
    coalesce(bool_and(i.status in (
      'closed', 'cancelled', 'converted', 'declined', 'expired', 'accepted'
    )), false)
  into v_any_queue, v_any_converted, v_all_cancelled, v_all_terminal
  from public.waiting_list_items i
  where i.request_id = p_request_id;

  if v_all_cancelled then
    v_status := 'cancelled';
  elsif v_any_queue and v_any_converted then
    v_status := 'partially_converted';
  elsif v_any_queue then
    v_status := 'active';
  elsif v_any_converted then
    v_status := 'converted';
  elsif v_all_terminal then
    v_status := 'closed';
  else
    v_status := 'active';
  end if;

  update public.waiting_list_requests r
  set status = v_status
  where r.id = p_request_id;
end;
$$;

revoke all on function public._waiting_list_digits(text) from public, anon;
revoke all on function public._waiting_list_append_event(uuid, uuid, text, uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public._waiting_list_next_queue_position(date, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public._waiting_list_response_minutes(uuid)
  from public, anon, authenticated;
revoke all on function public._waiting_list_matching_capacity(date, uuid, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public._waiting_list_held_quantity(uuid)
  from public, anon, authenticated;
revoke all on function public._waiting_list_sync_request_status(uuid)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Enablement (Bakery / Owner / Manager)
-- ---------------------------------------------------------------------------

create or replace function public.set_collection_waiting_list(
  p_actor_staff_id uuid,
  p_collection_id uuid,
  p_enabled boolean,
  p_response_minutes integer default null
)
returns public.collections
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.collections;
begin
  perform public._waiting_list_assert_configure_staff(p_actor_staff_id);
  if p_collection_id is null then
    raise exception 'Collection is required';
  end if;
  if p_response_minutes is not null and p_response_minutes < 1 then
    raise exception 'Response window must be at least 1 minute';
  end if;
  update public.collections c
  set
    waiting_list_enabled = coalesce(p_enabled, false),
    waiting_list_response_minutes = p_response_minutes
  where c.id = p_collection_id
  returning * into v_row;
  if not found then
    raise exception 'Collection not found';
  end if;
  return v_row;
end;
$$;

create or replace function public.set_production_capacity_waiting_list(
  p_actor_staff_id uuid,
  p_capacity_id uuid,
  p_enabled boolean
)
returns public.production_capacity
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.production_capacity;
begin
  perform public._waiting_list_assert_configure_staff(p_actor_staff_id);
  update public.production_capacity c
  set
    waiting_list_enabled = coalesce(p_enabled, false),
    updated_by = p_actor_staff_id
  where c.id = p_capacity_id
  returning * into v_row;
  if not found then
    raise exception 'Capacity row not found';
  end if;
  return v_row;
end;
$$;

revoke all on function public.set_collection_waiting_list(uuid, uuid, boolean, integer)
  from public, anon;
grant execute on function public.set_collection_waiting_list(uuid, uuid, boolean, integer)
  to authenticated;
revoke all on function public.set_production_capacity_waiting_list(uuid, uuid, boolean)
  from public, anon;
grant execute on function public.set_production_capacity_waiting_list(uuid, uuid, boolean)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Create request (guest + staff)
-- ---------------------------------------------------------------------------

create or replace function public._waiting_list_insert_request(
  p_guest_name text,
  p_phone text,
  p_pickup_date date,
  p_open_to_alternatives boolean,
  p_items jsonb,
  p_collection_id uuid,
  p_actor_staff_id uuid,
  p_notes text,
  p_event_type text
)
returns public.waiting_list_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_phone text;
  v_request public.waiting_list_requests;
  v_item jsonb;
  v_cake uuid;
  v_size uuid;
  v_qty integer;
  v_capacity public.production_capacity;
  v_collection public.collections;
  v_item_id uuid;
  v_position integer;
begin
  v_name := nullif(trim(coalesce(p_guest_name, '')), '');
  v_phone := public._waiting_list_digits(p_phone);
  if v_name is null then
    raise exception 'Name is required';
  end if;
  if char_length(v_phone) < 8 or char_length(v_phone) > 15 then
    raise exception 'Please enter a valid WhatsApp number';
  end if;
  if p_pickup_date is null then
    raise exception 'Collection date is required';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 then
    raise exception 'At least one cake is required';
  end if;

  if p_collection_id is not null then
    select c.* into v_collection from public.collections c where c.id = p_collection_id;
  else
    v_collection := public.storefront_collection_for_pickup_date(p_pickup_date);
  end if;
  if v_collection.id is null or v_collection.waiting_list_enabled is not true then
    raise exception 'Waiting list is not enabled for this collection';
  end if;

  insert into public.waiting_list_requests (
    guest_name,
    guest_phone,
    pickup_date,
    open_to_alternatives,
    status,
    notes,
    created_by_staff_id
  ) values (
    v_name,
    v_phone,
    p_pickup_date,
    coalesce(p_open_to_alternatives, false),
    'active',
    nullif(trim(coalesce(p_notes, '')), ''),
    p_actor_staff_id
  )
  returning * into v_request;

  for v_item in
    select value from jsonb_array_elements(p_items)
  loop
    v_cake := nullif(trim(coalesce(v_item->>'cake_id', v_item->>'cakeId', '')), '')::uuid;
    v_size := nullif(trim(coalesce(v_item->>'cake_size_id', v_item->>'sizeId', '')), '')::uuid;
    v_qty := coalesce((v_item->>'quantity')::integer, 0);
    if v_cake is null or v_size is null or v_qty < 1 then
      raise exception 'Each waiting-list item needs a cake, size, and quantity';
    end if;
    if not exists (
      select 1 from public.library_cake_sizes s
      where s.id = v_size and s.cake_id = v_cake
    ) then
      raise exception 'Cake size is not available';
    end if;

    v_capacity := public._waiting_list_matching_capacity(
      p_pickup_date,
      v_cake,
      v_size,
      v_collection.id
    );
    if v_capacity.id is null then
      raise exception 'Waiting list is not available for that cake and date';
    end if;
    if v_capacity.waiting_list_enabled is not true then
      raise exception 'Waiting list is not enabled for that cake and date';
    end if;
    if p_actor_staff_id is null then
      if not public._guest_preorder_item_fully_booked(
        p_pickup_date,
        v_collection.id,
        v_cake,
        v_size,
        v_qty
      ) then
        raise exception 'This cake is still available to order for that date';
      end if;
    end if;

    v_position := public._waiting_list_next_queue_position(
      p_pickup_date,
      v_cake,
      v_size
    );

    insert into public.waiting_list_items (
      request_id,
      pickup_date,
      library_cake_id,
      library_cake_size_id,
      quantity,
      accepted_quantity,
      remaining_quantity,
      queue_position,
      status,
      production_capacity_id
    ) values (
      v_request.id,
      p_pickup_date,
      v_cake,
      v_size,
      v_qty,
      0,
      v_qty,
      v_position,
      'active',
      v_capacity.id
    )
    returning id into v_item_id;

    perform public._waiting_list_append_event(
      v_request.id,
      v_item_id,
      p_event_type,
      p_actor_staff_id,
      jsonb_build_object(
        'quantity', v_qty,
        'pickup_date', p_pickup_date,
        'queue_position', v_position,
        'cake_id', v_cake,
        'size_id', v_size
      )
    );
  end loop;

  return v_request;
end;
$$;

revoke all on function public._waiting_list_insert_request(
  text, text, date, boolean, jsonb, uuid, uuid, text, text
) from public, anon, authenticated;

create or replace function public.submit_guest_waiting_list_request(
  p_customer_name text,
  p_phone text,
  p_pickup_date date,
  p_open_to_alternatives boolean,
  p_items jsonb,
  p_collection_id uuid default null
)
returns public.waiting_list_requests
language plpgsql
security definer
set search_path = public
as $$
begin
  return public._waiting_list_insert_request(
    p_customer_name,
    p_phone,
    p_pickup_date,
    p_open_to_alternatives,
    p_items,
    p_collection_id,
    null,
    null,
    'joined'
  );
end;
$$;

create or replace function public.create_staff_waiting_list_request(
  p_actor_staff_id uuid,
  p_customer_name text,
  p_phone text,
  p_pickup_date date,
  p_open_to_alternatives boolean,
  p_items jsonb,
  p_collection_id uuid default null,
  p_notes text default null
)
returns public.waiting_list_requests
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._waiting_list_assert_manage_staff(p_actor_staff_id);
  return public._waiting_list_insert_request(
    p_customer_name,
    p_phone,
    p_pickup_date,
    p_open_to_alternatives,
    p_items,
    p_collection_id,
    p_actor_staff_id,
    p_notes,
    'manually_added'
  );
end;
$$;

revoke all on function public.submit_guest_waiting_list_request(
  text, text, date, boolean, jsonb, uuid
) from public;
grant execute on function public.submit_guest_waiting_list_request(
  text, text, date, boolean, jsonb, uuid
) to anon, authenticated;

revoke all on function public.create_staff_waiting_list_request(
  uuid, text, text, date, boolean, jsonb, uuid, text
) from public, anon;
grant execute on function public.create_staff_waiting_list_request(
  uuid, text, text, date, boolean, jsonb, uuid, text
) to authenticated;

-- ---------------------------------------------------------------------------
-- Quantity / product / date / cancel
-- ---------------------------------------------------------------------------

create or replace function public.waiting_list_set_item_quantity(
  p_actor_staff_id uuid,
  p_item_id uuid,
  p_quantity integer
)
returns public.waiting_list_items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.waiting_list_items;
  v_previous integer;
begin
  perform public._waiting_list_assert_manage_staff(p_actor_staff_id);
  if p_quantity is null or p_quantity < 1 then
    raise exception 'Quantity must be at least 1';
  end if;
  select i.* into v_item from public.waiting_list_items i where i.id = p_item_id for update;
  if not found then
    raise exception 'Waiting-list item not found';
  end if;
  if v_item.status not in ('active', 'partially_accepted') then
    raise exception 'Quantity can only be changed on an active waiting-list item';
  end if;
  if p_quantity < v_item.accepted_quantity then
    raise exception 'Quantity cannot be below the already accepted quantity';
  end if;
  v_previous := v_item.quantity;
  update public.waiting_list_items i
  set quantity = p_quantity
  where i.id = p_item_id
  returning * into v_item;
  perform public._waiting_list_append_event(
    v_item.request_id,
    v_item.id,
    'quantity_changed',
    p_actor_staff_id,
    jsonb_build_object(
      'previous_quantity', v_previous,
      'quantity', p_quantity,
      'queue_position', v_item.queue_position
    )
  );
  return v_item;
end;
$$;

create or replace function public.waiting_list_replace_item_scope(
  p_actor_staff_id uuid,
  p_item_id uuid,
  p_pickup_date date,
  p_cake_id uuid,
  p_size_id uuid
)
returns public.waiting_list_items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old public.waiting_list_items;
  v_new public.waiting_list_items;
  v_request public.waiting_list_requests;
  v_capacity public.production_capacity;
  v_event text;
  v_position integer;
begin
  perform public._waiting_list_assert_manage_staff(p_actor_staff_id);
  select i.* into v_old from public.waiting_list_items i where i.id = p_item_id for update;
  if not found then
    raise exception 'Waiting-list item not found';
  end if;
  if v_old.status not in ('active', 'partially_accepted') then
    raise exception 'That waiting-list item is no longer active';
  end if;
  select r.* into v_request from public.waiting_list_requests r where r.id = v_old.request_id for update;
  if p_pickup_date is null or p_cake_id is null or p_size_id is null then
    raise exception 'Date, cake, and size are required';
  end if;
  if p_pickup_date = v_old.pickup_date
    and p_cake_id = v_old.library_cake_id
    and p_size_id is not distinct from v_old.library_cake_size_id then
    return v_old;
  end if;

  v_capacity := public._waiting_list_matching_capacity(
    p_pickup_date,
    p_cake_id,
    p_size_id,
    null
  );
  v_position := public._waiting_list_next_queue_position(
    p_pickup_date,
    p_cake_id,
    p_size_id
  );
  v_event := case
    when p_pickup_date is distinct from v_old.pickup_date then 'date_changed'
    else 'product_changed'
  end;

  update public.waiting_list_items i
  set status = 'closed'
  where i.id = v_old.id;

  if p_pickup_date is distinct from v_request.pickup_date then
    update public.waiting_list_requests r
    set pickup_date = p_pickup_date
    where r.id = v_request.id;
  end if;

  insert into public.waiting_list_items (
    request_id,
    pickup_date,
    library_cake_id,
    library_cake_size_id,
    quantity,
    accepted_quantity,
    remaining_quantity,
    queue_position,
    status,
    production_capacity_id
  ) values (
    v_old.request_id,
    p_pickup_date,
    p_cake_id,
    p_size_id,
    v_old.remaining_quantity,
    0,
    v_old.remaining_quantity,
    v_position,
    'active',
    v_capacity.id
  )
  returning * into v_new;

  perform public._waiting_list_append_event(
    v_old.request_id,
    v_old.id,
    v_event,
    p_actor_staff_id,
    jsonb_build_object(
      'previous_item_id', v_old.id,
      'new_item_id', v_new.id,
      'previous_queue_position', v_old.queue_position,
      'queue_position', v_new.queue_position,
      'pickup_date', p_pickup_date,
      'cake_id', p_cake_id,
      'size_id', p_size_id
    )
  );
  perform public._waiting_list_sync_request_status(v_old.request_id);
  return v_new;
end;
$$;

create or replace function public.waiting_list_cancel_item(
  p_actor_staff_id uuid,
  p_item_id uuid,
  p_guest_phone text default null,
  p_reason text default null
)
returns public.waiting_list_items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.waiting_list_items;
  v_request public.waiting_list_requests;
  v_phone text;
begin
  select i.* into v_item from public.waiting_list_items i where i.id = p_item_id for update;
  if not found then
    raise exception 'Waiting-list item not found';
  end if;
  select r.* into v_request from public.waiting_list_requests r where r.id = v_item.request_id for update;
  if p_actor_staff_id is null then
    v_phone := public._waiting_list_digits(p_guest_phone);
    if v_phone is null or v_phone <> v_request.guest_phone then
      raise exception 'Waiting-list request not found';
    end if;
  else
    perform public._waiting_list_assert_manage_staff(p_actor_staff_id);
  end if;
  if v_item.status in ('cancelled', 'converted', 'closed') then
    return v_item;
  end if;

  update public.production_capacity_holds h
  set status = 'released', released_at = now()
  where h.waiting_list_item_id = v_item.id
    and h.status = 'active';

  update public.waiting_list_items i
  set
    status = 'cancelled',
    outcome_note = nullif(trim(coalesce(p_reason, '')), '')
  where i.id = v_item.id
  returning * into v_item;

  update public.waiting_list_requests r
  set
    cancelled_at = case when r.cancelled_at is null then now() else r.cancelled_at end,
    cancelled_by = coalesce(p_actor_staff_id, r.cancelled_by),
    cancel_reason = coalesce(nullif(trim(coalesce(p_reason, '')), ''), r.cancel_reason)
  where r.id = v_request.id;

  perform public._waiting_list_append_event(
    v_request.id,
    v_item.id,
    'cancelled',
    p_actor_staff_id,
    jsonb_build_object('reason', p_reason)
  );
  perform public._waiting_list_sync_request_status(v_request.id);
  return v_item;
end;
$$;

revoke all on function public.waiting_list_set_item_quantity(uuid, uuid, integer)
  from public, anon;
grant execute on function public.waiting_list_set_item_quantity(uuid, uuid, integer)
  to authenticated;
revoke all on function public.waiting_list_replace_item_scope(uuid, uuid, date, uuid, uuid)
  from public, anon;
grant execute on function public.waiting_list_replace_item_scope(uuid, uuid, date, uuid, uuid)
  to authenticated;
revoke all on function public.waiting_list_cancel_item(uuid, uuid, text, text)
  from public;
grant execute on function public.waiting_list_cancel_item(uuid, uuid, text, text)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Contact / hold / response / convert
-- ---------------------------------------------------------------------------

create or replace function public.waiting_list_contact_item(
  p_actor_staff_id uuid,
  p_item_id uuid,
  p_offered_quantity integer
)
returns public.waiting_list_items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.waiting_list_items;
  v_request public.waiting_list_requests;
  v_capacity public.production_capacity;
  v_held integer;
  v_used integer;
  v_available integer;
  v_offer integer;
  v_minutes integer;
  v_deadline timestamptz;
begin
  perform public._waiting_list_assert_manage_staff(p_actor_staff_id);
  select i.* into v_item from public.waiting_list_items i where i.id = p_item_id for update;
  if not found then
    raise exception 'Waiting-list item not found';
  end if;
  if v_item.status not in ('active', 'partially_accepted') then
    raise exception 'That customer is not waiting in the active queue';
  end if;
  select r.* into v_request from public.waiting_list_requests r where r.id = v_item.request_id;
  v_capacity := public._waiting_list_matching_capacity(
    v_item.pickup_date,
    v_item.library_cake_id,
    v_item.library_cake_size_id,
    null
  );
  if v_capacity.id is null then
    raise exception 'No production capacity row is available to hold';
  end if;
  perform 1 from public.production_capacity c where c.id = v_capacity.id for update;

  v_held := public._waiting_list_held_quantity(v_capacity.id);
  select coalesce(sum(oi.quantity), 0) into v_used
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where o.pickup_date = v_capacity.pickup_date
    and o.status in ('submitted', 'pending_confirmation', 'awaiting_payment', 'paid')
    and oi.cake_id = v_capacity.library_cake_id
    and (
      v_capacity.library_cake_size_id is null
      or oi.cake_size_id = v_capacity.library_cake_size_id
    )
    and (
      v_capacity.collection_id is null
      or o.collection_id = v_capacity.collection_id
    );

  v_available := v_capacity.capacity_quantity - v_used - v_held;
  v_offer := least(v_item.remaining_quantity, coalesce(p_offered_quantity, v_item.remaining_quantity));
  if v_offer < 1 then
    raise exception 'Offered quantity must be at least 1';
  end if;
  if v_offer > v_available then
    raise exception 'Not enough availability to contact that customer for this quantity';
  end if;

  v_minutes := public._waiting_list_response_minutes(v_capacity.collection_id);
  v_deadline := now() + make_interval(mins => v_minutes);

  insert into public.production_capacity_holds (
    capacity_id,
    waiting_list_item_id,
    quantity,
    status,
    held_until,
    created_by
  ) values (
    v_capacity.id,
    v_item.id,
    v_offer,
    'active',
    v_deadline,
    p_actor_staff_id
  );

  update public.waiting_list_items i
  set
    status = 'contacted',
    contacted_at = now(),
    response_deadline_at = v_deadline,
    contacted_by_staff_id = p_actor_staff_id,
    production_capacity_id = v_capacity.id
  where i.id = v_item.id
  returning * into v_item;

  perform public._waiting_list_append_event(
    v_item.request_id,
    v_item.id,
    'contacted',
    p_actor_staff_id,
    jsonb_build_object(
      'offered_quantity', v_offer,
      'response_minutes', v_minutes,
      'response_deadline_at', v_deadline
    )
  );
  perform public._waiting_list_append_event(
    v_item.request_id,
    v_item.id,
    'response_deadline',
    p_actor_staff_id,
    jsonb_build_object('response_deadline_at', v_deadline)
  );
  return v_item;
end;
$$;

create or replace function public.waiting_list_record_response(
  p_actor_staff_id uuid,
  p_item_id uuid,
  p_outcome text,
  p_accepted_quantity integer default null,
  p_keep_remaining boolean default true,
  p_note text default null
)
returns public.waiting_list_items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.waiting_list_items;
  v_hold public.production_capacity_holds;
  v_accept integer;
  v_event text;
begin
  perform public._waiting_list_assert_manage_staff(p_actor_staff_id);
  select i.* into v_item from public.waiting_list_items i where i.id = p_item_id for update;
  if not found then
    raise exception 'Waiting-list item not found';
  end if;
  if v_item.status <> 'contacted' then
    raise exception 'Record a response only after the customer has been contacted';
  end if;
  select h.*
  into v_hold
  from public.production_capacity_holds h
  where h.waiting_list_item_id = v_item.id
    and h.status = 'active'
  order by h.held_at desc
  limit 1
  for update;

  if p_outcome = 'decline' then
    if v_hold.id is not null then
      update public.production_capacity_holds h
      set status = 'released', released_at = now()
      where h.id = v_hold.id;
    end if;
    update public.waiting_list_items i
    set
      status = 'active',
      contacted_at = null,
      response_deadline_at = null,
      contacted_by_staff_id = null,
      outcome_note = nullif(trim(coalesce(p_note, '')), '')
    where i.id = v_item.id
    returning * into v_item;
    perform public._waiting_list_append_event(
      v_item.request_id,
      v_item.id,
      'declined',
      p_actor_staff_id,
      jsonb_build_object('released_quantity', coalesce(v_hold.quantity, 0))
    );
    return v_item;
  end if;

  if p_outcome not in ('accept', 'late_accept', 'late_decline') then
    raise exception 'Unknown waiting-list response';
  end if;

  if p_outcome = 'late_decline' then
    if v_hold.id is not null then
      update public.production_capacity_holds h
      set status = 'released', released_at = now()
      where h.id = v_hold.id;
    end if;
    update public.waiting_list_items i
    set
      status = 'active',
      contacted_at = null,
      response_deadline_at = null,
      outcome_note = nullif(trim(coalesce(p_note, '')), '')
    where i.id = v_item.id
    returning * into v_item;
    perform public._waiting_list_append_event(
      v_item.request_id,
      v_item.id,
      'declined',
      p_actor_staff_id,
      jsonb_build_object('late', true)
    );
    return v_item;
  end if;

  v_accept := coalesce(p_accepted_quantity, v_hold.quantity, v_item.remaining_quantity);
  if v_accept < 1 or v_accept > v_item.remaining_quantity then
    raise exception 'Accepted quantity is not valid';
  end if;
  if v_hold.id is not null and v_accept > v_hold.quantity then
    raise exception 'Cannot accept more than the held quantity';
  end if;

  update public.waiting_list_items i
  set
    accepted_quantity = i.accepted_quantity + v_accept,
    status = case
      when i.remaining_quantity - v_accept <= 0 then 'accepted'
      when coalesce(p_keep_remaining, true) then 'partially_accepted'
      else 'closed'
    end,
    outcome_note = nullif(trim(coalesce(p_note, '')), '')
  where i.id = v_item.id
  returning * into v_item;

  v_event := case
    when v_item.status = 'partially_accepted' then 'partially_fulfilled'
    else 'accepted'
  end;
  perform public._waiting_list_append_event(
    v_item.request_id,
    v_item.id,
    v_event,
    p_actor_staff_id,
    jsonb_build_object(
      'accepted_quantity', v_accept,
      'keep_remaining', coalesce(p_keep_remaining, true),
      'late', p_outcome = 'late_accept'
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
  return v_item;
end;
$$;

create or replace function public.waiting_list_close_remaining(
  p_actor_staff_id uuid,
  p_item_id uuid
)
returns public.waiting_list_items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.waiting_list_items;
begin
  perform public._waiting_list_assert_manage_staff(p_actor_staff_id);
  select i.* into v_item from public.waiting_list_items i where i.id = p_item_id for update;
  if not found then
    raise exception 'Waiting-list item not found';
  end if;
  if v_item.status not in ('partially_accepted', 'active', 'accepted') then
    raise exception 'There is no remaining quantity to close';
  end if;
  update public.waiting_list_items i
  set status = 'closed'
  where i.id = v_item.id
  returning * into v_item;
  perform public._waiting_list_append_event(
    v_item.request_id,
    v_item.id,
    'remaining_closed',
    p_actor_staff_id,
    jsonb_build_object('remaining_quantity', v_item.remaining_quantity)
  );
  perform public._waiting_list_sync_request_status(v_item.request_id);
  return v_item;
end;
$$;

create or replace function public.waiting_list_offer_alternative(
  p_actor_staff_id uuid,
  p_item_id uuid,
  p_alternative_cake_id uuid,
  p_alternative_size_id uuid,
  p_quantity integer
)
returns public.waiting_list_items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.waiting_list_items;
  v_request public.waiting_list_requests;
begin
  perform public._waiting_list_assert_manage_staff(p_actor_staff_id);
  select i.* into v_item from public.waiting_list_items i where i.id = p_item_id for update;
  if not found then
    raise exception 'Waiting-list item not found';
  end if;
  select r.* into v_request from public.waiting_list_requests r where r.id = v_item.request_id;
  if v_request.open_to_alternatives is not true then
    raise exception 'This customer did not opt in to alternative flavours';
  end if;
  if p_quantity is null or p_quantity < 1 then
    raise exception 'Alternative quantity must be at least 1';
  end if;
  perform public._waiting_list_append_event(
    v_item.request_id,
    v_item.id,
    'alternative_offered',
    p_actor_staff_id,
    jsonb_build_object(
      'alternative_cake_id', p_alternative_cake_id,
      'alternative_size_id', p_alternative_size_id,
      'quantity', p_quantity,
      'pickup_date', v_item.pickup_date
    )
  );
  return v_item;
end;
$$;

create or replace function public.waiting_list_record_alternative_response(
  p_actor_staff_id uuid,
  p_item_id uuid,
  p_accept boolean,
  p_alternative_cake_id uuid default null,
  p_alternative_size_id uuid default null,
  p_quantity integer default null,
  p_keep_original boolean default true
)
returns public.waiting_list_items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.waiting_list_items;
  v_capacity public.production_capacity;
  v_alt_qty integer;
  v_remain integer;
  v_position integer;
  v_new_id uuid;
begin
  perform public._waiting_list_assert_manage_staff(p_actor_staff_id);
  select i.* into v_item from public.waiting_list_items i where i.id = p_item_id for update;
  if not found then
    raise exception 'Waiting-list item not found';
  end if;
  if p_accept then
    v_alt_qty := coalesce(p_quantity, v_item.remaining_quantity);
    if v_alt_qty < 1 or v_alt_qty > v_item.remaining_quantity then
      raise exception 'Alternative quantity is not valid';
    end if;
    perform public._waiting_list_append_event(
      v_item.request_id,
      v_item.id,
      'alternative_accepted',
      p_actor_staff_id,
      jsonb_build_object(
        'alternative_cake_id', p_alternative_cake_id,
        'alternative_size_id', p_alternative_size_id,
        'quantity', v_alt_qty,
        'keep_original', coalesce(p_keep_original, true)
      )
    );
    if p_alternative_cake_id is null or p_alternative_size_id is null then
      return v_item;
    end if;

    if coalesce(p_keep_original, true) and v_alt_qty < v_item.remaining_quantity then
      v_remain := v_item.remaining_quantity - v_alt_qty;
      update public.waiting_list_items i
      set quantity = i.accepted_quantity + v_remain
      where i.id = v_item.id
      returning * into v_item;
      perform public._waiting_list_append_event(
        v_item.request_id,
        v_item.id,
        'quantity_changed',
        p_actor_staff_id,
        jsonb_build_object(
          'queue_position', v_item.queue_position,
          'remaining_quantity', v_item.remaining_quantity,
          'keep_original', true
        )
      );
      v_capacity := public._waiting_list_matching_capacity(
        v_item.pickup_date,
        p_alternative_cake_id,
        p_alternative_size_id,
        null
      );
      v_position := public._waiting_list_next_queue_position(
        v_item.pickup_date,
        p_alternative_cake_id,
        p_alternative_size_id
      );
      insert into public.waiting_list_items (
        request_id,
        pickup_date,
        library_cake_id,
        library_cake_size_id,
        quantity,
        accepted_quantity,
        remaining_quantity,
        queue_position,
        status,
        production_capacity_id
      ) values (
        v_item.request_id,
        v_item.pickup_date,
        p_alternative_cake_id,
        p_alternative_size_id,
        v_alt_qty,
        0,
        v_alt_qty,
        v_position,
        'active',
        v_capacity.id
      )
      returning id into v_new_id;
      perform public._waiting_list_append_event(
        v_item.request_id,
        v_new_id,
        'product_changed',
        p_actor_staff_id,
        jsonb_build_object(
          'alternative', true,
          'quantity', v_alt_qty,
          'queue_position', v_position
        )
      );
      perform public._waiting_list_append_event(
        v_item.request_id,
        v_item.id,
        'remaining_kept',
        p_actor_staff_id,
        jsonb_build_object('remaining_quantity', v_item.remaining_quantity)
      );
      return v_item;
    end if;

    return public.waiting_list_replace_item_scope(
      p_actor_staff_id,
      p_item_id,
      v_item.pickup_date,
      p_alternative_cake_id,
      p_alternative_size_id
    );
  end if;
  perform public._waiting_list_append_event(
    v_item.request_id,
    v_item.id,
    'alternative_declined',
    p_actor_staff_id,
    jsonb_build_object('continue_original', true)
  );
  return v_item;
end;
$$;

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
set search_path = public
as $$
declare
  v_item public.waiting_list_items;
  v_request public.waiting_list_requests;
  v_hold public.production_capacity_holds;
  v_order public.orders;
  v_qty integer;
  v_source text;
begin
  perform public._waiting_list_assert_manage_staff(p_actor_staff_id);
  select i.* into v_item from public.waiting_list_items i where i.id = p_item_id for update;
  if not found then
    raise exception 'Waiting-list item not found';
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

  v_order := public.create_staff_guest_preorder(
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

revoke all on function public.waiting_list_contact_item(uuid, uuid, integer)
  from public, anon;
grant execute on function public.waiting_list_contact_item(uuid, uuid, integer)
  to authenticated;
revoke all on function public.waiting_list_record_response(uuid, uuid, text, integer, boolean, text)
  from public, anon;
grant execute on function public.waiting_list_record_response(uuid, uuid, text, integer, boolean, text)
  to authenticated;
revoke all on function public.waiting_list_close_remaining(uuid, uuid)
  from public, anon;
grant execute on function public.waiting_list_close_remaining(uuid, uuid)
  to authenticated;
revoke all on function public.waiting_list_offer_alternative(uuid, uuid, uuid, uuid, integer)
  from public, anon;
grant execute on function public.waiting_list_offer_alternative(uuid, uuid, uuid, uuid, integer)
  to authenticated;
revoke all on function public.waiting_list_record_alternative_response(
  uuid, uuid, boolean, uuid, uuid, integer, boolean
) from public, anon;
grant execute on function public.waiting_list_record_alternative_response(
  uuid, uuid, boolean, uuid, uuid, integer, boolean
) to authenticated;
revoke all on function public.waiting_list_convert_item(uuid, uuid, integer, time, boolean)
  from public, anon;
grant execute on function public.waiting_list_convert_item(uuid, uuid, integer, time, boolean)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Capacity increase → Action Required events (does not start the timer)
-- ---------------------------------------------------------------------------

create or replace function public._waiting_list_on_capacity_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item record;
begin
  if tg_op <> 'INSERT' then
    return new;
  end if;
  if new.previous_quantity is not null
    and new.new_quantity <= new.previous_quantity then
    return new;
  end if;
  if new.previous_quantity is null then
    return new;
  end if;

  for v_item in
    select i.id, i.request_id
    from public.waiting_list_items i
    where i.pickup_date = new.pickup_date
      and i.library_cake_id = new.library_cake_id
      and (
        new.library_cake_size_id is null
        or i.library_cake_size_id is not distinct from new.library_cake_size_id
      )
      and i.status in ('active', 'partially_accepted')
  loop
    perform public._waiting_list_append_event(
      v_item.request_id,
      v_item.id,
      'capacity_action_required',
      new.actor_staff_id,
      jsonb_build_object(
        'previous_quantity', new.previous_quantity,
        'new_quantity', new.new_quantity,
        'pickup_date', new.pickup_date
      )
    );
  end loop;
  return new;
end;
$$;

drop trigger if exists waiting_list_on_capacity_event
  on public.production_capacity_events;
create trigger waiting_list_on_capacity_event
after insert on public.production_capacity_events
for each row
execute function public._waiting_list_on_capacity_event();

revoke all on function public._waiting_list_on_capacity_event()
  from public, anon, authenticated;
