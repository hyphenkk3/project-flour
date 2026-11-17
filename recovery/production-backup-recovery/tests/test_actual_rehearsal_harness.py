#!/usr/bin/env python3
"""Exercise the actual-backup rehearsal assertions on a synthetic PG17 baseline.

This validates the coordinator/check queries only. It is not a substitute for
running the same checks against the captured November 15 database archive.
"""
from __future__ import annotations

import shutil
import os
import re
import subprocess
import sys
import tempfile
import time
import uuid
from pathlib import Path

HERE = Path(__file__).resolve().parent
RECOVERY = HERE.parent
REPO = RECOVERY.parents[1]
sys.path.insert(0, str(RECOVERY))
import restore_backup_isolated as restore  # noqa: E402
import rehearse_notification_migrations_actual as rehearsal  # noqa: E402


def run(args: list[str], *, payload: bytes | None = None, timeout: int = 120,
        check: bool = True) -> subprocess.CompletedProcess:
    result = subprocess.run(args, input=payload, stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE, env=restore._docker_env(),
                            timeout=timeout, check=False)
    if check and result.returncode:
        raise RuntimeError("synthetic_harness_command_failed:" + Path(args[0]).name)
    return result


def test_hook_failure_diagnostics_are_sanitized() -> None:
    class MemoryReport:
        data = {"checks": {}, "migration_stages": []}
        @staticmethod
        def flush() -> None:
            return None

    report = MemoryReport()
    original = rehearsal.apply_and_check
    rehearsal.apply_and_check = lambda *_args: (_ for _ in ()).throw(
        RuntimeError("event_scope_behavior_failed: secret-like diagnostic must not be stored"))
    try:
        try:
            rehearsal.run_migration_hook("database_validated", "synthetic-container", report, None, "docker")
        except restore.RestoreError as exc:
            if exc.code != "notification_migration_hook_failed":
                raise RuntimeError("hook_failure_code_mismatch") from None
        else:
            raise RuntimeError("hook_failure_not_propagated")
    finally:
        rehearsal.apply_and_check = original
    failure = report.data.get("post_migration_failure", {})
    if failure != {
        "phase": "database_validated",
        "stage": "starting_post_restore_migration_checks",
        "check_code": "event_scope_behavior_failed",
        "exception_type": "RuntimeError",
        "subprocess_exit_status": None,
    }:
        raise RuntimeError("hook_failure_report_mismatch")
    if "secret-like" in str(report.data):
        raise RuntimeError("hook_failure_report_contains_raw_exception")
    print("HOOK_FAILURE_DIAGNOSTICS=PASS; raw exception text excluded")


def test_sql_failure_records_safe_check_and_exit_status() -> None:
    original = rehearsal.subprocess.run
    rehearsal.subprocess.run = lambda *_args, **_kwargs: subprocess.CompletedProcess(
        args=["docker"], returncode=7, stdout=b"", stderr=(
            b'ERROR:  23505: duplicate key value violates unique constraint "private-secret-name"\n'
            b'DETAIL: Key (endpoint)=(secret-endpoint) already exists.\n'
        )
    )
    try:
        try:
            rehearsal.docker_psql("docker", "synthetic", "SELECT 1", label="post_migration_ledger")
        except rehearsal.RehearsalCheckError as exc:
            if (exc.code != "isolated_sql_failed_post_migration_ledger" or exc.subprocess_exit_status != 7
                    or exc.safe_diagnostic != "postgres_unique_violation_sqlstate_23505"
                    or exc.sqlstate != "23505" or exc.safe_error_category != "unique_violation"):
                raise RuntimeError("sql_failure_status_capture_mismatch") from None
            if "secret" in exc.safe_diagnostic:
                raise RuntimeError("sql_failure_diagnostic_leaked_raw_value") from None
        else:
            raise RuntimeError("sql_failure_not_raised")
    finally:
        rehearsal.subprocess.run = original
    if rehearsal._safe_psql_diagnostic(
        b"ERROR:  P0001: event1 queue count mismatch\nCONTEXT: sensitive context\n", event_behavior=True
    ) != "event_behavior_assertion_event1_queue_count_mismatch_sqlstate_P0001_category_raised_exception":
        raise RuntimeError("event_behavior_assertion_diagnostic_mismatch")
    if rehearsal._safe_psql_diagnostic(b"ERROR:  42703: column \"private_column\" does not exist\n") != "postgres_undefined_column_sqlstate_42703":
        raise RuntimeError("safe_sqlstate_diagnostic_mismatch")
    print("SQL_FAILURE_EXIT_STATUS=PASS; stderr excluded")


