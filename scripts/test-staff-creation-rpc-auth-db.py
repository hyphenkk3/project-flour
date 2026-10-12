"""Disposable Unix-socket-only authorization tests. No env/credentials/network.
Real RPC bodies; ancillary add-on/fulfilment helpers are representative stubs.
"""
from pathlib import Path
import re, subprocess
ROOT=Path(__file__).resolve().parents[1]
s=(ROOT/'scripts/test-cake-size-availability-db.py').read_text().split('tests = r"""')[0]
s=s.replace('flour_size_availability_test','flour_staff_rpc_auth_test')
exec(compile(s,'local-base-fixture','exec'))
DB='flour_staff_rpc_auth_test'
run("""
do $$declare r text; begin foreach r in array array['postgres','anon','authenticated','service_role'] loop if not exists(select 1 from pg_roles where rolname=r) then execute format('create role %I',r); end if; end loop; end$$;
alter role postgres superuser;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema public,auth to anon,authenticated,service_role;
grant execute on function auth.uid() to public;
create table roles(id uuid primary key,code text unique);
alter table staff_profiles add column auth_user_id uuid unique, add column role_id uuid references roles, add column is_active boolean default true;
truncate staff_profiles;
create type dine_in_venue as enum ('whitebird','hyphen');
create table extra_stock(id uuid primary key default gen_random_uuid(),lifecycle text,cake_name text,size_label text,library_cake_id uuid,library_cake_size_id uuid,prepared_on date,pickup_available_from_at timestamptz,pickup_through_at timestamptz,note text,proposed_at timestamptz,proposed_by uuid,confirmed_at timestamptz,confirmed_by uuid);
create function _staff_role_code(uuid) returns text language sql as $$select r.code from staff_profiles s join roles r on r.id=s.role_id where s.id=$1$$;
""",DB)
run(fn('20260817140000_extra_pickup_from_order_cutoff.sql','_pickup_slot_in_weekly_hours'),DB)
run(fn('20260817140000_extra_pickup_from_order_cutoff.sql','_assert_fresh_picks_confirm_window'),DB)
run(fn('20260817140000_extra_pickup_from_order_cutoff.sql','create_confirmed_extra_stock'),DB)

run("""
create table waiting_list_requests(id uuid primary key,guest_name text,guest_phone text,created_by_staff_id uuid,converted_order_id uuid,pickup_date date,status text);
create table waiting_list_items(id uuid primary key,request_id uuid,library_cake_id uuid,library_cake_size_id uuid,pickup_date date,status text,remaining_quantity int,accepted_quantity int,converted_order_id uuid);
alter table waiting_list_items add column quantity int not null default 1;
create function fixture_sync_waiting_list_remaining() returns trigger language plpgsql as $$begin new.remaining_quantity := new.quantity-new.accepted_quantity; return new; end$$;
create trigger fixture_waiting_list_remaining before insert or update of quantity,accepted_quantity on waiting_list_items for each row execute function fixture_sync_waiting_list_remaining();
create table production_capacity_holds(id uuid primary key,waiting_list_item_id uuid,status text,held_at timestamptz,held_until timestamptz,quantity int,converted_order_id uuid,released_at timestamptz);
create table waiting_list_confirmation_links(id uuid primary key,request_id uuid,status text,expires_at timestamptz,issued_at timestamptz,converted_order_id uuid,submitted_payload jsonb,item_snapshot jsonb);
create table waiting_list_events(request_id uuid,item_id uuid,event_type text,actor uuid,metadata jsonb);
create function _waiting_list_item_has_submitted_confirmation(uuid) returns boolean language sql as $$select false$$;
create function _waiting_list_append_event(uuid,uuid,text,uuid,jsonb) returns void language sql set search_path=public as $$insert into waiting_list_events values($1,$2,$3,$4,$5)$$;
create function _waiting_list_sync_request_status(uuid) returns void language sql as $$select null::void$$;
""",DB)
for name in ['_waiting_list_can_manage','_waiting_list_assert_manage_staff']:
    run(fn('20260903120000_waiting_list_engine.sql',name),DB)
for name in ['waiting_list_convert_item','waiting_list_convert_confirmation']:
    run(fn('20260921100000_waiting_list_confirmation_conversion_state.sql',name),DB)

for name in ['create_staff_guest_preorder','create_confirmed_extra_stock','waiting_list_convert_item','waiting_list_convert_confirmation']:
    run("do $$declare x regprocedure; begin select oid::regprocedure into x from pg_proc where proname='"+name+"'; execute format('alter function %s owner to postgres',x); execute format('grant execute on function %s to anon, authenticated, service_role',x); end$$;",DB)
