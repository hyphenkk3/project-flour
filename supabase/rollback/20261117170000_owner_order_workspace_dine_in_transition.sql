-- Restores the exact Production-rooted pre-Dine-In atomic save function.
-- Apply only after the application has been rolled back to its pre-Dine-In build.
create or replace function public.save_guest_order_workspace_atomic(
  p_order_id uuid,p_actor_staff_id uuid,p_plan jsonb
) returns void language plpgsql security definer set search_path = '' as $$
declare
  o public.orders; patch public.orders; actor uuid; role_code text; item jsonb;
  before_customer jsonb; after_customer jsonb; before_items jsonb; after_items jsonb;
  before_comp jsonb; after_comp jsonb; before_addons jsonb; after_addons jsonb;
  before_delivery jsonb; after_delivery jsonb; changed boolean; override_requested boolean;
  before_due numeric; before_net numeric; due numeric; net numeric; new_status public.order_status;
  material boolean; metadata jsonb; snapshot_id uuid; addon_before jsonb; addon_after jsonb;
begin
  actor:=public._bind_rpc_actor(p_actor_staff_id);
  role_code:=public._staff_role_code(actor);
  if role_code is null or role_code not in ('owner','manager','customer_operations') then raise exception 'Not authorized to edit this order'; end if;
  select * into o from public.orders where id=p_order_id and customer_id is null for update;
  if not found then raise exception 'Order not found'; end if;
  if o.status not in ('submitted','pending_confirmation','awaiting_payment','paid') then raise exception 'This order can no longer be edited'; end if;
  if o.pickup_date::text is distinct from p_plan->>'expected_pickup_date' then raise exception 'The order changed. Reload before saving.'; end if;
  if role_code='customer_operations' and o.pickup_date<=(timezone('Asia/Singapore',now())::date+1) then raise exception 'This order is within the 2-day change cutoff. Request approval for the exact change.'; end if;
  override_requested:=coalesce((p_plan->>'post_payment_override')::boolean,false);
  if override_requested and role_code not in ('owner','manager') then raise exception 'Only Manager or Owner can override the one-time post-payment customer change restriction.'; end if;
  patch:=jsonb_populate_record(o,p_plan->'order');
  if date_trunc('month',patch.pickup_date::timestamp) is distinct from date_trunc('month',o.pickup_date::timestamp)
    and (role_code<>'owner' or not coalesce((p_plan->>'pickup_month_override')::boolean,false)) then raise exception 'Cross-month pickup changes require Owner override. Request approval instead.'; end if;
  if patch.order_source is distinct from o.order_source and (patch.order_source='customer_website' or o.order_source='customer_website') then raise exception 'Website order source cannot be changed'; end if;
  before_due:=public.order_amount_due(o.id); before_net:=public.order_net_received(o.id);
  before_customer:=jsonb_build_array(trim(o.guest_name),trim(coalesce(o.guest_phone,'')),trim(coalesce(o.guest_email,'')),o.pickup_date,o.pickup_time,trim(coalesce(o.customer_notes,'')),o.fulfilment_method);
  select coalesce(jsonb_agg(jsonb_build_array(cake_id,cake_size_id,quantity) order by cake_id,cake_size_id,id),'[]') into before_items from public.order_items where order_id=o.id;
  select coalesce(jsonb_agg(jsonb_build_array(complimentary_item_type_id,name,quantity) order by complimentary_item_type_id,name),'[]') into before_comp from public.order_complimentary_items where order_id=o.id;
  before_addons:=public._operations_approval_paid_addons_snapshot(o.id);
  select coalesce(jsonb_agg(jsonb_build_object('code',x->>'code','quantity',(x->>'quantity')::integer,'messages',
    (select jsonb_agg(nullif(trim(x->'messages'->>(g-1)),'' ) order by g) from generate_series(1,(x->>'quantity')::integer) g)) order by x->>'code'),'[]')
    into before_addons from jsonb_array_elements(before_addons) x;
  select jsonb_build_object('recipient_name',trim(d.recipient_name),'recipient_phone',trim(d.recipient_phone),'address_line_1',trim(d.address_line_1),'address_line_2',nullif(trim(d.address_line_2),''),'postcode',trim(d.postcode),'city',trim(d.city),'state',trim(d.state),'recipient_notify_preference',d.recipient_notify_preference) into before_delivery from public.order_delivery_details d where order_id=o.id;
  if o.status='paid' and not override_requested and (
    exists(select 1 from public.order_items oi where oi.order_id=o.id group by oi.cake_id,oi.cake_size_id
      having sum(oi.quantity) is distinct from (select sum((x->>'quantity')::integer)
        from jsonb_array_elements(p_plan->'items') x where (x->>'cake_id')::uuid=oi.cake_id and (x->>'cake_size_id')::uuid=oi.cake_size_id))
    or exists(select 1 from public.order_items oi join jsonb_array_elements(p_plan->'items') x
      on (x->>'item_id')::uuid=oi.id where oi.order_id=o.id and oi.quantity is distinct from (x->>'quantity')::integer)
  ) then raise exception 'Existing paid-order cake lines require Manager or Owner override'; end if;
  update public.orders set guest_name=patch.guest_name,guest_phone=patch.guest_phone,guest_email=patch.guest_email,
    order_source=patch.order_source,crew_order=patch.crew_order,include_receipt=patch.include_receipt,
    needs_bakery_attention=patch.needs_bakery_attention,bakery_attention_note=patch.bakery_attention_note,
    pickup_date=patch.pickup_date,pickup_time=patch.pickup_time,pickup_instruction=o.pickup_instruction,
    customer_notes=patch.customer_notes,internal_notes=patch.internal_notes,updated_by=actor where id=o.id;
  perform public.sync_guest_order_items(o.id,p_plan->'items');
  delete from public.order_complimentary_items where order_id=o.id;
  for item in select * from jsonb_array_elements(p_plan->'complimentary') loop
    insert into public.order_complimentary_items(order_id,complimentary_item_type_id,name,quantity,sort_order)
      values(o.id,(item->>'type_id')::uuid,item->>'name',(item->>'quantity')::integer,(item->>'sort_order')::integer);
  end loop;
  perform public.sync_guest_order_paid_addons(o.id,p_plan->'paid_addons');
  if p_plan->'dine_in' is not null and p_plan->'dine_in'<>'null'::jsonb then
    item:=p_plan->'dine_in';
    update public.order_dine_in_reservations set reservation_date=patch.pickup_date,
      reservation_time=(item->>'reservation_time')::time,venue=(item->>'venue')::public.dine_in_venue,guest_count=(item->>'guest_count')::integer,
      adult_count=(item->>'adult_count')::integer,kid_count=(item->>'kid_count')::integer,toddler_count=(item->>'toddler_count')::integer,
      whitebird_split_seating_acknowledged=(item->>'whitebird_split_seating_acknowledged')::boolean,reservation_note=item->>'reservation_note' where order_id=o.id;
  elsif p_plan->'fulfilment' is not null and p_plan->'fulfilment'<>'null'::jsonb then
    perform public.sync_guest_order_fulfilment(o.id,(p_plan#>>'{fulfilment,method}')::public.fulfilment_method,p_plan#>'{fulfilment,delivery}');
  end if;
  select jsonb_build_array(trim(guest_name),trim(coalesce(guest_phone,'')),trim(coalesce(guest_email,'')),pickup_date,pickup_time,trim(coalesce(customer_notes,'')),fulfilment_method) into after_customer from public.orders where id=o.id;
  select coalesce(jsonb_agg(jsonb_build_array(cake_id,cake_size_id,quantity) order by cake_id,cake_size_id,id),'[]') into after_items from public.order_items where order_id=o.id;
  select coalesce(jsonb_agg(jsonb_build_array(complimentary_item_type_id,name,quantity) order by complimentary_item_type_id,name),'[]') into after_comp from public.order_complimentary_items where order_id=o.id;
  after_addons:=public._operations_approval_paid_addons_snapshot(o.id);
  select coalesce(jsonb_agg(jsonb_build_object('code',x->>'code','quantity',(x->>'quantity')::integer,'messages',
    (select jsonb_agg(nullif(trim(x->'messages'->>(g-1)),'' ) order by g) from generate_series(1,(x->>'quantity')::integer) g)) order by x->>'code'),'[]')
    into after_addons from jsonb_array_elements(after_addons) x;
  select jsonb_build_object('recipient_name',trim(d.recipient_name),'recipient_phone',trim(d.recipient_phone),'address_line_1',trim(d.address_line_1),'address_line_2',nullif(trim(d.address_line_2),''),'postcode',trim(d.postcode),'city',trim(d.city),'state',trim(d.state),'recipient_notify_preference',d.recipient_notify_preference) into after_delivery from public.order_delivery_details d where order_id=o.id;
  changed:=before_customer is distinct from after_customer or before_items is distinct from after_items
    or before_comp is distinct from after_comp or before_addons is distinct from after_addons or (before_delivery-'recipient_notify_preference') is distinct from (after_delivery-'recipient_notify_preference');
  if o.status='paid' and changed then perform public.guard_post_payment_customer_change(o.id,actor,override_requested); end if;
  -- Preserve payment-lifecycle reconciliation, using the existing canonical
  -- database totals (including payment corrections and recorded refunds).
  due:=public.order_amount_due(o.id); net:=public.order_net_received(o.id); new_status:=o.status;
  if o.status in ('awaiting_payment','paid') or before_net>0 or net>0 then
    new_status:=case when net>=due then 'paid'::public.order_status else 'awaiting_payment'::public.order_status end;
  end if;
  if new_status is distinct from o.status then
    update public.orders set status=new_status,payment_status=case when new_status='paid' then 'paid'::public.payment_status else 'unpaid'::public.payment_status end,updated_by=actor where id=o.id;
  end if;
  material:=before_customer->0 is distinct from after_customer->0
    or before_customer->1 is distinct from after_customer->1
    or before_customer->3 is distinct from after_customer->3
    or before_customer->4 is distinct from after_customer->4
    or before_customer->6 is distinct from after_customer->6
    or before_items is distinct from after_items or before_comp is distinct from after_comp
    or before_addons is distinct from after_addons or before_delivery is distinct from after_delivery;
  if material or o.status in ('awaiting_payment','paid') or new_status is distinct from o.status or before_due<>due then
    metadata:=jsonb_build_object('previous_amount_due',before_due,'new_amount_due',due,'net_received',net,
      'previous_status',o.status,'new_status',new_status,'remaining_balance',greatest(0,due-net),'overpayment',greatest(0,net-due));
    if o.status in ('awaiting_payment','paid') or new_status is distinct from o.status then metadata:=metadata||jsonb_build_object('amended_during_payment_lifecycle',true); end if;
    if before_addons is distinct from after_addons then
      select coalesce(jsonb_agg(jsonb_build_object('code',x->>'code','quantity',(x->>'quantity')::integer,'messages',
        (select jsonb_agg(jsonb_build_object('cardIndex',g,'message',x->'messages'->(g-1)) order by g) from generate_series(1,(x->>'quantity')::integer) g)) order by x->>'code'),'[]') into addon_before from jsonb_array_elements(before_addons) x;
      select coalesce(jsonb_agg(jsonb_build_object('code',x->>'code','quantity',(x->>'quantity')::integer,'messages',
        (select jsonb_agg(jsonb_build_object('cardIndex',g,'message',x->'messages'->(g-1)) order by g) from generate_series(1,(x->>'quantity')::integer) g)) order by x->>'code'),'[]') into addon_after from jsonb_array_elements(after_addons) x;
      metadata:=metadata||jsonb_build_object('paid_addons_before',addon_before,'paid_addons_after',addon_after);
    end if;
    if before_customer->3 is distinct from after_customer->3 or before_customer->4 is distinct from after_customer->4
      or before_customer->6 is distinct from after_customer->6 or before_delivery is distinct from after_delivery then
      metadata:=metadata||jsonb_build_object('fulfilment_before',jsonb_build_object('method',case when o.fulfilment_method='delivery' then 'delivery' else 'pickup' end,'date',o.pickup_date,'time',to_char(o.pickup_time,'HH24:MI'),'delivery',before_delivery),
        'fulfilment_after',jsonb_build_object('method',case when after_customer->>6='delivery' then 'delivery' else 'pickup' end,'date',after_customer->3,'time',left(after_customer->>4,5),'delivery',after_delivery));
    end if;
    insert into public.order_timeline_events(order_id,event_type,actor_staff_id,metadata) values(o.id,'order_updated',actor,metadata);
  end if;
  if material and o.status in ('pending_confirmation','awaiting_payment','paid') then
    select id into snapshot_id from public.order_confirmation_snapshots where order_id=o.id and lifecycle_status='sent' order by version desc limit 1 for update;
    if found then
      update public.order_confirmation_snapshots set lifecycle_status='outdated',outdated_at=now() where id=snapshot_id;
      insert into public.order_timeline_events(order_id,event_type,actor_staff_id,metadata) values(o.id,'confirmation_outdated',actor,jsonb_build_object('snapshot_id',snapshot_id));
    end if;
    update public.orders set confirmation_needs_resend=true where id=o.id;
  end if;
  -- Force these checks before returning to the caller; failures roll back the
  -- order, item changes, ancillary data and post-payment audit/count together.
  set constraints public.orders_size_availability_final,public.order_items_stock_linkage_final immediate;
end $$;
revoke execute on function public.save_guest_order_workspace_atomic(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.save_guest_order_workspace_atomic(uuid,uuid,jsonb) to authenticated,service_role;
