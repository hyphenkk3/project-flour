-- Collection may hand off an order based on complete assigned Fresh Pick
-- readiness when no order-level ready_at exists. Existing order-level
-- readiness remains supported for orders without assigned physical stock.
-- The order row lock serializes this check with the readiness override RPCs.
create or replace function public.mark_guest_order_picked_up_when_ready(
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
  v_order public.orders;
  v_has_assigned_stock boolean;
begin
  v_actor := public._bind_rpc_actor(p_actor_staff_id);

  select o.* into v_order
  from public.orders o
  where o.id = p_order_id
    and o.customer_id is null
  for update;

  if not found then
    raise exception 'Order not found';
  end if;

  v_has_assigned_stock := exists (
    select 1
    from public.extra_stock e
    where e.order_id = p_order_id
       or e.id = v_order.extra_stock_id
  );

  if v_has_assigned_stock then
    if coalesce(v_order.fulfilment_method::text, 'pickup') not in ('pickup', 'dine_in') then
      raise exception 'Fresh Pick readiness cannot authorize delivery handoff';
    end if;
    if v_order.status::text <> 'paid'
       or v_order.payment_status::text <> 'paid'
       or not public._fresh_pick_order_is_fully_paid(p_order_id) then
      raise exception 'Fresh Pick handoff requires a fully paid order';
    end if;
    if public._bakery_order_fresh_pick_allocation_state(p_order_id) <> 'fully_covered' then
      raise exception 'Every ordered cake quantity must be assigned to Fresh Pick stock';
    end if;
    if exists (
      select 1
      from public.extra_stock e
      where (e.order_id = p_order_id or e.id = v_order.extra_stock_id)
        and e.ready_for_collection is distinct from true
    ) then
      raise exception 'Every assigned Fresh Pick item must be ready for collection';
    end if;
  elsif v_order.ready_at is null then
    raise exception 'Order must be ready before Collection handoff';
  end if;

  -- Retains the existing staff authorization, order status, fulfilment,
  -- duplicate-handoff checks, timestamp update and timeline audit.
  return public._mark_guest_order_picked_up_impl(p_order_id, v_actor);
end;
$$;

revoke all on function public.mark_guest_order_picked_up_when_ready(uuid, uuid)
  from public, anon;
grant execute on function public.mark_guest_order_picked_up_when_ready(uuid, uuid)
  to authenticated, service_role;

comment on function public.mark_guest_order_picked_up_when_ready(uuid, uuid) is
  'Collection handoff gate: preserves legacy ready_at flow and permits fully paid, fully covered, ready Fresh Pick pickup/dine-in orders atomically.';