run("create table acl_before as select oid,proacl::text acl from pg_proc where proname not in ('create_staff_guest_preorder','create_confirmed_extra_stock','waiting_list_convert_item','waiting_list_convert_confirmation');",DB)
run("do $$declare x regprocedure; begin for x in select oid::regprocedure from pg_proc where pronamespace='public'::regnamespace and proname in ('storefront_collection_for_pickup_date','_staff_role_code') loop execute format('alter function %s set search_path=public',x); end loop; end$$;",DB)
migration=(ROOT/'supabase/migrations/20261011100225_staff_creation_rpc_actor_authorization.sql').read_text()
# Deliberately differ a reviewed owner: the entire single-file transaction must refuse.
run("alter function public.waiting_list_convert_confirmation(uuid,uuid) owner to ycwee;",DB)
probe=subprocess.run(PSQL+['-d',DB],input=migration,text=True,capture_output=True)
assert probe.returncode!=0 and 'Unreviewed waiting_list_convert_confirmation' in probe.stderr,probe.stderr
assert 't' in run("select to_regnamespace('staff_preorder_private') is null",DB)
run("alter function public.waiting_list_convert_confirmation(uuid,uuid) owner to postgres;",DB)
broken=migration.replace('commit;',"do $$begin raise exception 'synthetic late migration failure'; end$$; commit;")
probe=subprocess.run(PSQL+['-d',DB],input=broken,text=True,capture_output=True)
assert probe.returncode!=0 and 'synthetic late migration failure' in probe.stderr,probe.stderr
assert 't' in run("select to_regnamespace('staff_preorder_private') is null",DB)
run(migration,DB)
print('PASS migration refuses changed baseline without partial installation')
def uid(i):return f'70000000-0000-0000-0000-{i:012d}'
def actor(i):return f'40000000-0000-0000-0000-{i:012d}'
for i,role in enumerate(['owner','manager','bakery','customer_operations','other','owner'],1):
    run(f"insert into roles values ('{uid(i)}','{role}') on conflict(code) do nothing; insert into staff_profiles select '{actor(i)}','{uid(i)}',id,{str(i!=6).lower()} from roles where code='{role}';",DB)
CAKE='10000000-0000-0000-0000-000000000001'; SIZE='20000000-0000-0000-0000-000000000004'
def preorder(a,d='2026-11-01',q=1):return f"select public.create_staff_guest_preorder('{a}','Synthetic','0123456789',null,'whatsapp',false,'{d}','12:00',null,'[{{\"cake_id\":\"{CAKE}\",\"cake_size_id\":\"{SIZE}\",\"quantity\":{q}}}]','[]',false,false,null,null,null)"
def stock(a):return f"select public.create_confirmed_extra_stock('{a}','Synthetic','4 inch',current_date,(date_trunc('day',now() at time zone 'Asia/Singapore')+interval '1 day 12 hours') at time zone 'Asia/Singapore',(date_trunc('day',now() at time zone 'Asia/Singapore')+interval '1 day 13 hours') at time zone 'Asia/Singapore',null,'{CAKE}','{SIZE}')"
count=0
def check(role,identity,query,ok,label,pattern=None):
    global count
    before=run("select jsonb_build_array((select jsonb_agg(to_jsonb(t)) from orders t),(select jsonb_agg(to_jsonb(t)) from order_items t),(select jsonb_agg(to_jsonb(t)) from extra_stock t),(select jsonb_agg(to_jsonb(t)) from order_timeline_events t),(select jsonb_agg(to_jsonb(t)) from waiting_list_requests t),(select jsonb_agg(to_jsonb(t)) from waiting_list_items t),(select jsonb_agg(to_jsonb(t)) from production_capacity_holds t),(select jsonb_agg(to_jsonb(t)) from waiting_list_confirmation_links t),(select jsonb_agg(to_jsonb(t)) from waiting_list_events t))",DB)
    sql=f"set role {role}; select set_config('request.jwt.claim.sub','{identity}',false); {query};"
    res=subprocess.run(PSQL+['-d',DB],input=sql,text=True,capture_output=True)
    assert (res.returncode==0)==ok,(label,res.stderr)
    if pattern:assert pattern in res.stderr,(label,res.stderr)
    if not ok:assert before==run("select jsonb_build_array((select jsonb_agg(to_jsonb(t)) from orders t),(select jsonb_agg(to_jsonb(t)) from order_items t),(select jsonb_agg(to_jsonb(t)) from extra_stock t),(select jsonb_agg(to_jsonb(t)) from order_timeline_events t),(select jsonb_agg(to_jsonb(t)) from waiting_list_requests t),(select jsonb_agg(to_jsonb(t)) from waiting_list_items t),(select jsonb_agg(to_jsonb(t)) from production_capacity_holds t),(select jsonb_agg(to_jsonb(t)) from waiting_list_confirmation_links t),(select jsonb_agg(to_jsonb(t)) from waiting_list_events t))",DB),label+' partial writes'
    count+=1;print('PASS',label)
