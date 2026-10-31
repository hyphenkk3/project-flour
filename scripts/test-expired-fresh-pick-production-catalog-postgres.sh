#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CID="${RELEASE_TEST_POSTGRES_CONTAINER_ID:-}"
if [[ -z "$CID" || ! "$CID" =~ ^[[:xdigit:]]{12,64}$ ]] || ! command -v docker >/dev/null 2>&1; then
  echo "BLOCKED: disposable GitHub Actions PostgreSQL service is required" >&2
  exit 2
fi
IMAGE="$(docker inspect --format '{{.Config.Image}}' "$CID")"
[[ "$IMAGE" =~ ^postgres:17([.]|$) ]] || { echo "FAIL: expected PostgreSQL 17, got $IMAGE" >&2; exit 1; }

DB="pf_prod_catalog_gate_$$"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/pf-prod-catalog.XXXXXX")"
cleanup() {
  docker exec "$CID" dropdb -U postgres --if-exists "$DB" >/dev/null 2>&1 || true
  rm -rf "$TMP"
}
trap cleanup EXIT

docker exec "$CID" createdb -U postgres -T template0 "$DB"
psql_db() { docker exec -i "$CID" psql -X -v ON_ERROR_STOP=1 -U postgres -d "$DB" "$@"; }
FIXTURE="$ROOT/scripts/fixtures/expired-fresh-pick-production-catalog.sql"
[[ -r "$FIXTURE" ]] || { echo "FAIL: missing Production catalog fixture" >&2; exit 1; }
psql_db < "$FIXTURE" >/dev/null

IDENTITY="$(psql_db -Atqc "select current_database() || ':' || (current_setting('server_version_num')::int / 10000)::text || ':' || current_user")"
[[ "$IDENTITY" == "$DB:17:postgres" ]] || { echo "FAIL: wrong disposable DB identity $IDENTITY" >&2; exit 1; }

# Structural comparison for the exact catalog subset captured from Production.
psql_db <<'SQL' >/dev/null
CREATE OR REPLACE FUNCTION public.release_gate_acl_signature(p_acl text)
RETURNS text[] LANGUAGE sql IMMUTABLE AS $acl$
  SELECT coalesce(array_agg(item ORDER BY item), ARRAY[]::text[])
  FROM regexp_split_to_table(trim(both '{}' from coalesce(p_acl,'')), ',') AS pieces(item)
$acl$;
SQL

psql_db -P pager=off <<'SQL'
SELECT m.signature,
       md5(pg_get_functiondef(p.oid)) AS actual_definition_md5, m.definition_md5 AS expected_definition_md5,
       pg_get_userbyid(p.proowner) AS actual_owner, m.owner AS expected_owner,
       p.prosecdef AS actual_security_definer, m.security_definer AS expected_security_definer,
       p.proconfig AS actual_config, m.config AS expected_config,
       coalesce(p.proacl::text,'DEFAULT') AS actual_acl, m.acl AS expected_acl
FROM public.production_function_manifest m
LEFT JOIN pg_proc p ON p.oid=('public.'||m.signature)::regprocedure
WHERE p.oid IS NULL OR md5(pg_get_functiondef(p.oid)) IS DISTINCT FROM m.definition_md5
   OR pg_get_userbyid(p.proowner) IS DISTINCT FROM m.owner
   OR p.prosecdef IS DISTINCT FROM m.security_definer
   OR p.proconfig IS DISTINCT FROM m.config
   OR public.release_gate_acl_signature(coalesce(p.proacl::text,'')) IS DISTINCT FROM public.release_gate_acl_signature(m.acl)
ORDER BY m.signature;
SQL

