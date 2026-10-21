\set ON_ERROR_STOP on
select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000001',false);
select set_config('request.jwt.claim.role','authenticated',false);

-- Matching available stock succeeds and creates reciprocal links plus both audit events.
insert into public.orders(id,order_number,status) values ('40000000-0000-0000-0000-000000000001','TEST-OPEN','paid');
insert into public.order_items(id,order_id,cake_id,cake_size_id,cake_name,size_label,quantity) values
('50000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','Cocoa','6 inch',1);
insert into public.extra_stock(id,library_cake_id,library_cake_size_id,cake_name,size_label,lifecycle,pickup_through_at)
values ('80000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','Cocoa','6 inch','confirmed',now()+interval '5 days');
select public.assign_extra_stock_to_order('80000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001');
do $$ begin
  if not exists(select 1 from public.extra_stock where id='80000000-0000-0000-0000-000000000001' and order_id='40000000-0000-0000-0000-000000000001' and sold_at is not null) then raise exception 'successful assignment missing stock link'; end if;
  if not exists(select 1 from public.orders where id='40000000-0000-0000-0000-000000000001' and extra_stock_id='80000000-0000-0000-0000-000000000001') then raise exception 'successful assignment missing primary order link'; end if;
  if (select count(*) from public.order_timeline_events where order_id='40000000-0000-0000-0000-000000000001' and event_type='extra_assigned')<>1 then raise exception 'timeline event missing'; end if;
  if (select count(*) from public.extra_stock_events where extra_stock_id='80000000-0000-0000-0000-000000000001' and event_type='assigned')<>1 then raise exception 'stock event missing'; end if;
end $$;