for name,call,allowed in [('preorder',preorder,{1,2,4}),('stock',stock,{1,2,3})]:
    for role,identity,a,label in [('anon','',actor(1),'anonymous'),('authenticated',uid(99),actor(1),'customer'),('authenticated','',actor(1),'missing identity'),('authenticated',uid(1),actor(2),'wrong actor'),('authenticated',uid(4),actor(1),'forged owner'),('authenticated',uid(6),actor(6),'inactive'),('authenticated',uid(5),actor(5),'insufficient role'),('service_role','',actor(1),'service without identity')]:
        check(role,identity,call(a),False,name+' '+label)
    for i in range(1,5):check('authenticated',uid(i),call(actor(i)),i in allowed,name+' actual role '+str(i))
run(f"update library_cake_sizes set available_from='2026-11-01' where id='{SIZE}'; insert into library_cake_size_prices(cake_size_id,price,effective_from) values('{SIZE}',90,'2026-11-01');",DB)
check('authenticated',uid(1),preorder(actor(1),'2026-10-31'),False,'October rejected','Available from')
check('authenticated',uid(1),preorder(actor(1),'2026-11-01'),True,'inclusive November accepted')
check('authenticated',uid(1),preorder(actor(1),q=0),False,'quantity rejection')
check('authenticated',uid(3),stock(actor(3)),True,'bakery physical stock outside preorder window')
assert run("select count(*) from order_items where unit_price=90",DB).splitlines()[2].strip()!='0'
assert 't' in run("select not exists(select 1 from orders where created_by is distinct from updated_by and created_by is not null)",DB)
assert 't' in run("select not exists(select 1 from acl_before a join pg_proc p on p.oid=a.oid where a.acl is distinct from p.proacl::text)",DB)
print(f'{count} authorization cases PASS; pricing/audit/unrelated ACL checks PASS')

check('authenticated','not-a-uuid',preorder(actor(1)),False,'malformed Auth identity')
check('authenticated',uid(1),preorder(actor(1)).replace("'"+actor(1)+"'",'NULL',1),False,'missing actor ID')
assert 't' in run("select not exists(select 1 from historical_snapshot h join orders o on o.id='50000000-0000-0000-0000-000000000001' join order_items i on i.order_id=o.id where h.order_json<>row_to_json(o)::text or h.item_json<>row_to_json(i)::text)",DB)
print('Historical snapshots unchanged')

check('authenticated','not-a-uuid',stock(actor(1)),False,'stock malformed Auth identity')
check('authenticated',uid(1),stock(actor(1)).replace("'"+actor(1)+"'",'NULL',1),False,'stock missing actor ID')
def scalar(sql):
    p=subprocess.run(PSQL+['-d',DB,'-At'],input=sql,text=True,capture_output=True)
    assert p.returncode==0,p.stderr
    return p.stdout.strip()
assert scalar("select count(*)=4 from pg_proc where proname in ('create_staff_guest_preorder','create_confirmed_extra_stock','waiting_list_convert_item','waiting_list_convert_confirmation') and prosecdef and pg_get_userbyid(proowner)='postgres' and proconfig=array['search_path=\"\"']")=='t'
for name in ['create_staff_guest_preorder','create_confirmed_extra_stock']:
    for role in ['anon','service_role']:
        assert scalar(f"select not has_function_privilege('{role}',oid,'EXECUTE') from pg_proc where proname='{name}'")=='t'
    assert scalar(f"select has_function_privilege('postgres',oid,'EXECUTE') and has_function_privilege('authenticated',oid,'EXECUTE') from pg_proc where proname='{name}'")=='t'
assert scalar("select not exists(select 1 from extra_stock where proposed_by is distinct from confirmed_by or confirmed_by not in (select id from staff_profiles where is_active))")=='t'
print(f'{count} authorization cases PASS; owner/ACL/search_path/stock attribution PASS')