psql_db <<'SQL' >/dev/null
DO $catalog$
DECLARE n bigint;
BEGIN
  SELECT count(*) INTO n FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
  JOIN pg_namespace s ON s.oid=c.relnamespace
  WHERE s.nspname='public' AND c.relname IN
    ('extra_stock','orders','order_items','order_timeline_events','extra_stock_events','roles','staff_profiles')
    AND a.attnum>0 AND NOT a.attisdropped;
  IF n <> 112 THEN RAISE EXCEPTION 'Production catalog column count mismatch: %',n; END IF;

  SELECT count(*) INTO n FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid
  JOIN pg_namespace s ON s.oid=c.relnamespace
  WHERE s.nspname='public' AND c.relname IN
    ('extra_stock','orders','order_items','order_timeline_events','extra_stock_events','roles','staff_profiles')
    AND con.contype <> 't';
  IF n <> 60 THEN RAISE EXCEPTION 'Production catalog constraint count mismatch: %',n; END IF;

  SELECT count(*) INTO n FROM pg_index ix JOIN pg_class c ON c.oid=ix.indrelid
  JOIN pg_namespace s ON s.oid=c.relnamespace JOIN pg_class i ON i.oid=ix.indexrelid
  LEFT JOIN pg_constraint con ON con.conindid=i.oid
  WHERE s.nspname='public' AND c.relname IN
    ('extra_stock','orders','order_items','order_timeline_events','extra_stock_events','roles','staff_profiles')
    AND con.oid IS NULL;
  IF n <> 29 THEN RAISE EXCEPTION 'Production catalog index count mismatch: %',n; END IF;

  SELECT count(*) INTO n FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid
  JOIN pg_namespace s ON s.oid=c.relnamespace
  WHERE s.nspname='public' AND c.relname IN
    ('extra_stock','orders','order_items','order_timeline_events','extra_stock_events','roles','staff_profiles');
  IF n <> 14 THEN RAISE EXCEPTION 'Production policy count mismatch: %',n; END IF;

  SELECT count(*) INTO n FROM public.production_trigger_manifest;
  IF n <> 42 THEN RAISE EXCEPTION 'Production trigger manifest count mismatch: %',n; END IF;

  SELECT count(*) INTO n FROM public.production_function_manifest;
  IF n <> 59 THEN RAISE EXCEPTION 'Production function manifest count mismatch: %',n; END IF;

  IF (SELECT count(*) FROM supabase_migrations.schema_migrations) <> 175
     OR (SELECT max(version) FROM supabase_migrations.schema_migrations) <> '20261031074456' THEN
    RAISE EXCEPTION 'Production migration history fixture mismatch';
  END IF;

  SELECT count(*) INTO n FROM pg_trigger t
  JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace s ON s.oid=c.relnamespace
  WHERE s.nspname='public' AND NOT t.tgisinternal
    AND c.relname IN (SELECT DISTINCT table_name FROM public.production_trigger_manifest);
  IF n <> 42 THEN RAISE EXCEPTION 'Reconstructed trigger count mismatch: %',n; END IF;

  IF EXISTS (
    SELECT 1 FROM public.production_trigger_manifest m
    WHERE NOT EXISTS (
      SELECT 1 FROM pg_trigger t
      JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace s ON s.oid=c.relnamespace
      WHERE s.nspname='public' AND c.relname=m.table_name AND t.tgname=m.trigger_name
        AND pg_get_triggerdef(t.oid,true)=m.definition
    )
  ) THEN RAISE EXCEPTION 'Missing or mismatched Production trigger definition'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.production_function_manifest m
    LEFT JOIN pg_proc p ON p.oid=('public.'||m.signature)::regprocedure
    WHERE p.oid IS NULL
       OR md5(pg_get_functiondef(p.oid)) IS DISTINCT FROM m.definition_md5
       OR pg_get_userbyid(p.proowner) IS DISTINCT FROM m.owner
       OR p.prosecdef IS DISTINCT FROM m.security_definer
       OR p.proconfig IS DISTINCT FROM m.config
       OR public.release_gate_acl_signature(coalesce(p.proacl::text,'')) IS DISTINCT FROM public.release_gate_acl_signature(m.acl)
  ) THEN RAISE EXCEPTION 'Actual Production function definition or permissions differ from captured manifest'; END IF;
END $catalog$;
SQL
echo "production_catalog_fixture=PASS; core_tables=7 columns=112 constraints=60 indexes=29 policies=14 actual_triggers=42 actual_function_definitions=59 ledger_versions=175"

MIGRATIONS=(
  "20261031083000_allow_bakery_assign_expired_fresh_pick_mixed_orders.sql"
  "20261031085000_bakery_expired_stock_two_day_guard.sql"
  "20261031090000_bakery_slice_expired_stock_two_day_guard.sql"
  "20261031093000_bakery_expired_assignment_post_lock_guard.sql"
)

