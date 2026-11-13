"""Offline database tests for the real staff-notification producer triggers.

Run only against the disposable local PostgreSQL socket used by the other DB
tests. The trigger/function definitions are applied verbatim from migrations;
the surrounding business tables are deliberately minimal fixtures.
"""

from hashlib import sha256
import os
from pathlib import Path
import re
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[1]
DB = "flour_staff_notification_producers_test"
PSQL_BIN = os.environ.get("PF_TEST_PSQL_BIN", "/opt/homebrew/bin/psql")
PSQL = [PSQL_BIN, "-X"]
if "PF_TEST_PSQL_BIN" not in os.environ:
    PSQL.extend(
        ["-h", "/private/tmp/flour-size-availability-pg-socket", "-p", "55439"]
    )
PSQL.extend(["-U", "ycwee", "-v", "ON_ERROR_STOP=1"])

MIGRATIONS = [
    "20260903160000_staff_notification_reliability.sql",
    "20260904220000_fix_staff_notification_order_cake_name.sql",
    "20260905010000_staff_notification_new_order_content.sql",
    "20260920120000_staff_notification_waiting_list_new_request.sql",
]


def run(sql: str, database: str = DB) -> str:
    result = subprocess.run(
        PSQL + ["-d", database, "-At"],
        input=sql,
        text=True,
        capture_output=True,
    )
    if result.returncode:
        if result.stdout:
            print(result.stdout, end="")
        if result.stderr:
            print(result.stderr, end="", file=sys.stderr)
        raise SystemExit(result.returncode)
    return result.stdout + result.stderr


def ensure_no_existing_test_database() -> None:
    exists = run(
        f"select exists(select 1 from pg_database where datname = '{DB}')",
        "postgres",
    ).strip()
    if exists == "t":
        raise SystemExit(f"HOLD: local test database {DB} already exists")


def create_database() -> None:
    run(f"create database {DB} encoding 'UTF8' template template0", "postgres")


def install_fixture_schema() -> None:
    run(
        r"""
do $$begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
end$$;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;
create type public.fulfilment_method as enum ('pickup','delivery','dine_in','drive_through');
create type public.test_venue as enum ('whitebird','hyphen');
create table public.staff_profiles(
  id uuid primary key,
  auth_user_id uuid unique,
  is_active boolean not null default true
);
create table public.orders(
  id uuid primary key,
  order_number text,
  guest_name text,
  guest_phone text,
  guest_email text,
  fulfilment_method public.fulfilment_method,
  pickup_date date,
  pickup_time time,
  status text,
  payment_status text,
  customer_notes text,
  order_source text,
  extra_stock_id uuid
);
create table public.order_items(
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  cake_name text,
  size_label text,
  quantity integer not null default 1,
  unit_price numeric not null default 0,
  created_at timestamptz not null default now()
);
create table public.order_paid_addons(
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  name text,
  quantity integer not null default 1,
  unit_price numeric not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create table public.order_delivery_details(
  order_id uuid primary key references public.orders(id) on delete cascade,
  recipient_name text,
  recipient_phone text,
  address_line_1 text,
  address_line_2 text,
  postcode text,
  city text,
  state text
);
create table public.order_dine_in_reservations(
  order_id uuid primary key references public.orders(id) on delete cascade,
  venue public.test_venue,
  guest_count integer,
  reservation_time time
);
create table public.order_timeline_events(
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  event_type text not null,
  actor_staff_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create table public.operations_approval_requests(
  id uuid primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  request_type text not null check (request_type in ('discount_exception','late_order_edit','cross_month_pickup')),
  status text not null check (status in ('pending','approved','rejected','cancelled')),
  reason text not null check (char_length(trim(reason)) > 0),
  requested_by uuid not null references public.staff_profiles(id),
  created_at timestamptz not null default now()
);
create table public.library_cakes(id uuid primary key, name text not null);
create table public.library_cake_sizes(id uuid primary key, label text not null);
create table public.waiting_list_requests(
  id uuid primary key,
  guest_name text not null,
  guest_phone text not null,
  created_by_staff_id uuid references public.staff_profiles(id),
  pickup_date date not null,
  created_at timestamptz not null default now()
);
create table public.waiting_list_items(
  id uuid primary key,
  request_id uuid not null references public.waiting_list_requests(id) on delete cascade,
  library_cake_id uuid not null references public.library_cakes(id),
  library_cake_size_id uuid references public.library_cake_sizes(id),
  pickup_date date not null,
  quantity integer not null default 1,
  queue_position integer not null,
  created_at timestamptz not null default now()
);
create table public.staff_notification_preferences(
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff_profiles(id) on delete cascade,
  notification_code text not null,
  email_enabled boolean not null default true,
  constraint staff_notification_preferences_code_check check (
    notification_code in ('new_order','order_paid','order_confirmed','order_cancelled','order_edited','approval_required','guest_preorder')
  )
);
"""
    )


