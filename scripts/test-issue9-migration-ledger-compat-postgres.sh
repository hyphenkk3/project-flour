#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
[[ "$(shasum -a 256 "$ROOT/supabase/migrations/20261105030558_issue9_active_staff_orders_and_rpc_actor_binding.sql" | awk '{print $1}')" == '4ce038e16bcb24bdc0933ee011d2749d1feb8e246db078f9018cac75219bc02c' ]] || { echo 'FAIL: applied Issue #9 M1 checksum changed' >&2; exit 1; }
[[ "$(shasum -a 256 "$ROOT/supabase/migrations/20261105031949_issue9_waiting_list_archived_actor_binding.sql" | awk '{print $1}')" == '736f3384235d3243aded4ac12585b62bc5bdd03e805fd7d4817b399f83d09378' ]] || { echo 'FAIL: applied DEV M2 checksum changed' >&2; exit 1; }
SERVICE_CONTAINER_ID="${RELEASE_TEST_POSTGRES_CONTAINER_ID:-}"
LOCAL_CONTAINER=""
RUN_DIR="$(mktemp -d "${TMPDIR:-/tmp}/pf-issue9-ledger-compat.XXXXXX")"
DB="pf_issue9_compat_${RANDOM}_${RANDOM}"
STARTED=0
DB_CREATED=0
STAGED_FILES=()

cleanup() {
  local rc=$?
  if [[ -n "$SERVICE_CONTAINER_ID" && "$DB_CREATED" == "1" ]]; then
    docker exec "$SERVICE_CONTAINER_ID" dropdb -U postgres --if-exists "$DB" >/dev/null 2>&1 || true
  fi
  if [[ -n "$SERVICE_CONTAINER_ID" && "${#STAGED_FILES[@]}" -gt 0 ]]; then
    docker exec "$SERVICE_CONTAINER_ID" rm -f "${STAGED_FILES[@]}" >/dev/null 2>&1 || true
  fi
  if [[ -n "$LOCAL_CONTAINER" ]]; then
    docker rm -f "$LOCAL_CONTAINER" >/dev/null 2>&1 || true
  fi
  rm -rf "$RUN_DIR"
  if [[ -e "$RUN_DIR" ]]; then
    echo 'issue9_test_cleanup=FAIL' >&2
    return 1
  fi
  echo 'issue9_test_cleanup=PASS'
  return "$rc"
}
trap cleanup EXIT INT TERM

if ! command -v docker >/dev/null 2>&1; then
  echo 'SKIP: Docker unavailable and no PostgreSQL service supplied'
  exit 0
fi

if [[ -n "$SERVICE_CONTAINER_ID" ]]; then
  if [[ ! "$SERVICE_CONTAINER_ID" =~ ^[[:xdigit:]]{12,64}$ ]]; then
    echo 'FAIL: invalid disposable PostgreSQL service container ID' >&2
    exit 1
  fi
  SERVICE_IMAGE="$(docker inspect --format '{{.Config.Image}}' "$SERVICE_CONTAINER_ID")"
  if [[ ! "$SERVICE_IMAGE" =~ ^postgres:17([.]|$) ]]; then
    echo 'FAIL: Issue #9 migration regression requires PostgreSQL 17' >&2
    exit 1
  fi
else
  LOCAL_CONTAINER="pf-issue9-compat-${RANDOM}-${RANDOM}"
  docker run --network none --name "$LOCAL_CONTAINER" -d \
    -e POSTGRES_PASSWORD=issue9-local-test-only \
    -e POSTGRES_DB=postgres postgres:17 >/dev/null
  SERVICE_CONTAINER_ID="$(docker inspect --format '{{.Id}}' "$LOCAL_CONTAINER")"
  STARTED=1
fi

ready=0
for _ in $(seq 1 60); do
  if docker exec "$SERVICE_CONTAINER_ID" pg_isready -U postgres -d postgres >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 1
