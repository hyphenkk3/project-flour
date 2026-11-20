#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PGBIN="${PGBIN:-/opt/homebrew/opt/postgresql@17/bin}"
SERVICE_CONTAINER_ID="${RELEASE_TEST_POSTGRES_CONTAINER_ID:-}"
SQL_FILES=(
  "$ROOT/scripts/test-extra-assignment-rpc-fixture.sql"
  "$ROOT/supabase/migrations/20261021055655_harden_extra_stock_order_assignment_eligibility.sql"
  "$ROOT/scripts/test-extra-assignment-rpc-regression.sql"
)
RUN_DIR="$(mktemp -d "${TMPDIR:-/tmp}/pf-assignment-rpc.XXXXXX")"
DATA="$RUN_DIR/data"
SOCKET="$RUN_DIR/sock"
LOG="$RUN_DIR/postgres.log"
PORT=55432
LOCAL_SERVER_STARTED=0

cleanup() {
  if [[ "$LOCAL_SERVER_STARTED" == "1" && -d "$DATA" ]]; then
    "$PGBIN/pg_ctl" -D "$DATA" -m immediate -w stop >/dev/null 2>&1 || true
  fi
  rm -rf "$RUN_DIR"
}
trap cleanup EXIT

# Fail before touching the disposable database if any runner-side SQL file is
# missing or unreadable. In service mode these files are streamed to psql.
for sql_file in "${SQL_FILES[@]}"; do
  if [[ ! -f "$sql_file" || ! -r "$sql_file" ]]; then
    echo "FAIL: required SQL file is missing or unreadable: $sql_file" >&2
    exit 1
  fi
done

if [[ -n "$SERVICE_CONTAINER_ID" ]]; then
  # GitHub Actions supplies only the ID of this job's unexposed PostgreSQL
  # service. Execute psql inside that disposable container over its local socket.
  if [[ ! "$SERVICE_CONTAINER_ID" =~ ^[[:xdigit:]]{12,64}$ ]] || ! command -v docker >/dev/null 2>&1; then
    echo "FAIL: invalid or unavailable isolated PostgreSQL service container" >&2
    exit 1
  fi
  SERVICE_IMAGE="$(docker inspect --format '{{.Config.Image}}' "$SERVICE_CONTAINER_ID")"
  if [[ ! "$SERVICE_IMAGE" =~ ^postgres:17([.]|$) ]]; then
    echo "FAIL: regression service is not the configured PostgreSQL 17 image" >&2
    exit 1
  fi
  run_psql() {
    docker exec -i "$SERVICE_CONTAINER_ID" psql -U postgres -d project_flour_regression "$@"
  }
  SERVICE_IDENTITY="$(run_psql -XAtqc "select current_database() || ':' || (current_setting('server_version_num')::int / 10000)::text || ':' || current_user")"
  if [[ "$SERVICE_IDENTITY" != "project_flour_regression:17:postgres" ]]; then
    echo "FAIL: PostgreSQL service identity/version did not match the isolated test database" >&2
    exit 1
  fi
else
  if [[ ! -x "$PGBIN/initdb" || ! -x "$PGBIN/pg_ctl" || ! -x "$PGBIN/psql" ]]; then
    echo "FAIL: PostgreSQL 17 binaries not found at $PGBIN" >&2
    exit 1
  fi
  # Local mode uses a private Unix socket and does not listen on TCP.
  mkdir -m 700 "$SOCKET"
  "$PGBIN/initdb" -D "$DATA" --no-locale --encoding=UTF8 --auth=trust >/dev/null
  if ! "$PGBIN/pg_ctl" -D "$DATA" -l "$LOG" -o "-F -p $PORT -k $SOCKET -c listen_addresses='' -c timezone=UTC -c shared_memory_type=mmap -c dynamic_shared_memory_type=posix" -w start >/dev/null; then
    echo "FAIL: isolated PostgreSQL could not start; diagnostic log follows" >&2
    cat "$LOG" >&2 || true
    exit 1
  fi
  LOCAL_SERVER_STARTED=1
  export PGHOST="$SOCKET" PGPORT="$PORT" PGUSER="$(id -un)" PGDATABASE=postgres
  run_psql() {
    "$PGBIN/psql" "$@"
  }
fi

run_psql_file() {
  local sql_file="$1"
  run_psql -X -v ON_ERROR_STOP=1 -f - <"$sql_file"
}

run_psql_file "${SQL_FILES[0]}" >/dev/null
run_psql_file "${SQL_FILES[1]}" >/dev/null
run_psql_file "${SQL_FILES[2]}"

# A fixture-only delay keeps the first assignment's stock row lock open while a
# second PostgreSQL session attempts to assign the same stock to another order.
run_psql -X -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
create function public.test_concurrency_delay() returns trigger language plpgsql as $$
begin if new.id='83000000-0000-0000-0000-000000000001' then perform pg_sleep(0.7); end if; return new; end $$;
create trigger test_concurrency_delay before update on public.extra_stock for each row execute function public.test_concurrency_delay();
SQL
CONCURRENT_SQL="select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000001',false); select set_config('request.jwt.claim.role','authenticated',false); select public.assign_extra_stock_to_order('83000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000009','20000000-0000-0000-0000-000000000001');"
set +e
run_psql -X -v ON_ERROR_STOP=1 -c "$CONCURRENT_SQL" >"$RUN_DIR/concurrent-a.log" 2>&1 &
PID_A=$!
sleep 0.15
run_psql -X -v ON_ERROR_STOP=1 -c "select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000001',false); select set_config('request.jwt.claim.role','authenticated',false); select public.assign_extra_stock_to_order('83000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000010','20000000-0000-0000-0000-000000000001');" >"$RUN_DIR/concurrent-b.log" 2>&1
STATUS_B=$?
wait "$PID_A"
STATUS_A=$?
set -e
if [[ "$STATUS_A" -eq 0 && "$STATUS_B" -eq 0 ]] || [[ "$STATUS_A" -ne 0 && "$STATUS_B" -ne 0 ]]; then
  echo "FAIL: concurrent assignment outcomes were not exactly one success" >&2
  cat "$RUN_DIR/concurrent-a.log" "$RUN_DIR/concurrent-b.log" >&2
  exit 1
fi
run_psql -X -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
do $$ begin
  if (select count(*) from public.extra_stock where id='83000000-0000-0000-0000-000000000001' and order_id in ('40000000-0000-0000-0000-000000000009','40000000-0000-0000-0000-000000000010') and sold_at is not null)<>1 then raise exception 'concurrent assignment did not allocate exactly once'; end if;
  if (select count(*) from public.order_timeline_events where order_id in ('40000000-0000-0000-0000-000000000009','40000000-0000-0000-0000-000000000010') and event_type='extra_assigned')<>1 then raise exception 'concurrent assignment produced unexpected timeline writes'; end if;
  if (select count(*) from public.extra_stock_events where extra_stock_id='83000000-0000-0000-0000-000000000001' and event_type='assigned')<>1 then raise exception 'concurrent assignment produced unexpected stock audit writes'; end if;
end $$;
SQL
echo "concurrent_competing_assignment=PASS"

echo "assignment_rpc_postgres=PASS"
echo "postgres_version=$(run_psql -XAtqc 'show server_version')"
echo "mode=isolated_synthetic_only"
