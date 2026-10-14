"""Disposable PostgreSQL tests. Explicit loopback socket only; never loads .env.
Run: python3 scripts/test-cake-size-availability-db.py
Requires a scratch server at the hardcoded socket/port. Recreates only flour_size_availability_test.
Real guest/staff submission and pricing function bodies are loaded from repository migrations.
Other subsystems (hours/capacity/add-ons) are fixture stubs, not integration coverage.
"""
from pathlib import Path
import subprocess, re
ROOT = Path(__file__).resolve().parents[1]
PSQL = ['/opt/homebrew/bin/psql', '-X', '-h', '/private/tmp/flour-size-availability-pg-socket', '-p', '55439', '-U', 'ycwee', '-v', 'ON_ERROR_STOP=1']
def run(sql, db='postgres'):
    result = subprocess.run(PSQL + ['-d', db], input=sql, text=True, capture_output=True)
    if result.returncode:
        print(result.stdout); print(result.stderr); raise SystemExit(result.returncode)
    return result.stdout
def fn(file, name):
    text = (ROOT / 'supabase/migrations' / file).read_text()
    match = re.search(r'create or replace function public\.' + name + r'\([\s\S]*?\n\$\$;', text)
    assert match, name
    return match.group(0)
run('DROP DATABASE IF EXISTS flour_size_availability_test; CREATE DATABASE flour_size_availability_test ENCODING \'UTF8\' TEMPLATE template0;')
setup = """
do $$begin if not exists(select 1 from pg_roles where rolname='flour_fixture_anon') then create role flour_fixture_anon; end if; end$$;
create type public.fulfilment_method as enum ('pickup','delivery','dine_in','drive_through');
create table library_cakes(id uuid primary key, name text, status text);
create table library_cake_sizes(id uuid primary key, cake_id uuid references library_cakes, label text, price numeric, preorder_days int);
create table library_cake_size_prices(id uuid primary key default gen_random_uuid(), cake_size_id uuid, price numeric, effective_from date, effective_to date);
create table collections(id uuid primary key, status text, month date);
create table collection_cakes(collection_id uuid, library_cake_id uuid, available boolean);
create table staff_profiles(id uuid primary key);
create table orders(id uuid primary key default gen_random_uuid(), order_number text, customer_id uuid, guest_name text, guest_phone text, guest_email text,
fulfilment_method fulfilment_method, pickup_date date, pickup_time time, status text, payment_status text, customer_notes text, internal_notes text, collection_id uuid,
extra_stock_id uuid, confirmation_needs_resend boolean, order_source text, email_submission_receipt_requested boolean, include_receipt boolean,
pickup_instruction text, crew_order boolean, needs_bakery_attention boolean, bakery_attention_note text, created_by uuid, updated_by uuid);
create table order_items(id uuid primary key default gen_random_uuid(), order_id uuid references orders, cake_id uuid references library_cakes, cake_size_id uuid references library_cake_sizes,
quantity int, unit_price numeric, cake_name text, size_label text);
create table order_timeline_events(order_id uuid, event_type text, actor_staff_id uuid, metadata jsonb);
create table order_complimentary_items(order_id uuid, complimentary_item_type_id uuid, name text, quantity int, sort_order int);
create function current_delivery_processing_fee_default() returns numeric language sql as $$select 0::numeric$$;
create function earliest_preorder_collection_date(int, timestamptz) returns date language sql as $$select '2026-10-10'::date$$;
create function is_pickup_orders_closed(date) returns boolean language sql as $$select false$$;
create function is_valid_public_pickup_slot(date,time) returns boolean language sql as $$select true$$;
create function _guest_preorder_item_fully_booked(date,uuid,uuid,uuid,int) returns boolean language sql as $$select false$$;
create function storefront_collection_for_pickup_date(date) returns collections language sql as $$select c from collections c limit 1$$;
create function allocate_order_number() returns text language sql as $$select gen_random_uuid()::text$$;
create function _sync_order_paid_addons_from_payload(uuid,jsonb) returns int language sql as $$select 0$$;
create function _sync_order_fulfilment_from_payload(uuid,fulfilment_method,jsonb,jsonb) returns void language sql as $$select null::void$$;
insert into library_cakes values ('10000000-0000-0000-0000-000000000001','Thai Milk Tea Mango','active'), ('10000000-0000-0000-0000-000000000002','Other Cake','active');
insert into library_cake_sizes values
('20000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000001','4"',78,2),
('20000000-0000-0000-0000-000000000006','10000000-0000-0000-0000-000000000001','6"',125,2),
('20000000-0000-0000-0000-000000000008','10000000-0000-0000-0000-000000000001','8"',180,2);
insert into collections values ('30000000-0000-0000-0000-000000000001','active','2026-10-01');
insert into collection_cakes values ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',true);
insert into staff_profiles values ('40000000-0000-0000-0000-000000000001');
insert into orders(id, pickup_date, status) values ('50000000-0000-0000-0000-000000000001','2026-10-20','paid');
insert into order_items(order_id,cake_id,cake_size_id,quantity,unit_price,cake_name,size_label) values
('50000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000004',1,70,'Original Thai Milk Tea Mango','4"');
create table historical_snapshot as select row_to_json(o)::text as order_json, row_to_json(i)::text as item_json from orders o join order_items i on i.order_id=o.id;
"""
run(setup, 'flour_size_availability_test')
for name, file in [('library_cake_size_price_on','20260922120000_library_cake_size_prices.sql'), ('submit_guest_preorder','20260922180000_guest_preorder_delivery_processing_ack.sql'), ('create_staff_guest_preorder','20260922120000_library_cake_size_prices.sql')]:
    run(fn(file, name), 'flour_size_availability_test')