def test_real_psql_event_diagnostics() -> None:
    """Exercise psql stderr and the runner subprocess adapter against local-only PG17."""
    pg_bin = Path(shutil.which("initdb") or "").parent
    initdb, pg_ctl, psql = (pg_bin / "initdb", pg_bin / "pg_ctl", pg_bin / "psql")
    if not all(path.is_file() for path in (initdb, pg_ctl, psql)):
        raise RuntimeError("local_postgresql_17_test_tools_missing")
    version = run([str(initdb), "--version"], timeout=10).stdout.decode().strip()
    if not re.search(r"\b17\.\d+", version):
        raise RuntimeError("local_postgresql_17_test_tools_required")

    expected_messages = (
        "no eligible test profile", "event1 queue count mismatch", "queue idempotency failed",
        "queue escaped event1", "event2 queue failed", "stale Fresh Pick event queued",
        "stale Fresh Pick event appeared in due list", "event1 claim count mismatch", "claim escaped event1",
        "claim altered another event", "stale event claimed", "stale event not suppressed",
        "null queue unexpectedly accepted", "null claim unexpectedly accepted",
    )
    observed_messages = tuple(re.findall(
        r"RAISE EXCEPTION\s*(?:USING ERRCODE='P0001',MESSAGE=)?\s*'([^']+)'", rehearsal.BEHAVIOR_SQL
    ))
    if observed_messages != expected_messages:
        raise RuntimeError("event_behavior_assertion_order_changed")

    root = Path(tempfile.mkdtemp(prefix="pf-event-diagnostics-", dir="/private/tmp"))
    data, sock = root / "pgdata", root / "socket"
    sock.mkdir(mode=0o700)
    started = False
    try:
        setup = subprocess.run(
            [str(initdb), "-D", str(data), "-U", "postgres", "--auth-local=trust", "--auth-host=reject"],
            stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, timeout=60, check=False,
        )
        if setup.returncode:
            raise RuntimeError("diagnostic_fixture_initdb_failed")
        start = subprocess.run(
            [str(pg_ctl), "-D", str(data), "-o", f"-h '' -k {sock} -p 55492 -c shared_memory_type=mmap",
             "-l", str(root / "postgres.log"), "-t", "15", "-w", "start"],
            stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, timeout=30, check=False,
        )
        if start.returncode:
            raise RuntimeError("diagnostic_fixture_server_start_failed")
        started = True

        docker_adapter = root / "docker-psql-adapter"
        adapter_source = (
            f"#!{sys.executable}\nimport os,sys\n"
            "args=sys.argv[1:]\n"
            "assert args[:4]==['exec','-i','synthetic-only','psql']\n"
            "args=args[4:]\n"
            f"args=[{str(sock)!r} if value=='/var/run/postgresql' else value for value in args]\n"
            f"os.execv({str(psql)!r}, ['psql','-p','55492',*args])\n"
        )
        docker_adapter.write_text(adapter_source)
        docker_adapter.chmod(0o700)

        for message in expected_messages:
            statement = f"DO $$ BEGIN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='{message}'; END $$;"
            try:
                rehearsal.docker_psql(str(docker_adapter), "synthetic-only", statement,
                                      label="event_behavior_fixture")
            except rehearsal.RehearsalCheckError as exc:
                assertion_id = "event_behavior_assertion_" + message.replace(" ", "_")
                if (exc.code, exc.safe_diagnostic, exc.sqlstate, exc.safe_error_category,
                    exc.subprocess_exit_status) != (
                    assertion_id, assertion_id + "_sqlstate_P0001_category_raised_exception",
                    "P0001", "raised_exception", 3,
                ):
                    raise RuntimeError("real_psql_assertion_capture_mismatch") from None
                if assertion_id not in exc.safe_diagnostic or "sensitive context" in repr(exc.__dict__):
                    raise RuntimeError("real_psql_assertion_sanitization_failed") from None
            else:
                raise RuntimeError("real_psql_assertion_not_raised")

        private_marker = "synthetic-private-error-detail-must-not-be-retained"
        try:
            rehearsal.docker_psql(
                str(docker_adapter), "synthetic-only",
                f"DO $$ BEGIN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='{private_marker}'; END $$;",
                label="event_behavior_fixture",
            )
        except rehearsal.RehearsalCheckError as exc:
            if (exc.code, exc.sqlstate, exc.safe_error_category, exc.subprocess_exit_status) != (
                "isolated_sql_failed_event_behavior_fixture", "P0001", "raised_exception", 3,
            ):
                raise RuntimeError("real_psql_generic_error_metadata_mismatch") from None
            if private_marker in repr(exc.__dict__) or private_marker in str(exc):
                raise RuntimeError("real_psql_private_error_detail_leaked") from None
        else:
            raise RuntimeError("real_psql_generic_error_not_raised")

        class MemoryReport:
            data = {"checks": {}, "migration_stages": []}
            @staticmethod
            def flush() -> None:
                return None

        original_apply = rehearsal.apply_and_check
        def cause_known_fixture_failure(_docker, _container, _report, _coordinator_report):
            rehearsal.docker_psql(
                str(docker_adapter), "synthetic-only",
                "DO $$ BEGIN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='event1 queue count mismatch'; END $$;",
                label="event_behavior_fixture",
            )
        report = MemoryReport()
        rehearsal.apply_and_check = cause_known_fixture_failure
        try:
            try:
                rehearsal.run_migration_hook("database_validated", "synthetic-only", report, None, str(docker_adapter))
            except restore.RestoreError as exc:
                if exc.code != "notification_migration_hook_failed":
                    raise RuntimeError("known_failure_hook_propagation_mismatch") from None
            else:
                raise RuntimeError("known_failure_hook_was_mislabeled_as_pass")
        finally:
            rehearsal.apply_and_check = original_apply
        failure = report.data.get("post_migration_failure", {})
        if failure != {
            "phase": "database_validated", "stage": "starting_post_restore_migration_checks",
            "check_code": "event_behavior_assertion_event1_queue_count_mismatch",
            "exception_type": "RehearsalCheckError", "subprocess_exit_status": 3,
            "sqlstate": "P0001", "safe_error_category": "raised_exception",
            "safe_diagnostic": "event_behavior_assertion_event1_queue_count_mismatch_sqlstate_P0001_category_raised_exception",
        }:
            raise RuntimeError("diagnostic_report_fields_or_pass_classification_invalid")
        if private_marker in repr(report.data):
            raise RuntimeError("diagnostic_report_contains_raw_sql_error")
        print("REAL_PSQL_DIAGNOSTICS=PASS; 14 ordered assertions identified")
        print("REPORT_FIELDS=PASS; assertion ID, SQLSTATE, safe category, psql exit status")
        print("ERROR_SANITIZATION=PASS; private marker excluded; failure remains FAIL")
    finally:
        if started:
            stopped = subprocess.run([str(pg_ctl), "-D", str(data), "-m", "immediate", "-w", "stop"],
                                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                     timeout=30, check=False)
            if stopped.returncode:
                raise RuntimeError("diagnostic_fixture_server_cleanup_failed")
        shutil.rmtree(root)


