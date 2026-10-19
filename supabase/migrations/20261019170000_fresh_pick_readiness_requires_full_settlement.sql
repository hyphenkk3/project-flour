-- Fresh Pick order readiness requires completed net settlement as well as all
-- linked physical stock being ready. This is a forward migration: the prior
-- readiness migration has already been applied in DEV and is not edited here.
-- No historical rows are backfilled by this migration.

create or replace function public._fresh_pick_order_is_fully_paid(
  p_order_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    o.status = 'paid'
      and o.payment_status = 'paid'
      and public.order_net_received(o.id) >= public.order_amount_due(o.id),
    false
  )
  from public.orders o
  where o.id = p_order_id;
$$;

revoke all on function public._fresh_pick_order_is_fully_paid(uuid)
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
  v_fully_paid boolean;
  v_stock_ready boolean;
  v_order_eligible boolean;
  v_previous_ready_at timestamptz;
  v_previous_ready_by uuid;
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
  then
    return;
  end if;

  v_order_eligible :=
    order_row.fulfilment_method in ('pickup', 'dine_in')
    and order_row.status in ('submitted', 'pending_confirmation', 'awaiting_payment', 'paid')
    and order_row.picked_up_at is null
    and order_row.out_for_delivery_at is null
    and order_row.delivered_at is null;

  v_fully_paid := public._fresh_pick_order_is_fully_paid(p_order_id);
  v_stock_ready := public._fresh_pick_order_items_are_ready(p_order_id);

  if v_order_eligible and v_fully_paid and v_stock_ready then
    if order_row.ready_at is not null then
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

    insert into public.order_timeline_events (
      order_id, event_type, actor_staff_id, metadata
    ) values (
      p_order_id,
      'order_marked_ready',
      null,
      jsonb_build_object(
        'ready_at', order_row.ready_at,
        'source', 'fully_paid_prepared_fresh_pick_stock',
        'extra_stock_ids', to_jsonb(coalesce(v_stock_ids, array[]::uuid[])),
        'item_quantity', v_item_quantity,
        'amount_due', public.order_amount_due(p_order_id),
        'net_received', public.order_net_received(p_order_id)
      )
    );
    return;
  end if;

  -- Revoke only an unhanded Fresh Pick readiness assertion. Completed handoffs
  -- remain historical facts if a payment is corrected or refunded afterward.
  if order_row.ready_at is null then
    return;
  end if;

  -- A later payment correction/refund revokes readiness even if a collection
  -- action was previously recorded. The handoff timestamps and audit history
  -- remain intact; clearing ready_at prevents a subsequent undo from reopening
  -- an unpaid Collection handoff. Otherwise preserve terminal handoff history.
  if v_fully_paid and (
    order_row.picked_up_at is not null
    or order_row.out_for_delivery_at is not null
    or order_row.delivered_at is not null
  ) then
    return;
  end if;

  v_previous_ready_at := order_row.ready_at;
  v_previous_ready_by := order_row.ready_by;

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
    null,
    jsonb_build_object(
      'previous_ready_at', v_previous_ready_at,
      'previous_ready_by', v_previous_ready_by,
      'reason', case
        when not v_fully_paid then 'fresh_pick_not_fully_settled'
        when not v_stock_ready then 'fresh_pick_stock_not_ready'
        else 'fresh_pick_order_not_eligible'
      end,
      'source', 'fresh_pick_readiness_reconciliation',
      'amount_due', public.order_amount_due(p_order_id),
      'net_received', public.order_net_received(p_order_id)
    )
  );
end;
$$;

revoke all on function public._sync_fresh_pick_order_readiness(uuid)
  from public, anon, authenticated, service_role;

-- Order-level readiness and all downstream handoffs are guarded at the
-- database boundary as a second line of defense behind the audited workflow.
create or replace function public._guard_fresh_pick_order_readiness_and_handoff()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_fresh_pick boolean;
  v_fully_paid boolean;
  v_stock_ready boolean;
begin
  is_fresh_pick :=
    new.customer_id is null
    and new.order_source = 'customer_website'
    and new.extra_stock_id is not null;

  if not is_fresh_pick then
    return new;
  end if;

  v_fully_paid := public._fresh_pick_order_is_fully_paid(new.id);
  v_stock_ready := public._fresh_pick_order_items_are_ready(new.id);

  if new.ready_at is not null
    and (
      new.status is distinct from 'paid'
      or new.payment_status is distinct from 'paid'
      or public.order_net_received(new.id) < public.order_amount_due(new.id)
      or not v_stock_ready
    )
  then
    raise exception 'Fresh Pick order must be fully paid and all linked stock ready';
  end if;

  if (
    (old.picked_up_at is null and new.picked_up_at is not null)
    or (old.out_for_delivery_at is null and new.out_for_delivery_at is not null)
    or (old.delivered_at is null and new.delivered_at is not null)
  ) and (
    not v_fully_paid
    or not v_stock_ready
    or new.ready_at is null
  ) then
    raise exception 'Fresh Pick handoff requires full payment and ready linked stock';
  end if;

  return new;