# A forced error after function replacement and ledger insertion must roll the
# entire single-file transaction back before any real rehearsal is applied.
FIRST="$ROOT/supabase/migrations/${MIGRATIONS[0]}"
python3 - "$FIRST" "$TMP/forced-failure.sql" <<'PY'
import pathlib, sys
source = pathlib.Path(sys.argv[1]).read_text()
version = pathlib.Path(sys.argv[1]).name.split("_", 1)[0]
name = pathlib.Path(sys.argv[1]).name.split("_", 1)[1][:-4]
literal = source.replace("'", "''")
with open(sys.argv[2], "w", encoding="utf-8") as out:
    out.write(source)
    out.write("\nINSERT INTO supabase_migrations.schema_migrations(version,name,statements) ")
    out.write(f"VALUES ('{version}','{name}',ARRAY['{literal}']);\nSELECT 1/0;\n")
PY
set +e
psql_db --single-transaction < "$TMP/forced-failure.sql" >"$TMP/rollback.log" 2>&1
ROLLBACK_STATUS=$?
set -e
if [[ "$ROLLBACK_STATUS" -eq 0 ]]; then
  echo "FAIL: forced transaction failure unexpectedly committed" >&2
  exit 1
fi
psql_db <<'SQL' >/dev/null
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261031083000') THEN
    RAISE EXCEPTION 'failed transaction left a migration ledger row';
  END IF;
  IF (SELECT md5(pg_get_functiondef(p.oid)) FROM pg_proc p
      WHERE p.oid='public.assign_extra_stock_to_order(uuid,uuid,uuid)'::regprocedure)
       IS DISTINCT FROM (SELECT definition_md5 FROM public.production_function_manifest
          WHERE signature='assign_extra_stock_to_order(uuid,uuid,uuid)') THEN
    RAISE EXCEPTION 'failed transaction changed the actual Production baseline function body';
  END IF;
END $$;
SQL
echo "single_migration_forced_rollback=PASS"

apply_one() {
  local file="$1"
  local path="$ROOT/supabase/migrations/$file"
  local version="${file%%_*}"
  local name="${file#*_}"
  name="${name%.sql}"
  python3 - "$path" "$TMP/apply.sql" "$version" "$name" <<'PY'
import pathlib, sys
source = pathlib.Path(sys.argv[1]).read_text()
literal = source.replace("'", "''")
with open(sys.argv[2], "w", encoding="utf-8") as out:
    out.write(source)
    out.write("\nINSERT INTO supabase_migrations.schema_migrations(version,name,statements) ")
    out.write(f"VALUES ('{sys.argv[3]}','{sys.argv[4]}',ARRAY['{literal}']);\n")
PY
  psql_db --single-transaction < "$TMP/apply.sql" >/dev/null
  echo "applied=$version:$file"
}

for file in "${MIGRATIONS[@]}"; do
  [[ -r "$ROOT/supabase/migrations/$file" ]] || { echo "FAIL: missing $file" >&2; exit 1; }
  apply_one "$file"
done

BEHAVIOR_FIXTURE="$ROOT/scripts/fixtures/expired-fresh-pick-production-trigger-behavior.sql"
[[ -r "$BEHAVIOR_FIXTURE" ]] || { echo "FAIL: missing actual-trigger behavior fixture" >&2; exit 1; }
psql_db < "$BEHAVIOR_FIXTURE" >/dev/null
echo "production_trigger_assignment_mixed_readiness_audit_and_slice=PASS"

