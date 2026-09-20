-- Guest Waiting List: closed pickup dates do not require Fully Booked.
-- Open dates keep the existing Fully Booked check.
-- Collection waiting_list_enabled + matching production_capacity.waiting_list_enabled
-- remain required. Staff insert is unchanged.
-- Does not change staff notifications, queue, or eligibility flags.

create or replace function public._waiting_list_insert_request(
  p_guest_name text,
  p_phone text,
  p_pickup_date date,
  p_open_to_alternatives boolean,
  p_items jsonb,
  p_collection_id uuid,
  p_actor_staff_id uuid,
  p_notes text,
  p_event_type text
)
returns public.waiting_list_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_phone text;
  v_request public.waiting_list_requests;
  v_item jsonb;
  v_cake uuid;
  v_size uuid;
  v_qty integer;
  v_capacity public.production_capacity;
  v_collection public.collections;
  v_item_id uuid;
  v_position integer;
begin
  v_name := nullif(trim(coalesce(p_guest_name, '')), '');
  v_phone := public._waiting_list_digits(p_phone);
  if v_name is null then
    raise exception 'Name is required';
  end if;
  if char_length(v_phone) < 8 or char_length(v_phone) > 15 then
    raise exception 'Please enter a valid WhatsApp number';
  end if;
  if p_pickup_date is null then
    raise exception 'Collection date is required';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 then
    raise exception 'At least one cake is required';
  end if;

  if p_collection_id is not null then
    select c.* into v_collection from public.collections c where c.id = p_collection_id;
  else
    v_collection := public.storefront_collection_for_pickup_date(p_pickup_date);
  end if;
  if v_collection.id is null or v_collection.waiting_list_enabled is not true then
    raise exception 'Waiting list is not enabled for this collection';
  end if;

  insert into public.waiting_list_requests (
    guest_name,
    guest_phone,
    pickup_date,
    open_to_alternatives,
    status,
    notes,
    created_by_staff_id
  ) values (
    v_name,
    v_phone,
    p_pickup_date,
    coalesce(p_open_to_alternatives, false),
    'active',
    nullif(trim(coalesce(p_notes, '')), ''),
    p_actor_staff_id
  )
  returning * into v_request;

  for v_item in
    select value from jsonb_array_elements(p_items)
  loop
    v_cake := nullif(trim(coalesce(v_item->>'cake_id', v_item->>'cakeId', '')), '')::uuid;
    v_size := nullif(trim(coalesce(v_item->>'cake_size_id', v_item->>'sizeId', '')), '')::uuid;
    v_qty := coalesce((v_item->>'quantity')::integer, 0);
    if v_cake is null or v_size is null or v_qty < 1 then
      raise exception 'Each waiting-list item needs a cake, size, and quantity';
    end if;
    if not exists (
      select 1 from public.library_cake_sizes s
      where s.id = v_size and s.cake_id = v_cake
    ) then
      raise exception 'Cake size is not available';
    end if;

    v_capacity := public._waiting_list_matching_capacity(
      p_pickup_date,
      v_cake,
      v_size,
      v_collection.id
    );
    if v_capacity.id is null then
      raise exception 'Waiting list is not available for that cake and date';
    end if;
    if v_capacity.waiting_list_enabled is not true then
      raise exception 'Waiting list is not enabled for that cake and date';
    end if;
    -- Guests: Fully Booked is required on open dates only.
    -- Closed dates may still accept Waiting List when both WL flags are on.
    if p_actor_staff_id is null
      and not public.is_pickup_orders_closed(p_pickup_date)
    then
      if not public._guest_preorder_item_fully_booked(
        p_pickup_date,
        v_collection.id,
        v_cake,
        v_size,
        v_qty
      ) then
        raise exception 'This cake is still available to order for that date';
      end if;
    end if;

    v_position := public._waiting_list_next_queue_position(
      p_pickup_date,
      v_cake,
      v_size
    );

    insert into public.waiting_list_items (
      request_id,
      pickup_date,
      library_cake_id,
      library_cake_size_id,
      quantity,
      accepted_quantity,
      remaining_quantity,
      queue_position,
      status,
      production_capacity_id
    ) values (
      v_request.id,
      p_pickup_date,
      v_cake,
      v_size,
      v_qty,
      0,
      v_qty,
      v_position,
      'active',
      v_capacity.id
    )
    returning id into v_item_id;

    perform public._waiting_list_append_event(
      v_request.id,
      v_item_id,
      p_event_type,
      p_actor_staff_id,
      jsonb_build_object(
        'quantity', v_qty,
        'pickup_date', p_pickup_date,
        'queue_position', v_position,
        'cake_id', v_cake,
        'size_id', v_size
      )
    );
  end loop;

  return v_request;
end;
$$;
