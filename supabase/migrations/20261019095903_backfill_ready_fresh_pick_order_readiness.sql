-- Repair active guest Fresh Pick orders that were already fully prepared
-- before order-level Collection readiness was introduced. The shared helper
-- revalidates every linked physical item and exact item quantity, and writes
-- the existing order_marked_ready timeline event. Terminal, delivery,
-- incomplete, mixed, or otherwise mismatched orders are left untouched.
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
      and o.picked_up_at is null
      and o.out_for_delivery_at is null
      and o.delivered_at is null
      and public._fresh_pick_order_items_are_ready(o.id)
  loop
    perform public._sync_fresh_pick_order_readiness(v_order_id);
  end loop;
end;
$$;
