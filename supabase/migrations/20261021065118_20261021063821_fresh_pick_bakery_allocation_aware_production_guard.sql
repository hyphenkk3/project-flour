-- Bakery must not start production for cake quantities already supplied by
-- valid physical Fresh Pick stock. This migration adds no lifecycle status and
-- does not modify order lines, stock, prices, or historical records.

create or replace function public._bakery_order_fresh_pick_allocation_state(
  p_order_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  order_row public.orders;
  stock_row public.extra_stock;
  v_matching_groups bigint;
  v_overallocated boolean;
  v_has_remaining boolean;
  v_group_count bigint;
begin
  select o.* into order_row
  from public.orders o
  where o.id = p_order_id;

  if not found or order_row.customer_id is not null then
    return 'invalid';
  end if;

  if order_row.extra_stock_id is not null and not exists (
    select 1 from public.extra_stock e where e.id = order_row.extra_stock_id
  ) then
    return 'invalid';
  end if;

  -- The OR returns a physical row once even when it is linked through both
  -- extra_stock.order_id and the legacy orders.extra_stock_id pointer.
  for stock_row in
    select e.*
    from public.extra_stock e
    where e.order_id = p_order_id
       or e.id = order_row.extra_stock_id
    order by e.id
  loop
    if exists (
      select 1
      from public.orders other_order
      where other_order.extra_stock_id = stock_row.id
        and other_order.id <> p_order_id
    ) then
      return 'invalid';
    end if;
    if stock_row.order_id is not null
       and stock_row.order_id <> p_order_id then
      return 'invalid';
    end if;
    if stock_row.lifecycle <> 'confirmed'
       or stock_row.sold_at is null
       or stock_row.cut_into_slices_at is not null
       or (
         stock_row.walk_in_held_until is not null
         and stock_row.walk_in_held_until >= clock_timestamp()
       ) then
      return 'invalid';
    end if;

    -- Every physical unit must map to exactly one grouped cake-and-size
    -- requirement. Duplicate identical order lines intentionally form one
    -- group; a legacy name-only stock row matching multiple catalogue groups
    -- is ambiguous and fails closed.
    select count(distinct (oi.cake_id, oi.cake_size_id))
    into v_matching_groups
    from public.order_items oi
    where oi.order_id = p_order_id
      and (
        (stock_row.library_cake_id is not null
          and oi.cake_id = stock_row.library_cake_id)
        or (
          stock_row.library_cake_id is null
          and lower(trim(oi.cake_name)) = lower(trim(stock_row.cake_name))
        )
      )
      and (
        (stock_row.library_cake_size_id is not null
          and oi.cake_size_id = stock_row.library_cake_size_id)
        or (
          stock_row.library_cake_size_id is null
          and lower(trim(oi.size_label)) = lower(trim(stock_row.size_label))
        )
      );

    if v_matching_groups <> 1 then
      return 'invalid';
    end if;
  end loop;

  with grouped_items as (
    select oi.cake_id, oi.cake_size_id, sum(oi.quantity)::bigint as ordered_quantity
    from public.order_items oi
    where oi.order_id = p_order_id
    group by oi.cake_id, oi.cake_size_id
  ),
  allocations as (
    select
      gi.cake_id,
      gi.cake_size_id,
      gi.ordered_quantity,
      count(distinct e.id)::bigint as assigned_quantity
    from grouped_items gi
    left join public.extra_stock e
      on (e.order_id = p_order_id or e.id = order_row.extra_stock_id)
      and e.lifecycle = 'confirmed'
      and e.sold_at is not null
      and e.cut_into_slices_at is null
      and (e.walk_in_held_until is null or e.walk_in_held_until < clock_timestamp())
      and (
        (e.library_cake_id is not null and gi.cake_id = e.library_cake_id)
        or (
          e.library_cake_id is null
          and exists (
            select 1 from public.order_items oi
            where oi.order_id = p_order_id
              and oi.cake_id = gi.cake_id
              and oi.cake_size_id = gi.cake_size_id
              and lower(trim(oi.cake_name)) = lower(trim(e.cake_name))
          )
        )
      )
      and (
        (e.library_cake_size_id is not null and gi.cake_size_id = e.library_cake_size_id)
        or (
          e.library_cake_size_id is null
          and exists (
            select 1 from public.order_items oi
            where oi.order_id = p_order_id
              and oi.cake_id = gi.cake_id
              and oi.cake_size_id = gi.cake_size_id
              and lower(trim(oi.size_label)) = lower(trim(e.size_label))
          )
        )
      )
    group by gi.cake_id, gi.cake_size_id, gi.ordered_quantity
  )
  select
    coalesce(bool_or(a.assigned_quantity > a.ordered_quantity), false),
    coalesce(bool_or(a.assigned_quantity < a.ordered_quantity), false),
    count(*)::bigint
  into v_overallocated, v_has_remaining, v_group_count
  from allocations a;

  if v_overallocated then
    return 'invalid';
  end if;
  if v_group_count = 0 then
    return 'invalid';
  end if;
  if v_group_count > 0 and not v_has_remaining then
    return 'fully_covered';
  end if;
  return 'partial_or_none';
end;
$$;

revoke all on function public._bakery_order_fresh_pick_allocation_state(uuid)
  from public, anon, authenticated, service_role;

create or replace function public.mark_guest_order_production_started(
  p_order_id uuid,
  p_actor_staff_id uuid
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  order_row public.orders;
  v_allocation_state text;
begin
  if p_order_id is null then
    raise exception 'Order is required';
  end if;

  v_actor := public._bind_rpc_actor(p_actor_staff_id);
  perform public._require_rpc_roles(
    v_actor,
    array['bakery', 'manager', 'owner']::text[],
    'Not authorized to start production'
  );

  -- Match the assignment RPC's order-row serialization. The allocation check
  -- and existing production transition therefore see a single committed order
  -- state, while the trigger below prevents an allocation racing in afterward.
  select o.* into order_row
  from public.orders o
  where o.id = p_order_id
    and o.customer_id is null
  for update;

  if not found then
    raise exception 'Order not found';
  end if;

  v_allocation_state := public._bakery_order_fresh_pick_allocation_state(p_order_id);
  if v_allocation_state = 'invalid' then
    raise exception 'Fresh Pick allocation needs review before production can start';
  end if;
  if v_allocation_state = 'fully_covered' then
    raise exception 'All ordered cake quantities are supplied by Fresh Pick; use the existing Fresh Pick readiness controls';
  end if;

  return public._mark_guest_order_production_started_impl(p_order_id, v_actor);
end;
$$;

create or replace function public._prevent_fresh_pick_assignment_after_production_start()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_production_started_at timestamptz;
begin
  if new.order_id is null or new.order_id is not distinct from old.order_id then
    return new;
  end if;

  -- Assignments and Start Production both serialize on the order row. If Start
  -- wins, a waiting stock assignment rechecks here and rolls back atomically.
  select o.production_started_at into v_production_started_at
  from public.orders o
  where o.id = new.order_id
  for update;

  if not found then
    raise exception 'Order not found for Fresh Pick assignment';
  end if;
  if v_production_started_at is not null then
    raise exception 'Fresh Pick stock cannot be assigned after production has started';
  end if;

  return new;
end;
$$;

revoke all on function public._prevent_fresh_pick_assignment_after_production_start()
  from public, anon, authenticated, service_role;

drop trigger if exists extra_stock_block_assignment_after_production_start
  on public.extra_stock;
create trigger extra_stock_block_assignment_after_production_start
before update of order_id on public.extra_stock
for each row
execute function public._prevent_fresh_pick_assignment_after_production_start();
