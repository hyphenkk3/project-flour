#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PGBIN="${PGBIN:-/opt/homebrew/opt/postgresql@17/bin}"
SERVICE_CONTAINER_ID="${RELEASE_TEST_POSTGRES_CONTAINER_ID:-}"
RUN_DIR="$(mktemp -d "${TMPDIR:-/tmp}/pf-capacity-rpc.XXXXXX")"
DATA="$RUN_DIR/data"
SOCKET="$RUN_DIR/sock"
LOG="$RUN_DIR/postgres.log"
DB="project_flour_capacity_regression"
PORT=55433
LOCAL_SERVER_STARTED=0
SERVICE_DB_CREATED=0

cleanup() {
  if [[ "$LOCAL_SERVER_STARTED" == "1" && -d "$DATA" ]]; then
    "$PGBIN/pg_ctl" -D "$DATA" -m immediate -w stop >/dev/null 2>&1 || true
  fi
  if [[ "$SERVICE_DB_CREATED" == "1" && -n "$SERVICE_CONTAINER_ID" ]]; then
    docker exec "$SERVICE_CONTAINER_ID" dropdb -U postgres --if-exists "$DB" >/dev/null 2>&1 || true
  fi
  rm -rf "$RUN_DIR"
}
trap cleanup EXIT

if [[ -n "$SERVICE_CONTAINER_ID" ]]; then
  if [[ ! "$SERVICE_CONTAINER_ID" =~ ^[[:xdigit:]]{12,64}$ ]] || ! command -v docker >/dev/null 2>&1; then
    echo "FAIL: invalid or unavailable isolated PostgreSQL service container" >&2
    exit 1
  fi
  SERVICE_IMAGE="$(docker inspect --format '{{.Config.Image}}' "$SERVICE_CONTAINER_ID")"
  if [[ ! "$SERVICE_IMAGE" =~ ^postgres:17([.]|$) ]]; then
    echo "FAIL: capacity regression service is not PostgreSQL 17" >&2
    exit 1
  fi
  docker exec "$SERVICE_CONTAINER_ID" dropdb -U postgres --if-exists "$DB" >/dev/null
  docker exec "$SERVICE_CONTAINER_ID" createdb -U postgres "$DB"
  SERVICE_DB_CREATED=1
  run_psql() {
    docker exec -i "$SERVICE_CONTAINER_ID" psql -X -v ON_ERROR_STOP=1 -U postgres -d "$DB" "$@"
  }
  IDENTITY="$(run_psql -Atqc "select current_database() || ':' || (current_setting('server_version_num')::int / 10000)::text || ':' || current_user")"
  [[ "$IDENTITY" == "$DB:17:postgres" ]] || { echo "FAIL: unexpected PostgreSQL identity: $IDENTITY" >&2; exit 1; }
else
  if [[ ! -x "$PGBIN/initdb" || ! -x "$PGBIN/pg_ctl" || ! -x "$PGBIN/createdb" || ! -x "$PGBIN/psql" ]]; then
    echo "SKIP: PostgreSQL 17 binaries unavailable and no isolated CI service was supplied"
    exit 0
  fi
  mkdir -m 700 "$SOCKET"
  "$PGBIN/initdb" -D "$DATA" --no-locale --encoding=UTF8 --auth=trust >/dev/null
  if ! "$PGBIN/pg_ctl" -D "$DATA" -l "$LOG" -o "-F -p $PORT -k $SOCKET -c listen_addresses='' -c timezone=UTC -c shared_memory_type=mmap -c dynamic_shared_memory_type=posix" -w start >/dev/null; then
    echo "FAIL: disposable PostgreSQL 17 could not start; diagnostics follow" >&2
    cat "$LOG" >&2 || true
    exit 1
  fi
  LOCAL_SERVER_STARTED=1
  export PGHOST="$SOCKET" PGPORT="$PORT" PGUSER="$(id -un)" PGDATABASE="$DB"
  "$PGBIN/createdb" "$DB"
  run_psql() { "$PGBIN/psql" -X -v ON_ERROR_STOP=1 "$@"; }
fi

