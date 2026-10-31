-- Additive follow-up: enforce recovery window after stock/order row lock waits.
-- Cutoff-day and following-day only. Storefront cutoff remains unchanged.
CREATE OR REPLACE FUNCTION public.assign_extra_stock_to_order(p_extra_stock_id uuid, p_order_id uuid, p_actor_staff_id uuid)
 RETURNS extra_stock
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor uuid;
  v_role text;
  v_now timestamptz := clock_timestamp();
  stock_row public.extra_stock;
  order_row public.orders;
  primary_stock public.extra_stock;
  v_matching_item_count integer;
  v_matching_item_quantity bigint;
  v_allocated_matching_stock_count bigint;
  v_updated integer;
begin
  if p_extra_stock_id is null then
    raise exception 'EXTRA stock is required';
  end if;
  if p_order_id is null then
    raise exception 'Order is required';
  end if;

  v_actor := public._bind_rpc_actor(p_actor_staff_id);
  v_role := public._staff_role_code(v_actor);
  if v_role is null or v_role not in ('bakery', 'manager', 'owner') then
    raise exception 'Not authorized to assign EXTRA';
  end if;

  -- Staff may assign physical Fresh Pick stock on its Malaysia cutoff date
  -- or the following calendar day, regardless of customer ordering cutoff.
  -- This is enforced in the RPC, not only the Bakery interface.
  if not exists (
    select 1 from public.extra_stock e
    where e.id = p_extra_stock_id
      and e.pickup_through_at is not null
      and timezone('Asia/Kuala_Lumpur', clock_timestamp())::date
          between timezone('Asia/Kuala_Lumpur', e.pickup_through_at)::date
              and timezone('Asia/Kuala_Lumpur', e.pickup_through_at)::date + 1
  ) then
    raise exception 'The two-day Bakery recovery window has ended';
  end if;

  -- Lock stock first so competing calls cannot allocate this physical item twice.
  select e.*
  into stock_row
  from public.extra_stock e
  where e.id = p_extra_stock_id
  for update;

  if not found then
    raise exception 'EXTRA stock not found';
  end if;
  if stock_row.lifecycle <> 'confirmed' then
    raise exception 'Only confirmed Fresh Pick stock can be assigned';
  end if;
  if stock_row.sold_at is not null or stock_row.order_id is not null then
    raise exception 'This Fresh Pick has already been sold or assigned';
  end if;
  if stock_row.cut_into_slices_at is not null then
    raise exception 'This Fresh Pick was cut into slices';
  end if;
  if stock_row.walk_in_held_until is not null and stock_row.walk_in_held_until >= v_now then
    raise exception 'This Fresh Pick is currently on walk-in hold';
  end if;

  -- Serializing all assignments for an order makes quantity checks safe when
  -- multiple staff assign different physical stock to the same order at once.
  select o.*
  into order_row
  from public.orders o
  where o.id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found';
  end if;
  -- Refresh the time after lock waits so stock expiry/hold checks are current.
  v_now := clock_timestamp();
  -- Recheck under both row locks, after any wait crossing local midnight.
  -- The earlier pre-lock check is insufficient as an assignment guard.
  if stock_row.pickup_through_at is null or
     timezone('Asia/Kuala_Lumpur', v_now)::date not between
       timezone('Asia/Kuala_Lumpur', stock_row.pickup_through_at)::date
       and timezone('Asia/Kuala_Lumpur', stock_row.pickup_through_at)::date + 1 then
    raise exception 'The two-day Bakery recovery window has ended';
  end if;
  if order_row.pickup_date not in (
    timezone('Asia/Kuala_Lumpur', stock_row.pickup_through_at)::date,
    timezone('Asia/Kuala_Lumpur', stock_row.pickup_through_at)::date + 1
  ) then
    raise exception 'Bakery can assign this cake only to orders on the cutoff date or the next day';
  end if;
  if order_row.status in ('cancelled', 'completed') then
    raise exception 'Cannot assign Fresh Pick stock to a cancelled or completed order';
  end if;
  if order_row.picked_up_at is not null
     or order_row.out_for_delivery_at is not null
     or order_row.delivered_at is not null then
    raise exception 'Cannot assign Fresh Pick stock after collection or delivery handoff';
  end if;

  -- Do not permit a second order to claim the order's legacy primary stock link.
  if exists (
    select 1
    from public.orders other_order
    where other_order.extra_stock_id = p_extra_stock_id
      and other_order.id <> p_order_id
  ) then
    raise exception 'This Fresh Pick is already linked to another order';
  end if;
  if order_row.extra_stock_id = p_extra_stock_id then
    raise exception 'This Fresh Pick is already assigned to that order';
  end if;

  -- Existing primary links must remain internally plausible. A legacy primary
  -- link with order_id NULL is still counted below, but a link to another order
  -- is an unexplained conflict and fails closed.
  if order_row.extra_stock_id is not null then
    select e.*
    into primary_stock
    from public.extra_stock e
    where e.id = order_row.extra_stock_id;

    if not found then
      raise exception 'The order has an invalid existing Fresh Pick link';
    end if;
    if primary_stock.order_id is not null and primary_stock.order_id <> p_order_id then
      raise exception 'The order has a conflicting existing Fresh Pick link';
    end if;
    if primary_stock.lifecycle <> 'confirmed'
       or primary_stock.sold_at is null
       or primary_stock.cut_into_slices_at is not null then
      raise exception 'The order has an incomplete existing Fresh Pick allocation';
    end if;
  end if;

  if exists (
    select 1
    from public.extra_stock linked
    where linked.order_id = p_order_id
      and (
        linked.lifecycle <> 'confirmed'
        or linked.sold_at is null
        or linked.cut_into_slices_at is not null
      )
  ) then
    raise exception 'The order has an incomplete existing Fresh Pick allocation';
  end if;

  -- Match catalogue ids strictly when the physical stock has them. Preserve
  -- the established normalized-name fallback only for legacy stock without ids.
  select count(*)::integer, coalesce(sum(oi.quantity), 0)::bigint
  into v_matching_item_count, v_matching_item_quantity
  from public.order_items oi
  where oi.order_id = p_order_id
    and (
      (stock_row.library_cake_id is not null and oi.cake_id = stock_row.library_cake_id)
      or (
        stock_row.library_cake_id is null
        and lower(trim(oi.cake_name)) = lower(trim(stock_row.cake_name))
      )
    )
    and (
      (stock_row.library_cake_size_id is not null and oi.cake_size_id = stock_row.library_cake_size_id)
      or (
        stock_row.library_cake_size_id is null
        and lower(trim(oi.size_label)) = lower(trim(stock_row.size_label))
      )
    );

  if v_matching_item_count = 0 or v_matching_item_quantity = 0 then
    raise exception 'This order has no remaining cake line matching this Fresh Pick';
  end if;

  -- Count distinct physical stock units linked through the one-to-many stock
  -- relation plus the legacy primary pointer. The OR returns each row once.
  select count(*)::bigint
  into v_allocated_matching_stock_count
  from public.extra_stock linked
  where (linked.order_id = p_order_id or linked.id = order_row.extra_stock_id)
    and (
      (
        stock_row.library_cake_id is not null
        and linked.library_cake_id is not null
        and linked.library_cake_id = stock_row.library_cake_id
      )
      or (
        (stock_row.library_cake_id is null or linked.library_cake_id is null)
        and lower(trim(linked.cake_name)) = lower(trim(stock_row.cake_name))
      )
    )
    and (
      (
        stock_row.library_cake_size_id is not null
        and linked.library_cake_size_id is not null
        and linked.library_cake_size_id = stock_row.library_cake_size_id
      )
      or (
        (stock_row.library_cake_size_id is null or linked.library_cake_size_id is null)
        and lower(trim(linked.size_label)) = lower(trim(stock_row.size_label))
      )
    );

  if v_allocated_matching_stock_count >= v_matching_item_quantity then
    raise exception 'All matching cake quantities on this order already have physical stock assigned';
  end if;

  -- Assignment and audit writes are in this RPC transaction. If any later write
  -- or deferred constraint fails, PostgreSQL rolls all of them back.
  update public.extra_stock e
  set order_id = p_order_id,
      sold_at = v_now,
      updated_at = v_now
  where e.id = p_extra_stock_id
    and e.sold_at is null
    and e.order_id is null
    and e.cut_into_slices_at is null
    and e.lifecycle = 'confirmed'
    and (e.walk_in_held_until is null or e.walk_in_held_until < v_now);

  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    raise exception 'This Fresh Pick is no longer available for assignment';
  end if;

  -- Keep the established single primary pointer; subsequent physical units are
  -- represented by extra_stock.order_id and remain visible per stock record.
  if order_row.extra_stock_id is null
     and not exists (
       select 1
       from (
         select oi.cake_id, oi.cake_size_id, sum(oi.quantity)::bigint as required_qty
         from public.order_items oi
         where oi.order_id = p_order_id
         group by oi.cake_id, oi.cake_size_id
       ) required
       where (
         select count(*)::bigint
         from public.extra_stock linked
         where linked.order_id = p_order_id
           and linked.library_cake_id = required.cake_id
           and linked.library_cake_size_id = required.cake_size_id
           and linked.lifecycle = 'confirmed'
           and linked.cut_into_slices_at is null
       ) < required.required_qty
     )
  then
    update public.orders o
    set extra_stock_id = p_extra_stock_id,
        updated_at = v_now
    where o.id = p_order_id
      and o.extra_stock_id is null;

    get diagnostics v_updated = row_count;
    if v_updated <> 1 then
      raise exception 'The order changed while this Fresh Pick was being assigned';
    end if;
  end if;

  insert into public.order_timeline_events (
    order_id,
    event_type,
    actor_staff_id,
    metadata
  )
  values (
    p_order_id,
    'extra_assigned',
    v_actor,
    jsonb_build_object(
      'extra_stock_id', p_extra_stock_id,
      'matching_item_count', v_matching_item_count,
      'matching_item_quantity', v_matching_item_quantity,
      'previously_allocated_matching_stock_count', v_allocated_matching_stock_count,
      'inserted_order_item', false
    )
  );

  perform public._record_extra_stock_event(
    p_extra_stock_id,
    'assigned',
    v_actor,
    jsonb_build_object(
      'order_id', p_order_id,
      'order_number', order_row.order_number,
      'matching_item_count', v_matching_item_count,
      'matching_item_quantity', v_matching_item_quantity,
      'previously_allocated_matching_stock_count', v_allocated_matching_stock_count,
      'inserted_order_item', false
    )
  );

  select e.* into stock_row
  from public.extra_stock e
  where e.id = p_extra_stock_id;
  return stock_row;
end;
$function$
;