run((ROOT / 'supabase/migrations/20261010082912_cake_size_pickup_date_availability.sql').read_text(), 'flour_size_availability_test')
tests = r"""
create function test_assert(ok boolean, label text) returns void language plpgsql as $$begin if not coalesce(ok,false) then raise exception 'FAIL: %',label; end if; raise notice 'PASS: %',label; end$$;
create function expect_failure(query text, pattern text, label text) returns void language plpgsql as $$
begin
  begin execute query; exception when others then
    if sqlerrm not like pattern then raise exception 'Wrong failure for %: %',label,sqlerrm; end if;
    raise notice 'PASS: %',label; return;
  end;
  raise exception 'FAIL: % unexpectedly succeeded',label;
end$$;
create function guest(d date,s uuid default '20000000-0000-0000-0000-000000000004') returns orders language sql as $$
 select public.submit_guest_preorder('Fixture Customer','0123456789',null,d,'12:00',null,
 jsonb_build_array(jsonb_build_object('cake_id','10000000-0000-0000-0000-000000000001','cake_size_id',s,'quantity',1)));$$;
create function staff(d date) returns orders language sql as $$
select public.create_staff_guest_preorder('40000000-0000-0000-0000-000000000001','Fixture Customer','0123456789',null,'whatsapp',false,d,'12:00',null,
 '[{"cake_id":"10000000-0000-0000-0000-000000000001","cake_size_id":"20000000-0000-0000-0000-000000000004","quantity":1}]',
 '[]',false,false,null,null,null);$$;
select test_assert((guest('2026-10-20')).id is not null,'1 NULL dates accept real guest submission');
update library_cake_sizes set available_from='2026-11-01' where label='4"';
set role flour_fixture_anon;
select test_assert((guest('2026-11-01')).id is not null,'2 Available From inclusive / 7 November permitted / 8 October preorder for November (anonymous direct RPC)');
select expect_failure($q$select guest('2026-10-31')$q$,'%Available from 1 Nov 2026%','anonymous direct October RPC rejected');
reset role;
select expect_failure($q$select guest('2026-10-31')$q$,'%Available from 1 Nov 2026%','4/6 October rejected by real guest RPC');
select test_assert((guest('2026-10-20','20000000-0000-0000-0000-000000000006')).id is not null,'9 other Thai Milk Tea Mango sizes unchanged');
select test_assert((guest('2026-10-20','20000000-0000-0000-0000-000000000008')).id is not null,'9 8-inch unchanged');
update library_cake_sizes set available_until='2026-11-30' where label='4"';
select test_assert((guest('2026-11-30')).id is not null,'3 Available Until inclusive');
select expect_failure($q$select guest('2026-12-01')$q$,'%Available until 30 Nov 2026%','4 dates after range rejected');
select expect_failure($q$update library_cake_sizes set available_until='2026-10-31' where label='4"'$q$,'%library_cake_sizes_availability_range_check%','5 database rejects invalid range');
select expect_failure($q$select staff('2026-10-31')$q$,'%Available from 1 Nov 2026%','staff preorder and waiting-list shared creation path reject October');
select test_assert((staff('2026-11-01')).id is not null,'staff preorder accepts boundary');
select test_assert((select count(*) from orders where pickup_date='2026-10-31')=0,'13 rejected submission leaves no partial orders');
insert into orders(id,pickup_date,status) values ('50000000-0000-0000-0000-000000000002','2026-10-31','submitted');
select expect_failure($q$insert into order_items(order_id,cake_id,cake_size_id,quantity,unit_price) values ('50000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000004',1,0)$q$,'%Available from 1 Nov 2026%','12 direct stale cart insertion cannot bypass guard');
select expect_failure($q$insert into order_items(order_id,cake_id,cake_size_id,quantity,unit_price) values ('50000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000004',1,0)$q$,'%Cake size is not available%','direct request checks cake/size ownership');
select test_assert((select row_to_json(o)::text = h.order_json and row_to_json(i)::text = h.item_json from orders o join order_items i on o.id=i.order_id cross join historical_snapshot h where o.id='50000000-0000-0000-0000-000000000001'),'14 historical confirmed order and size snapshot unchanged');
select test_assert((select price from library_cake_sizes where label='4"')=78,'15 base price unchanged');
insert into library_cake_size_prices(cake_size_id,price,effective_from,effective_to) values ('20000000-0000-0000-0000-000000000004',88,'2026-11-01','2026-11-30');
select test_assert(library_cake_size_price_on('20000000-0000-0000-0000-000000000004','2026-10-31')=78,'15 price resolver still returns price independently of availability');
select test_assert(library_cake_size_price_on('20000000-0000-0000-0000-000000000004','2026-11-01')=88,'15 date-based pricing boundary unchanged');
select guest('2026-11-02');
select test_assert((select i.unit_price=88 from order_items i join orders o on o.id=i.order_id where o.pickup_date='2026-11-02'),'15 real guest order uses scheduled price');
update library_cake_sizes set available_from=null,available_until='2026-10-31' where label='4"';
select test_assert((guest('2026-10-31')).id is not null,'until-only boundary');
select expect_failure($q$select guest('2026-11-01')$q$,'%Available until 31 Oct 2026%','until-only outside range');
update library_cake_sizes set available_from=null,available_until=null where label='4"';
select test_assert((guest('2026-12-01')).id is not null,'clearing both dates restores unrestricted availability');
-- New physical-stock orders keep their existing rules, outside preorder guard.
insert into orders(id,pickup_date,status,extra_stock_id) values ('50000000-0000-0000-0000-000000000003','2026-10-31','submitted',gen_random_uuid());
update library_cake_sizes set available_from='2026-11-01' where label='4"';
insert into order_items(order_id,cake_id,cake_size_id,quantity,unit_price) values ('50000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000004',1,78);
select test_assert(true,'17 physical-stock insertion unaffected');
"""
result = subprocess.run(PSQL + ['-d','flour_size_availability_test'], input=tests, text=True, capture_output=True)
print(result.stderr)
if result.returncode: print(result.stdout)
raise SystemExit(result.returncode)