run_psql -f - <"$ROOT/scripts/test-capacity-concurrency-fixture.sql" >/dev/null
run_psql -1 -f - <"$ROOT/supabase/migrations/20261103140120_serialize_guest_preorder_capacity.sql" >/dev/null
run_psql -1 -f - <"$ROOT/supabase/migrations/20261103140631_capacity_row_lock_conflict.sql" >/dev/null
CAPACITY_ADMIN_DEF="$(run_psql -Atqc "select pg_get_functiondef('public.set_production_capacity(uuid,date,uuid,uuid,uuid,integer,text)'::regprocedure)")"
LOCK_LINES="$(printf '%s\n' "$CAPACITY_ADMIN_DEF" | awk '/perform public\._lock_production_capacity_date\(p_pickup_date\)/ {d=NR} /perform pg_advisory_xact_lock\(/ {b=NR} END {print d+0, b+0}')"
read -r DATE_LOCK_LINE BUCKET_LOCK_LINE <<<"$LOCK_LINES"
if [[ "$DATE_LOCK_LINE" -eq 0 || "$BUCKET_LOCK_LINE" -eq 0 || "$DATE_LOCK_LINE" -ge "$BUCKET_LOCK_LINE" ]]; then
  echo "FAIL: capacity-administration lock order was not normalized" >&2
  exit 1
fi

for trigger_function in \
  'public._lock_capacity_order_row()' \
  'public._lock_capacity_order_item_row()' \
  'public._lock_capacity_definition_row()' \
  'public._lock_capacity_hold_row()'; do
  trigger_definition="$(run_psql -Atqc "select pg_get_functiondef('$trigger_function'::regprocedure)")"
  if grep -q 'perform public._lock_production_capacity_date(' <<<"$trigger_definition" || \
     ! grep -q 'public._try_lock_production_capacity_date(' <<<"$trigger_definition"; then
    echo "FAIL: $trigger_function did not use nonblocking row-trigger date locks" >&2
    exit 1
  fi
done

run_psql -f - <<'SQL' >/dev/null
create function public.capacity_test_guest_reserve(
  p_order_id uuid, p_item_id uuid, p_pickup_date date, p_cake_id uuid,
  p_size_id uuid, p_collection_id uuid, p_quantity integer,
  p_pause_seconds numeric default 0, p_fail_after_write boolean default false
) returns void language plpgsql as $$
begin
  if public._guest_preorder_item_fully_booked(
    p_pickup_date, p_collection_id, p_cake_id, p_size_id, p_quantity
  ) then raise exception 'Fully Booked'; end if;
  if p_pause_seconds > 0 then perform pg_sleep(p_pause_seconds); end if;
  insert into public.orders(id,pickup_date,collection_id,status)
    values(p_order_id,p_pickup_date,p_collection_id,'submitted');
  insert into public.order_items(id,order_id,cake_id,cake_size_id,quantity)
    values(p_item_id,p_order_id,p_cake_id,p_size_id,p_quantity);
  if p_fail_after_write then raise exception 'synthetic checkout failure'; end if;
end $$;
create function public.capacity_test_staff_reserve(
  p_order_id uuid, p_item_id uuid, p_pickup_date date, p_cake_id uuid,
  p_size_id uuid, p_collection_id uuid, p_quantity integer
) returns void language plpgsql as $$
begin
  -- Mirrors the actual staff RPC's order + line writes without a guest pre-read.
  insert into public.orders(id,pickup_date,collection_id,status)
    values(p_order_id,p_pickup_date,p_collection_id,'submitted');
  insert into public.order_items(id,order_id,cake_id,cake_size_id,quantity)
    values(p_item_id,p_order_id,p_cake_id,p_size_id,p_quantity);
end $$;
SQL

reset_data() {
  run_psql -c 'truncate public.order_items, public.orders, public.production_capacity_holds, public.production_capacity' >/dev/null
}
capacity_row() {
  local id="$1" date="$2" quantity="$3"
  run_psql -c "insert into public.production_capacity(id,pickup_date,library_cake_id,library_cake_size_id,collection_id,capacity_quantity) values('$id','$date','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','33333333-3333-3333-3333-333333333333',$quantity)" >/dev/null
}
reserve_sql() {
  local order_id="$1" item_id="$2" date="$3" delay="${4:-0}"
  printf "select public.capacity_test_guest_reserve('%s','%s','%s','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','33333333-3333-3333-3333-333333333333',1,%s,false);" "$order_id" "$item_id" "$date" "$delay"
}

