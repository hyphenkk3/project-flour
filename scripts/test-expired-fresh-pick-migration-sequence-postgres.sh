#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CID="${RELEASE_TEST_POSTGRES_CONTAINER_ID:-}"
if [[ -z "$CID" || ! "$CID" =~ ^[[:xdigit:]]{12,64}$ ]] || ! command -v docker >/dev/null 2>&1; then
  echo "BLOCKED: a disposable GitHub Actions PostgreSQL service container is required" >&2
  exit 2
fi
IMAGE="$(docker inspect --format '{{.Config.Image}}' "$CID")"
if [[ ! "$IMAGE" =~ ^postgres:17([.]|$) ]]; then
  echo "FAIL: expected PostgreSQL 17 service, found $IMAGE" >&2
  exit 1
fi

DB="pf_expired_gate_$$"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/pf-expired-gate.XXXXXX")"
cleanup() {
  docker exec "$CID" dropdb -U postgres --if-exists "$DB" >/dev/null 2>&1 || true
  rm -rf "$TMP"
}
trap cleanup EXIT

docker exec "$CID" createdb -U postgres -T template0 "$DB"
psql_db() { docker exec -i "$CID" psql -X -v ON_ERROR_STOP=1 -U postgres -d "$DB" "$@"; }
psql_admin() { docker exec -i "$CID" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }
IDENTITY="$(psql_db -Atqc "select current_database() || ':' || (current_setting('server_version_num')::int / 10000)::text || ':' || current_user")"
if [[ "$IDENTITY" != "$DB:17:postgres" ]]; then
  echo "FAIL: unexpected disposable database identity: $IDENTITY" >&2
  exit 1
fi

MIGRATIONS=(
  "20261031083000_allow_bakery_assign_expired_fresh_pick_mixed_orders.sql"
  "20261031085000_bakery_expired_stock_two_day_guard.sql"
  "20261031090000_bakery_slice_expired_stock_two_day_guard.sql"
  "20261031093000_bakery_expired_assignment_post_lock_guard.sql"
)
for file in "${MIGRATIONS[@]}"; do
  if [[ ! -r "$ROOT/supabase/migrations/$file" ]]; then
    echo "FAIL: candidate migration missing: $file" >&2
    exit 1
  fi
done

# Build the relevant application schema using the same isolated SQL fixture as
# the existing assignment-RPC regression, then install the already-deployed
# assignment baseline on which the four follow-up migrations depend.
psql_db -f "$ROOT/scripts/test-extra-assignment-rpc-fixture.sql" >/dev/null
BASELINE="$ROOT/supabase/migrations/20261021055655_harden_extra_stock_order_assignment_eligibility.sql"
if [[ ! -r "$BASELINE" ]]; then
  echo "FAIL: existing assignment baseline migration is missing" >&2
  exit 1
fi
psql_db --single-transaction -f "$BASELINE" >/dev/null
psql_db <<'SQL' >/dev/null
create schema supabase_migrations;
create table supabase_migrations.schema_migrations (
  version text primary key,
  statements text[],
  name text,
  inserted_at timestamptz not null default now()
);
insert into supabase_migrations.schema_migrations(version,name)
values ('20261021055655','harden_extra_stock_order_assignment_eligibility');
create table public.release_gate_snapshot (
  key text primary key,
  value jsonb not null
);
insert into public.release_gate_snapshot(key,value)
select 'assignment_rpc_before', jsonb_build_object(
  'identity_args', p.oid::regprocedure::text,
  'owner', pg_get_userbyid(p.proowner),
  'acl', coalesce(p.proacl::text,''),
  'security_definer', p.prosecdef,
  'config', coalesce(p.proconfig::text,'')
)
from pg_proc p where p.oid='public.assign_extra_stock_to_order(uuid,uuid,uuid)'::regprocedure;
insert into public.release_gate_snapshot(key,value)
select 'order_triggers_before', coalesce(jsonb_agg(t.tgname order by t.tgname),'[]'::jsonb)
from pg_trigger t join pg_class c on c.oid=t.tgrelid
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname='orders' and not t.tgisinternal;
SQL

apply_migration() {
  local file="$1" version="$2" name="$3"
  {
    cat "$ROOT/supabase/migrations/$file"
    printf "\nINSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('%s','%s' );\n" "$version" "$name"
  } | psql_db --single-transaction >/dev/null
  echo "applied=$version:$file"
}
for file in "${MIGRATIONS[@]}"; do
  version="${file%%_*}"
  name="${file#*_}"
  name="${name%.sql}"
  apply_migration "$file" "$version" "$name"
