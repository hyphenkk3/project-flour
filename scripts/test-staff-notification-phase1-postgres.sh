#!/usr/bin/env bash
set -euo pipefail
umask 077

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
migration="$root/supabase/migrations/20261123000802_staff_notification_phase1_content_and_fresh_pick.sql"
work="$(mktemp -d "${TMPDIR:-/tmp}/pf-phase1-notifications.XXXXXX")"
chmod 700 "$work"
data="$work/data"
socket="$work/socket"
log="$work/private.log"
mkdir -m 700 "$socket"
port=55491
started=0
stage=initdb

cleanup() {
  result=$?
  trap - EXIT
  cleanup_failed=0
  if [[ "$started" == 1 ]]; then
    if ! pg_ctl -D "$data" -m fast -w stop >>"$log" 2>&1; then
      cleanup_failed=1
    fi
  fi
  if ! rm -rf -- "$work"; then cleanup_failed=1; fi
  if [[ "$cleanup_failed" == 1 ]]; then
    printf '%s\n' 'PHASE1_POSTGRES=FAIL stage=cleanup'
    exit 1
  fi
  if [[ "$result" -eq 0 ]]; then
    printf '%s\n' 'PHASE1_POSTGRES=PASS postgres=local-only network=disabled cleanup=PASS'
  fi
  exit "$result"
}
trap cleanup EXIT

if [[ ! -f "$migration" ]]; then
  printf '%s\n' 'PHASE1_POSTGRES=FAIL stage=migration_source'
  exit 1
fi

if ! initdb -D "$data" --no-locale --encoding=UTF8 --auth-local=trust --auth-host=reject -U "$(id -un)" >>"$log" 2>&1; then
  printf '%s\n' 'PHASE1_POSTGRES=FAIL stage=initdb'
  exit 1
fi

stage=postgres_start
if ! pg_ctl -D "$data" -l "$log" -o "-h '' -k $socket -p $port" -w start >>"$log" 2>&1; then
  printf '%s\n' 'PHASE1_POSTGRES=FAIL stage=postgres_start'
  exit 1
fi
started=1

psql_local() {
  psql -X -q -v ON_ERROR_STOP=1 -h "$socket" -p "$port" -U "$(id -un)" -d postgres "$@" >>"$log" 2>&1
}