# Exactly one guest checkout can consume a single remaining slot.
reset_data
capacity_row 44444444-4444-4444-4444-444444444401 2026-12-20 1
set +e
run_psql -c "$(reserve_sql 50000000-0000-0000-0000-000000000001 60000000-0000-0000-0000-000000000001 2026-12-20 1.0)" >"$RUN_DIR/a.log" 2>&1 &
PID_A=$!
sleep 0.2
run_psql -c "$(reserve_sql 50000000-0000-0000-0000-000000000002 60000000-0000-0000-0000-000000000002 2026-12-20 0)" >"$RUN_DIR/b.log" 2>&1
STATUS_B=$?
wait "$PID_A"
STATUS_A=$?
set -e
if [[ "$STATUS_A" -ne 0 || "$STATUS_B" -eq 0 ]]; then
  echo "FAIL: competing guest sessions did not produce exactly one success" >&2
  cat "$RUN_DIR/a.log" "$RUN_DIR/b.log" >&2
  exit 1
fi
[[ "$(run_psql -Atqc 'select count(*) from public.orders')" == "1" ]] || { echo "FAIL: competing checkout left an unexpected order count" >&2; exit 1; }
echo "concurrent_one_slot_exactly_one_success=PASS"

# Both reservations succeed when the bucket has room for both quantities.
reset_data
capacity_row 44444444-4444-4444-4444-444444444402 2026-12-20 2
set +e
run_psql -c "$(reserve_sql 50000000-0000-0000-0000-000000000003 60000000-0000-0000-0000-000000000003 2026-12-20 0.5)" >"$RUN_DIR/c.log" 2>&1 & PID_A=$!
sleep 0.1
run_psql -c "$(reserve_sql 50000000-0000-0000-0000-000000000004 60000000-0000-0000-0000-000000000004 2026-12-20 0)" >"$RUN_DIR/d.log" 2>&1
STATUS_B=$?
wait "$PID_A"; STATUS_A=$?
set -e
if [[ "$STATUS_A" -ne 0 || "$STATUS_B" -ne 0 ]] || [[ "$(run_psql -Atqc 'select count(*) from public.orders')" != "2" ]]; then
  echo "FAIL: sufficient-capacity concurrent reservations were rejected" >&2
  cat "$RUN_DIR/c.log" "$RUN_DIR/d.log" >&2
  exit 1
fi
echo "concurrent_sufficient_capacity=PASS"

# Different dates have independent locks; the second date completes while the
# first transaction deliberately remains open inside its reservation function.
reset_data
capacity_row 44444444-4444-4444-4444-444444444403 2026-12-20 1
capacity_row 44444444-4444-4444-4444-444444444404 2026-12-21 1
set +e
run_psql -c "$(reserve_sql 50000000-0000-0000-0000-000000000005 60000000-0000-0000-0000-000000000005 2026-12-20 2.0)" >"$RUN_DIR/e.log" 2>&1 & PID_A=$!
sleep 0.2
STARTED_AT="$(date +%s)"
run_psql -c "$(reserve_sql 50000000-0000-0000-0000-000000000006 60000000-0000-0000-0000-000000000006 2026-12-21 0)" >"$RUN_DIR/f.log" 2>&1
STATUS_B=$?
ELAPSED=$(( $(date +%s) - STARTED_AT ))
wait "$PID_A"; STATUS_A=$?
set -e
if [[ "$STATUS_A" -ne 0 || "$STATUS_B" -ne 0 || "$ELAPSED" -ge 2 ]]; then
  echo "FAIL: unrelated dates blocked one another (elapsed ${ELAPSED}s)" >&2
  cat "$RUN_DIR/e.log" "$RUN_DIR/f.log" >&2
  exit 1
fi
echo "different_dates_independent=PASS"