done
if [[ "$ready" != "1" ]]; then
  echo 'FAIL: disposable PostgreSQL 17 did not become ready' >&2
  if [[ "$STARTED" == "1" ]]; then docker logs --tail 40 "$LOCAL_CONTAINER" >&2 || true; fi
  exit 1
fi

docker exec "$SERVICE_CONTAINER_ID" dropdb -U postgres --if-exists "$DB" >/dev/null
docker exec "$SERVICE_CONTAINER_ID" createdb -U postgres "$DB"
DB_CREATED=1

stage_file() {
  local source="$1" target="/tmp/$(basename "$1").$RANDOM"
  docker cp "$source" "$SERVICE_CONTAINER_ID:$target" >/dev/null
  STAGED_FILES+=("$target")
  printf '%s' "$target"
}
PROD_FUNCTIONS="$(stage_file "$ROOT/scripts/fixtures/issue9-production-waiting-functions.sql")"
DEV_FUNCTIONS="$(stage_file "$ROOT/scripts/fixtures/issue9-dev-post-m2-waiting-functions.sql")"
HELPERS="$(stage_file "$ROOT/scripts/fixtures/issue9-authorization-helper-functions.sql")"
MIGRATION="$(stage_file "$ROOT/supabase/migrations/20261105032000_issue9_waiting_list_archived_actor_binding_ledger_compat.sql")"

psql() {
  docker exec -i "$SERVICE_CONTAINER_ID" psql -X -q -w -v ON_ERROR_STOP=1 -U postgres -d "$DB" "$@"
}
run_sql_file() {
  local file="$1"
  docker exec -i "$SERVICE_CONTAINER_ID" psql -X -q -w -v ON_ERROR_STOP=1 -U postgres -d "$DB" -f "$file"
}
expect_sql_failure() {
  local file="$1" label="$2"
  if run_sql_file "$file" >"$RUN_DIR/$label.log" 2>&1; then
    echo "FAIL: $label unexpectedly succeeded" >&2
    cat "$RUN_DIR/$label.log" >&2
    exit 1
  fi
}
reset_database() {
  docker exec "$SERVICE_CONTAINER_ID" dropdb -U postgres --if-exists "$DB" >/dev/null
  docker exec "$SERVICE_CONTAINER_ID" createdb -U postgres "$DB"
  docker exec "$SERVICE_CONTAINER_ID" psql -X -q -w -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c "do \$\$ begin if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if; if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if; if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if; end \$\$;" \
    >/dev/null
}
install_base() {
  local function_file="$1" include_m2="$2" corrupt_second="${3:-false}"
  psql -c "create schema auth; create schema supabase_migrations; create schema staff_preorder_private;" >/dev/null
  psql -c "create table supabase_migrations.schema_migrations(version text, name text, statements text[] not null default '{}');" >/dev/null
  psql -c "create type public.dine_in_venue as enum ('cafe'); create type public.fulfilment_method as enum ('pickup','delivery','dine_in');" >/dev/null
  psql -c "create table public.roles(id uuid primary key, code text); create table public.staff_profiles(id uuid primary key, auth_user_id uuid, role_id uuid, is_active boolean, archived_at timestamptz);" >/dev/null
  psql -c "create table public.orders(id uuid); create table public.waiting_list_requests(id uuid); create table public.waiting_list_confirmation_links(id uuid); create table public.waiting_list_items(id uuid); create table public.production_capacity_holds(id uuid); create table public.waiting_list_events(id uuid);" >/dev/null
  psql -c "create function auth.uid() returns uuid language sql stable as \$\$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid \$\$; create function auth.role() returns text language sql stable as \$\$ select nullif(current_setting('request.jwt.claim.role',true),'') \$\$;" >/dev/null
  psql -c "create function public._waiting_list_assert_manage_staff(uuid) returns void language plpgsql as \$\$ begin raise exception 'ISSUE9_FIXTURE_STOP_AFTER_ACTOR_CHECK'; end \$\$;" >/dev/null
  psql -f "$HELPERS" >/dev/null
  psql -f "$function_file" >/dev/null
  psql -c "revoke all on function public._bind_rpc_actor(uuid) from public, anon, authenticated, service_role; grant execute on function public._bind_rpc_actor(uuid) to authenticated, service_role; revoke all on function public._require_rpc_roles(uuid,text[],text) from public, anon, authenticated, service_role; grant execute on function public._require_rpc_roles(uuid,text[],text) to authenticated, service_role;" >/dev/null
  psql -c "revoke all on function public.waiting_list_convert_confirmation(uuid,uuid) from public, anon, authenticated, service_role; grant execute on function public.waiting_list_convert_confirmation(uuid,uuid) to authenticated; revoke all on function public.waiting_list_convert_item(uuid,uuid,integer,time without time zone,boolean) from public, anon, authenticated, service_role; grant execute on function public.waiting_list_convert_item(uuid,uuid,integer,time without time zone,boolean) to authenticated;" >/dev/null
  psql -c "insert into supabase_migrations.schema_migrations(version,name) values ('20261105030558','issue9_active_staff_orders_and_rpc_actor_binding');" >/dev/null
  if [[ "$include_m2" == "true" ]]; then
    psql -c "insert into supabase_migrations.schema_migrations(version,name) values ('20261105031949','issue9_waiting_list_archived_actor_binding');" >/dev/null
  fi
  if [[ "$corrupt_second" == "true" ]]; then
    psql -c "create or replace function public.waiting_list_convert_item(p_actor_staff_id uuid,p_item_id uuid,p_quantity integer,p_pickup_time time without time zone,p_keep_remaining boolean default true) returns public.orders language plpgsql security definer set search_path='' as \$\$ begin raise exception 'unexpected function body'; end; \$\$; revoke all on function public.waiting_list_convert_item(uuid,uuid,integer,time without time zone,boolean) from public, anon, authenticated, service_role; grant execute on function public.waiting_list_convert_item(uuid,uuid,integer,time without time zone,boolean) to authenticated;" >/dev/null
  fi
}