def apply_producer_migrations() -> None:
    for filename in MIGRATIONS:
        path = ROOT / "supabase" / "migrations" / filename
        if not path.is_file():
            raise SystemExit(f"HOLD: required migration missing: {filename}")
        body = path.read_text()
        checksum = sha256(path.read_bytes()).hexdigest()
        print(f"MIGRATION {filename} SHA256 {checksum}")
        run(body)


def test_sql() -> str:
    return r"""
create function public.pf_assert(ok boolean, label text) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'FAIL: %', label; end if;
  raise notice 'PASS: %', label;
end$$;

create function public.pf_rollback_case_clean() returns void language plpgsql as $$
begin
  perform public.pf_assert(not exists(select 1 from public.staff_notification_events), 'case rollback leaves no notification events');
  perform public.pf_assert(not exists(select 1 from public.orders), 'case rollback leaves no orders');
  perform public.pf_assert(not exists(select 1 from public.order_timeline_events), 'case rollback leaves no timeline rows');
  perform public.pf_assert(not exists(select 1 from public.operations_approval_requests), 'case rollback leaves no approvals');
  perform public.pf_assert(not exists(select 1 from public.waiting_list_requests), 'case rollback leaves no waiting-list requests');
  perform public.pf_assert(not exists(select 1 from public.waiting_list_items), 'case rollback leaves no waiting-list items');
  perform public.pf_assert(not exists(select 1 from public.staff_profiles), 'case rollback leaves no synthetic staff profiles');
end$$;

begin;
set local app.settings.staff_notification_dispatch_url = '';

do $$
begin
  begin
    insert into public.orders(id, order_number, guest_name, guest_phone, fulfilment_method, pickup_date, pickup_time, status, payment_status, order_source)
    values ('71000000-0000-0000-0000-000000000001','LOCAL-NEW-01','Synthetic fixture','00000000000','pickup','2027-01-20','12:00','submitted','unpaid','website');
    insert into public.order_items(id, order_id, cake_name, size_label, quantity, unit_price)
    values ('72000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000001','Fixture cake','6 inch',1,0);
    set constraints all immediate;
    perform public.pf_assert(
      (select count(*)=1 from public.staff_notification_events where event_key='new_order:71000000-0000-0000-0000-000000000001' and code='new_order' and order_id='71000000-0000-0000-0000-000000000001' and href='/owner/orders/71000000-0000-0000-0000-000000000001' and payload->>'cakeName'='Fixture cake' and payload->'items'->0->>'cakeName'='Fixture cake'),
      'new_order deferred producer emits exact event/payload after items exist'
    );
    perform public.pf_assert((select count(*)=1 from public.staff_notification_events), 'new_order emits exactly one event');
    raise exception using errcode='ZX001', message='rollback_case_marker';
  exception when sqlstate 'ZX001' then null;
  end;
  perform public.pf_rollback_case_clean();
end$$;

do $$
begin
  begin
    insert into public.orders(id, order_number, guest_name, fulfilment_method, pickup_date, status, payment_status, order_source)
    values ('71000000-0000-0000-0000-000000000002','LOCAL-CONFIRM-01','Synthetic fixture','pickup','2027-01-20','pending_confirmation','unpaid','website');
    update public.orders set status='awaiting_payment' where id='71000000-0000-0000-0000-000000000002';
    insert into public.order_timeline_events(id, order_id, event_type) values
      ('73000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000002','status_changed'),
      ('73000000-0000-0000-0000-000000000002','71000000-0000-0000-0000-000000000002','customer_confirmed'),
      ('73000000-0000-0000-0000-000000000003','71000000-0000-0000-0000-000000000002','customer_confirmed');
    perform public.pf_assert(
      (select count(*)=1 from public.staff_notification_events where event_key='order_confirmed:71000000-0000-0000-0000-000000000002' and code='order_confirmed' and order_id='71000000-0000-0000-0000-000000000002' and approval_id is null and href='/owner/orders/71000000-0000-0000-0000-000000000002'),
      'order_confirmed follows pending-to-awaiting transition, ignores unrelated timeline and deduplicates repeated confirmation key'
    );
    perform public.pf_assert((select count(*)=1 from public.staff_notification_events), 'order_confirmed emits exactly one event');
    raise exception using errcode='ZX001', message='rollback_case_marker';
  exception when sqlstate 'ZX001' then null;
  end;
  perform public.pf_rollback_case_clean();
end$$;

do $$
begin
  begin
    insert into public.orders(id, order_number, guest_name, fulfilment_method, pickup_date, status, payment_status, order_source)
    values ('71000000-0000-0000-0000-000000000003','LOCAL-EDIT-01','Synthetic fixture','pickup','2027-01-20','awaiting_payment','unpaid','website');
    update public.orders set customer_notes='synthetic edit' where id='71000000-0000-0000-0000-000000000003';
    insert into public.order_timeline_events(id, order_id, event_type) values
      ('73000000-0000-0000-0000-000000000004','71000000-0000-0000-0000-000000000003','status_changed'),
      ('73000000-0000-0000-0000-000000000005','71000000-0000-0000-0000-000000000003','order_updated');
    insert into public.order_timeline_events(id, order_id, event_type) values
      ('73000000-0000-0000-0000-000000000005','71000000-0000-0000-0000-000000000003','order_updated')
      on conflict (id) do nothing;
    perform public.pf_assert(
      (select count(*)=1 from public.staff_notification_events where event_key='order_edited:73000000-0000-0000-0000-000000000005' and code='order_edited' and order_id='71000000-0000-0000-0000-000000000003' and href='/owner/orders/71000000-0000-0000-0000-000000000003'),
      'order_edited follows an order-field change and keys one event to the qualifying timeline row'
    );
    perform public.pf_assert((select count(*)=1 from public.staff_notification_events), 'unrelated timeline and duplicate source-row retry create no duplicate');
    raise exception using errcode='ZX001', message='rollback_case_marker';
  exception when sqlstate 'ZX001' then null;
  end;
  perform public.pf_rollback_case_clean();
end$$;

do $$
begin
  begin
    insert into public.orders(id, order_number, guest_name, fulfilment_method, pickup_date, status, payment_status, order_source)
    values ('71000000-0000-0000-0000-000000000004','LOCAL-CANCEL-01','Synthetic fixture','pickup','2027-01-20','awaiting_payment','unpaid','website');
    update public.orders set status='cancelled' where id='71000000-0000-0000-0000-000000000004';
    update public.orders set status='cancelled' where id='71000000-0000-0000-0000-000000000004';
    perform public.pf_assert(
      (select count(*)=1 from public.staff_notification_events where event_key='order_cancelled:71000000-0000-0000-0000-000000000004' and code='order_cancelled' and order_id='71000000-0000-0000-0000-000000000004' and href='/owner/orders/71000000-0000-0000-0000-000000000004'),
      'order_cancelled emits only on transition into cancelled'
    );
    perform public.pf_assert((select count(*)=1 from public.staff_notification_events), 'repeated cancellation emits no duplicate');
    raise exception using errcode='ZX001', message='rollback_case_marker';
  exception when sqlstate 'ZX001' then null;
  end;
  perform public.pf_rollback_case_clean();
end$$;

do $$
begin
  begin
    insert into public.staff_profiles(id) values ('74000000-0000-0000-0000-000000000001');
    insert into public.orders(id, order_number, guest_name, fulfilment_method, pickup_date, status, payment_status, order_source)
    values ('71000000-0000-0000-0000-000000000005','LOCAL-APPROVAL-01','Synthetic fixture','pickup','2027-01-20','awaiting_payment','unpaid','website');
    insert into public.operations_approval_requests(id, order_id, request_type, status, reason, requested_by)
    values ('75000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000005','late_order_edit','pending','Local rollback producer test','74000000-0000-0000-0000-000000000001');
    insert into public.operations_approval_requests(id, order_id, request_type, status, reason, requested_by)
    values ('75000000-0000-0000-0000-000000000002','71000000-0000-0000-0000-000000000005','discount_exception','approved','Local non-pending negative control','74000000-0000-0000-0000-000000000001');
    perform public.pf_assert(
      (select count(*)=1 from public.staff_notification_events where event_key='approval_required:75000000-0000-0000-0000-000000000001' and code='approval_required' and approval_id='75000000-0000-0000-0000-000000000001' and order_id='71000000-0000-0000-0000-000000000005' and href='/owner/orders/71000000-0000-0000-0000-000000000005' and payload->>'requestType'='late_order_edit'),
      'approval_required emits pending request with correct references/payload'
    );
    perform public.pf_assert((select count(*)=1 from public.staff_notification_events), 'approved request emits no event');
    raise exception using errcode='ZX001', message='rollback_case_marker';
  exception when sqlstate 'ZX001' then null;
  end;
  perform public.pf_rollback_case_clean();
end$$;

do $$
begin
  begin
    insert into public.orders(id, order_number, guest_name, guest_phone, fulfilment_method, pickup_date, pickup_time, status, payment_status, order_source)
    values ('71000000-0000-0000-0000-000000000006','LOCAL-LAST-MINUTE-01','Synthetic fixture','00000000000','pickup','2027-01-20','12:00','submitted','unpaid','last_minute');
    insert into public.order_items(id, order_id, cake_name, size_label, quantity, unit_price)
    values ('72000000-0000-0000-0000-000000000006','71000000-0000-0000-0000-000000000006','Fixture cake','6 inch',1,0);
    set constraints all immediate;
    perform public.pf_assert(
      (select count(*)=1 from public.staff_notification_events where event_key='last_minute:71000000-0000-0000-0000-000000000006' and code='last_minute' and order_id='71000000-0000-0000-0000-000000000006' and payload->>'orderSource'='last_minute'),
      'last_minute producer emits the expected source event'
    );
    perform public.pf_assert(
      (select count(*)=1 from public.staff_notification_events where event_key='new_order:71000000-0000-0000-0000-000000000006' and code='new_order' and order_id='71000000-0000-0000-0000-000000000006'),
      'last_minute submitted order also emits expected new_order'
    );
    update public.orders set order_source='website' where id='71000000-0000-0000-0000-000000000006';
    update public.orders set order_source='last_minute' where id='71000000-0000-0000-0000-000000000006';
    perform public.pf_assert((select count(*)=2 from public.staff_notification_events), 'last_minute source retries do not duplicate either event key');

    insert into public.orders(id, order_number, guest_name, guest_phone, fulfilment_method, pickup_date, pickup_time, status, payment_status, order_source)
    values ('71000000-0000-0000-0000-000000000008','LOCAL-LAST-MINUTE-UPDATE-01','Synthetic fixture','00000000000','pickup','2027-01-20','12:00','submitted','unpaid','website');
    insert into public.order_items(id, order_id, cake_name, size_label, quantity, unit_price)
    values ('72000000-0000-0000-0000-000000000008','71000000-0000-0000-0000-000000000008','Fixture cake','6 inch',1,0);
    set constraints all immediate;
    perform public.pf_assert(
      not exists(select 1 from public.staff_notification_events where event_key='last_minute:71000000-0000-0000-0000-000000000008'),
      'ordinary submitted order does not emit last_minute before source transition'
    );
    update public.orders set order_source='last_minute' where id='71000000-0000-0000-0000-000000000008';
    perform public.pf_assert(
      (select count(*)=1 from public.staff_notification_events where event_key='last_minute:71000000-0000-0000-0000-000000000008' and code='last_minute' and order_id='71000000-0000-0000-0000-000000000008'),
      'last_minute is emitted when an existing order transitions into that source'
    );
    update public.orders set order_source='last_minute' where id='71000000-0000-0000-0000-000000000008';
    perform public.pf_assert((select count(*)=4 from public.staff_notification_events), 'repeated last_minute source update emits no duplicate');
    raise exception using errcode='ZX001', message='rollback_case_marker';
  exception when sqlstate 'ZX001' then null;
  end;
  perform public.pf_rollback_case_clean();
end$$;

insert into public.library_cakes(id,name) values ('76000000-0000-0000-0000-000000000001','Fixture cake');
insert into public.library_cake_sizes(id,label) values ('77000000-0000-0000-0000-000000000001','6 inch');
do $$
begin
  begin
    insert into public.waiting_list_requests(id,guest_name,guest_phone,created_by_staff_id,pickup_date)
    values ('78000000-0000-0000-0000-000000000001','Synthetic fixture','00000000000',null,'2027-01-20');
    insert into public.waiting_list_items(id,request_id,library_cake_id,library_cake_size_id,pickup_date,quantity,queue_position)
    values ('79000000-0000-0000-0000-000000000001','78000000-0000-0000-0000-000000000001','76000000-0000-0000-0000-000000000001','77000000-0000-0000-0000-000000000001','2027-01-20',1,1);
    set constraints all immediate;
    perform public.pf_assert(
      (select count(*)=1 from public.staff_notification_events where event_key='waiting_list_new_request:78000000-0000-0000-0000-000000000001' and code='waiting_list_new_request' and order_id is null and approval_id is null and payload->>'requestId'='78000000-0000-0000-0000-000000000001' and payload->>'itemId'='79000000-0000-0000-0000-000000000001' and payload->>'guestPhone'='00000000000' and href like '/bakery/availability?date=2027-01-20&wlCake=%#waiting-list-heading'),
      'waiting-list producer emits deferred event with exact request/item payload and destination'
    );
    perform public.pf_assert((select count(*)=1 from public.staff_notification_events), 'one eligible waiting-list request emits one event');
    raise exception using errcode='ZX001', message='rollback_case_marker';
  exception when sqlstate 'ZX001' then null;
  end;
  perform public.pf_rollback_case_clean();
end$$;

do $$
begin
  begin
    insert into public.staff_profiles(id) values ('74000000-0000-0000-0000-000000000002');
    insert into public.waiting_list_requests(id,guest_name,guest_phone,created_by_staff_id,pickup_date)
    values ('78000000-0000-0000-0000-000000000002','Synthetic staff request','00000000000','74000000-0000-0000-0000-000000000002','2027-01-20');
    insert into public.waiting_list_items(id,request_id,library_cake_id,library_cake_size_id,pickup_date,quantity,queue_position)
    values ('79000000-0000-0000-0000-000000000002','78000000-0000-0000-0000-000000000002','76000000-0000-0000-0000-000000000001','77000000-0000-0000-0000-000000000001','2027-01-20',1,1);
    set constraints all immediate;
    perform public.pf_assert(not exists(select 1 from public.staff_notification_events), 'staff-created waiting-list request emits no customer request event');
    raise exception using errcode='ZX001', message='rollback_case_marker';
  exception when sqlstate 'ZX001' then null;
  end;
  perform public.pf_rollback_case_clean();
end$$;

do $$
begin
  begin
    insert into public.orders(id, order_number, guest_name, fulfilment_method, pickup_date, status, payment_status, order_source)
    values ('71000000-0000-0000-0000-000000000007','LOCAL-PAID-NEGATIVE','Synthetic fixture','pickup','2027-01-20','awaiting_payment','unpaid','website');
    update public.orders set customer_notes='unrelated edit' where id='71000000-0000-0000-0000-000000000007';
    perform public.pf_assert(not exists(select 1 from public.staff_notification_events where code='order_paid'), 'unrelated order update emits no paid event');
    raise exception using errcode='ZX001', message='rollback_case_marker';
  exception when sqlstate 'ZX001' then null;
  end;
  perform public.pf_rollback_case_clean();
end$$;

select public.pf_assert(not has_function_privilege('anon','public.emit_staff_notification_event(text,text,uuid,uuid,text,text,text,jsonb)','EXECUTE'), 'anon cannot invoke notification event emitter directly');
select public.pf_assert(not has_function_privilege('authenticated','public.emit_staff_notification_event(text,text,uuid,uuid,text,text,text,jsonb)','EXECUTE'), 'authenticated cannot invoke notification event emitter directly');
select public.pf_assert(not has_table_privilege('anon','public.staff_notification_events','INSERT'), 'anon cannot insert notification events directly');
select public.pf_assert(not has_table_privilege('authenticated','public.staff_notification_events','INSERT'), 'authenticated cannot insert notification events directly');

select public.pf_assert(not exists(select 1 from public.staff_notification_events), 'outer transaction contains no remaining events before rollback');
select public.pf_assert(not exists(select 1 from public.orders), 'outer transaction contains no remaining orders before rollback');
select public.pf_assert(not exists(select 1 from public.operations_approval_requests), 'outer transaction contains no remaining approvals before rollback');
select public.pf_assert(not exists(select 1 from public.waiting_list_requests), 'outer transaction contains no remaining waiting-list data before rollback');
rollback;
"""


def main() -> None:
    ensure_no_existing_test_database()
    create_database()
    try:
        install_fixture_schema()
        apply_producer_migrations()
        output = run(test_sql())
        labels = re.findall(r"PASS: ([^\r\n]+)", output)
        for label in labels:
            print(f"PASS {label}")
        if len(labels) != 91:
            raise SystemExit(f"FAIL: expected 91 passing assertions, observed {len(labels)}")
        print("BLOCKED order_paid: positive verification requires a verified payment transition; only the unrelated-update negative control ran")
        print(
            f"RESULT 6 requested non-payment producers PASS; 1 requested producer BLOCKED (order_paid); "
            f"new_order interaction/control PASS; {len(labels)} assertions PASS; rollback-only"
        )
    finally:
        run(f"drop database if exists {DB}", "postgres")


if __name__ == "__main__":
    main()