# Actual conversion wrapper bodies, with minimal ancillary schema/helper fixtures.
import uuid,json
def waiting_fixture(d='2026-11-01',quantity=1,hold_quantity=None):
    req,item,hold,link=[str(uuid.uuid4()) for _ in range(4)]
    held=hold_quantity if hold_quantity is not None else 1
    payload=json.dumps({'customer_name':'Synthetic','phone':'0123456789','pickup_date':d,'pickup_time':'12:00','fulfilment_method':'pickup','unit_price':999})
    snap=json.dumps([{'waiting_list_item_id':item,'cake_id':CAKE,'cake_size_id':SIZE,'offered_quantity':quantity}])
    run(f"insert into waiting_list_requests values('{req}','Synthetic','0123456789','{actor(1)}',null,'{d}','accepted'); insert into waiting_list_items(id,request_id,library_cake_id,library_cake_size_id,pickup_date,status,remaining_quantity,accepted_quantity,converted_order_id,quantity) values('{item}','{req}','{CAKE}','{SIZE}','{d}','accepted',{quantity},0,null,{quantity}); insert into production_capacity_holds values('{hold}','{item}','active',now(),now()+interval '1 day',{held},null,null); insert into waiting_list_confirmation_links values('{link}','{req}','submitted',now()+interval '1 day',now(),null,'{payload}','{snap}');",DB)
    return req,item,hold,link
for name in ['waiting_list_convert_item','waiting_list_convert_confirmation']:
    req,item,hold,link=waiting_fixture()
    def call(a):return (f"select public.waiting_list_convert_item('{a}','{item}',1,'12:00')" if name.endswith('_item') else f"select public.waiting_list_convert_confirmation('{a}','{req}')")
    for role,identity,a,label in [('anon','',actor(1),'anonymous'),('authenticated',uid(99),actor(1),'customer'),('authenticated','',actor(1),'missing identity'),('authenticated',uid(1),actor(2),'wrong actor'),('authenticated',uid(3),actor(1),'forged owner'),('authenticated',uid(6),actor(6),'inactive'),('authenticated',uid(5),actor(5),'insufficient role'),('service_role','',actor(1),'service without identity')]:
        check(role,identity,call(a),False,name+' '+label)
    for i in range(1,5):
        req,item,hold,link=waiting_fixture()
        check('authenticated',uid(i),call(actor(i)),True,name+' actual role '+str(i))
        assert scalar(f"select status='converted' and converted_order_id is not null from production_capacity_holds where id='{hold}'")=='t'
        assert scalar(f"select count(*)=1 from orders o join order_items i on i.order_id=o.id where o.id=(select converted_order_id from waiting_list_items where id='{item}') and o.created_by='{actor(i)}' and i.unit_price=90 and i.quantity=1 and i.cake_name='Thai Milk Tea Mango' and i.size_label='4\"'")=='t'
    if name.endswith('_confirmation'):
        check('authenticated',uid(3),call(actor(3)),True,'bakery idempotent confirmation access')
        check('authenticated',uid(99),call(actor(3)),False,'customer denied converted confirmation access')
        check('authenticated',uid(4),call(actor(3)),False,'forged actor denied converted confirmation access')
    req,item,hold,link=waiting_fixture('2026-10-31')
    check('authenticated',uid(3),call(actor(3)),False,name+' bakery October unavailable rollback','Available from')
    req,item,hold,link=waiting_fixture(quantity=2)
    run(f"update waiting_list_items set accepted_quantity=1,status='partially_accepted' where id='{item}';",DB)
    query=call(actor(3)) if name.endswith('_confirmation') else call(actor(3)).replace(",1,'12:00')",",2,'12:00')")
    check('authenticated',uid(3),query,False,name+' excess quantity rejected')

# Install the reviewed accepted-quantity migration, then reproduce the hosted
# event-column mismatch using DEV's actual metadata-based schema.
run((ROOT/'supabase/migrations/20261012001012_waiting_list_accepted_quantity_conversion.sql').read_text(),DB)
req,item,hold,link=waiting_fixture()
run(f"update waiting_list_items set accepted_quantity=1,remaining_quantity=0,status='accepted' where id='{item}';",DB)
query=f"select public.waiting_list_convert_item('{actor(1)}','{item}',1,'12:00')"
check('authenticated',uid(1),query,False,'baseline event-column mismatch repro','column e.payload does not exist')