end;
$$;

revoke all on function public._guard_fresh_pick_order_readiness_and_handoff()
  from public, anon, authenticated, service_role;

drop trigger if exists fresh_pick_order_readiness_and_handoff_guard
  on public.orders;
create trigger fresh_pick_order_readiness_and_handoff_guard
before update of ready_at, picked_up_at, out_for_delivery_at, delivered_at
on public.orders
for each row
execute function public._guard_fresh_pick_order_readiness_and_handoff();

-- Trigger callback for payment/lifecycle changes on the order row.
create or replace function public._reconcile_fresh_pick_readiness_after_order_payment_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._sync_fresh_pick_order_readiness(new.id);
  return new;
end;
$$;

revoke all on function public._reconcile_fresh_pick_readiness_after_order_payment_change()
  from public, anon, authenticated, service_role;

drop trigger if exists orders_fresh_pick_settlement_readiness
  on public.orders;
create constraint trigger orders_fresh_pick_settlement_readiness
after update of status, payment_status on public.orders
deferrable initially deferred
for each row
execute function public._reconcile_fresh_pick_readiness_after_order_payment_change();

-- A shared callback reconciles the order after a payment allocation, refund,
-- adjustment, or payment-status row changes. Deferred execution sees the
-- complete transaction state and then takes the order row lock.
create or replace function public._reconcile_fresh_pick_readiness_after_order_linked_finance_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public._sync_fresh_pick_order_readiness(old.order_id);
    return old;
  end if;

  if tg_op = 'UPDATE' and old.order_id is distinct from new.order_id then
    perform public._sync_fresh_pick_order_readiness(old.order_id);
  end if;

  perform public._sync_fresh_pick_order_readiness(new.order_id);
  return new;
end;
$$;

revoke all on function public._reconcile_fresh_pick_readiness_after_order_linked_finance_change()
  from public, anon, authenticated, service_role;

drop trigger if exists payment_allocations_fresh_pick_settlement_readiness
  on public.payment_allocations;
create constraint trigger payment_allocations_fresh_pick_settlement_readiness
after insert or update or delete on public.payment_allocations
deferrable initially deferred
for each row
execute function public._reconcile_fresh_pick_readiness_after_order_linked_finance_change();

drop trigger if exists refunds_fresh_pick_settlement_readiness
  on public.refunds;
create constraint trigger refunds_fresh_pick_settlement_readiness
after insert or update or delete on public.refunds
deferrable initially deferred
for each row
execute function public._reconcile_fresh_pick_readiness_after_order_linked_finance_change();

drop trigger if exists order_adjustments_fresh_pick_settlement_readiness
  on public.order_adjustments;
create constraint trigger order_adjustments_fresh_pick_settlement_readiness
after insert or update or delete on public.order_adjustments
deferrable initially deferred
for each row
execute function public._reconcile_fresh_pick_readiness_after_order_linked_finance_change();

create or replace function public._reconcile_fresh_pick_readiness_after_payment_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  linked_order record;
begin
  for linked_order in
    select distinct pa.order_id
    from public.payment_allocations pa
    where pa.payment_id = new.id
  loop
    perform public._sync_fresh_pick_order_readiness(linked_order.order_id);
  end loop;
  return new;
end;
$$;

revoke all on function public._reconcile_fresh_pick_readiness_after_payment_row_change()
  from public, anon, authenticated, service_role;

drop trigger if exists payments_fresh_pick_settlement_readiness
  on public.payments;
create constraint trigger payments_fresh_pick_settlement_readiness
after update of status on public.payments
deferrable initially deferred
for each row
execute function public._reconcile_fresh_pick_readiness_after_payment_row_change();

-- Physically marking linked stock ready after payment reconciles the order;
-- the existing stock RPC, role checks, and stock audit event remain intact.
create or replace function public._reconcile_fresh_pick_readiness_after_stock_ready_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.order_id is not null then
    perform public._sync_fresh_pick_order_readiness(new.order_id);
  end if;
  return new;
end;
$$;

revoke all on function public._reconcile_fresh_pick_readiness_after_stock_ready_change()
  from public, anon, authenticated, service_role;

drop trigger if exists extra_stock_fresh_pick_ready_state_readiness
  on public.extra_stock;
create constraint trigger extra_stock_fresh_pick_ready_state_readiness
after update of ready_for_collection on public.extra_stock
deferrable initially deferred
for each row
execute function public._reconcile_fresh_pick_readiness_after_stock_ready_change();