done

psql_db <<'SQL' >/dev/null
do $$
declare expected jsonb; actual jsonb; before_triggers jsonb; after_triggers jsonb;
begin
  select value into expected from public.release_gate_snapshot where key='assignment_rpc_before';
  select jsonb_build_object(
    'identity_args', p.oid::regprocedure::text,
    'owner', pg_get_userbyid(p.proowner),
    'acl', coalesce(p.proacl::text,''),
    'security_definer', p.prosecdef,
    'config', coalesce(p.proconfig::text,'')
  ) into actual
  from pg_proc p where p.oid='public.assign_extra_stock_to_order(uuid,uuid,uuid)'::regprocedure;
  if actual is distinct from expected then raise exception 'Assignment RPC identity/owner/grants/security changed: before %, after %',expected,actual; end if;
  select value into before_triggers from public.release_gate_snapshot where key='order_triggers_before';
  select coalesce(jsonb_agg(t.tgname order by t.tgname),'[]'::jsonb) into after_triggers
  from pg_trigger t join pg_class c on c.oid=t.tgrelid
  join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relname='orders' and not t.tgisinternal;
  if after_triggers is distinct from before_triggers then raise exception 'Order trigger set changed during four-migration sequence'; end if;
  if (select count(*) from supabase_migrations.schema_migrations where version in ('20261031083000','20261031085000','20261031090000','20261031093000'))<>4 then
    raise exception 'Expected exactly four canonical migration ledger versions';
  end if;
  if to_regprocedure('public.cut_extra_stock_into_slices(uuid,uuid)') is null then raise exception 'Slice guard RPC absent'; end if;
end $$;
SQL

# Replaying the source migrations must be safe in this disposable database, but
# must not duplicate or rewrite migration-history rows.
for file in "${MIGRATIONS[@]}"; do
  psql_db --single-transaction -f "$ROOT/supabase/migrations/$file" >/dev/null
done
LEDGER_COUNTS="$(psql_db -Atqc "select count(*) || ':' || count(distinct version) from supabase_migrations.schema_migrations where version in ('20261031083000','20261031085000','20261031090000','20261031093000')")"
if [[ "$LEDGER_COUNTS" != "4:4" ]]; then
  echo "FAIL: migration replay changed canonical ledger count: $LEDGER_COUNTS" >&2
  exit 1
fi

# Deterministic time injection is test-only: substitute only clock_timestamp()
# calls in the exact final candidate function migration with a volatile helper.
# Assert the source diff is exactly that replacement before executing it.
python3 - "$ROOT/supabase/migrations/${MIGRATIONS[3]}" "$TMP/930_test_clock.sql" <<'PY'
import pathlib, sys
source = pathlib.Path(sys.argv[1]).read_text()
needle = "clock_timestamp()"
count = source.count(needle)
if count < 3:
    raise SystemExit(f"FAIL: expected the candidate clock checks, found {count} clock calls")
instrumented = source.replace(needle, "public.test_clock_timestamp()")
if instrumented.replace("public.test_clock_timestamp()", needle) != source:
    raise SystemExit("FAIL: test clock instrumentation changed more than the clock provider")
pathlib.Path(sys.argv[2]).write_text(instrumented)
print(f"deterministic_clock_provider_substitutions={count}; other SQL bytes unchanged")
PY
psql_db <<'SQL' >/dev/null
create table public.test_clock(now_at timestamptz not null);
insert into public.test_clock values ('2026-10-31 12:00:00+08');
create function public.test_clock_timestamp() returns timestamptz
language plpgsql volatile set search_path=public as $$
declare v_now timestamptz;
begin select now_at into v_now from public.test_clock; return v_now; end $$;
SQL
psql_db --single-transaction -f "$TMP/930_test_clock.sql" >/dev/null

