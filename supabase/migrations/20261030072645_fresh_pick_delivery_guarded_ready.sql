-- Explicit, guarded whole-order readiness for fully stock-backed Fresh Pick
-- customer Delivery orders. Standard Bakery readiness is unchanged.
--
-- Locking: serialize on the order row first. Existing stock/settlement/item
-- mutations either lock this order before committing or run deferred readiness
-- reconciliation that acquires this same order lock before commit. This RPC
-- deliberately does not lock extra_stock rows, avoiding the stock-row -> order
-- lock inversion used by allocation writers.

create or replace function public.mark_fresh_pick_delivery_order_ready(
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
  perform public._require_rpc_roles(
    v_actor,
    array['bakery', 'manager', 'owner']::text[],
    'Not authorized to mark ready'
  );

  if p_order_id is null then
    raise exception 'Order is required';
  end if;

  -- The order row is the serialization point shared by allocation,
  -- settlement, lifecycle and deferred readiness writers.
  select o.*
  into order_row
  from public.orders o
  where o.id = p_order_id
    and o.customer_id is null
  for update;

  if not found then
    raise exception 'Order not found';
  end if;

  if order_row.fulfilment_method is distinct from 'delivery' then
    raise exception 'This action is only for Fresh Pick Delivery orders';
  end if;

  -- Repeated staff clicks are safe and do not duplicate the timeline event or
  -- alter an order which has already moved into a later fulfilment state.
  if order_row.ready_at is not null then
    return order_row;
  end if;

  if order_row.status is distinct from 'paid'
     or order_row.payment_status is distinct from 'paid'
     or not public._fresh_pick_order_is_fully_paid(p_order_id) then
    raise exception 'Order must be fully paid before it can be marked ready';
  end if;

  if order_row.production_started_at is not null then
    raise exception 'Use the standard Bakery completion action for started production';
  end if;

  if order_row.picked_up_at is not null
     or order_row.out_for_delivery_at is not null
     or order_row.delivered_at is not null then
    raise exception 'This order has already left Bakery';
  end if;

  -- This authoritative helper verifies the complete cake-item quantities and
  -- exact cake/size matching against assigned stock, plus confirmed, sold,
  -- uncut and physically ready state for every unit. This rules out partial
  -- allocation and any remaining cake production.
  if not public._fresh_pick_order_items_are_ready(p_order_id) then
    raise exception 'Every ordered cake must be exactly covered by confirmed, ready Fresh Pick stock';
  end if;

  -- Reuse the existing whole-order transition for its lifecycle, authorization,
  -- row-lock, ready_at and timeline semantics. No direct readiness update here.
  return public.mark_guest_order_ready(p_order_id, v_actor);
end;
$$;

revoke all on function public.mark_fresh_pick_delivery_order_ready(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.mark_fresh_pick_delivery_order_ready(uuid, uuid)
  to authenticated, service_role;

comment on function public.mark_fresh_pick_delivery_order_ready(uuid, uuid) is
  'Explicit Bakery Ready action for fully paid, exact and physically ready Fresh Pick customer Delivery orders; serializes on the order and delegates the actual transition/audit to mark_guest_order_ready.';