def main() -> int:
    test_hook_failure_diagnostics_are_sanitized()
    test_sql_failure_records_safe_check_and_exit_status()
    test_real_psql_event_diagnostics()
    docker = shutil.which("docker")
    if not docker:
        raise RuntimeError("docker_unavailable")
    name = "pf-notification-assertions-" + uuid.uuid4().hex[:12]
    container = None
    try:
        started = run([
            docker, "run", "--pull=never", "--detach", "--rm", "--name", name,
            "--label", "project-flour.notification-rehearsal=1", "--network", "none",
            "--tmpfs", "/var/lib/postgresql/data:rw,nosuid,nodev,size=768m",
            "--tmpfs", "/tmp:rw,nosuid,nodev,size=96m",
            "--tmpfs", "/docker-entrypoint-initdb.d:rw,nosuid,nodev,size=1m",
            "-e", "POSTGRES_USER=postgres", "-e", "POSTGRES_DB=postgres",
            "-e", "POSTGRES_HOST_AUTH_METHOD=trust", restore.PINNED_IMAGE,
            "postgres", "-c", "cron.launch_active_jobs=off",
            "-c", "shared_preload_libraries=pg_cron,pg_stat_statements",
        ], timeout=90)
        container = started.stdout.decode().strip()
        if len(container) != 64 or set(container) - set("0123456789abcdef"):
            raise RuntimeError("container_identity_invalid")
        for _ in range(120):
            state = run([docker, "inspect", "--format",
                         "{{.State.Running}}|{{.HostConfig.NetworkMode}}|{{.Config.Image}}|{{.Image}}",
                         container], timeout=10).stdout.decode().strip()
            ready = run([docker, "exec", container, "pg_isready", "-U", "postgres",
                         "-d", "postgres"], timeout=10, check=False)
            if state == f"true|none|{restore.PINNED_IMAGE}|{restore.PINNED_IMAGE_ID}" and ready.returncode == 0:
                break
            time.sleep(1)
        else:
            raise RuntimeError("postgres_start_timeout")

        baseline = r"""
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END $$;
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE TABLE public.staff_profiles(id uuid PRIMARY KEY,is_active boolean NOT NULL DEFAULT true,archived_at timestamptz,role_id uuid);
CREATE TABLE public.staff_notification_preferences(staff_id uuid NOT NULL REFERENCES public.staff_profiles(id),notification_code text NOT NULL,email_enabled boolean NOT NULL DEFAULT true,PRIMARY KEY(staff_id,notification_code));
CREATE TABLE public.staff_notification_events(id uuid PRIMARY KEY,event_key text NOT NULL UNIQUE,code text NOT NULL,order_id uuid,approval_id uuid,title text NOT NULL,description text NOT NULL DEFAULT '',href text,payload jsonb NOT NULL DEFAULT '{}'::jsonb,created_at timestamptz NOT NULL DEFAULT now());
CREATE FUNCTION public.staff_notification_fresh_pick_hold_reminder_is_current(jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$ SELECT coalesce(($1->>'current')::boolean,false) $$;
CREATE SCHEMA supabase_migrations;
CREATE TABLE supabase_migrations.schema_migrations(version text PRIMARY KEY);
INSERT INTO supabase_migrations.schema_migrations SELECT '20250101'||lpad(g::text,6,'0') FROM generate_series(1,190) g;
INSERT INTO supabase_migrations.schema_migrations VALUES ('20261106104602');
CREATE TABLE public.cakes(id integer PRIMARY KEY,name text NOT NULL); INSERT INTO public.cakes VALUES (1,'synthetic cake');
CREATE TABLE public.collections(id integer PRIMARY KEY,status text NOT NULL); INSERT INTO public.collections VALUES (1,'open');
CREATE TABLE public.orders(id integer PRIMARY KEY,status text NOT NULL); INSERT INTO public.orders VALUES (1,'pending');
CREATE TABLE public.stock(id integer PRIMARY KEY,quantity integer NOT NULL); INSERT INTO public.stock VALUES (1,4);
INSERT INTO public.staff_profiles(id,is_active) VALUES ('00000000-0000-0000-0000-000000000001',true);
INSERT INTO public.staff_notification_preferences(staff_id,notification_code,email_enabled)
 SELECT '00000000-0000-0000-0000-000000000001',code,true FROM unnest(ARRAY[
 'new_order','order_confirmed','order_paid','order_cancelled','order_edited',
 'fresh_pick_walk_in_hold_reminder','waitlist_update','staff_test','customer_message']) code;
ALTER TABLE public.staff_notification_preferences ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE ON public.staff_notification_preferences TO anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.staff_notification_preferences TO service_role;
SELECT cron.schedule('staff-notification-email-dispatch-sweep','*/15 * * * *','select 1');
UPDATE cron.job SET active=false WHERE jobname='staff-notification-email-dispatch-sweep';
"""
        setup = run([docker, "exec", "-i", container, "psql", "-X", "-q",
                     "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"],
                    payload=baseline.encode(), timeout=120)
        if setup.returncode:
            raise RuntimeError("synthetic_baseline_setup_failed")

        class MemoryReport:
            data = {"checks": {}, "migration_stages": []}

            @staticmethod
            def flush() -> None:
                return None

        report = MemoryReport()
        rehearsal.apply_and_check(docker, container, report, None)
        if report.data["checks"].get("actual_captured_database_schema_migration_rehearsal") != "PASS":
            raise RuntimeError("synthetic_assertion_report_missing")
        if len(report.data["migration_stages"]) != 5:
            raise RuntimeError("synthetic_migration_stage_count_wrong")
        if report.data.get("post_migration_progress") != {"status": "PASS", "stage": "all_post_migration_assertions"}:
            raise RuntimeError("synthetic_post_migration_progress_missing")
        print("SYNTHETIC_INTEGRATED_ASSERTIONS=PASS")
        print("POSTGRESQL_IMAGE=" + restore.PINNED_IMAGE_ID)
        print("NETWORK=none")
        print("FIVE_MIGRATIONS=PASS; TRANSACTION_ROLLBACK=PASS; SECURITY_AND_ACL=PASS")
        print("EVENT_SCOPE_IDEMPOTENCY_STALE_HOLD_DEFAULTS_BUSINESS_ROWS=PASS")
        return 0
    finally:
        if container:
            run([docker, "rm", "-f", container], timeout=30, check=False)
            remaining = run([docker, "ps", "-aq", "--filter", f"id={container}"], timeout=15)
            if remaining.stdout.strip():
                raise RuntimeError("synthetic_container_cleanup_failed")


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print("SYNTHETIC_INTEGRATED_ASSERTIONS=FAIL code=" + str(exc).split(":", 1)[0], file=sys.stderr)
        raise SystemExit(2)
