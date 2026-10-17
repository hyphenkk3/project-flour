-- Fresh Pick cutoff selection and exact server-side order boundary.
-- Additive: preserve pickup operating hours, physical stock, and existing orders.

alter table public.extra_stock
  drop constraint if exists extra_stock_pickup_from_order_cutoff_fields;

alter table public.extra_stock
  add constraint extra_stock_pickup_from_order_cutoff_fields check (
    pickup_available_from_at is null or pickup_through_at is not null
  );

create or replace function public._assert_fresh_picks_confirm_window(
  p_pickup_available_from_at timestamptz,
  p_pickup_through_at timestamptz
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_today date;
  v_from_local timestamp;
  v_through_local timestamp;
  v_from_date date;
  v_through_date date;
begin
  if p_pickup_available_from_at is null then
    raise exception 'Pickup available from is required';
  end if;
  if p_pickup_through_at is null then
    raise exception 'Order cutoff is required';
  end if;

  v_today := timezone('Asia/Kuala_Lumpur', clock_timestamp())::date;
  v_from_local := timezone('Asia/Kuala_Lumpur', p_pickup_available_from_at);
  v_through_local := timezone('Asia/Kuala_Lumpur', p_pickup_through_at);
  v_from_date := v_from_local::date;
  v_through_date := v_through_local::date;

  if v_from_date not in (v_today, v_today + 1) then
    raise exception 'Fresh Picks pickup and order-cutoff dates must be today or tomorrow.';
  end if;
  if v_through_date < v_from_date then
    raise exception 'Order cutoff must be on the pickup-from date or the next calendar day.';
  end if;
  if v_through_date > v_from_date + 1 then
    raise exception 'Order cutoff must be on the pickup-from date or the next calendar day.';
  end if;
  if not public._pickup_slot_in_weekly_hours(v_from_date, v_from_local::time) then
    raise exception 'Pickup available from must be a valid bakery pickup time for that date.';
  end if;
  if extract(minute from v_through_local)::integer % 30 <> 0
     or extract(second from v_through_local) <> 0 then
    raise exception 'Choose a valid 30-minute order cutoff time.';
  end if;
  if p_pickup_through_at <= clock_timestamp() then
    raise exception 'That order cutoff has already passed. Choose a later time.';
  end if;
end;
$$;

create or replace function public._assert_fresh_picks_customer_fulfilment(
  p_date date,
  p_time time,
  p_method public.fulfilment_method,
  p_extra_stock_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cutoff time;
  v_lead integer;
  v_today date;
  v_cutoff_at timestamptz;
  v_fulfilment_at timestamptz;
  v_boundary timestamptz;
  v_cutoff_label text;
  v_ready_bypass boolean := false;
  v_ready_count integer := 0;
  v_now timestamptz := clock_timestamp();
begin
  if p_date is null or p_time is null then
    raise exception 'Please choose a valid fulfilment time for that date.';
  end if;
  if p_method is null or p_method not in ('pickup', 'dine_in', 'delivery') then
    raise exception 'Please choose a valid fulfilment method.';
  end if;

  -- submit_guest_extra_order holds every selected extra_stock row before this
  -- internal validator runs. Keeping the cutoff check here makes the boundary
  -- authoritative for both old and new clients and serializes with cutoff edits.
  if coalesce(array_length(p_extra_stock_ids, 1), 0) > 0 and exists (
    select 1
    from public.extra_stock e
    where e.id = any(p_extra_stock_ids)
      and (e.pickup_through_at is null or v_now >= e.pickup_through_at)
  ) then
    raise exception 'This Extra is no longer available to order';
  end if;

  if p_method = 'pickup' then
    if not public._pickup_slot_in_weekly_hours(p_date, p_time) then
      raise exception 'Please choose a valid pickup time for that date.';
    end if;
  elsif p_method = 'dine_in' then
    if not public.is_valid_dine_in_slot(p_date, p_time) then
      raise exception 'Please choose a valid dine-in reservation time for that date.';
    end if;
  else
    if not public.is_valid_delivery_slot(p_date, p_time) then
      raise exception 'Please choose a valid delivery time for that date.';
    end if;
  end if;

  select
    coalesce(c.fresh_picks_same_day_preparation_cutoff_time, time '16:00:00'),
    coalesce(c.fresh_picks_same_day_preparation_lead_minutes, 60)
  into v_cutoff, v_lead
  from public.business_operating_config c
  where c.id = 1;
  v_cutoff := coalesce(v_cutoff, time '16:00:00');
  v_lead := coalesce(v_lead, 60);

  v_today := (timezone('Asia/Kuala_Lumpur', v_now))::date;
  v_fulfilment_at := timezone(
    'Asia/Kuala_Lumpur',
    (p_date::text || ' ' || p_time::text)::timestamp
  );

  if p_method in ('pickup', 'dine_in')
     and p_date = v_today
     and coalesce(array_length(p_extra_stock_ids, 1), 0) > 0 then
    select count(*)::integer into v_ready_count
    from public.extra_stock e
    where e.id = any(p_extra_stock_ids)
      and e.ready_for_collection is true;
    v_ready_bypass := v_ready_count = array_length(p_extra_stock_ids, 1);
  end if;

  if p_date = v_today then
    if not v_ready_bypass then
      v_cutoff_at := timezone(
        'Asia/Kuala_Lumpur',
        (v_today::text || ' ' || v_cutoff::text)::timestamp
      );
      if v_now >= v_cutoff_at then
        v_cutoff_label := trim(to_char(v_cutoff, 'FMHH12:MI AM'));
        raise exception
          'Same-day orders must be placed before %. Please select another date for your order.',
          v_cutoff_label;
      end if;
    elsif v_fulfilment_at <= v_now then
      raise exception 'Please choose a future pickup or dine-in time.';
    end if;

    if not v_ready_bypass then
      v_boundary := v_now + make_interval(mins => v_lead);
      if p_method = 'dine_in' then
        if v_fulfilment_at <= v_boundary then
          raise exception 'Please choose a valid fulfilment time for that date.';
        end if;
      elsif v_fulfilment_at < v_boundary then
        raise exception 'Please choose a valid fulfilment time for that date.';
      end if;
    end if;
  elsif v_fulfilment_at < v_now then
    raise exception 'Please choose a pickup time from the Extra pickup window.';
  end if;
end;
$$;

revoke all on function public._assert_fresh_picks_customer_fulfilment(
  date, time, public.fulfilment_method, uuid[]
) from public, anon, authenticated;

create or replace function public.update_extra_stock_order_cutoff(
  p_extra_stock_id uuid,
  p_actor_staff_id uuid,
  p_pickup_through_at timestamptz,
  p_confirm_immediate_close boolean
)
returns public.extra_stock
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_now timestamptz;
  v_from_date date;
  v_cutoff_local timestamp;
  v_previous_cutoff timestamptz;
  stock_row public.extra_stock;
begin
  v_actor := public._bind_rpc_actor(p_actor_staff_id);
  perform public._require_rpc_roles(
    v_actor,
    array['bakery', 'manager', 'owner'],
    'Not authorized to edit a Fresh Pick order cutoff.'
  );

  select e.* into stock_row
  from public.extra_stock e
  where e.id = p_extra_stock_id
  for update;

  if not found then raise exception 'Fresh Pick not found'; end if;
  v_now := clock_timestamp();
  if stock_row.lifecycle <> 'confirmed'
     or stock_row.sold_at is not null
     or stock_row.order_id is not null
     or stock_row.cut_into_slices_at is not null then
    raise exception 'Only an unsold, confirmed Fresh Pick can have its cutoff edited';
  end if;
  if public.extra_walk_in_hold_is_active(stock_row.walk_in_held_until, v_now) then
    raise exception 'A Fresh Pick on walk-in hold cannot have its cutoff edited';
  end if;
  if stock_row.pickup_through_at is null or stock_row.pickup_through_at <= v_now then
    raise exception 'This order cutoff has expired and can no longer be edited';
  end if;
  if p_pickup_through_at is null then
    raise exception 'Order cutoff is required';
  end if;
  if p_pickup_through_at = stock_row.pickup_through_at then
    raise exception 'Choose a different order cutoff';
  end if;
  v_previous_cutoff := stock_row.pickup_through_at;

  v_from_date := timezone('Asia/Kuala_Lumpur', stock_row.pickup_available_from_at)::date;
  v_cutoff_local := timezone('Asia/Kuala_Lumpur', p_pickup_through_at);
  if v_cutoff_local::date < v_from_date
     or v_cutoff_local::date > v_from_date + 1 then
    raise exception 'Order cutoff must be on the pickup-from date or the next calendar day';
  end if;
  if extract(minute from v_cutoff_local)::integer % 30 <> 0
     or extract(second from v_cutoff_local) <> 0 then
    raise exception 'Choose a valid 30-minute order cutoff time';
  end if;
  if p_pickup_through_at <= v_now and not coalesce(p_confirm_immediate_close, false) then
    raise exception 'Confirm that this cutoff will close ordering immediately';
  end if;

  update public.extra_stock e
  set pickup_through_at = p_pickup_through_at,
      updated_at = v_now
  where e.id = p_extra_stock_id
  returning * into stock_row;

  perform public._record_extra_stock_event(
    p_extra_stock_id,
    'order_cutoff_changed',
    v_actor,
    jsonb_build_object(
      'from_pickup_through_at', v_previous_cutoff,
      'to_pickup_through_at', p_pickup_through_at,
      'closes_immediately', p_pickup_through_at <= v_now
    )
  );
  return stock_row;
end;
$$;

revoke all on function public.update_extra_stock_order_cutoff(uuid, uuid, timestamptz, boolean)
  from public, anon;
grant execute on function public.update_extra_stock_order_cutoff(uuid, uuid, timestamptz, boolean)
  to authenticated, service_role;
