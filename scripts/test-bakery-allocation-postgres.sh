#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PG_BIN="/opt/homebrew/opt/postgresql@17/bin"
RUN="/private/tmp/pf-bakery-allocation-pg-$$"
SOCKET="$RUN/s"
PORT="$((55400 + ($$ % 1200)))"
STARTED=0

cleanup() {
  if [[ "$STARTED" == "1" ]]; then
    "$PG_BIN/pg_ctl" -D "$RUN/data" -m immediate -w stop >/dev/null 2>&1 || true
  fi
  rm -rf "$RUN"
}
trap cleanup EXIT

mkdir -m 700 "$RUN" "$SOCKET"
if ! "$PG_BIN/initdb" -D "$RUN/data" --auth-local=trust --auth-host=reject --no-locale --encoding=UTF8 >"$RUN/initdb.log" 2>&1; then
  cat "$RUN/initdb.log" >&2
  exit 1
fi
"$PG_BIN/pg_ctl" -D "$RUN/data" -l "$RUN/server.log" -o "-F -h '' -k $SOCKET -p $PORT" -w start >/dev/null 2>&1 || {
  cat "$RUN/server.log" >&2
  exit 1
}
STARTED=1
PSQL=("$PG_BIN/psql" -X -v ON_ERROR_STOP=1 -h "$SOCKET" -p "$PORT" -U "$(id -un)" -d postgres)

"${PSQL[@]}" -f "$ROOT/scripts/test-bakery-allocation-postgres.sql" >/dev/null
if "${PSQL[@]}" --single-transaction \
  -f "$ROOT/supabase/migrations/20261021065118_20261021063821_fresh_pick_bakery_allocation_aware_production_guard.sql" \
  -c "select 1/0" >"$RUN/forced-failure.log" 2>&1; then
  echo "FAIL: forced migration failure unexpectedly succeeded" >&2
  exit 1
fi
if "${PSQL[@]}" -Atc "select to_regprocedure('public._bakery_order_fresh_pick_allocation_state(uuid)') is null and not exists (select 1 from information_schema.triggers where trigger_schema='public' and trigger_name='extra_stock_block_assignment_after_production_start')" | grep -qx 't'; then
  echo "PASS: forced late migration failure rolled back function and trigger"
else
  cat "$RUN/forced-failure.log" >&2
  echo "FAIL: forced migration failure left partial DDL" >&2
  exit 1
fi
"${PSQL[@]}" -f "$ROOT/supabase/migrations/20261021065118_20261021063821_fresh_pick_bakery_allocation_aware_production_guard.sql" >/dev/null
"${PSQL[@]}" -f "$ROOT/scripts/test-bakery-allocation-postgres-assertions.sql"

# The production-start path wins the order lock. A simultaneous assignment must
# wait, then fail in the trigger rather than allocating stock after production.
("${PSQL[@]}" -c "begin; select public.mark_guest_order_production_started('00000000-0000-0000-0000-000000000007','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'); select pg_sleep(1.2); commit" >/dev/null) &
START_PID=$!
sleep 0.2
if "${PSQL[@]}" -c "update public.extra_stock set order_id='00000000-0000-0000-0000-000000000007', sold_at=clock_timestamp() where id='40000000-0000-0000-0000-000000000007'" >"$RUN/race.out" 2>&1; then
  wait "$START_PID" || true
  echo "FAIL: assignment succeeded after Start Production committed" >&2
  exit 1
fi
wait "$START_PID"
if "${PSQL[@]}" -Atc "select count(*) from public.extra_stock where id='40000000-0000-0000-0000-000000000007' and order_id is null" | grep -qx '1'; then
  echo "PASS: concurrent Start Production / assignment serialized; no duplicate allocation"
else
  cat "$RUN/race.out" >&2
  echo "FAIL: race left unexpected stock linkage" >&2
  exit 1
fi