stage=schema_setup
if ! psql_local <<'SQL'
create role anon;
create role authenticated;
create role service_role;
create type public.fulfilment_method as enum ('pickup', 'delivery', 'dine_in');
create table public.orders (
  id uuid primary key,
  status text not null,
  order_source text not null,
  extra_stock_id uuid,
  guest_name text not null,
  pickup_date date not null,
  order_number text not null,
  fulfilment_method public.fulfilment_method not null
);
create table public.staff_notification_events (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  code text not null,
  order_id uuid,
  approval_id uuid,
  title text not null,
  description text not null,
  href text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create function public._staff_notification_order_cake_name(uuid)
returns text language sql immutable as $$ select 'Synthetic Cake'::text $$;
create function public._staff_notification_order_description(text, text, date, text)
returns text language sql immutable as $$ select 'Synthetic order needs attention.'::text $$;
SQL
then
  printf '%s\n' 'PHASE1_POSTGRES=FAIL stage=schema_setup'
  exit 1
fi

stage=migration_apply
if ! psql_local -f "$migration"; then
  printf '%s\n' 'PHASE1_POSTGRES=FAIL stage=migration_apply'
  exit 1
fi

stage=fixture_setup
if ! psql_local <<'SQL'
create function public.staff_notification_emit_new_order(p_order_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare o public.orders; result_id uuid;
begin
  select * into o from public.orders where id = p_order_id;
  if not found or o.status <> 'submitted' or o.extra_stock_id is not null then
    return null;
  end if;
  select public.emit_staff_notification_event(
    'new_order:' || o.id::text, 'new_order', o.id, null,
    'legacy generic title', 'Synthetic order needs attention.',
    '/owner/orders/' || o.id::text, '{}'::jsonb
  ) into result_id;
  return result_id;
end $$;
create function public.staff_notification_emit_new_order_row()
returns trigger language plpgsql security definer set search_path = public as $$
begin perform public.staff_notification_emit_new_order(new.id); return new; end $$;
create constraint trigger staff_notification_on_orders_insert_new_order
after insert on public.orders deferrable initially deferred
for each row execute function public.staff_notification_emit_new_order_row();
create function public.staff_notification_on_legacy_last_minute()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.order_source = 'last_minute' then
    perform public.emit_staff_notification_event(
      'last_minute:' || new.id::text, 'last_minute', new.id, null,
      'legacy generic title', 'Synthetic order needs attention.',
      '/owner/orders/' || new.id::text, '{}'::jsonb
    );
  end if;
  return new;
end $$;
create trigger staff_notification_on_orders_legacy_last_minute
after insert on public.orders for each row
execute function public.staff_notification_on_legacy_last_minute();

insert into public.orders values
  ('10000000-0000-4000-8000-000000000001', 'submitted', 'customer_website', null, 'Synthetic preorder', '2026-12-01', 'SYNTH-001', 'pickup'),
  ('10000000-0000-4000-8000-000000000002', 'submitted', 'customer_website', '20000000-0000-4000-8000-000000000001', 'Synthetic Fresh Pick pickup', '2026-12-01', 'SYNTH-002', 'pickup'),
  ('10000000-0000-4000-8000-000000000003', 'submitted', 'customer_website', '20000000-0000-4000-8000-000000000002', 'Synthetic Fresh Pick delivery', '2026-12-01', 'SYNTH-003', 'delivery'),
  ('10000000-0000-4000-8000-000000000004', 'submitted', 'customer_website', '20000000-0000-4000-8000-000000000003', 'Synthetic Fresh Pick Dine-In', '2026-12-01', 'SYNTH-004', 'dine_in'),
  ('10000000-0000-4000-8000-000000000005', 'submitted', 'last_minute', null, 'Synthetic manual last-minute', '2026-12-01', 'SYNTH-005', 'pickup');
SQL
then
  printf '%s\n' 'PHASE1_POSTGRES=FAIL stage=fixture_setup'
  exit 1
fi

stage=classification_assertions
if ! psql_local <<'SQL'
do $$
declare count_new integer; count_last integer; wrong_title integer; wrong_stock_new integer;
begin
  select count(*) into count_new from public.staff_notification_events where code = 'new_order';
  select count(*) into count_last from public.staff_notification_events where code = 'last_minute';
  select count(*) into wrong_title from public.staff_notification_events where title not in ('New Order', 'Last Minute Order');
  select count(*) into wrong_stock_new from public.staff_notification_events e
    join public.orders o on o.id = e.order_id
    where e.code = 'new_order' and o.extra_stock_id is not null;
  if count_new <> 1 or count_last <> 4 or wrong_title <> 0 or wrong_stock_new <> 0 then
    raise exception 'synthetic notification classification assertion failed';
  end if;
  if (select count(distinct event_key) from public.staff_notification_events) <> 5 then
    raise exception 'synthetic event key uniqueness assertion failed';
  end if;
  if (select count(*) from public.orders) <> 5 then
    raise exception 'synthetic business row preservation assertion failed';
  end if;
end $$;
select public.emit_staff_notification_event(
  'last_minute:10000000-0000-4000-8000-000000000002', 'last_minute',
  '10000000-0000-4000-8000-000000000002', null, 'Last Minute Order',
  'Synthetic duplicate probe.', '/owner', '{}'::jsonb
);
do $$ begin
  if (select count(*) from public.staff_notification_events
      where event_key = 'last_minute:10000000-0000-4000-8000-000000000002') <> 1 then
    raise exception 'duplicate suppression assertion failed';
  end if;
end $$;
SQL
then
  printf '%s\n' 'PHASE1_POSTGRES=FAIL stage=classification_assertions'
  exit 1
fi

printf '%s\n' 'PHASE1_POSTGRES=PASS fresh_pick=3_fulfilment_methods=PASS regular_preorder=PASS last_minute_source=PASS event_keys_unique=PASS duplicate_suppression=PASS synthetic_rows_only=PASS'