# A direct capacity-table writer already holds its row before the BEFORE ROW
# trigger fires. The trigger must fail fast instead of waiting on a date lock
# held by a transaction that will subsequently lock the same capacity row.
reset_data
capacity_row 44444444-4444-4444-4444-444444444411 2026-12-20 2
set +e
run_psql -c "begin; select public._lock_production_capacity_date('2026-12-20'); select pg_sleep(1.0); select id from public.production_capacity where id='44444444-4444-4444-4444-444444444411' for update; commit" >"$RUN_DIR/row-lock-order.log" 2>&1 & PID_A=$!
sleep 0.2
run_psql -c "update public.production_capacity set note='direct-writer-race' where id='44444444-4444-4444-4444-444444444411'" >"$RUN_DIR/direct-capacity-writer.log" 2>&1
STATUS_DIRECT=$?
wait "$PID_A"; STATUS_DATE_FIRST=$?
set -e
if [[ "$STATUS_DIRECT" -eq 0 || "$STATUS_DATE_FIRST" -ne 0 ]] || \
  ! grep -q 'Capacity changed concurrently. Please retry this operation.' "$RUN_DIR/direct-capacity-writer.log" || \
  [[ "$(run_psql -Atqc "select coalesce(note,'') from public.production_capacity where id='44444444-4444-4444-4444-444444444411'")" != "" ]]; then
  echo "FAIL: direct capacity writer did not abort cleanly on conflicting date lock" >&2
  cat "$RUN_DIR/direct-capacity-writer.log" "$RUN_DIR/row-lock-order.log" >&2
  exit 1
fi
echo "direct_capacity_writer_aborts_without_deadlock=PASS"

# Failed work and explicit rollback leave no order or payment-like residue.
reset_data
capacity_row 44444444-4444-4444-4444-444444444405 2026-12-20 1
set +e
run_psql -c "select public.capacity_test_guest_reserve('50000000-0000-0000-0000-000000000007','60000000-0000-0000-0000-000000000007','2026-12-20','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','33333333-3333-3333-3333-333333333333',1,0,true)" >"$RUN_DIR/fail.log" 2>&1
STATUS_FAIL=$?
set -e
if [[ "$STATUS_FAIL" -eq 0 ]] || [[ "$(run_psql -Atqc 'select count(*) from public.orders')" != "0" ]]; then
  echo "FAIL: failed checkout left a partial order" >&2
  cat "$RUN_DIR/fail.log" >&2
  exit 1
fi
run_psql -c "begin; select public._guest_preorder_item_fully_booked('2026-12-20','33333333-3333-3333-3333-333333333333','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222',1); insert into public.orders values('50000000-0000-0000-0000-000000000008','2026-12-20','33333333-3333-3333-3333-333333333333','submitted',null); insert into public.order_items values('60000000-0000-0000-0000-000000000008','50000000-0000-0000-0000-000000000008','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222',1); rollback" >/dev/null
[[ "$(run_psql -Atqc 'select count(*) from public.orders')" == "0" ]] || { echo "FAIL: explicit rollback left order rows" >&2; exit 1; }
echo "rollback_no_partial_order=PASS"

# An active waitlist hold consumes capacity; releasing it makes the slot usable.
run_psql -c "insert into public.production_capacity_holds values('70000000-0000-0000-0000-000000000001','44444444-4444-4444-4444-444444444405',1,'active',now()+interval '1 hour')" >/dev/null
[[ "$(run_psql -Atqc "select public._guest_preorder_item_fully_booked('2026-12-20','33333333-3333-3333-3333-333333333333','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222',1)")" == "t" ]] || { echo "FAIL: active hold did not block guest capacity" >&2; exit 1; }
run_psql -c "update public.production_capacity_holds set status='released' where id='70000000-0000-0000-0000-000000000001'" >/dev/null
run_psql -c "$(reserve_sql 50000000-0000-0000-0000-000000000009 60000000-0000-0000-0000-000000000009 2026-12-20)" >/dev/null
echo "waitlist_hold_reserve_and_release=PASS"

