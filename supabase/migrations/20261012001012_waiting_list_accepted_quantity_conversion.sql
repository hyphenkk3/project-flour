-- Keep manual waiting-list conversion consistent with the accepted quantity.
-- A recorded acceptance has already reduced remaining_quantity. Conversion
-- consumes that held, accepted offer; it must not validate against or consume
-- the unaccepted remainder a second time.
do $check$
begin
  if (select count(*)
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = 'waiting_list_convert_item') <> 1
    or not exists (
      select 1
      from pg_catalog.pg_proc p
      where p.oid = pg_catalog.to_regprocedure(
        'public.waiting_list_convert_item(uuid, uuid, integer, time, boolean)'
      )
        and md5(regexp_replace(p.prosrc, '\s', '', 'g')) = '640a25f9d83edb0f9c0b2e5a458d254c'
        and p.prosecdef
        and pg_catalog.pg_get_userbyid(p.proowner) = 'postgres'
    ) then
    raise exception 'Unreviewed waiting_list_convert_item definition; stop and reconcile';
  end if;
end
$check$;

create or replace function public.waiting_list_convert_item(
  p_actor_staff_id uuid,
  p_item_id uuid,
  p_quantity integer,
  p_pickup_time time,
  p_keep_remaining boolean default true
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.waiting_list_items;
  v_request public.waiting_list_requests;
  v_hold public.production_capacity_holds;
  v_order public.orders;
  v_qty integer;
  v_previously_converted integer;
  v_unconverted_accepted integer;
  v_recorded_acceptance boolean;
  v_source text;
begin
  -- Preserve the deployed correction: require an active staff identity bound
  -- to the supplied actor, then apply the existing staff-role policy.
  if auth.uid() is null or p_actor_staff_id is null or not exists (
    select 1
    from public.staff_profiles sp
    join public.roles r on r.id = sp.role_id
    where sp.auth_user_id = auth.uid()
      and sp.id = p_actor_staff_id
      and sp.is_active = true
      and r.code in ('owner', 'manager', 'customer_operations', 'bakery')
  ) then
    raise exception using
      errcode = '42501',
      message = 'Not authorized: an active staff session with the required role is required';
  end if;
  perform public._waiting_list_assert_manage_staff(p_actor_staff_id);

  select i.*
  into v_item
  from public.waiting_list_items i
  where i.id = p_item_id
  for update;
  if not found then
    raise exception 'Waiting-list item not found';
  end if;
  if public._waiting_list_item_has_submitted_confirmation(v_item.id) then
    raise exception 'Customer confirmation has already been submitted';
  end if;
  if v_item.status not in ('contacted', 'accepted', 'partially_accepted') then
    raise exception 'Convert only after the customer accepts an offered quantity';
  end if;

  select r.*
  into v_request
  from public.waiting_list_requests r
  where r.id = v_item.request_id
  for update;

  select h.*
  into v_hold
  from public.production_capacity_holds h
  where h.waiting_list_item_id = v_item.id
    and h.status = 'active'
  order by h.held_at desc
  limit 1
  for update;
  if v_hold.id is null then
    raise exception 'There is no active production hold for this offer';
  end if;

  v_qty := coalesce(p_quantity, v_hold.quantity);
  if v_qty < 1 or v_qty > v_hold.quantity then
    raise exception 'Convert quantity exceeds the held offer';
  end if;
  if p_pickup_time is null then
    raise exception 'Pickup time is required';
  end if;

  select coalesce(sum((e.payload ->> 'quantity')::integer), 0)::integer
  into v_previously_converted
  from public.waiting_list_events e
  where e.item_id = v_item.id
    and e.event_type = 'converted_to_order'
    and coalesce(e.payload ->> 'quantity', '') ~ '^[0-9]+$';

  -- Older accepted rows may have status='accepted' before accepted_quantity
  -- was populated. Treat only quantities newly recorded beyond prior converted
  -- events as an already-recorded acceptance.
  v_recorded_acceptance := v_item.status in ('accepted', 'partially_accepted')
    and v_item.accepted_quantity > v_previously_converted;
  if v_recorded_acceptance then
    v_unconverted_accepted := v_item.accepted_quantity - v_previously_converted;
    if v_qty > v_unconverted_accepted then
      raise exception 'Convert quantity exceeds the accepted offer';
    end if;
  elsif v_item.status = 'contacted' then
    if v_qty > v_item.remaining_quantity then
      raise exception 'Convert quantity exceeds the remaining request';
    end if;
  else
    raise exception 'There is no unconverted accepted quantity';
  end if;

  v_source := case
    when v_request.created_by_staff_id is null then 'customer_website'
    else 'other'
  end;

  v_order := staff_preorder_private.create_waiting_list_preorder(
    p_actor_staff_id,
    v_request.guest_name,
    v_request.guest_phone,
    null,
    v_source,
    false,
    v_item.pickup_date,
    p_pickup_time,
    null,
    jsonb_build_array(jsonb_build_object(
      'cake_id', v_item.library_cake_id,
      'cake_size_id', v_item.library_cake_size_id,
      'quantity', v_qty
    )),
    '[]'::jsonb,
    false,
    false,
    null,
    null,
    'Converted from waiting list',
    '[]'::jsonb,
    'pickup',
    null
  );

  update public.production_capacity_holds h
  set
    status = 'converted',
    converted_order_id = v_order.id,
    released_at = now()
  where h.id = v_hold.id;

  if v_recorded_acceptance then
    -- Acceptance already updated accepted_quantity and remaining_quantity.
    -- Conversion only links the order and closes or retains the unaccepted
    -- remainder; it must not count the accepted units a second time.
    update public.waiting_list_items i
    set
      converted_order_id = v_order.id,
      status = case
        when i.remaining_quantity = 0 then 'converted'
        when coalesce(p_keep_remaining, true) then 'partially_accepted'
        else 'closed'
      end
    where i.id = v_item.id
    returning * into v_item;
  else
    -- Converting directly from Contacted records the verbal acceptance here.
    update public.waiting_list_items i
    set
      accepted_quantity = i.accepted_quantity + v_qty,
      converted_order_id = v_order.id,
      status = case
        when i.remaining_quantity - v_qty <= 0 then 'converted'
        when coalesce(p_keep_remaining, true) then 'partially_accepted'
        else 'closed'
      end
    where i.id = v_item.id
    returning * into v_item;
  end if;

  if v_request.converted_order_id is null then
    update public.waiting_list_requests r
    set converted_order_id = v_order.id
    where r.id = v_request.id;
  end if;

  perform public._waiting_list_append_event(
    v_item.request_id,
    v_item.id,
    'converted_to_order',
    p_actor_staff_id,
    jsonb_build_object(
      'order_id', v_order.id,
      'quantity', v_qty,
      'recorded_acceptance', v_recorded_acceptance,
      'keep_remaining', coalesce(p_keep_remaining, true)
    )
  );
  if v_item.status = 'partially_accepted' then
    perform public._waiting_list_append_event(
      v_item.request_id,
      v_item.id,
      'remaining_kept',
      p_actor_staff_id,
      jsonb_build_object('remaining_quantity', v_item.remaining_quantity)
    );
  elsif v_item.remaining_quantity > 0 and v_item.status = 'closed' then
    perform public._waiting_list_append_event(
      v_item.request_id,
      v_item.id,
      'remaining_closed',
      p_actor_staff_id,
      jsonb_build_object('remaining_quantity', v_item.remaining_quantity)
    );
  end if;
  perform public._waiting_list_sync_request_status(v_item.request_id);
  return v_order;
end;
$$;
