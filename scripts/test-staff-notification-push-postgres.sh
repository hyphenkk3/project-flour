#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTAINER="${RELEASE_TEST_POSTGRES_CONTAINER_ID:-}"
if [[ ! "$CONTAINER" =~ ^[[:xdigit:]]{12,64}$ ]] || ! command -v docker >/dev/null 2>&1; then
  echo "FAIL: an isolated PostgreSQL 17 Docker container is required" >&2
  exit 1
fi
IMAGE="$(docker inspect --format '{{.Config.Image}}' "$CONTAINER")"
if [[ ! "$IMAGE" =~ ^postgres:17([.]|$) ]]; then
  echo "FAIL: expected the approved PostgreSQL 17 test image, got $IMAGE" >&2
  exit 1
fi

DB="project_flour_push_$$"
CREATED=0
cleanup() {
  if [[ "$CREATED" == "1" ]]; then
    docker exec "$CONTAINER" dropdb -U postgres --if-exists "$DB" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

docker exec "$CONTAINER" createdb -U postgres "$DB"
CREATED=1
run_sql() {
  docker exec -i "$CONTAINER" psql -X -v ON_ERROR_STOP=1 -U postgres -d "$DB" "$@"
}

run_sql -f - <"$ROOT/scripts/test-staff-notification-push-postgres-fixture.sql" >/dev/null
run_sql -1 -f - <"$ROOT/supabase/migrations/20261109193000_staff_notification_push.sql" >/dev/null
run_sql -1 -f - <"$ROOT/scripts/fixtures/20261111110823_staff_notification_fresh_pick_push_handoff.sql" >/dev/null
run_sql -1 -f - <"$ROOT/supabase/migrations/20261114120000_staff_notification_push_dispatch_scope.sql" >/dev/null
run_sql -f - <"$ROOT/scripts/test-staff-notification-push-postgres-assertions.sql"
printf 'Staff Push PostgreSQL migration and queue-scope qualification: PASS (PostgreSQL 17; disposable database %s)\n' "$DB"
