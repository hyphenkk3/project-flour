-- Follow-up only: the installed DATE columns and original migration are unchanged.
-- All genuine selection changes are checked; unchanged historical rows survive.
create or replace function public.enforce_preorder_size_availability()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  v_date date; v_stock uuid; v_from date; v_until date; v_label text; v_name text;
begin
  if tg_op = 'UPDATE' and new.order_id is not distinct from old.order_id
     and new.cake_id is not distinct from old.cake_id
     and new.cake_size_id is not distinct from old.cake_size_id then return new; end if;
  select pickup_date, extra_stock_id into v_date,v_stock from public.orders
    where id=new.order_id for share;
  if not found then raise exception 'Order is not available'; end if;
  -- Physical stock is verified by the deferred linkage guard, after checkout
  -- has finished assigning every stock row to the order.
  if v_stock is not null then return new; end if;
  select s.available_from,s.available_until,s.label,c.name
    into v_from,v_until,v_label,v_name from public.library_cake_sizes s
    join public.library_cakes c on c.id=s.cake_id
    where s.id=new.cake_size_id and s.cake_id=new.cake_id for share of s;
  if not found then raise exception 'Cake size is not available'; end if;
  if v_date is null then raise exception 'Select a valid pickup date'; end if;
  if v_from is not null and v_date<v_from then
    raise exception '% %: Available from %. Choose another size or pickup date.',v_name,v_label,to_char(v_from,'FMDD Mon YYYY'); end if;
  if v_until is not null and v_date>v_until then
    raise exception '% %: Available until %. Choose another size or pickup date.',v_name,v_label,to_char(v_until,'FMDD Mon YYYY'); end if;
  return new;
end $$;
-- CREATE OR REPLACE retains the already-hardened ACL.
create trigger order_items_preorder_size_availability_update
before update of order_id,cake_id,cake_size_id on public.order_items
for each row execute function public.enforce_preorder_size_availability();

-- Deferred checks fire after guest SECURITY DEFINER RPCs return. Anonymous
-- callers cannot read orders under RLS, so this trigger-only, read-only
-- validator uses owner privileges. It cannot be invoked as a normal function.
create function public.enforce_order_size_availability_final()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid; o public.orders; i record; s record; v_count integer;
begin
  if tg_table_name='orders' then
    v_id:=new.id;
    if tg_op='UPDATE' and new.pickup_date is not distinct from old.pickup_date
      and new.extra_stock_id is not distinct from old.extra_stock_id then return null; end if;
  else v_id:=new.order_id; end if;
  select * into o from public.orders where id=v_id for share;
  if not found then return null; end if;
  if o.extra_stock_id is not null then
    -- No marker-only exemption: primary stock must actually belong to this
    -- order; each physical unit must match confirmed, uncut linked stock.
    perform 1 from public.extra_stock e where e.id=o.extra_stock_id
      and e.order_id=o.id and e.lifecycle='confirmed' and e.cut_into_slices_at is null for share;
    if not found then raise exception 'Fresh Pick requires legitimate stock linked to this order'; end if;
    for i in select cake_id,cake_size_id,sum(quantity)::integer qty
      from public.order_items where order_id=o.id group by cake_id,cake_size_id loop
      -- Lock before counting so concurrent stock reassignment cannot pass.
      perform 1 from public.extra_stock e where e.order_id=o.id for share;
      select count(*) into v_count from public.extra_stock e where e.order_id=o.id
        and e.library_cake_id=i.cake_id and e.library_cake_size_id=i.cake_size_id
        and e.lifecycle='confirmed' and e.cut_into_slices_at is null;
      if i.qty<1 or v_count<i.qty then raise exception 'Fresh Pick items must match linked physical stock'; end if;
    end loop;
    return null;
  end if;
  -- Item INSERT / selection UPDATE was already checked immediately. This
  -- guard checks retained selections only when the order date actually changes.
  if tg_table_name<>'orders' or tg_op<>'UPDATE' then return null; end if;
  if new.pickup_date is not distinct from old.pickup_date
    and new.extra_stock_id is not distinct from old.extra_stock_id then return null; end if;
  if o.pickup_date is null then raise exception 'Select a valid pickup date'; end if;
  for i in select * from public.order_items where order_id=o.id loop
    select cs.available_from,cs.available_until,cs.label,c.name into s
      from public.library_cake_sizes cs join public.library_cakes c on c.id=cs.cake_id
      where cs.id=i.cake_size_id and cs.cake_id=i.cake_id for share of cs;
    if not found then raise exception 'Cake size is not available'; end if;
    if s.available_from is not null and o.pickup_date<s.available_from then
      raise exception '% %: Available from %. Choose another size or pickup date.',s.name,s.label,to_char(s.available_from,'FMDD Mon YYYY'); end if;
    if s.available_until is not null and o.pickup_date>s.available_until then
      raise exception '% %: Available until %. Choose another size or pickup date.',s.name,s.label,to_char(s.available_until,'FMDD Mon YYYY'); end if;
  end loop;
  return null;