reset_database
install_base "$PROD_FUNCTIONS" false
PROD_BASELINE="$(psql -Atc "select md5(pg_get_functiondef('public.waiting_list_convert_confirmation(uuid,uuid)'::regprocedure))||'|'||md5(pg_get_functiondef('public.waiting_list_convert_item(uuid,uuid,integer,time without time zone,boolean)'::regprocedure))")"
[[ "$PROD_BASELINE" == 'd75338ec3ba9283dd8a50f4a945d417b|583879c960b0e88b7f4b2dc9ba44ebc1' ]] || { echo "FAIL: PostgreSQL 17 fixture hashes differ from verified Production source" >&2; exit 1; }
run_sql_file "$MIGRATION"
POST_M2="$(psql -Atc "select md5(pg_get_functiondef('public.waiting_list_convert_confirmation(uuid,uuid)'::regprocedure))||'|'||md5(pg_get_functiondef('public.waiting_list_convert_item(uuid,uuid,integer,time without time zone,boolean)'::regprocedure))")"
[[ "$POST_M2" == '5210846e7356ca2d4d4f6064341b73d0|654dfcf9673d71337772fbbd34b7a70f' ]] || { echo 'FAIL: Production replacement branch did not produce verified DEV M2 definitions' >&2; exit 1; }
psql -c "insert into supabase_migrations.schema_migrations(version,name) values ('20261105032000','issue9_waiting_list_archived_actor_binding_ledger_compat');" >/dev/null
[[ "$(psql -Atc "select count(*) from supabase_migrations.schema_migrations where version='20261105032000'")" == '1' ]] || { echo 'FAIL: canonical compatibility version did not record once' >&2; exit 1; }
echo 'production_state_replacement_branch_and_exact_function_hashes=PASS'

