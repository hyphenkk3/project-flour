"""Local-only amendment/ACL regression fixtures; never reads .env or remote credentials.
Extends the existing real guest/staff/pricing SQL fixture. Other workflows use
representative adapters, explicitly not hosted or complete business integration.
"""
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
s = (ROOT / 'scripts/test-cake-size-availability-db.py').read_text()
s = s.replace("ROOT = Path(__file__).resolve().parents[1]", "ROOT = Path(" + repr(str(ROOT)) + ")")
setup = r"""
do $$declare r text; begin foreach r in array array['anon','authenticated','service_role'] loop if not exists(select 1 from pg_roles where rolname=r) then execute format('create role %I',r); end if; end loop; end$$;
create type order_status as enum ('submitted','pending_confirmation','awaiting_payment','paid','cancelled','completed');
create type payment_status as enum ('unpaid','paid');
create type dine_in_venue as enum ('whitebird','hyphen');
alter table orders alter column status type order_status using status::order_status, alter column payment_status type payment_status using payment_status::payment_status;
alter table orders add column updated_at timestamptz default now(), add column post_payment_customer_change_count integer default 0;
alter table order_complimentary_items add column id uuid default gen_random_uuid();
create table extra_stock(id uuid primary key,order_id uuid references orders,library_cake_id uuid,library_cake_size_id uuid,lifecycle text,cut_into_slices_at timestamptz);
create table order_delivery_details(id uuid default gen_random_uuid(),order_id uuid,recipient_name text,recipient_phone text,address_line_1 text,address_line_2 text,postcode text,city text,state text,recipient_notify_preference text,created_at timestamptz,updated_at timestamptz);
create table order_dine_in_reservations(order_id uuid,reservation_date date,reservation_time time,venue dine_in_venue,guest_count int,adult_count int,kid_count int,toddler_count int,whitebird_split_seating_acknowledged boolean,reservation_note text);
create table order_confirmation_snapshots(id uuid default gen_random_uuid(),order_id uuid,lifecycle_status text,version int,outdated_at timestamptz);
create table fixture_addons(order_id uuid primary key,payload jsonb);
create function _bind_rpc_actor(id uuid) returns uuid language plpgsql as $$begin if current_setting('flour.actor',true) is distinct from id::text then raise exception 'Not authorized'; end if; return id; end$$;
create function _staff_role_code(id uuid) returns text language sql as $$select coalesce(nullif(current_setting('flour.role',true),''),'owner')$$;
create function _operations_approval_paid_addons_snapshot(id uuid) returns jsonb language sql as $$select coalesce((select payload from fixture_addons where order_id=id),'[]')$$;
create function sync_guest_order_paid_addons(id uuid,p jsonb) returns void language plpgsql as $$begin if p='[{"fail":true}]'::jsonb then raise exception 'Fixture add-on rejection'; end if; insert into fixture_addons values(id,p) on conflict(order_id) do update set payload=excluded.payload; end$$;
create function sync_guest_order_fulfilment(id uuid,m fulfilment_method,p jsonb) returns void language plpgsql as $$begin if p->>'fail'='true' then raise exception 'Fixture fulfilment rejection'; end if; update orders set fulfilment_method=m where orders.id=sync_guest_order_fulfilment.id; end$$;
create function guard_post_payment_customer_change(id uuid,actor uuid,overr boolean) returns jsonb language plpgsql as $$begin if not overr and exists(select 1 from orders where orders.id=guard_post_payment_customer_change.id and post_payment_customer_change_count>=1) then raise exception 'Change already used'; end if; update orders set post_payment_customer_change_count=1 where orders.id=guard_post_payment_customer_change.id; insert into order_timeline_events values(id,'post_payment_customer_change',actor,'{}'); return '{}'; end$$;
create function order_amount_due(id uuid) returns numeric language sql as $$select coalesce(sum(quantity*unit_price),0) from order_items where order_id=$1$$;
create function order_net_received(id uuid) returns numeric language sql as $$select case when status='paid' then 70 else 0 end from orders where orders.id=order_net_received.id$$;
truncate historical_snapshot; insert into historical_snapshot select row_to_json(o)::text,row_to_json(i)::text from orders o join order_items i on i.order_id=o.id;
grant execute on function enforce_preorder_size_availability() to anon,authenticated,service_role;
create table other_acl_before as select oid,proacl::text acl from pg_proc where oid<>'enforce_preorder_size_availability()'::regprocedure;
"""
setup=setup.replace('language sql as', 'language sql set search_path=public as').replace('language plpgsql as', 'language plpgsql set search_path=public as')
s=s.replace('tests = r"""', "run(" + repr(setup) + ", 'flour_size_availability_test')\n" + "run((ROOT / 'supabase/migrations/20261010103300_cake_size_availability_trigger_acl_hardening.sql').read_text(), 'flour_size_availability_test')\n" + "run((ROOT / 'supabase/migrations/20261010104124_cake_size_order_amendment_safety.sql').read_text(), 'flour_size_availability_test')\n" + 'tests = r"""')
# Stock linking happens after item insertion in actual Fresh Pick checkout.
s=s.replace("insert into orders(id,pickup_date,status,extra_stock_id) values ('50000000-0000-0000-0000-000000000003','2026-10-31','submitted',gen_random_uuid());", "begin; insert into extra_stock values('60000000-0000-0000-0000-000000000003',null,'10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000004','confirmed',null); insert into orders(id,pickup_date,status,extra_stock_id) values ('50000000-0000-0000-0000-000000000003','2026-10-31','submitted','60000000-0000-0000-0000-000000000003');")
s=s.replace("select test_assert(true,'17 physical-stock insertion unaffected');", "update extra_stock set order_id='50000000-0000-0000-0000-000000000003'; commit; select test_assert(true,'17 linked physical stock outside preorder window permitted');")
extra=r"""
select test_assert(has_function_privilege(current_user,'enforce_preorder_size_availability()','EXECUTE'),'ACL owner retains EXECUTE');
select test_assert(not has_function_privilege('anon','enforce_preorder_size_availability()','EXECUTE') and not has_function_privilege('authenticated','enforce_preorder_size_availability()','EXECUTE') and not has_function_privilege('service_role','enforce_preorder_size_availability()','EXECUTE'),'ACL API roles revoked');
select test_assert(not exists(select 1 from other_acl_before b join pg_proc p on p.oid=b.oid where b.acl is distinct from p.proacl::text),'unrelated function ACLs unchanged');
select expect_failure($q$update orders set pickup_date='2026-10-30' where pickup_date='2026-11-02'$q$,'%Available from 1 Nov 2026%','A November-to-October date UPDATE rejected');
select expect_failure($q$update order_items i set cake_size_id='20000000-0000-0000-0000-000000000004' from orders o where i.order_id=o.id and o.pickup_date='2026-10-20' and i.cake_size_id='20000000-0000-0000-0000-000000000006'$q$,'%Available from 1 Nov 2026%','A October 6-to-4 size UPDATE rejected');
select expect_failure($q$update order_items set order_id='50000000-0000-0000-0000-000000000002' where cake_size_id='20000000-0000-0000-0000-000000000004' and order_id in(select id from orders where pickup_date='2026-11-01')$q$,'%Available from 1 Nov 2026%','A item-to-order reassignment rejected');
create table retained_snapshot as select row_to_json(i)::text snapshot from order_items i where order_id='50000000-0000-0000-0000-000000000001';
select sync_guest_order_items('50000000-0000-0000-0000-000000000001',(select jsonb_agg(to_jsonb(i)||jsonb_build_object('unit_price',999,'cake_name','Today name','size_label','Today size')) from order_items i where order_id='50000000-0000-0000-0000-000000000001'));
select test_assert((select row_to_json(i)::text=s.snapshot from order_items i cross join retained_snapshot s where order_id='50000000-0000-0000-0000-000000000001'),'B historical paid selection IDs prices and snapshots preserved');
select set_config('flour.actor','40000000-0000-0000-0000-000000000001',false);
create function plan(id uuid,d date default null,s uuid default null) returns jsonb language sql as $$select jsonb_build_object('expected_pickup_date',o.pickup_date,'order',jsonb_build_object('pickup_date',coalesce(d,o.pickup_date),'internal_notes','Updated unrelated note'),'items',(select jsonb_agg(to_jsonb(i)||case when s is null then '{}'::jsonb else jsonb_build_object('cake_size_id',s) end) from order_items i where i.order_id=o.id),'complimentary','[]'::jsonb,'paid_addons','[]'::jsonb,'post_payment_override',false,'pickup_month_override',true) from orders o where o.id=plan.id$$;
select save_guest_order_workspace_atomic('50000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001',plan('50000000-0000-0000-0000-000000000001'));
select test_assert((select internal_notes='Updated unrelated note' and post_payment_customer_change_count=0 from orders where id='50000000-0000-0000-0000-000000000001'),'B confirmed unrelated edit succeeds without consuming customer change');
create table atomic_before as select row_to_json(o)::text snapshot from orders o where id='50000000-0000-0000-0000-000000000001';
select expect_failure($q$select save_guest_order_workspace_atomic('50000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001',plan('50000000-0000-0000-0000-000000000001','2026-10-30'))$q$,'%Available from 1 Nov 2026%','C invalid retained date rolls back atomic staff save');
select test_assert((select row_to_json(o)::text=b.snapshot from orders o cross join atomic_before b where o.id='50000000-0000-0000-0000-000000000001'),'C no partial date notes payment count or order update');
select expect_failure($q$select save_guest_order_workspace_atomic('50000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001',plan('50000000-0000-0000-0000-000000000001')||'{"paid_addons":[{"fail":true}]}'::jsonb)$q$,'%Fixture add-on rejection%','C ancillary rejection rolls back entire save');
select test_assert((select row_to_json(o)::text=b.snapshot from orders o cross join atomic_before b where o.id='50000000-0000-0000-0000-000000000001'),'C ancillary rollback preserves order');
select expect_failure($q$select save_guest_order_workspace_atomic('50000000-0000-0000-0000-000000000001',gen_random_uuid(),plan('50000000-0000-0000-0000-000000000001'))$q$,'%Not authorized%','actor impersonation rejected');
select set_config('flour.role','bakery',false);
select expect_failure($q$select save_guest_order_workspace_atomic('50000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001',plan('50000000-0000-0000-0000-000000000001'))$q$,'%Not authorized%','unauthorized staff save rejected');
select set_config('flour.role','owner',false);
select expect_failure($q$update orders set extra_stock_id='60000000-0000-0000-0000-000000000003' where id='50000000-0000-0000-0000-000000000001'$q$,'%Fresh Pick requires legitimate stock linked to this order%','Fresh Pick marker impersonation rejected');
select expect_failure($q$update order_items set quantity=2 where order_id='50000000-0000-0000-0000-000000000003'$q$,'%Fresh Pick items must match linked physical stock%','Fresh Pick quantity cannot exceed physical stock');
select expect_failure($q$insert into order_items(order_id,cake_id,cake_size_id,quantity,unit_price) values('50000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000006',1,125)$q$,'%Fresh Pick items must match linked physical stock%','Fresh Pick mismatched size impersonation rejected');
update orders set pickup_date='2026-10-20',internal_notes='Fresh Pick fulfilment amendment' where id='50000000-0000-0000-0000-000000000003';
select test_assert(true,'linked Fresh Pick date/fulfilment edits outside preorder period permitted');
create function fixture_voucher(d date) returns orders language sql security definer as $$select guest(d)$$;
create function fixture_waiting_list(d date) returns orders language sql security definer as $$select staff(d)$$;
set role anon;
select test_assert((fixture_voucher('2026-11-01')).id is not null,'voucher shared guest creation after hardening');
select expect_failure($q$select fixture_voucher('2026-10-31')$q$,'%Available from 1 Nov 2026%','voucher shared October creation rejected');
reset role;
set role authenticated;
select test_assert((fixture_waiting_list('2026-11-01')).id is not null,'waiting-list shared staff creation after hardening');
select expect_failure($q$select fixture_waiting_list('2026-10-31')$q$,'%Available from 1 Nov 2026%','waiting-list shared October creation rejected');
reset role;

-- Pending-order valid combined date/selection change and invalid atomic change.
select guest('2026-10-21','20000000-0000-0000-0000-000000000006');
create table pending_before as select row_to_json(o)::text snapshot,id from orders o where pickup_date='2026-10-21';
select expect_failure($q$select save_guest_order_workspace_atomic(id,'40000000-0000-0000-0000-000000000001',plan(id,null,'20000000-0000-0000-0000-000000000004')) from pending_before$q$,'%Available from 1 Nov 2026%','C October new 4-inch atomic selection rejected');
select test_assert((select row_to_json(o)::text=b.snapshot from orders o join pending_before b using(id)),'C invalid new selection leaves whole order unchanged');
select save_guest_order_workspace_atomic(id,'40000000-0000-0000-0000-000000000001',plan(id,'2026-11-01','20000000-0000-0000-0000-000000000004')) from pending_before;
select test_assert((select o.pickup_date='2026-11-01' and i.cake_size_id='20000000-0000-0000-0000-000000000004' from orders o join pending_before b using(id) join order_items i on i.order_id=o.id),'valid combined date and new selection succeed atomically');
update library_cake_sizes set available_until='2026-11-30' where label='4"';
select expect_failure($q$update orders set pickup_date='2026-12-01' where id in(select id from pending_before)$q$,'%Available until 30 Nov 2026%','UPDATE end boundary enforced');
update orders set pickup_date='2026-11-30' where id in(select id from pending_before);
select test_assert(true,'UPDATE end boundary inclusive');
update library_cake_sizes set available_until=null where label='4"';
-- Retained snapshots survive an eligible date change; customer counter/audit stay atomic.
insert into order_confirmation_snapshots(order_id,lifecycle_status,version) values('50000000-0000-0000-0000-000000000001','sent',1);
select save_guest_order_workspace_atomic('50000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001',plan('50000000-0000-0000-0000-000000000001','2026-11-01'));
select test_assert((select post_payment_customer_change_count=1 and status='paid' and confirmation_needs_resend from orders where id='50000000-0000-0000-0000-000000000001'),'confirmed eligible date change consumes guard and preserves paid status');
select test_assert((select lifecycle_status='outdated' from order_confirmation_snapshots where order_id='50000000-0000-0000-0000-000000000001'),'confirmation invalidation in same transaction');
select test_assert((select row_to_json(i)::text=s.snapshot from order_items i cross join retained_snapshot s where order_id='50000000-0000-0000-0000-000000000001'),'eligible date change preserves historical price and item snapshot');
select expect_failure($q$select save_guest_order_workspace_atomic('50000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001',jsonb_set(plan('50000000-0000-0000-0000-000000000001'),'{order,guest_name}','"Changed customer"'))$q$,'%Change already used%','used post-payment guard remains enforced');
select test_assert((select guest_name is null from orders where id='50000000-0000-0000-0000-000000000001'),'guard rejection rolls back customer details');
select expect_failure($q$select save_guest_order_workspace_atomic('50000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001',plan('50000000-0000-0000-0000-000000000001','2026-10-25')||'{"post_payment_override":true}'::jsonb)$q$,'%Available from 1 Nov 2026%','Owner post-payment override cannot bypass date eligibility');
select save_guest_order_workspace_atomic('50000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001',jsonb_set(plan('50000000-0000-0000-0000-000000000001',null,'20000000-0000-0000-0000-000000000006'),'{items,0,unit_price}','125')||'{"post_payment_override":true}'::jsonb);
select test_assert((select status='awaiting_payment' and payment_status='unpaid' from orders where id='50000000-0000-0000-0000-000000000001'),'authorized price amendment reconciles remaining payment');
select test_assert(exists(select 1 from order_timeline_events where order_id='50000000-0000-0000-0000-000000000001' and event_type='order_updated' and metadata->>'new_amount_due'='125' and metadata->>'net_received'='70'),'payment audit retains amount due and net received');
-- Direct authenticated updates use the same guard under representative RLS.
grant select,update on orders,order_items,library_cakes,library_cake_sizes to authenticated;
alter table orders enable row level security; alter table order_items enable row level security;
create policy fixture_staff_orders on orders to authenticated using(true) with check(true);
create policy fixture_staff_items on order_items to authenticated using(true) with check(true);
set role authenticated;
select expect_failure($q$update orders set pickup_date='2026-10-25' where pickup_date='2026-11-30'$q$,'%Available from 1 Nov 2026%','direct authenticated/RLS date UPDATE protected');
reset role;
-- Confirmed physical units are independently sellable before preorder start.
begin;
insert into extra_stock values('60000000-0000-0000-0000-000000000004',null,'10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000004','confirmed',null),('60000000-0000-0000-0000-000000000005',null,'10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000004','confirmed',null);
insert into orders(id,pickup_date,status,extra_stock_id) values('50000000-0000-0000-0000-000000000005','2026-10-20','submitted','60000000-0000-0000-0000-000000000004');
insert into order_items(order_id,cake_id,cake_size_id,quantity,unit_price) values('50000000-0000-0000-0000-000000000005','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000004',2,78);
update extra_stock set order_id='50000000-0000-0000-0000-000000000005' where id in('60000000-0000-0000-0000-000000000004','60000000-0000-0000-0000-000000000005');
commit;
select test_assert(true,'Fresh Pick stock creation and two-unit checkout outside preorder dates');
-- Separate old rows with different prices must survive an unrelated sync.
begin;
update library_cake_sizes set available_from=null where label='6"';
insert into order_items(order_id,cake_id,cake_size_id,quantity,unit_price,cake_name,size_label) values('50000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000006',1,100,'Older price','6"');
commit;
create table duplicate_snapshot as select row_to_json(i)::text snapshot from order_items i where order_id='50000000-0000-0000-0000-000000000001';
select sync_guest_order_items('50000000-0000-0000-0000-000000000001','[{"cake_id":"10000000-0000-0000-0000-000000000001","cake_size_id":"20000000-0000-0000-0000-000000000006","quantity":2,"unit_price":999,"cake_name":"Ignore today name","size_label":"6 inch"}]');
select test_assert((select count(*)=2 from order_items i join duplicate_snapshot d on row_to_json(i)::text=d.snapshot where order_id='50000000-0000-0000-0000-000000000001'),'all duplicate historical snapshots preserved unchanged');

update orders set status='paid',post_payment_customer_change_count=0 where id='50000000-0000-0000-0000-000000000001';
select save_guest_order_workspace_atomic('50000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001',
 jsonb_set(plan('50000000-0000-0000-0000-000000000001'),'{items}',(select jsonb_agg(jsonb_build_object('item_id',id,'cake_id',cake_id,'cake_size_id',cake_size_id,'quantity',quantity,'unit_price',unit_price,'cake_name',cake_name,'size_label',size_label)) from order_items where order_id='50000000-0000-0000-0000-000000000001')));
select test_assert((select post_payment_customer_change_count=0 from orders where id='50000000-0000-0000-0000-000000000001'),'unchanged paid duplicate rows allow unrelated atomic edit without override');
select sync_guest_order_items('50000000-0000-0000-0000-000000000001',
 (select jsonb_agg(jsonb_build_object('item_id',id,'cake_id',cake_id,'cake_size_id',cake_size_id,'quantity',case when unit_price=100 then 2 else quantity end,'unit_price',999,'cake_name','Ignore','size_label','Ignore')) from order_items where order_id='50000000-0000-0000-0000-000000000001'));
select test_assert((select quantity=2 and cake_name='Older price' from order_items where order_id='50000000-0000-0000-0000-000000000001' and unit_price=100),'chosen historical row quantity changes with original price and snapshot');
select test_assert((select quantity=1 from order_items where order_id='50000000-0000-0000-0000-000000000001' and unit_price=125),'other historical row remains unchanged');
select expect_failure($q$select sync_guest_order_items('50000000-0000-0000-0000-000000000001','[{"cake_id":"10000000-0000-0000-0000-000000000001","cake_size_id":"20000000-0000-0000-0000-000000000006","quantity":4,"unit_price":999,"cake_name":"Fixture","size_label":"6 inch"}]')$q$,'%Choose the specific historical row%','ambiguous historical quantity changes require row choice');
select expect_failure($q$select sync_guest_order_items('50000000-0000-0000-0000-000000000001','[{"item_id":"90000000-0000-0000-0000-000000000099","cake_id":"10000000-0000-0000-0000-000000000001","cake_size_id":"20000000-0000-0000-0000-000000000006","quantity":1,"unit_price":999,"cake_name":"Fixture","size_label":"6 inch"}]')$q$,'%Historical item does not belong%','foreign historical row identity rejected');

"""
s=s.replace("begin execute query; exception", "begin execute query; set constraints all immediate; exception")
s=s.replace('\nresult = subprocess.run(PSQL', '\ntests += '+repr(extra)+'\nresult = subprocess.run(PSQL')
exec(compile(s,'amendment-fixture','exec'))
