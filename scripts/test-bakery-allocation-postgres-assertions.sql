do $$
declare state text;
begin
  -- No allocation: full ordered requirement remains, normal production can start.
  state := public._bakery_order_fresh_pick_allocation_state('00000000-0000-0000-0000-000000000001');
  if state <> 'partial_or_none' then raise exception 'no-allocation classification failed: %', state; end if;
  perform public.mark_guest_order_production_started('00000000-0000-0000-0000-000000000001','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

  -- Two reciprocal rows plus one legacy pointer cover qty 2, not qty 3.
  state := public._bakery_order_fresh_pick_allocation_state('00000000-0000-0000-0000-000000000002');
  if state <> 'fully_covered' then raise exception 'full allocation classification failed: %', state; end if;
  update public.orders set extra_stock_id = '40000000-0000-0000-0000-000000000001'
  where id = '00000000-0000-0000-0000-000000000008';
  if public._bakery_order_fresh_pick_allocation_state('00000000-0000-0000-0000-000000000002') <> 'invalid' then
    raise exception 'conflicting legacy pointer was not rejected';
  end if;
  update public.orders set extra_stock_id = '40000000-0000-0000-0000-000000000005'
  where id = '00000000-0000-0000-0000-000000000008';
  begin
    perform public.mark_guest_order_production_started('00000000-0000-0000-0000-000000000002','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    raise exception 'fully allocated order unexpectedly started production';
  exception when others then
    if sqlerrm not like 'All ordered cake quantities are supplied by Fresh Pick%' then raise; end if;
  end;
  if (select production_started_at from public.orders where id='00000000-0000-0000-0000-000000000002') is not null then
    raise exception 'fully allocated rejection partially changed order';
  end if;

  -- Partial physical allocation remains production-startable.
  state := public._bakery_order_fresh_pick_allocation_state('00000000-0000-0000-0000-000000000003');
  if state <> 'partial_or_none' then raise exception 'partial allocation classification failed: %', state; end if;
  perform public.mark_guest_order_production_started('00000000-0000-0000-0000-000000000003','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

  -- A mixed order with a covered Chocolate line and uncovered Matcha remains startable.
  state := public._bakery_order_fresh_pick_allocation_state('00000000-0000-0000-0000-000000000008');
  if state <> 'partial_or_none' then raise exception 'mixed order classification failed: %', state; end if;
  perform public.mark_guest_order_production_started('00000000-0000-0000-0000-000000000008','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

  -- Over-allocation, mismatched stock and dangling legacy pointer all fail closed.
  foreach state in array array[
    public._bakery_order_fresh_pick_allocation_state('00000000-0000-0000-0000-000000000004'),
    public._bakery_order_fresh_pick_allocation_state('00000000-0000-0000-0000-000000000005'),
    public._bakery_order_fresh_pick_allocation_state('00000000-0000-0000-0000-000000000006')
  ] loop
    if state <> 'invalid' then raise exception 'invalid allocation was not rejected: %', state; end if;
  end loop;
  begin
    perform public.mark_guest_order_production_started('00000000-0000-0000-0000-000000000006','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    raise exception 'dangling pointer unexpectedly started production';
  exception when others then
    if sqlerrm not like 'Fresh Pick allocation needs review%' then raise; end if;
  end;
  if (select production_started_at from public.orders where id='00000000-0000-0000-0000-000000000006') is not null then
    raise exception 'invalid allocation rejection partially changed order';
  end if;

  -- Role guard is still enforced by the public production-start RPC.
  begin
    perform public.mark_guest_order_production_started('00000000-0000-0000-0000-000000000007','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
    raise exception 'unauthorized production start unexpectedly succeeded';
  exception when others then
    if sqlerrm <> 'Not authorized to start production' then raise; end if;
  end;
  if (select production_started_at from public.orders where id='00000000-0000-0000-0000-000000000007') is not null then
    raise exception 'unauthorized attempt partially changed order';
  end if;

  raise notice 'PASS: isolated PostgreSQL allocation and production guard cases';
end
$$;