psql_db <<'SQL' >/dev/null
DO $postflight$
DECLARE n bigint; before_meta jsonb; after_meta jsonb;
BEGIN
  SELECT count(*) INTO n FROM supabase_migrations.schema_migrations
  WHERE version IN ('20261031083000','20261031085000','20261031090000','20261031093000');
  IF n <> 4 THEN RAISE EXCEPTION 'Expected four canonical migration entries, got %',n; END IF;
  IF EXISTS (
    SELECT version FROM supabase_migrations.schema_migrations
    WHERE version IN ('20261031083000','20261031085000','20261031090000','20261031093000')
    GROUP BY version HAVING count(*) <> 1
  ) THEN RAISE EXCEPTION 'Duplicate canonical migration version'; END IF;
  IF (SELECT count(*) FROM supabase_migrations.schema_migrations) <> 179 THEN
    RAISE EXCEPTION 'Unexpected non-target migration history change';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.release_gate_ledger_snapshot s
    FULL JOIN supabase_migrations.schema_migrations l USING(version)
    WHERE coalesce(s.version,l.version) NOT IN
      ('20261031083000','20261031085000','20261031090000','20261031093000')
      AND s.name IS DISTINCT FROM l.name
  ) THEN RAISE EXCEPTION 'Historical migration versions/names changed'; END IF;

  SELECT jsonb_agg(to_jsonb(f) ORDER BY identity) INTO before_meta
  FROM public.release_gate_function_snapshot f;
  SELECT jsonb_agg(jsonb_build_object(
    'identity',p.oid::regprocedure::text,
    'owner',pg_get_userbyid(p.proowner),
    'security_definer',p.prosecdef,
    'config',p.proconfig,
    'acl',p.proacl::text
  ) ORDER BY p.oid::regprocedure::text) INTO after_meta
  FROM pg_proc p
  WHERE p.oid IN ('public.assign_extra_stock_to_order(uuid,uuid,uuid)'::regprocedure,
                  'public.cut_extra_stock_into_slices(uuid,uuid)'::regprocedure);
  IF before_meta IS DISTINCT FROM after_meta THEN
    RAISE EXCEPTION 'Function identity, ownership, security, search_path, or grants changed';
  END IF;
  IF to_regprocedure('public.assign_extra_stock_to_order(uuid,uuid,uuid)') IS NULL
     OR to_regprocedure('public.cut_extra_stock_into_slices(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'Expected RPC signature missing';
  END IF;
  IF has_function_privilege('anon','public.assign_extra_stock_to_order(uuid,uuid,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'Unexpected anonymous assignment RPC permission';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.production_function_manifest m
    WHERE m.signature NOT IN ('assign_extra_stock_to_order(uuid,uuid,uuid)','cut_extra_stock_into_slices(uuid,uuid)')
      AND NOT EXISTS (
        SELECT 1 FROM pg_proc p WHERE p.oid=('public.'||m.signature)::regprocedure
          AND md5(pg_get_functiondef(p.oid))=m.definition_md5
          AND pg_get_userbyid(p.proowner)=m.owner
          AND p.prosecdef=m.security_definer
          AND p.proconfig IS NOT DISTINCT FROM m.config
          AND public.release_gate_acl_signature(coalesce(p.proacl::text,'')) IS NOT DISTINCT FROM public.release_gate_acl_signature(m.acl)
      )
  ) THEN RAISE EXCEPTION 'A non-target Production trigger/dependency function changed during migration'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.production_trigger_manifest m
    WHERE NOT EXISTS (
      SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
      JOIN pg_namespace ns ON ns.oid=c.relnamespace
      WHERE ns.nspname='public' AND c.relname=m.table_name AND t.tgname=m.trigger_name
        AND pg_get_triggerdef(t.oid,true)=m.definition
    )
  ) THEN RAISE EXCEPTION 'A Production trigger changed during migration'; END IF;
END $postflight$;
SQL

# Source replay checks CREATE OR REPLACE repeatability without altering history.
for file in "${MIGRATIONS[@]}"; do
  psql_db --single-transaction < "$ROOT/supabase/migrations/$file" >/dev/null
done
COUNTS="$(psql_db -Atqc "select count(*)||':'||count(distinct version) from supabase_migrations.schema_migrations where version in ('20261031083000','20261031085000','20261031090000','20261031093000')")"
[[ "$COUNTS" == "4:4" ]] || { echo "FAIL: replay altered ledger count $COUNTS" >&2; exit 1; }

echo "four_migrations_on_production_catalog_schema=PASS"
echo "canonical_ledger_and_history_preservation=PASS"
echo "production_trigger_definitions_and_body_fingerprints=PASS"
echo "function_signature_owner_security_grants=PASS"
echo "migration_source_replay=PASS"
echo "postgres_version=$(psql_db -Atqc 'show server_version')"
echo "scope=Production catalog-derived schema-only; 42 exact triggers and 59 actual function bodies fingerprint-checked; no Production business data copied; isolated synthetic behavior rows only"