# Supported happy path proves the post-sequence assignment still preserves
# allocation, permissions, and both append-only audit records.
psql_db <<'SQL' >/dev/null
insert into public.orders(id,order_number,status,pickup_date)
values ('40000000-0000-0000-0000-000000000020','TEST-RECOVERY-HAPPY','paid','2026-10-31');
insert into public.order_items(id,order_id,cake_id,cake_size_id,cake_name,size_label,quantity)
values ('50000000-0000-0000-0000-000000000020','40000000-0000-0000-0000-000000000020','60000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','Cocoa','6 inch',1);
insert into public.extra_stock(id,library_cake_id,library_cake_size_id,cake_name,size_label,lifecycle,pickup_through_at)
values ('83000000-0000-0000-0000-000000000020','60000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','Cocoa','6 inch','confirmed','2026-10-31 23:59:59+08');
select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000001',false);
select set_config('request.jwt.claim.role','authenticated',false);
select public.assign_extra_stock_to_order('83000000-0000-0000-0000-000000000020','40000000-0000-0000-0000-000000000020','20000000-0000-0000-0000-000000000001');
do $$ begin
 if not exists(select 1 from public.extra_stock where id='83000000-0000-0000-0000-000000000020' and order_id='40000000-0000-0000-0000-000000000020' and sold_at is not null) then raise exception 'happy-path stock allocation missing'; end if;
 if not exists(select 1 from public.orders where id='40000000-0000-0000-0000-000000000020' and extra_stock_id='83000000-0000-0000-0000-000000000020') then raise exception 'happy-path primary link missing'; end if;
 if (select count(*) from public.order_timeline_events where order_id='40000000-0000-0000-0000-000000000020' and event_type='extra_assigned')<>1 then raise exception 'happy-path timeline audit count wrong'; end if;
 if (select count(*) from public.extra_stock_events where extra_stock_id='83000000-0000-0000-0000-000000000020' and event_type='assigned')<>1 then raise exception 'happy-path stock audit count wrong'; end if;
end $$;
SQL

# A real second PostgreSQL backend waits on the stock row lock. Session A moves
# only the disposable test clock beyond the Kuala Lumpur recovery date boundary
# before committing. Session B must then reject without any allocation/audit.
psql_db <<'SQL' >/dev/null
insert into public.orders(id,order_number,status,pickup_date)
values ('40000000-0000-0000-0000-000000000021','TEST-RECOVERY-BOUNDARY','paid','2026-11-01');
insert into public.order_items(id,order_id,cake_id,cake_size_id,cake_name,size_label,quantity)
values ('50000000-0000-0000-0000-000000000021','40000000-0000-0000-0000-000000000021','60000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','Cocoa','6 inch',1);
insert into public.extra_stock(id,library_cake_id,library_cake_size_id,cake_name,size_label,lifecycle,pickup_through_at)
values ('83000000-0000-0000-0000-000000000021','60000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','Cocoa','6 inch','confirmed','2026-10-31 23:59:59+08');
update public.test_clock set now_at='2026-11-01 23:59:59+08';
SQL
A_SQL="begin; set local application_name='fp-boundary-lock-a'; select id from public.extra_stock where id='83000000-0000-0000-0000-000000000021' for update; select pg_sleep(3); update public.test_clock set now_at='2026-11-02 00:00:01+08'; commit;"
docker exec -i "$CID" env PGAPPNAME=fp-boundary-lock-a psql -X -v ON_ERROR_STOP=1 -U postgres -d "$DB" -c "$A_SQL" >"$TMP/session-a.log" 2>&1 &
PID_A=$!
A_PID=""
for _ in $(seq 1 100); do
  A_PID="$(psql_db -Atqc "select pid from pg_stat_activity where application_name='fp-boundary-lock-a' and state='active' and query like '%pg_sleep%' limit 1" 2>/dev/null || true)"
  if [[ -n "$A_PID" ]]; then break; fi
  sleep 0.05
done
if [[ -z "$A_PID" ]]; then
  echo "FAIL: lock-holder session did not acquire the stock lock" >&2
  cat "$TMP/session-a.log" >&2 || true
  exit 1
fi

B_SQL="select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000001',false); select set_config('request.jwt.claim.role','authenticated',false); select public.assign_extra_stock_to_order('83000000-0000-0000-0000-000000000021','40000000-0000-0000-0000-000000000021','20000000-0000-0000-0000-000000000001');"
set +e
docker exec -i "$CID" env PGAPPNAME=fp-boundary-assignment-b psql -X -v ON_ERROR_STOP=1 -U postgres -d "$DB" -c "$B_SQL" >"$TMP/session-b.log" 2>&1 &
PID_B=$!
set -e
B_WAIT=""
for _ in $(seq 1 100); do
  B_WAIT="$(psql_db -Atqc "select coalesce(wait_event_type,'') from pg_stat_activity where application_name='fp-boundary-assignment-b' and state='active' limit 1" 2>/dev/null || true)"
  if [[ "$B_WAIT" == "Lock" ]]; then break; fi
  sleep 0.05
done
if [[ "$B_WAIT" != "Lock" ]]; then
  echo "FAIL: assignment session was not observed waiting on a PostgreSQL lock" >&2
  cat "$TMP/session-a.log" "$TMP/session-b.log" >&2 || true
  exit 1