# Staff order creation bypasses the guest pre-read but is still serialized and
# validated by the database constraint trigger.
reset_data
capacity_row 44444444-4444-4444-4444-444444444406 2026-12-20 1
run_psql -c "select public.capacity_test_staff_reserve('50000000-0000-0000-0000-000000000010','60000000-0000-0000-0000-000000000010','2026-12-20','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','33333333-3333-3333-3333-333333333333',1)" >/dev/null
set +e
run_psql -c "select public.capacity_test_staff_reserve('50000000-0000-0000-0000-000000000011','60000000-0000-0000-0000-000000000011','2026-12-20','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','33333333-3333-3333-3333-333333333333',1)" >"$RUN_DIR/staff-over.log" 2>&1
STATUS_STAFF=$?
set -e
if [[ "$STATUS_STAFF" -eq 0 ]] || [[ "$(run_psql -Atqc 'select count(*) from public.orders')" != "1" ]]; then
  echo "FAIL: staff order path bypassed capacity validation" >&2
  cat "$RUN_DIR/staff-over.log" >&2
  exit 1
fi
echo "staff_order_capacity_enforced=PASS"

# Cancellation releases the slot; a date move into a full bucket rolls back.
reset_data
capacity_row 44444444-4444-4444-4444-444444444407 2026-12-20 1
capacity_row 44444444-4444-4444-4444-444444444408 2026-12-21 1
run_psql -c "$(reserve_sql 50000000-0000-0000-0000-000000000012 60000000-0000-0000-0000-000000000012 2026-12-20)" >/dev/null
run_psql -c "$(reserve_sql 50000000-0000-0000-0000-000000000013 60000000-0000-0000-0000-000000000013 2026-12-21)" >/dev/null
set +e
run_psql -c "update public.orders set pickup_date='2026-12-21' where id='50000000-0000-0000-0000-000000000012'" >"$RUN_DIR/move.log" 2>&1
STATUS_MOVE=$?
set -e
if [[ "$STATUS_MOVE" -eq 0 || "$(run_psql -Atqc "select pickup_date from public.orders where id='50000000-0000-0000-0000-000000000012'")" != "2026-12-20" ]]; then
  echo "FAIL: over-capacity date move was committed or not rolled back" >&2
  cat "$RUN_DIR/move.log" >&2
  exit 1
fi
run_psql -c "update public.orders set status='cancelled' where id='50000000-0000-0000-0000-000000000012'" >/dev/null
run_psql -c "$(reserve_sql 50000000-0000-0000-0000-000000000014 60000000-0000-0000-0000-000000000014 2026-12-20)" >/dev/null
echo "cancellation_release_and_date_move_rollback=PASS"

# Production-capacity edits cannot race below live reservations. Fresh Pick
# orders retain their separate extra_stock inventory contract.
reset_data
capacity_row 44444444-4444-4444-4444-444444444409 2026-12-20 1
run_psql -c "$(reserve_sql 50000000-0000-0000-0000-000000000015 60000000-0000-0000-0000-000000000015 2026-12-20)" >/dev/null
set +e
run_psql -c "update public.production_capacity set capacity_quantity=0 where id='44444444-4444-4444-4444-444444444409'" >"$RUN_DIR/capacity-update.log" 2>&1
STATUS_CAP=$?
set -e
if [[ "$STATUS_CAP" -eq 0 || "$(run_psql -Atqc "select capacity_quantity from public.production_capacity where id='44444444-4444-4444-4444-444444444409'")" != "1" ]]; then
  echo "FAIL: capacity reduction below reservations was committed" >&2
  cat "$RUN_DIR/capacity-update.log" >&2
  exit 1
fi
reset_data
capacity_row 44444444-4444-4444-4444-444444444410 2026-12-20 0
run_psql -c "insert into public.orders values('50000000-0000-0000-0000-000000000016','2026-12-20','33333333-3333-3333-3333-333333333333','submitted','80000000-0000-0000-0000-000000000001'); insert into public.order_items values('60000000-0000-0000-0000-000000000016','50000000-0000-0000-0000-000000000016','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222',1)" >/dev/null
echo "capacity_update_and_fresh_pick_isolation=PASS"

echo "capacity_concurrency_postgres=PASS"
echo "postgres_version=$(run_psql -Atqc 'show server_version')"
echo "mode=isolated_synthetic_independent_sessions"