# Install only the local follow-up migration under test; hosted databases are
# never contacted by this disposable Unix-socket test harness.
run((ROOT/'supabase/migrations/20261012015854_waiting_list_conversion_events_metadata.sql').read_text(),DB)
assert scalar("select position('e.metadata' in prosrc)>0 and position('e.payload' in prosrc)=0 from pg_proc where proname='waiting_list_convert_item'")=='t'

req,item,hold,link=waiting_fixture()
run(f"update waiting_list_items set accepted_quantity=1,remaining_quantity=0,status='accepted' where id='{item}';",DB)
query=f"select public.waiting_list_convert_item('{actor(1)}','{item}',1,'12:00')"
check('authenticated',uid(1),query,True,'accepted quantity converts after response')
assert scalar(f"select status='converted' and accepted_quantity=1 and remaining_quantity=0 and converted_order_id is not null from waiting_list_items where id='{item}'")=='t'
assert scalar(f"select status='converted' and converted_order_id=(select converted_order_id from waiting_list_items where id='{item}') from production_capacity_holds where id='{hold}'")=='t'

# A direct conversion from Contacted still records acceptance once.
req,item,hold,link=waiting_fixture()
run(f"update waiting_list_items set status='contacted' where id='{item}';",DB)
query=f"select public.waiting_list_convert_item('{actor(2)}','{item}',1,'12:00')"
check('authenticated',uid(2),query,True,'contacted offer converts and records acceptance')
assert scalar(f"select accepted_quantity=1 and remaining_quantity=0 and status='converted' from waiting_list_items where id='{item}'")=='t'

# Partial recorded acceptance converts only accepted, unconverted units.
req,item,hold,link=waiting_fixture(quantity=2,hold_quantity=2)
run(f"update waiting_list_items set accepted_quantity=1,remaining_quantity=1,status='partially_accepted' where id='{item}';",DB)
query=f"select public.waiting_list_convert_item('{actor(2)}','{item}',1,'12:00')"
check('authenticated',uid(2),query,True,'partial accepted quantity converts without double-counting')
assert scalar(f"select accepted_quantity=1 and remaining_quantity=1 and status='partially_accepted' from waiting_list_items where id='{item}'")=='t'

# Attempting to convert the unaccepted remainder is rejected atomically.
req,item,hold,link=waiting_fixture(quantity=2,hold_quantity=2)
run(f"update waiting_list_items set accepted_quantity=1,remaining_quantity=1,status='partially_accepted' where id='{item}';",DB)
query=f"select public.waiting_list_convert_item('{actor(2)}','{item}',2,'12:00')"
check('authenticated',uid(2),query,False,'unaccepted remainder cannot convert','accepted offer')

# Identity binding and the migration's narrow call surface survive replacement.
req,item,hold,link=waiting_fixture()
run(f"update waiting_list_items set accepted_quantity=1,remaining_quantity=0,status='accepted' where id='{item}';",DB)
query=f"select public.waiting_list_convert_item('{actor(1)}','{item}',1,'12:00')"
check('authenticated',uid(99),query,False,'post-fix customer cannot convert')
check('authenticated',uid(2),query,False,'post-fix forged staff actor rejected')
assert scalar("select has_function_privilege('authenticated','public.waiting_list_convert_item(uuid,uuid,integer,time without time zone,boolean)','EXECUTE') and not has_function_privilege('anon','public.waiting_list_convert_item(uuid,uuid,integer,time without time zone,boolean)','EXECUTE') and not has_function_privilege('service_role','public.waiting_list_convert_item(uuid,uuid,integer,time without time zone,boolean)','EXECUTE')")=='t'
for role in ['anon','authenticated','service_role']:
    q=preorder(actor(3)).replace('public.create_staff_guest_preorder','staff_preorder_private.create_waiting_list_preorder')
    check(role,uid(3),q,False,role+' cannot directly enter private path')
    assert scalar(f"select not has_schema_privilege('{role}','staff_preorder_private','USAGE') and not has_function_privilege('{role}',p.oid,'EXECUTE') from pg_proc p where p.pronamespace='staff_preorder_private'::regnamespace")=='t'
for name in ['waiting_list_convert_item','waiting_list_convert_confirmation']:
    assert scalar(f"select not has_function_privilege('anon',oid,'EXECUTE') and not has_function_privilege('service_role',oid,'EXECUTE') and has_function_privilege('authenticated',oid,'EXECUTE') from pg_proc where proname='{name}'")=='t'
assert scalar("select not exists(select 1 from waiting_list_events where actor not in (select id from staff_profiles where is_active))")=='t'
print(f'{count} authorization/conversion cases PASS; exact wrapper price/hold/audit/rollback/private ACL checks PASS')
