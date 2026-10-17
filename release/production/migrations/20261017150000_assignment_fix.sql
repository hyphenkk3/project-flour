-- Production release candidate based on accepted DEV migration 20261017012542.
-- Data-preserving: changes only assignment RPC definition and EXECUTE ACL.
do $preflight$
begin
 if to_regprocedure('public._bind_rpc_actor(uuid)') is null
 or to_regprocedure('public._staff_role_code(uuid)') is null
 or to_regprocedure('public._record_extra_stock_event(uuid,text,uuid,jsonb)') is null
 or to_regclass('public.extra_stock') is null
 or to_regclass('public.orders') is null
 or to_regclass('public.order_timeline_events') is null then
 raise exception 'Assignment precondition failed: required schema/helper missing';
 end if;
end
$preflight$;

-- Repairs the Fresh Pick reciprocal stock/order link and binds the staff actor.
-- Keeps the existing signature for the authenticated server action. The shared
-- _bind_rpc_actor helper rejects anonymous callers, inactive/archived staff, and
-- a staff ID that does not map to auth.uid(). Trusted service_role callers remain
-- supported; the application server action uses the cookie-authenticated client.

-- Assign a specific Extra to an existing order. Does not insert order items.
create or replace function public.assign_extra_stock_to_order(
  p_extra_stock_id uuid,
  p_order_id uuid,
  p_actor_staff_id uuid
)
returns public.extra_stock
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_role text;
  stock_row public.extra_stock;
  order_row public.orders;
  v_matching_items int;
  v_updated int;
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

  select e.*
  into stock_row
  from public.extra_stock e
  where e.id = p_extra_stock_id
  for update;

  if not found then
    raise exception 'EXTRA stock not found';
  end if;

  if stock_row.lifecycle <> 'confirmed' then
    raise exception 'Only a confirmed Fresh Pick can be assigned to an order';
  end if;
  if stock_row.sold_at is not null then
    raise exception 'This Fresh Pick has already been sold or assigned';
  end if;
  if stock_row.cut_into_slices_at is not null then
    raise exception 'This Fresh Pick was cut into slices';
  end if;

  select o.*
  into order_row
  from public.orders o
  where o.id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found';
  end if;

  if order_row.status = 'cancelled' then
    raise exception 'Cannot assign a Fresh Pick to a cancelled order';
  end if;

  if order_row.extra_stock_id is not null then
    if order_row.extra_stock_id = p_extra_stock_id then
      raise exception 'This Fresh Pick is already assigned to that order';
    end if;
    raise exception 'That order already has a Fresh Pick assigned';
  end if;

  select count(*)::int
  into v_matching_items
  from public.order_items oi
  where oi.order_id = p_order_id
    and (
      (
        stock_row.library_cake_id is not null
        and oi.cake_id is not null
        and oi.cake_id = stock_row.library_cake_id
        and (
          stock_row.library_cake_size_id is null
          or oi.cake_size_id is null
          or oi.cake_size_id = stock_row.library_cake_size_id
        )
      )
      or (
        lower(trim(oi.cake_name)) = lower(trim(stock_row.cake_name))
        and lower(trim(oi.size_label)) = lower(trim(stock_row.size_label))
      )
    );

  update public.extra_stock e
  set order_id = p_order_id, sold_at = now(), updated_at = now()
  where e.id = p_extra_stock_id
    and e.sold_at is null
    and e.order_id is null
    and e.cut_into_slices_at is null
    and e.lifecycle = 'confirmed';

  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    raise exception 'This Fresh Pick has already been sold or assigned';
  end if;

  update public.orders o
  set extra_stock_id = p_extra_stock_id, updated_at = now()
  where o.id = p_order_id
    and o.extra_stock_id is null;

  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    raise exception 'That order already has a Fresh Pick assigned';
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
      'matching_item_count', v_matching_items,
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
      'matching_item_count', v_matching_items,
      'inserted_order_item', false
    )
  );

  select e.* into stock_row from public.extra_stock e where e.id = p_extra_stock_id;
  return stock_row;
end;
$$;

revoke all on function public.assign_extra_stock_to_order(uuid, uuid, uuid)
  from public, anon;
grant execute on function public.assign_extra_stock_to_order(uuid, uuid, uuid)
  to authenticated, service_role;