# The new branch retains active-staff, non-spoofable actor checks. Confirmed
# active callers reach existing business logic; spoofed/inactive/archived actors
# are denied before it. Anon cannot execute the RPC.
psql -c "insert into public.roles values ('10000000-0000-0000-0000-000000000001','manager'),('10000000-0000-0000-0000-000000000002','manager'); insert into public.staff_profiles values ('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',true,null),('20000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002',false,null),('20000000-0000-0000-0000-000000000003','30000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000002',true,now());" >/dev/null
ANON_EXEC="$(psql -Atc "select has_function_privilege('anon','public.waiting_list_convert_item(uuid,uuid,integer,time without time zone,boolean)','execute')")"
AUTH_EXEC="$(psql -Atc "select has_function_privilege('authenticated','public.waiting_list_convert_item(uuid,uuid,integer,time without time zone,boolean)','execute')")"
SERVICE_EXEC="$(psql -Atc "select has_function_privilege('service_role','public.waiting_list_convert_item(uuid,uuid,integer,time without time zone,boolean)','execute')")"
[[ "$ANON_EXEC|$AUTH_EXEC|$SERVICE_EXEC" == 'f|t|f' ]] || { echo 'FAIL: conversion RPC effective grants changed' >&2; exit 1; }
set +e
psql -c "set role authenticated; set request.jwt.claim.sub='30000000-0000-0000-0000-000000000001'; set request.jwt.claim.role='authenticated'; select public.waiting_list_convert_item('20000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000001',1,'12:00',true);" >"$RUN_DIR/spoof.log" 2>&1
SPOOF_RC=$?
set -e
[[ "$SPOOF_RC" -ne 0 ]] && grep -qi 'Not authorized' "$RUN_DIR/spoof.log" || { echo 'FAIL: spoofed actor was not rejected' >&2; cat "$RUN_DIR/spoof.log" >&2; exit 1; }
for actor_user in '20000000-0000-0000-0000-000000000002:30000000-0000-0000-0000-000000000002' '20000000-0000-0000-0000-000000000003:30000000-0000-0000-0000-000000000003'; do
  actor="${actor_user%%:*}"
  actor_uid="${actor_user##*:}"
  set +e
  psql -c "set role authenticated; set request.jwt.claim.sub='$actor_uid'; set request.jwt.claim.role='authenticated'; select public.waiting_list_convert_item('$actor','40000000-0000-0000-0000-000000000002',1,'12:00',true);" >"$RUN_DIR/inactive.log" 2>&1
  rc=$?
  set -e
  [[ "$rc" -ne 0 ]] && grep -qi 'Not authorized' "$RUN_DIR/inactive.log" || { echo "FAIL: inactive/archived actor $actor was not rejected" >&2; cat "$RUN_DIR/inactive.log" >&2; exit 1; }