end $$;
revoke execute on function public.enforce_order_size_availability_final() from public,anon,authenticated,service_role;
create constraint trigger orders_size_availability_final
  after insert or update on public.orders deferrable initially deferred
  for each row execute function public.enforce_order_size_availability_final();
create constraint trigger order_items_stock_linkage_final
  after insert or update on public.order_items deferrable initially deferred
  for each row execute function public.enforce_order_size_availability_final();

-- Preserve existing function ownership, signature and ACL; merge by cake+size.
create or replace function public.sync_guest_order_items(p_order_id uuid,p_items jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  o public.orders; item jsonb; retained public.order_items; v_cake uuid; v_size uuid; v_qty integer;
  v_id uuid; kept uuid[]:=array[]::uuid[]; matches uuid[]; existing_qty integer;
begin
  if p_order_id is null then raise exception 'Order is required'; end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'At least one cake is required'; end if;
  select * into o from public.orders where id=p_order_id and customer_id is null for update;
  if not found then raise exception 'Order not found'; end if;
  if o.status not in ('submitted','pending_confirmation','awaiting_payment','paid') then raise exception 'This order can no longer be edited'; end if;
  if exists(select 1 from jsonb_array_elements(p_items) x where nullif(x->>'item_id','') is not null group by x->>'item_id' having count(*)>1)
    or exists(select 1 from jsonb_array_elements(p_items) x where nullif(x->>'item_id','') is null group by x->>'cake_id',x->>'cake_size_id' having count(*)>1) then raise exception 'Duplicate item identities must be consolidated'; end if;
  for item in select * from jsonb_array_elements(p_items) loop
    v_cake:=(item->>'cake_id')::uuid; v_size:=(item->>'cake_size_id')::uuid; v_qty:=(item->>'quantity')::integer; v_id:=nullif(item->>'item_id','')::uuid;
    if v_cake is null or v_size is null then raise exception 'Each item requires cake and size'; end if;
    if v_qty is null or v_qty<1 then raise exception 'Quantity must be at least 1'; end if;
    if nullif(trim(item->>'cake_name'),'') is null or nullif(trim(item->>'size_label'),'') is null then raise exception 'Each item requires cake name and size label snapshots'; end if;
    if (item->>'unit_price')::numeric is null or (item->>'unit_price')::numeric<0 then raise exception 'Unit price cannot be negative'; end if;
    if v_id is not null then
      select * into retained from public.order_items where id=v_id and order_id=o.id for update;
      if not found then raise exception 'Historical item does not belong to this order. Reload before saving.'; end if;
    else
      select array_agg(id order by id),sum(quantity) into matches,existing_qty from public.order_items oi where order_id=o.id and cake_id=v_cake and cake_size_id=v_size
        and not(id=any(kept)) and not exists(select 1 from jsonb_array_elements(p_items) x where nullif(x->>'item_id','')::uuid=oi.id);
      if coalesce(cardinality(matches),0)>1 then
        if existing_qty=v_qty then kept:=kept||matches; continue; end if;
        raise exception 'Choose the specific historical row whose quantity should change';
      end if;
      v_id:=matches[1];
      select * into retained from public.order_items where id=v_id for update;
    end if;
    if v_id is not null then
      if retained.cake_id=v_cake and retained.cake_size_id=v_size then
        -- Same historical selection: preserve identity, price and labels.
        update public.order_items set quantity=v_qty where id=v_id and quantity is distinct from v_qty;
      else
        -- Genuine selection change: UPDATE trigger validates the chosen date.
        update public.order_items set cake_id=v_cake,cake_size_id=v_size,quantity=v_qty,unit_price=(item->>'unit_price')::numeric,cake_name=trim(item->>'cake_name'),size_label=trim(item->>'size_label') where id=v_id;
      end if;
    else
      insert into public.order_items(order_id,cake_id,cake_size_id,quantity,unit_price,cake_name,size_label)
        values(o.id,v_cake,v_size,v_qty,(item->>'unit_price')::numeric,trim(item->>'cake_name'),trim(item->>'size_label')) returning id into v_id;
    end if;
    kept:=array_append(kept,v_id);
  end loop;
  delete from public.order_items where order_id=o.id and not(id=any(kept));
  update public.orders set updated_at=now() where id=o.id;
end $$;

-- One transaction for the existing staff save mutations and guard consumption.
-- Existing server-side approval/date/capacity rules still run before this RPC.
create function public.save_guest_order_workspace_atomic(
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
