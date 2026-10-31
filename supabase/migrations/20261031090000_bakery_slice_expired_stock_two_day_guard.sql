-- Keep eligible physical stock sliceable only until the day after its customer cutoff.
CREATE OR REPLACE FUNCTION public.cut_extra_stock_into_slices(p_extra_stock_id uuid, p_actor_staff_id uuid)
 RETURNS extra_stock
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor_staff_id uuid;
  v_role text;
  stock_row public.extra_stock;
begin
  if p_extra_stock_id is null then
    raise exception 'EXTRA stock is required';
  end if;
  if p_actor_staff_id is null then
    raise exception 'Staff actor is required';
  end if;

  v_actor_staff_id := public._bind_rpc_actor(p_actor_staff_id);
  v_role := public._staff_role_code(v_actor_staff_id);
  if v_role is null or v_role not in ('bakery', 'manager', 'owner') then
    raise exception 'Not authorized to cut EXTRA into slices';
  end if;

  select e.*
  into stock_row
  from public.extra_stock e
  where e.id = p_extra_stock_id
  for update;

  if not found then
    raise exception 'EXTRA stock not found';
  end if;

  -- Staff may cut stock through the day after its customer ordering cutoff.
  -- Customer order cutoff itself is still controlled independently.
  if stock_row.pickup_through_at is null
     or timezone('Asia/Kuala_Lumpur', clock_timestamp())::date >
        timezone('Asia/Kuala_Lumpur', stock_row.pickup_through_at)::date + 1 then
    raise exception 'The two-day Bakery recovery window has ended';
  end if;

  if stock_row.lifecycle <> 'confirmed' then
    raise exception 'Only a confirmed Fresh Pick can be cut into slices';
  end if;
  if stock_row.sold_at is not null then
    raise exception 'Cannot cut a sold Extra into slices';
  end if;
  if stock_row.cut_into_slices_at is not null then
    raise exception 'This Extra was already cut into slices';
  end if;

  update public.extra_stock e
  set
    cut_into_slices_at = now(),
    cut_into_slices_by = v_actor_staff_id,
    updated_at = now()
  where e.id = p_extra_stock_id
    and e.sold_at is null
    and e.cut_into_slices_at is null
    and e.lifecycle = 'confirmed'
  returning * into stock_row;

  if not found then
    raise exception 'Cannot cut this Fresh Pick into slices';
  end if;

  perform public._record_extra_stock_event(
    p_extra_stock_id,
    'cut_into_slices',
    v_actor_staff_id,
    '{}'::jsonb
  );

  return stock_row;
end;
$function$
;
