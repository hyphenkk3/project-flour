-- Preserve an explicit staff Undo Ready decision for a Fresh Pick order until
-- a later authorized Ready action or material payment, stock, or item event.
-- Forward-only: no historical rows are updated and prior migrations stay intact.

create table if not exists public.fresh_pick_readiness_undo_holds (
  order_id uuid primary key references public.orders(id) on delete cascade,
  undone_at timestamptz not null default clock_timestamp(),
  undone_by uuid not null references public.staff_profiles(id) on delete restrict
);

alter table public.fresh_pick_readiness_undo_holds enable row level security;
revoke all on table public.fresh_pick_readiness_undo_holds
  from public, anon, authenticated, service_role;
comment on table public.fresh_pick_readiness_undo_holds is
  'Private Fresh Pick marker for an explicit staff Undo Ready. The order timeline remains the audit record.';

-- Retain the existing readiness reconciler unchanged as the underlying
-- implementation, then guard it with the explicit staff decision.
alter function public._sync_fresh_pick_order_readiness(uuid)
  rename to _sync_fresh_pick_order_readiness_unheld_impl;

create or replace function public._sync_fresh_pick_order_readiness(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
begin
  if p_order_id is null then return; end if;
  select o.id into v_order_id
  from public.orders o
  where o.id = p_order_id
  for update;
  if not found then return; end if;
  if exists (
    select 1
    from public.fresh_pick_readiness_undo_holds h
    where h.order_id = p_order_id
  ) then
    return;
  end if;
  perform public._sync_fresh_pick_order_readiness_unheld_impl(p_order_id);
end;
$$;

revoke all on function public._sync_fresh_pick_order_readiness_unheld_impl(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public._sync_fresh_pick_order_readiness(uuid)
  from public, anon, authenticated, service_role;

-- Relevant triggers clear the hold and then run the existing idempotent
-- reconciler. The helper is private and called only by SECURITY DEFINER triggers.
create or replace function public._sync_fresh_pick_after_relevant_event(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
begin
  if p_order_id is null then return; end if;
  select o.id into v_order_id
  from public.orders o
  where o.id = p_order_id
  for update;
  if not found then return; end if;
  delete from public.fresh_pick_readiness_undo_holds h
  where h.order_id = p_order_id;
  perform public._sync_fresh_pick_order_readiness(p_order_id);
end;
$$;
revoke all on function public._sync_fresh_pick_after_relevant_event(uuid)
  from public, anon, authenticated, service_role;

-- Preserve the existing actor binding and authorized implementation. A
-- successful staff Ready action supersedes the earlier Undo hold; failures
-- roll back without changing it.
create or replace function public.mark_guest_order_ready(
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
begin
  v_actor := public._bind_rpc_actor(p_actor_staff_id);
  order_row := public._mark_guest_order_ready_impl(p_order_id, v_actor);
  delete from public.fresh_pick_readiness_undo_holds h
  where h.order_id = p_order_id;
  return order_row;
end;
$$;

create or replace function public.undo_guest_order_ready(
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
begin
  v_actor := public._bind_rpc_actor(p_actor_staff_id);
  order_row := public._undo_guest_order_ready_impl(p_order_id, v_actor);

  insert into public.fresh_pick_readiness_undo_holds (order_id, undone_by)
  select o.id, v_actor
  from public.orders o
  where o.id = p_order_id
    and o.customer_id is null
    and o.order_source = 'customer_website'
    and o.extra_stock_id is not null
  on conflict (order_id) do update
    set undone_at = clock_timestamp(),
        undone_by = excluded.undone_by;

  return order_row;
end;
$$;

revoke all on function public.mark_guest_order_ready(uuid, uuid) from public, anon;
revoke all on function public.undo_guest_order_ready(uuid, uuid) from public, anon;
grant execute on function public.mark_guest_order_ready(uuid, uuid)
  to authenticated, service_role;
grant execute on function public.undo_guest_order_ready(uuid, uuid)
  to authenticated, service_role;

-- Only material payment/lifecycle changes release the Undo hold.
create or replace function public._reconcile_fresh_pick_readiness_after_order_payment_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status is not distinct from new.status
    and old.payment_status is not distinct from new.payment_status then
    return new;
  end if;
  perform public._sync_fresh_pick_after_relevant_event(new.id);
  return new;
end;
$$;

create or replace function public._reconcile_fresh_pick_readiness_after_order_linked_finance_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public._sync_fresh_pick_after_relevant_event(old.order_id);
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if to_jsonb(old) is not distinct from to_jsonb(new) then
      return new;
    end if;
    if old.order_id is distinct from new.order_id then
      perform public._sync_fresh_pick_after_relevant_event(old.order_id);
    end if;
  end if;

  perform public._sync_fresh_pick_after_relevant_event(new.order_id);
  return new;
end;
$$;

create or replace function public._reconcile_fresh_pick_readiness_after_payment_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  linked_order record;
begin
  if old.status is not distinct from new.status then
    return new;
  end if;

  for linked_order in
    select distinct pa.order_id
    from public.payment_allocations pa
    where pa.payment_id = new.id
  loop
    perform public._sync_fresh_pick_after_relevant_event(linked_order.order_id);
  end loop;
  return new;
end;
$$;

create or replace function public._reconcile_fresh_pick_readiness_after_stock_ready_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.ready_for_collection is not distinct from new.ready_for_collection then
    return new;
  end if;
  if new.order_id is not null then
    perform public._sync_fresh_pick_after_relevant_event(new.order_id);
  end if;
  return new;
end;
$$;

-- The existing item reconciler still handles invalidating readiness when an
-- item/link changes. Wrap it to release an explicit hold only on that event.
alter function public._reconcile_order_readiness_after_items_change(uuid)
  rename to _reconcile_order_readiness_after_items_change_unheld_impl;

create or replace function public._reconcile_order_readiness_after_items_change(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
begin
  if p_order_id is null then return; end if;
  select o.id into v_order_id
  from public.orders o
  where o.id = p_order_id
  for update;
  if not found then return; end if;
  delete from public.fresh_pick_readiness_undo_holds h
  where h.order_id = p_order_id;
  perform public._reconcile_order_readiness_after_items_change_unheld_impl(p_order_id);
end;
$$;

revoke all on function public._reconcile_order_readiness_after_items_change_unheld_impl(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public._reconcile_order_readiness_after_items_change(uuid)
  from public, anon, authenticated, service_role;

create or replace function public._sync_order_readiness_after_stock_link()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and old.order_id is not distinct from new.order_id then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    perform public._reconcile_order_readiness_after_items_change(old.order_id);
  end if;
  perform public._reconcile_order_readiness_after_items_change(new.order_id);
  return new;
end;
$$;

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
  if tg_op = 'UPDATE'
    and old.order_id is not distinct from new.order_id
    and old.cake_id is not distinct from new.cake_id
    and old.cake_size_id is not distinct from new.cake_size_id
    and old.quantity is not distinct from new.quantity then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.order_id is distinct from new.order_id then
    perform public._reconcile_order_readiness_after_items_change(old.order_id);
  end if;
  perform public._reconcile_order_readiness_after_items_change(new.order_id);
  return new;
end;
$$;

revoke all on function public._reconcile_fresh_pick_readiness_after_order_payment_change()
  from public, anon, authenticated, service_role;
revoke all on function public._reconcile_fresh_pick_readiness_after_order_linked_finance_change()
  from public, anon, authenticated, service_role;
revoke all on function public._reconcile_fresh_pick_readiness_after_payment_row_change()
  from public, anon, authenticated, service_role;
revoke all on function public._reconcile_fresh_pick_readiness_after_stock_ready_change()
  from public, anon, authenticated, service_role;
revoke all on function public._sync_order_readiness_after_stock_link()
  from public, anon, authenticated, service_role;
revoke all on function public._reconcile_order_readiness_after_item_row_change()
  from public, anon, authenticated, service_role;

