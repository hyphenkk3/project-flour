-- Keep physical Fresh Pick readiness and order-level Collection readiness
-- separate, while promoting an order only when its complete stock-backed item
-- set is ready. The trigger runs at transaction end so checkout has linked all
-- physical stock and order items before evaluating readiness.

create or replace function public._fresh_pick_order_items_are_ready(
  p_order_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  order_row public.orders;
  stock_count bigint;
begin
  if p_order_id is null then
    return false;
  end if;

  select o.* into order_row
  from public.orders o
  where o.id = p_order_id;

  if not found or order_row.extra_stock_id is null then
    return false;
  end if;

  if not exists (
    select 1
    from public.extra_stock e
    where e.id = order_row.extra_stock_id
      and e.order_id = p_order_id
  ) then
    return false;
  end if;

  select count(*) into stock_count
  from public.extra_stock e
  where e.order_id = p_order_id;

  if stock_count = 0 then
    return false;
  end if;

  if exists (
    select 1
    from public.extra_stock e
    where e.order_id = p_order_id
      and (
        e.lifecycle is distinct from 'confirmed'
        or e.sold_at is null
        or e.cut_into_slices_at is not null
        or e.ready_for_collection is not true
      )
  ) then
    return false;
  end if;

  -- Every physical unit must have a corresponding order-item quantity, and
  -- every order item must be backed by the exact linked stock cake and size.
  -- This deliberately prevents one ready Fresh Pick from making a mixed or
  -- incomplete order Collection-ready.
  if exists (
    with stock_counts as (
      select
        e.library_cake_id as cake_id,
        e.library_cake_size_id as cake_size_id,
        count(*)::bigint as quantity
      from public.extra_stock e
      where e.order_id = p_order_id
      group by e.library_cake_id, e.library_cake_size_id
    ),
    item_counts as (
      select
        oi.cake_id,
        oi.cake_size_id,
        sum(oi.quantity)::bigint as quantity
      from public.order_items oi
      where oi.order_id = p_order_id
      group by oi.cake_id, oi.cake_size_id
    )
    select 1
    from stock_counts s
    full join item_counts i using (cake_id, cake_size_id)
    where coalesce(s.quantity, 0) <> coalesce(i.quantity, 0)
  ) then
    return false;
  end if;

  return true;
end;
$$;

revoke all on function public._fresh_pick_order_items_are_ready(uuid)
  from public, anon, authenticated, service_role;

create or replace function public._sync_fresh_pick_order_readiness(
  p_order_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  order_row public.orders;
  v_ready_at timestamptz;
  v_stock_ids uuid[];
  v_item_quantity bigint;
begin
  if p_order_id is null then
    return;
  end if;

  select o.* into order_row
  from public.orders o
  where o.id = p_order_id
  for update;

  if not found
    or order_row.customer_id is not null
    or order_row.order_source is distinct from 'customer_website'
    or order_row.extra_stock_id is null
    or order_row.status is null
    or order_row.status not in (
      'submitted', 'pending_confirmation', 'awaiting_payment', 'paid'
    )
    or order_row.fulfilment_method is null
    or order_row.fulfilment_method not in ('pickup', 'dine_in')
    or order_row.ready_at is not null
    or order_row.picked_up_at is not null
    or order_row.out_for_delivery_at is not null
    or order_row.delivered_at is not null
  then
    return;
  end if;

  if not public._fresh_pick_order_items_are_ready(p_order_id) then
    return;
  end if;

  select array_agg(e.id order by e.id)
  into v_stock_ids
  from public.extra_stock e
  where e.order_id = p_order_id;

  select coalesce(sum(oi.quantity), 0)::bigint
  into v_item_quantity
  from public.order_items oi
  where oi.order_id = p_order_id;

  v_ready_at := clock_timestamp();
  update public.orders o
  set ready_at = v_ready_at,
      ready_by = null,
      updated_at = v_ready_at
  where o.id = p_order_id
    and o.ready_at is null
  returning * into order_row;

  if not found then
    return;
  end if;

  -- Keep the existing order-ready timeline contract. A NULL actor records
  -- that readiness was derived from previously staff-approved physical stock.
  insert into public.order_timeline_events (
    order_id, event_type, actor_staff_id, metadata
  ) values (
    p_order_id,
    'order_marked_ready',
    null,
    jsonb_build_object(
      'ready_at', order_row.ready_at,
      'source', 'prepared_fresh_pick_stock',
      'extra_stock_ids', to_jsonb(coalesce(v_stock_ids, array[]::uuid[])),
      'item_quantity', v_item_quantity
    )
  );
end;
$$;

revoke all on function public._sync_fresh_pick_order_readiness(uuid)
  from public, anon, authenticated, service_role;

create or replace function public._reconcile_order_readiness_after_items_change(
  p_order_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  order_row public.orders;
  previous_ready_at timestamptz;
  previous_ready_by uuid;
begin
  if p_order_id is null then
    return;
  end if;

  select o.* into order_row
  from public.orders o
  where o.id = p_order_id
  for update;

  if not found then
    return;
  end if;

  if public._fresh_pick_order_items_are_ready(p_order_id) then
    perform public._sync_fresh_pick_order_readiness(p_order_id);
    return;
  end if;

  -- A material cake-item amendment invalidates an order-level Ready assertion.
  -- Terminal/cancelled history is retained; Collection already excludes it.
  if order_row.ready_at is null
    or order_row.status = 'cancelled'
    or order_row.picked_up_at is not null
    or order_row.out_for_delivery_at is not null
    or order_row.delivered_at is not null
  then
    return;
  end if;

  previous_ready_at := order_row.ready_at;
  previous_ready_by := order_row.ready_by;

  update public.orders o
  set ready_at = null,
      ready_by = null,
      updated_at = clock_timestamp()
  where o.id = p_order_id
    and o.ready_at is not null;

  if not found then
    return;
  end if;

  insert into public.order_timeline_events (
    order_id, event_type, actor_staff_id, metadata
  ) values (
    p_order_id,
    'order_ready_undone',
    order_row.updated_by,
    jsonb_build_object(
      'previous_ready_at', previous_ready_at,
      'previous_ready_by', previous_ready_by,
      'reason', 'required_items_changed',
      'source', 'order_items'
    )
  );
end;
$$;

revoke all on function public._reconcile_order_readiness_after_items_change(uuid)
  from public, anon, authenticated, service_role;

create or replace function public._sync_order_readiness_after_stock_link()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and old.order_id is distinct from new.order_id then
    perform public._reconcile_order_readiness_after_items_change(old.order_id);
  end if;
  perform public._reconcile_order_readiness_after_items_change(new.order_id);
  return new;
end;
$$;

revoke all on function public._sync_order_readiness_after_stock_link()
  from public, anon, authenticated, service_role;

create constraint trigger extra_stock_order_readiness_sync
  after update of order_id on public.extra_stock
  deferrable initially deferred
  for each row execute function public._sync_order_readiness_after_stock_link();

create or replace function public._reconcile_order_readiness_after_item_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public._reconcile_order_readiness_after_items_change(old.order_id);
    return old;
  end if;

  if tg_op = 'UPDATE' and old.order_id is distinct from new.order_id then
    perform public._reconcile_order_readiness_after_items_change(old.order_id);
  end if;

  perform public._reconcile_order_readiness_after_items_change(new.order_id);
  return new;
end;
$$;

revoke all on function public._reconcile_order_readiness_after_item_row_change()
  from public, anon, authenticated, service_role;

create constraint trigger order_items_readiness_reconcile
  after insert or delete or update of order_id, cake_id, cake_size_id, quantity
  on public.order_items
  deferrable initially deferred
  for each row execute function public._reconcile_order_readiness_after_item_row_change();

-- Reconcile already-submitted active Fresh Pick orders whose complete linked
-- stock was approved ready before this migration. The helper rechecks the full
-- stock/item invariant and writes the established order-ready timeline event.
do $$
declare
  v_order_id uuid;
begin
  for v_order_id in
    select o.id
    from public.orders o
    where o.customer_id is null
      and o.order_source = 'customer_website'
      and o.extra_stock_id is not null
      and o.ready_at is null
      and o.status in ('submitted', 'pending_confirmation', 'awaiting_payment', 'paid')
      and o.fulfilment_method in ('pickup', 'dine_in')
  loop
    perform public._sync_fresh_pick_order_readiness(v_order_id);
  end loop;
end;
$$;