fi
OVERLAP="$(psql_db -At -F: -c "select application_name,pid,coalesce(wait_event_type,'running') from pg_stat_activity where application_name in ('fp-boundary-lock-a','fp-boundary-assignment-b') order by application_name")"
printf '%s\n' "$OVERLAP"
if ! printf '%s\n' "$OVERLAP" | awk -F: 'NR==1{a=$2} NR==2{b=$2; if(a==b) exit 1} END{if(NR!=2) exit 1}'; then
  echo "FAIL: sessions did not have two distinct overlapping backend PIDs" >&2
  exit 1
fi
wait "$PID_A"
STATUS_A=$?
set +e
wait "$PID_B"
STATUS_B=$?
set -e
if [[ "$STATUS_A" -ne 0 || "$STATUS_B" -eq 0 ]]; then
  echo "FAIL: expected lock holder success and assignment rejection (A=$STATUS_A B=$STATUS_B)" >&2
  cat "$TMP/session-a.log" "$TMP/session-b.log" >&2
  exit 1
fi
if ! grep -Fq "The two-day Bakery recovery window has ended" "$TMP/session-b.log"; then
  echo "FAIL: assignment did not fail at the post-lock recovery-window guard" >&2
  cat "$TMP/session-b.log" >&2
  exit 1
fi
psql_db <<'SQL' >/dev/null
do $$ begin
 if not exists(select 1 from public.extra_stock where id='83000000-0000-0000-0000-000000000021' and order_id is null and sold_at is null) then raise exception 'rejected boundary attempt mutated stock'; end if;
 if not exists(select 1 from public.orders where id='40000000-0000-0000-0000-000000000021' and extra_stock_id is null) then raise exception 'rejected boundary attempt mutated order link'; end if;
 if exists(select 1 from public.order_timeline_events where order_id='40000000-0000-0000-0000-000000000021') then raise exception 'rejected boundary attempt wrote timeline audit'; end if;
 if exists(select 1 from public.extra_stock_events where extra_stock_id='83000000-0000-0000-0000-000000000021') then raise exception 'rejected boundary attempt wrote stock audit'; end if;
end $$;
SQL

# Direct RPC callers cannot target an order collecting two days after the cutoff,
# and a direct call after the physical recovery window leaves no assignment/audit.
psql_db <<'SQL' >/dev/null
insert into public.orders(id,order_number,status,pickup_date)
values
 ('40000000-0000-0000-0000-000000000022','TEST-RECOVERY-WRONG-PICKUP','paid','2026-11-02'),
 ('40000000-0000-0000-0000-000000000023','TEST-RECOVERY-EXPIRED-DIRECT','paid','2026-11-01');
insert into public.order_items(id,order_id,cake_id,cake_size_id,cake_name,size_label,quantity)
values
 ('50000000-0000-0000-0000-000000000022','40000000-0000-0000-0000-000000000022','60000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','Cocoa','6 inch',1),
 ('50000000-0000-0000-0000-000000000023','40000000-0000-0000-0000-000000000023','60000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','Cocoa','6 inch',1);
insert into public.extra_stock(id,library_cake_id,library_cake_size_id,cake_name,size_label,lifecycle,pickup_through_at)
values
 ('83000000-0000-0000-0000-000000000024','60000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','Cocoa','6 inch','confirmed','2026-10-31 23:59:59+08'),
 ('83000000-0000-0000-0000-000000000025','60000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','Cocoa','6 inch','confirmed','2026-10-31 23:59:59+08');
update public.test_clock set now_at='2026-11-01 12:00:00+08';
SQL
set +e
psql_db -c "select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000001',false); select set_config('request.jwt.claim.role','authenticated',false); select public.assign_extra_stock_to_order('83000000-0000-0000-0000-000000000024','40000000-0000-0000-0000-000000000022','20000000-0000-0000-0000-000000000001')" >"$TMP/wrong-pickup.log" 2>&1
WRONG_PICKUP_STATUS=$?
set -e
if [[ "$WRONG_PICKUP_STATUS" -eq 0 ]] || ! grep -Fq "cutoff date or the next day" "$TMP/wrong-pickup.log"; then
  echo "FAIL: assignment to an order two days after cutoff was not rejected" >&2
  cat "$TMP/wrong-pickup.log" >&2
  exit 1