done
set +e
psql -c "set role authenticated; set request.jwt.claim.sub='30000000-0000-0000-0000-000000000001'; set request.jwt.claim.role='authenticated'; select public.waiting_list_convert_item('20000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000003',1,'12:00',true);" >"$RUN_DIR/active.log" 2>&1
ACTIVE_RC=$?
set -e
[[ "$ACTIVE_RC" -ne 0 ]] && grep -q 'ISSUE9_FIXTURE_STOP_AFTER_ACTOR_CHECK' "$RUN_DIR/active.log" || { echo 'FAIL: active actor did not reach the existing RPC body' >&2; cat "$RUN_DIR/active.log" >&2; exit 1; }
set +e
psql -c "set role authenticated; set request.jwt.claim.sub='30000000-0000-0000-0000-000000000001'; set request.jwt.claim.role='authenticated'; select public.waiting_list_convert_confirmation('20000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000004');" >"$RUN_DIR/spoof-confirmation.log" 2>&1
SPOOF_CONFIRMATION_RC=$?
set -e
[[ "$SPOOF_CONFIRMATION_RC" -ne 0 ]] && grep -qi 'Not authorized' "$RUN_DIR/spoof-confirmation.log" || { echo 'FAIL: confirmation conversion accepted a spoofed actor' >&2; cat "$RUN_DIR/spoof-confirmation.log" >&2; exit 1; }
set +e
psql -c "set role authenticated; set request.jwt.claim.sub='30000000-0000-0000-0000-000000000001'; set request.jwt.claim.role='authenticated'; select public.waiting_list_convert_confirmation('20000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000005');" >"$RUN_DIR/active-confirmation.log" 2>&1
ACTIVE_CONFIRMATION_RC=$?
set -e
[[ "$ACTIVE_CONFIRMATION_RC" -ne 0 ]] && grep -q 'ISSUE9_FIXTURE_STOP_AFTER_ACTOR_CHECK' "$RUN_DIR/active-confirmation.log" || { echo 'FAIL: active confirmation actor did not reach the existing RPC body' >&2; cat "$RUN_DIR/active-confirmation.log" >&2; exit 1; }
set +e
psql -c "set role anon; select public.waiting_list_convert_item(null,gen_random_uuid(),1,'12:00',true);" >"$RUN_DIR/anon.log" 2>&1
ANON_RC=$?
set -e
[[ "$ANON_RC" -ne 0 ]] && grep -Eqi 'permission denied|42501' "$RUN_DIR/anon.log" || { echo 'FAIL: anonymous execution was not denied' >&2; cat "$RUN_DIR/anon.log" >&2; exit 1; }
echo 'actor_spoof_inactive_archived_active_and_anon_matrix=PASS'

# DEV already ran original M2: the compatibility migration must make no further
# function change and must permit the historical exact M2 version.
reset_database
install_base "$DEV_FUNCTIONS" true
DEV_BEFORE="$(psql -Atc "select md5(pg_get_functiondef('public.waiting_list_convert_confirmation(uuid,uuid)'::regprocedure))||'|'||md5(pg_get_functiondef('public.waiting_list_convert_item(uuid,uuid,integer,time without time zone,boolean)'::regprocedure))")"
[[ "$DEV_BEFORE" == '5210846e7356ca2d4d4f6064341b73d0|654dfcf9673d71337772fbbd34b7a70f' ]] || { echo 'FAIL: DEV fixture does not match recorded M2 function definitions' >&2; exit 1; }
run_sql_file "$MIGRATION"
DEV_AFTER="$(psql -Atc "select md5(pg_get_functiondef('public.waiting_list_convert_confirmation(uuid,uuid)'::regprocedure))||'|'||md5(pg_get_functiondef('public.waiting_list_convert_item(uuid,uuid,integer,time without time zone,boolean)'::regprocedure))")"
[[ "$DEV_BEFORE" == "$DEV_AFTER" ]] || { echo 'FAIL: DEV no-op branch modified already-applied function definitions' >&2; exit 1; }
psql -c "insert into supabase_migrations.schema_migrations(version,name) values ('20261105032000','issue9_waiting_list_archived_actor_binding_ledger_compat');" >/dev/null
echo 'existing_DEV_M2_history_preserved_noop_and_new_version=PASS'

# Reject incomplete, renamed and duplicated prerequisite history before any
# function replacement. These simulations use only the isolated test database.
reset_database
install_base "$PROD_FUNCTIONS" false
psql -c "delete from supabase_migrations.schema_migrations where version='20261105030558';" >/dev/null
expect_sql_failure "$MIGRATION" 'missing_m1'
[[ "$(psql -Atc "select md5(pg_get_functiondef('public.waiting_list_convert_confirmation(uuid,uuid)'::regprocedure))||'|'||(select count(*) from supabase_migrations.schema_migrations where version='20261105032000')")" == 'd75338ec3ba9283dd8a50f4a945d417b|0' ]] || { echo 'FAIL: missing-M1 preflight mutated state' >&2; exit 1; }
echo 'missing_M1_prerequisite_refused=PASS'

