-- Phase 5.3 — Production capacity mutation + confirmed-order floor
-- Requires Phase 2 tables: production_capacity, production_capacity_events.
-- Does not change Phase 3 _guest_preorder_item_fully_booked.
-- Does not use production_capacity_holds.

-- Committed quantity for a capacity scope. Confirmed Whole Cake commitments:
--   confirmed (legacy/staff) | awaiting_payment | paid
-- Not counted: submitted, pending_confirmation, cancelled, completed, holds.

create or replace function public.production_capacity_committed_quantity(
  p_pickup_date date,
  p_library_cake_id uuid,
  p_library_cake_size_id uuid default null,
  p_collection_id uuid default null
)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(oi.quantity), 0)::integer
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where o.pickup_date = p_pickup_date
    and o.status in (
      'confirmed'::public.order_status,
      'awaiting_payment'::public.order_status,
      'paid'::public.order_status
    )
    and oi.cake_id = p_library_cake_id
    and (
      p_library_cake_size_id is null
      or oi.cake_size_id = p_library_cake_size_id
    )
    and (
      p_collection_id is null
      or o.collection_id = p_collection_id
    );
$$;

comment on function public.production_capacity_committed_quantity(date, uuid, uuid, uuid) is
  'Confirmed-order quantity for a production_capacity scope. '
  'Statuses: confirmed, awaiting_payment, paid. Does not count holds.';

revoke all on function public.production_capacity_committed_quantity(date, uuid, uuid, uuid)
  from public, anon;
grant execute on function public.production_capacity_committed_quantity(date, uuid, uuid, uuid)
  to authenticated;