fi
psql_db <<'SQL' >/dev/null
update public.test_clock set now_at='2026-11-02 00:00:01+08';
SQL
set +e
psql_db -c "select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000001',false); select set_config('request.jwt.claim.role','authenticated',false); select public.assign_extra_stock_to_order('83000000-0000-0000-0000-000000000025','40000000-0000-0000-0000-000000000023','20000000-0000-0000-0000-000000000001')" >"$TMP/assignment-expired.log" 2>&1
EXPIRED_ASSIGN_STATUS=$?
set -e
if [[ "$EXPIRED_ASSIGN_STATUS" -eq 0 ]] || ! grep -Fq "The two-day Bakery recovery window has ended" "$TMP/assignment-expired.log"; then
  echo "FAIL: direct post-window assignment was not rejected" >&2
  cat "$TMP/assignment-expired.log" >&2
  exit 1
fi
psql_db <<'SQL' >/dev/null
do $ begin
 if not exists(select 1 from public.extra_stock where id='83000000-0000-0000-0000-000000000024' and order_id is null and sold_at is null) then raise exception 'wrong-pickup rejection mutated stock'; end if;
 if not exists(select 1 from public.extra_stock where id='83000000-0000-0000-0000-000000000025' and order_id is null and sold_at is null) then raise exception 'expired assignment rejection mutated stock'; end if;
 if exists(select 1 from public.order_timeline_events where order_id in ('40000000-0000-0000-0000-000000000022','40000000-0000-0000-0000-000000000023')) then raise exception 'rejected direct assignment wrote timeline'; end if;
 if exists(select 1 from public.extra_stock_events where extra_stock_id in ('83000000-0000-0000-0000-000000000024','83000000-0000-0000-0000-000000000025')) then raise exception 'rejected direct assignment wrote stock audit'; end if;
end $;
SQL
echo "wrong_pickup_and_direct_expiry_rejection=PASS"

# Slice RPC cutoff is also evaluated after a stock lock and remains limited to
# the cutoff date and following day.
psql_db <<'SQL' >/dev/null
insert into public.extra_stock(id,library_cake_id,library_cake_size_id,cake_name,size_label,lifecycle,pickup_through_at)
values
('83000000-0000-0000-0000-000000000022','60000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','Cocoa','6 inch','confirmed','2026-10-31 23:59:59+08'),
('83000000-0000-0000-0000-000000000023','60000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','Cocoa','6 inch','confirmed','2026-10-31 23:59:59+08');
update public.test_clock set now_at='2026-11-01 12:00:00+08';
select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000001',false);
select set_config('request.jwt.claim.role','authenticated',false);
select public.cut_extra_stock_into_slices('83000000-0000-0000-0000-000000000022','20000000-0000-0000-0000-000000000001');
SQL
psql_db <<'SQL' >/dev/null
do $$ begin
 if not exists(select 1 from public.extra_stock where id='83000000-0000-0000-0000-000000000022' and cut_into_slices_at is not null) then raise exception 'allowed cutoff+1 slice did not occur'; end if;
 if (select count(*) from public.extra_stock_events where extra_stock_id='83000000-0000-0000-0000-000000000022' and event_type='cut_into_slices')<>1 then raise exception 'slice audit missing'; end if;
end $$;
update public.test_clock set now_at='2026-11-02 00:00:01+08';
SQL
set +e
psql_db -c "select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000001',false); select set_config('request.jwt.claim.role','authenticated',false); select public.cut_extra_stock_into_slices('83000000-0000-0000-0000-000000000023','20000000-0000-0000-0000-000000000001')" >"$TMP/slice-expired.log" 2>&1
SLICE_STATUS=$?
set -e
if [[ "$SLICE_STATUS" -eq 0 ]] || ! grep -Fq "The two-day Bakery recovery window has ended" "$TMP/slice-expired.log"; then
  echo "FAIL: post-window slice attempt was not rejected" >&2
  cat "$TMP/slice-expired.log" >&2
  exit 1
fi
psql_db <<'SQL' >/dev/null
do $$ begin
 if not exists(select 1 from public.extra_stock where id='83000000-0000-0000-0000-000000000023' and cut_into_slices_at is null) then raise exception 'rejected slice attempt mutated stock'; end if;
 if exists(select 1 from public.extra_stock_events where extra_stock_id='83000000-0000-0000-0000-000000000023') then raise exception 'rejected slice attempt wrote audit'; end if;
end $$;
SQL

echo "four_migration_sequence=PASS"
echo "migration_replay_without_duplicate_ledger=PASS"
echo "assignment_midnight_wait_two_sessions=PASS"
echo "slice_cutoff_and_post_window=PASS"
echo "postgres_version=$(psql_db -Atqc 'show server_version')"
echo "rehearsal_scope=relevant synthetic schema fixture; not full Production dump"