reset_database
install_base "$PROD_FUNCTIONS" false
psql -c "update supabase_migrations.schema_migrations set name='unexpected_m1_name' where version='20261105030558';" >/dev/null
expect_sql_failure "$MIGRATION" 'wrong_m1_name'
echo 'incorrect_M1_name_refused=PASS'

reset_database
install_base "$PROD_FUNCTIONS" false
psql -c "insert into supabase_migrations.schema_migrations(version,name) values ('20261105030558','duplicate_m1');" >/dev/null
expect_sql_failure "$MIGRATION" 'duplicate_history_version'
echo 'duplicate_history_version_refused=PASS'

reset_database
install_base "$PROD_FUNCTIONS" true
expect_sql_failure "$MIGRATION" 'recorded_m2_not_reflected'
[[ "$(psql -Atc "select md5(pg_get_functiondef('public.waiting_list_convert_confirmation(uuid,uuid)'::regprocedure))||'|'||(select count(*) from supabase_migrations.schema_migrations where version='20261105032000')")" == 'd75338ec3ba9283dd8a50f4a945d417b|0' ]] || { echo 'FAIL: M2/function mismatch preflight mutated state' >&2; exit 1; }
echo 'M2_ledger_function_mismatch_refused=PASS'

# A mismatch on the second function occurs after the first function has been
# replaced. The surrounding transaction must roll the first replacement back.
reset_database
install_base "$PROD_FUNCTIONS" false true
BEFORE_FAILURE="$(psql -Atc "select md5(pg_get_functiondef('public.waiting_list_convert_confirmation(uuid,uuid)'::regprocedure))||'|'||md5(pg_get_functiondef('public.waiting_list_convert_item(uuid,uuid,integer,time without time zone,boolean)'::regprocedure))")"
expect_sql_failure "$MIGRATION" 'unexpected_second_function'
ROLLED_BACK="$(psql -Atc "select md5(pg_get_functiondef('public.waiting_list_convert_confirmation(uuid,uuid)'::regprocedure))||'|'||md5(pg_get_functiondef('public.waiting_list_convert_item(uuid,uuid,integer,time without time zone,boolean)'::regprocedure))||'|'||(select count(*) from supabase_migrations.schema_migrations where version='20261105032000')")"
AFTER_FAILURE="$(printf '%s' "$ROLLED_BACK" | awk -F'|' '{print $1"|"$2}')"
THIRD="$(printf '%s' "$ROLLED_BACK" | awk -F'|' '{print $3}')"
[[ "$AFTER_FAILURE" == "$BEFORE_FAILURE" && "$THIRD" == '0' ]] || { echo 'FAIL: migration failure left a partial function update or history entry' >&2; exit 1; }
echo 'second_function_mismatch_rolls_back_first_function=PASS'

reset_database
install_base "$PROD_FUNCTIONS" false
psql -c "insert into supabase_migrations.schema_migrations(version,name) values ('20261105032000','issue9_waiting_list_archived_actor_binding_ledger_compat');" >/dev/null
expect_sql_failure "$MIGRATION" 'duplicate_compat_version'
[[ "$(psql -Atc "select md5(pg_get_functiondef('public.waiting_list_convert_confirmation(uuid,uuid)'::regprocedure))||'|'||md5(pg_get_functiondef('public.waiting_list_convert_item(uuid,uuid,integer,time without time zone,boolean)'::regprocedure))")" == 'd75338ec3ba9283dd8a50f4a945d417b|583879c960b0e88b7f4b2dc9ba44ebc1' ]] || { echo 'FAIL: duplicate guard changed functions' >&2; exit 1; }
echo 'duplicate_compat_migration_refused_without_mutation=PASS'

echo 'Issue #9 ledger-compatible PostgreSQL 17 migration tests: PASS'