create or replace function public.set_production_capacity(
  p_actor_staff_id uuid,
  p_pickup_date date,
  p_library_cake_id uuid,
  p_library_cake_size_id uuid default null,
  p_collection_id uuid default null,
  p_capacity_quantity integer default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_note text;
  v_committed integer;
  v_existing public.production_capacity%rowtype;
  v_has_row boolean;
  v_id uuid;
  v_previous integer;
begin
  if p_actor_staff_id is null then
    raise exception 'Staff actor is required';
  end if;
  if p_pickup_date is null then
    raise exception 'Pickup date is required';
  end if;
  if p_library_cake_id is null then
    raise exception 'Cake is required';
  end if;
  if p_capacity_quantity is not null and p_capacity_quantity < 0 then
    raise exception 'Capacity cannot be negative';
  end if;

  v_role := public._staff_role_code(p_actor_staff_id);
  if v_role is distinct from 'owner'
    and v_role is distinct from 'manager'
    and v_role is distinct from 'bakery' then
    raise exception 'Not authorized to change production capacity.';
  end if;

  if not exists (
    select 1 from public.library_cakes c where c.id = p_library_cake_id
  ) then
    raise exception 'Cake is not available';
  end if;

  if p_library_cake_size_id is not null then
    if not exists (
      select 1
      from public.library_cake_sizes s
      where s.id = p_library_cake_size_id
        and s.cake_id = p_library_cake_id
    ) then
      raise exception 'Cake size must belong to the selected cake';
    end if;
  end if;

  if p_collection_id is not null then
    if not exists (
      select 1 from public.collections c where c.id = p_collection_id
    ) then
      raise exception 'Catalogue is not available';
    end if;
  end if;

  v_note := nullif(trim(coalesce(p_note, '')), '');

  perform pg_advisory_xact_lock(
    abs(hashtext(
      'production_capacity:'
      || p_pickup_date::text
      || ':'
      || p_library_cake_id::text
      || ':'
      || coalesce(p_library_cake_size_id::text, '')
      || ':'
      || coalesce(p_collection_id::text, '')
    ))
  );

  perform o.id
  from public.orders o
  join public.order_items oi on oi.order_id = o.id
  where o.pickup_date = p_pickup_date
    and o.status in (
      'confirmed'::public.order_status,
      'awaiting_payment'::public.order_status,
      'paid'::public.order_status
    )
    and oi.cake_id = p_library_cake_id
    and (
      p_library_cake_size_id is null
      or oi.cake_size_id = p_library_cake_size_id
    )
    and (
      p_collection_id is null
      or o.collection_id = p_collection_id
    )
  for update of o;

  select c.*
  into v_existing
  from public.production_capacity c
  where c.pickup_date = p_pickup_date
    and c.library_cake_id = p_library_cake_id
    and c.library_cake_size_id is not distinct from p_library_cake_size_id
    and c.collection_id is not distinct from p_collection_id
  for update;

  v_has_row := found;

  v_committed := public.production_capacity_committed_quantity(
    p_pickup_date,
    p_library_cake_id,
    p_library_cake_size_id,
    p_collection_id
  );

  if p_capacity_quantity is null then
    if not v_has_row then
      return jsonb_build_object(
        'removed', true,
        'committed_quantity', v_committed
      );
    end if;

    v_id := v_existing.id;
    v_previous := v_existing.capacity_quantity;

    delete from public.production_capacity where id = v_id;

    insert into public.production_capacity_events (
      capacity_id,
      pickup_date,
      library_cake_id,
      library_cake_size_id,
      collection_id,
      previous_quantity,
      new_quantity,
      waiting_list_enabled,
      actor_staff_id,
      note
    ) values (
      null,
      p_pickup_date,
      p_library_cake_id,
      p_library_cake_size_id,
      p_collection_id,
      v_previous,
      0,
      false,
      p_actor_staff_id,
      'Removed (unrestricted)'
    );

    return jsonb_build_object(
      'removed', true,
      'committed_quantity', v_committed
    );
  end if;

  if p_capacity_quantity < v_committed then
    raise exception
      'Capacity cannot be reduced below the number of confirmed orders already committed to this date and cake. Confirmed quantity: %.',
      v_committed;
  end if;

  if v_has_row then
    v_id := v_existing.id;
    v_previous := v_existing.capacity_quantity;

    update public.production_capacity c
    set
      capacity_quantity = p_capacity_quantity,
      note = v_note,
      updated_by = p_actor_staff_id
    where c.id = v_id;
  else
    v_previous := null;
    insert into public.production_capacity (
      pickup_date,
      library_cake_id,
      library_cake_size_id,
      collection_id,
      capacity_quantity,
      waiting_list_enabled,
      note,
      created_by,
      updated_by
    ) values (
      p_pickup_date,
      p_library_cake_id,
      p_library_cake_size_id,
      p_collection_id,
      p_capacity_quantity,
      false,
      v_note,
      p_actor_staff_id,
      p_actor_staff_id
    )
    returning id into v_id;
  end if;

  insert into public.production_capacity_events (
    capacity_id,
    pickup_date,
    library_cake_id,
    library_cake_size_id,
    collection_id,
    previous_quantity,
    new_quantity,
    waiting_list_enabled,
    actor_staff_id,
    note
  ) values (
    v_id,
    p_pickup_date,
    p_library_cake_id,
    p_library_cake_size_id,
    p_collection_id,
    v_previous,
    p_capacity_quantity,
    false,
    p_actor_staff_id,
    v_note
  );

  return jsonb_build_object(
    'id', v_id,
    'capacity_quantity', p_capacity_quantity,
    'committed_quantity', v_committed
  );
end;
$$;

comment on function public.set_production_capacity(uuid, date, uuid, uuid, uuid, integer, text) is
  'Create, update, or remove (null quantity) a production_capacity row. '
  'Enforces confirmed-order floor. Owner/Manager/Bakery only. '
  'Does not touch waiting-list holds.';

revoke all on function public.set_production_capacity(uuid, date, uuid, uuid, uuid, integer, text)
  from public, anon;
grant execute on function public.set_production_capacity(uuid, date, uuid, uuid, uuid, integer, text)
  to authenticated;
