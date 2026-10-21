#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PGBIN="${PGBIN:-/opt/homebrew/opt/postgresql@17/bin}"
if [[ ! -x "$PGBIN/initdb" || ! -x "$PGBIN/pg_ctl" || ! -x "$PGBIN/psql" ]]; then
  echo "FAIL: PostgreSQL 17 binaries not found at $PGBIN" >&2
  exit 1
fi

RUN_DIR="$(mktemp -d /private/tmp/pf-assignment-rpc.XXXXXX)"
DATA="$RUN_DIR/data"
SOCKET="$RUN_DIR/sock"
LOG="$RUN_DIR/postgres.log"
# No TCP listener is enabled; PostgreSQL uses this isolated private socket dir.
PORT=55432
mkdir -m 700 "$SOCKET"
cleanup() {
  if [[ -d "$DATA" ]]; then
    "$PGBIN/pg_ctl" -D "$DATA" -m immediate -w stop >/dev/null 2>&1 || true
  fi
  rm -rf "$RUN_DIR"
}
trap cleanup EXIT

"$PGBIN/initdb" -D "$DATA" --no-locale --encoding=UTF8 --auth=trust >/dev/null
"$PGBIN/pg_ctl" -D "$DATA" -l "$LOG" -o "-F -p $PORT -k $SOCKET -c listen_addresses='' -c timezone=UTC -c shared_memory_type=mmap -c dynamic_shared_memory_type=posix" -w start >/dev/null
export PGHOST="$SOCKET" PGPORT="$PORT" PGUSER="$(id -un)" PGDATABASE=postgres

"$PGBIN/psql" -X -v ON_ERROR_STOP=1 -f "$ROOT/scripts/test-extra-assignment-rpc-fixture.sql" >/dev/null
"$PGBIN/psql" -X -v ON_ERROR_STOP=1 -f "$ROOT/supabase/migrations/20261021055655_harden_extra_stock_order_assignment_eligibility.sql" >/dev/null
"$PGBIN/psql" -X -v ON_ERROR_STOP=1 -f "$ROOT/scripts/test-extra-assignment-rpc-regression.sql"

# A fixture-only delay keeps the first assignment's stock row lock open while a
# second PostgreSQL session attempts to assign the same stock to another order.
"$PGBIN/psql" -X -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
create function public.test_concurrency_delay() returns trigger language plpgsql as $$
begin if new.id='83000000-0000-0000-0000-000000000001' then perform pg_sleep(0.7); end if; return new; end $$;
create trigger test_concurrency_delay before update on public.extra_stock for each row execute function public.test_concurrency_delay();
SQL
CONCURRENT_SQL="select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000001',false); select set_config('request.jwt.claim.role','authenticated',false); select public.assign_extra_stock_to_order('83000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000009','20000000-0000-0000-0000-000000000001');"
set +e
"$PGBIN/psql" -X -v ON_ERROR_STOP=1 -c "$CONCURRENT_SQL" >"$RUN_DIR/concurrent-a.log" 2>&1 &
PID_A=$!
sleep 0.15
"$PGBIN/psql" -X -v ON_ERROR_STOP=1 -c "select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000001',false); select set_config('request.jwt.claim.role','authenticated',false); select public.assign_extra_stock_to_order('83000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000010','20000000-0000-0000-0000-000000000001');" >"$RUN_DIR/concurrent-b.log" 2>&1
STATUS_B=$?
wait "$PID_A"
STATUS_A=$?
set -e
if [[ "$STATUS_A" -eq 0 && "$STATUS_B" -eq 0 ]] || [[ "$STATUS_A" -ne 0 && "$STATUS_B" -ne 0 ]]; then
  echo "FAIL: concurrent assignment outcomes were not exactly one success" >&2
  cat "$RUN_DIR/concurrent-a.log" "$RUN_DIR/concurrent-b.log" >&2
  exit 1
fi
"$PGBIN/psql" -X -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
do $$ begin
  if (select count(*) from public.extra_stock where id='83000000-0000-0000-0000-000000000001' and order_id in ('40000000-0000-0000-0000-000000000009','40000000-0000-0000-0000-000000000010') and sold_at is not null)<>1 then raise exception 'concurrent assignment did not allocate exactly once'; end if;
  if (select count(*) from public.order_timeline_events where order_id in ('40000000-0000-0000-0000-000000000009','40000000-0000-0000-0000-000000000010') and event_type='extra_assigned')<>1 then raise exception 'concurrent assignment produced unexpected timeline writes'; end if;
  if (select count(*) from public.extra_stock_events where extra_stock_id='83000000-0000-0000-0000-000000000001' and event_type='assigned')<>1 then raise exception 'concurrent assignment produced unexpected stock audit writes'; end if;
end $$;
SQL
echo "concurrent_competing_assignment=PASS"

echo "assignment_rpc_postgres=PASS"
echo "postgres_version=$("$PGBIN/psql" -XAtqc 'show server_version')"
echo "mode=isolated_synthetic_only"