-- Zero valid cake/size matches and all terminal lifecycle states fail without writes.
insert into public.orders(id,order_number,status) values
('40000000-0000-0000-0000-000000000002','TEST-CAKE-MISMATCH','paid'),
('40000000-0000-0000-0000-000000000003','TEST-SIZE-MISMATCH','paid'),
('40000000-0000-0000-0000-000000000004','TEST-PICKUP-COMPLETE','completed'),
('40000000-0000-0000-0000-000000000005','TEST-DELIVERY-COMPLETE','completed'),
('40000000-0000-0000-0000-000000000006','TEST-CANCELLED','cancelled');
insert into public.order_items(id,order_id,cake_id,cake_size_id,cake_name,size_label,quantity) values
('50000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000002','60000000-0000-0000-0000-000000000002','70000000-0000-0000-0000-000000000001','Vanilla','6 inch',1),
('50000000-0000-0000-0000-000000000003','40000000-0000-0000-0000-000000000003','60000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000002','Cocoa','8 inch',1),
('50000000-0000-0000-0000-000000000004','40000000-0000-0000-0000-000000000004','60000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','Cocoa','6 inch',1),
('50000000-0000-0000-0000-000000000005','40000000-0000-0000-0000-000000000005','60000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','Cocoa','6 inch',1),
('50000000-0000-0000-0000-000000000006','40000000-0000-0000-0000-000000000006','60000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','Cocoa','6 inch',1);
update public.orders set picked_up_at=now() where id='40000000-0000-0000-0000-000000000004';
update public.orders set delivered_at=now() where id='40000000-0000-0000-0000-000000000005';
insert into public.extra_stock(id,library_cake_id,library_cake_size_id,cake_name,size_label,lifecycle,pickup_through_at)
select ('80000000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid,
  '60000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','Cocoa','6 inch','confirmed',now()+interval '5 days'
from generate_series(2,6) n;
select public.test_expect_rejected('80000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000002','no remaining cake line');
select public.test_expect_rejected('80000000-0000-0000-0000-000000000003','40000000-0000-0000-0000-000000000003','no remaining cake line');
select public.test_expect_rejected('80000000-0000-0000-0000-000000000004','40000000-0000-0000-0000-000000000004','cancelled or completed');
select public.test_expect_rejected('80000000-0000-0000-0000-000000000005','40000000-0000-0000-0000-000000000005','cancelled or completed');
select public.test_expect_rejected('80000000-0000-0000-0000-000000000006','40000000-0000-0000-0000-000000000006','cancelled or completed');

-- Physical allocation quantity is tracked per cake/size, including mixed orders.
insert into public.orders(id,order_number,status) values ('40000000-0000-0000-0000-000000000007','TEST-MULTI','paid');
insert into public.order_items(id,order_id,cake_id,cake_size_id,cake_name,size_label,quantity) values
('50000000-0000-0000-0000-000000000007','40000000-0000-0000-0000-000000000007','60000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','Cocoa','6 inch',2),
('50000000-0000-0000-0000-000000000008','40000000-0000-0000-0000-000000000007','60000000-0000-0000-0000-000000000002','70000000-0000-0000-0000-000000000002','Vanilla','8 inch',1);
insert into public.extra_stock(id,library_cake_id,library_cake_size_id,cake_name,size_label,lifecycle,pickup_through_at)
select ('81000000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid,
  case when n<4 then '60000000-0000-0000-0000-000000000001'::uuid else '60000000-0000-0000-0000-000000000002'::uuid end,
  case when n<4 then '70000000-0000-0000-0000-000000000001'::uuid else '70000000-0000-0000-0000-000000000002'::uuid end,
  case when n<4 then 'Cocoa' else 'Vanilla' end,
  case when n<4 then '6 inch' else '8 inch' end,'confirmed',now()+interval '5 days'
from generate_series(1,4) n;
select public.assign_extra_stock_to_order('81000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000007','20000000-0000-0000-0000-000000000001');
select public.assign_extra_stock_to_order('81000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000007','20000000-0000-0000-0000-000000000001');
select public.test_expect_rejected('81000000-0000-0000-0000-000000000003','40000000-0000-0000-0000-000000000007','All matching cake quantities');
select public.assign_extra_stock_to_order('81000000-0000-0000-0000-000000000004','40000000-0000-0000-0000-000000000007','20000000-0000-0000-0000-000000000001');
do $$ begin
  if (select count(*) from public.extra_stock where order_id='40000000-0000-0000-0000-000000000007')<>3 then raise exception 'multi-cake stock count wrong'; end if;
  if (select extra_stock_id from public.orders where id='40000000-0000-0000-0000-000000000007')<>'81000000-0000-0000-0000-000000000001' then raise exception 'legacy primary pointer changed unexpectedly'; end if;
end $$;

-- Duplicate stock, invalid primary links, expiry, cut stock and walk-in holds are rejected.
select public.test_expect_rejected('80000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','already been sold or assigned');
insert into public.orders(id,order_number,status) values ('40000000-0000-0000-0000-000000000008','TEST-HOLD','paid');
insert into public.order_items(id,order_id,cake_id,cake_size_id,cake_name,size_label,quantity) values ('50000000-0000-0000-0000-000000000009','40000000-0000-0000-0000-000000000008','60000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','Cocoa','6 inch',1);
insert into public.extra_stock(id,library_cake_id,library_cake_size_id,cake_name,size_label,lifecycle,pickup_through_at,walk_in_held_until)
values ('82000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','Cocoa','6 inch','confirmed',now()+interval '5 days',now()+interval '1 minute');
select public.test_expect_rejected('82000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000008','walk-in hold');
update public.extra_stock set walk_in_held_until=null, pickup_through_at=now()-interval '1 second' where id='82000000-0000-0000-0000-000000000001';
select public.test_expect_rejected('82000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000008','no longer available');

-- An inconsistent existing order allocation fails closed rather than stacking on it.
insert into public.orders(id,order_number,status) values ('40000000-0000-0000-0000-000000000011','TEST-CONFLICTING-LINK','paid');
insert into public.order_items(id,order_id,cake_id,cake_size_id,cake_name,size_label,quantity)
values ('50000000-0000-0000-0000-000000000012','40000000-0000-0000-0000-000000000011','60000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','Cocoa','6 inch',1);
insert into public.extra_stock(id,library_cake_id,library_cake_size_id,cake_name,size_label,lifecycle,pickup_through_at)
values ('82000000-0000-0000-0000-000000000002','60000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','Cocoa','6 inch','confirmed',now()+interval '5 days');
insert into public.extra_stock(id,library_cake_id,library_cake_size_id,cake_name,size_label,lifecycle,sold_at,order_id)
values ('82000000-0000-0000-0000-000000000003','60000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','Cocoa','6 inch','rejected',null,'40000000-0000-0000-0000-000000000011');
select public.test_expect_rejected('82000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000011','incomplete existing Fresh Pick allocation');

-- A failure after the stock/order updates still rolls the entire RPC back.
insert into public.orders(id,order_number,status) values ('40000000-0000-0000-0000-000000000012','TEST-LATE-FAILURE','paid');
insert into public.order_items(id,order_id,cake_id,cake_size_id,cake_name,size_label,quantity)
values ('50000000-0000-0000-0000-000000000013','40000000-0000-0000-0000-000000000012','60000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','Cocoa','6 inch',1);
insert into public.extra_stock(id,library_cake_id,library_cake_size_id,cake_name,size_label,lifecycle,pickup_through_at)
values ('82000000-0000-0000-0000-000000000004','60000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','Cocoa','6 inch','confirmed',now()+interval '5 days');
create function public.test_fail_late_stock_audit() returns trigger language plpgsql as $$
begin if new.extra_stock_id='82000000-0000-0000-0000-000000000004' then raise exception 'fixture late audit failure'; end if; return new; end $$;
create trigger test_fail_late_stock_audit before insert on public.extra_stock_events for each row execute function public.test_fail_late_stock_audit();
select public.test_expect_rejected('82000000-0000-0000-0000-000000000004','40000000-0000-0000-0000-000000000012','fixture late audit failure');
drop trigger test_fail_late_stock_audit on public.extra_stock_events;
drop function public.test_fail_late_stock_audit();

-- Unauthorized staff and anonymous callers fail before touching records.
select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000002',false);
select public.test_expect_rejected('80000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000002','Not authorized');
select set_config('request.jwt.claim.sub','',false);
select set_config('request.jwt.claim.role','anon',false);
select public.test_expect_rejected('80000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000002','Not authenticated');

do $$ begin
  if not has_function_privilege('authenticated','public.assign_extra_stock_to_order(uuid,uuid,uuid)','EXECUTE') then raise exception 'authenticated RPC grant missing'; end if;
  if has_function_privilege('anon','public.assign_extra_stock_to_order(uuid,uuid,uuid)','EXECUTE') then raise exception 'anonymous RPC grant unexpectedly exists'; end if;
end $$;

-- Prepare a separate eligible record for two-session concurrency testing.
insert into public.orders(id,order_number,status) values ('40000000-0000-0000-0000-000000000009','TEST-CONCURRENT-A','paid'),('40000000-0000-0000-0000-000000000010','TEST-CONCURRENT-B','paid');
insert into public.order_items(id,order_id,cake_id,cake_size_id,cake_name,size_label,quantity) values
('50000000-0000-0000-0000-000000000010','40000000-0000-0000-0000-000000000009','60000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','Cocoa','6 inch',1),
('50000000-0000-0000-0000-000000000011','40000000-0000-0000-0000-000000000010','60000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','Cocoa','6 inch',1);
insert into public.extra_stock(id,library_cake_id,library_cake_size_id,cake_name,size_label,lifecycle,pickup_through_at)
values ('83000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','Cocoa','6 inch','confirmed',now()+interval '5 days');
