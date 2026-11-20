#!/usr/bin/env python3
"""Exercise replacement-runner transaction mechanics on disposable PostgreSQL 17."""
from __future__ import annotations

import importlib.util
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import uuid

ROOT = Path(__file__).resolve().parents[1]
RUNNER_PATH = ROOT / "scripts/release/capacity-status-migrate.py"
PGBIN = Path(os.environ.get("PGBIN", "/opt/homebrew/opt/postgresql@17/bin"))
PORT = os.environ.get("PF_CAPACITY_RUNNER_TEST_PORT", "55437")


def check(command: list[str], **kwargs) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(command, text=True, capture_output=True, **kwargs)
    if result.returncode:
        raise AssertionError(f"command failed ({result.returncode}): {' '.join(command)}\n{result.stdout}\n{result.stderr}")
    return result


def main() -> None:
    container = os.environ.get("RELEASE_TEST_POSTGRES_CONTAINER_ID", "")
    use_container = bool(container)
    if use_container:
        if not re.fullmatch(r"[0-9a-fA-F]{12,64}", container) or not shutil.which("docker"):
            raise SystemExit("invalid or unavailable disposable PostgreSQL service container")
        image = subprocess.run(["docker", "inspect", "--format", "{{.Config.Image}}", container], text=True, capture_output=True, check=True).stdout.strip()
        if not re.match(r"^postgres:17(?:[.]|$)", image):
            raise SystemExit("runner integration service is not PostgreSQL 17")
    else:
        for binary in ("initdb", "pg_ctl", "createdb", "psql"):
            if not (PGBIN / binary).is_file():
                raise SystemExit(f"PostgreSQL 17 binary missing: {PGBIN / binary}")
    spec = importlib.util.spec_from_file_location("capacity_runner", RUNNER_PATH)
    runner = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(runner)
    work = Path(tempfile.mkdtemp(prefix="pf-capacity-runner-test-"))
    data, sock = work / "data", work / "sock"
    sock.mkdir(mode=0o700)
    started = False
    created_dbs: list[str] = []
    container_files: list[str] = []
    try:
        suffix = uuid.uuid4().hex[:10]
        db = f"pf_capacity_runner_{suffix}"
        if use_container:
            check(["docker", "exec", container, "createdb", "-U", "postgres", db])
            created_dbs.append(db)
            psql = ["docker", "exec", "-i", container, "psql", "-X", "-q", "-w", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", db]
            def create_db(name: str) -> None:
                check(["docker", "exec", container, "createdb", "-U", "postgres", name])
                created_dbs.append(name)
            def run_driver(command: list[str], path: Path) -> subprocess.CompletedProcess[str]:
                return subprocess.run(command + ["--single-transaction", "-f", "-"], input=path.read_text(), text=True, capture_output=True)
            def stage_sql(path: Path) -> Path:
                target = f"/tmp/{path.name}-{suffix}"
                check(["docker", "cp", str(path), f"{container}:{target}"])
                container_files.append(target)
                return Path(target)
        else:
            check([str(PGBIN / "initdb"), "-D", str(data), "--no-locale", "--encoding=UTF8", "--auth=trust", "-U", "postgres", "--set=shared_memory_type=mmap", "--set=dynamic_shared_memory_type=posix"])
            start = subprocess.run([str(PGBIN / "pg_ctl"), "-D", str(data), "-l", str(work / "postgres.log"), "-o", f"-F -p {PORT} -k {sock} -c listen_addresses='' -c shared_memory_type=mmap -c dynamic_shared_memory_type=posix", "-w", "start"], text=True, capture_output=True)
            if start.returncode:
                raise AssertionError(f"PostgreSQL startup failed:\n{start.stdout}\n{start.stderr}\n{(work/'postgres.log').read_text(errors='replace')}")
            started = True
            check([str(PGBIN / "createdb"), "-h", str(sock), "-p", PORT, "-U", "postgres", db])
            created_dbs.append(db)
            psql = [str(PGBIN / "psql"), "-X", "-q", "-w", "-v", "ON_ERROR_STOP=1", "-h", str(sock), "-p", PORT, "-U", "postgres", "-d", db]
            def create_db(name: str) -> None:
                check([str(PGBIN / "createdb"), "-h", str(sock), "-p", PORT, "-U", "postgres", name])
                created_dbs.append(name)
            def run_driver(command: list[str], path: Path) -> subprocess.CompletedProcess[str]:
                return subprocess.run(command + ["--single-transaction", "-f", str(path)], text=True, capture_output=True)
            def stage_sql(path: Path) -> Path:
                return path
        check(psql + ["-c", "create schema supabase_migrations; create table supabase_migrations.schema_migrations(version text primary key,name text not null,statements text[] not null);"])
        check(psql + ["-c", "insert into supabase_migrations.schema_migrations values ('20261103140120','serialize_guest_preorder_capacity',array['fixture']),('20261103140631','capacity_row_lock_conflict',array['fixture']);"])

        success_sql = "create table public.runner_effect(effect text not null);\ninsert into public.runner_effect values ('committed');"
        success_file = work / "success.sql"
        success_file.write_text(success_sql)
        success_driver = work / "success-driver.sql"
        success_driver.write_text(runner.build_driver(stage_sql(success_file), success_sql, runner.split_sql(success_sql), expected_ledger_count=2))
        check(psql + ["--single-transaction", "-f", str(success_driver)] if not use_container else ["docker", "exec", "-i", container, "psql", "-X", "-q", "-w", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", db, "--single-transaction", "-f", "-"], input=success_driver.read_text() if use_container else None)
        actual = check(psql + ["-Atc", "select count(*) from public.runner_effect where effect='committed'; select count(*) from supabase_migrations.schema_migrations where version='20261104001213'; select cardinality(statements) from supabase_migrations.schema_migrations where version='20261104001213';"])
        if actual.stdout.strip().splitlines() != ["1", "1", "2"]:
            raise AssertionError(f"success/ledger verification mismatch: {actual.stdout}")
        print("runner_success_canonical_atomic_ledger=PASS")

        duplicate = run_driver(psql, success_driver)
        if duplicate.returncode == 0:
            raise AssertionError("duplicate application unexpectedly succeeded")
        actual = check(psql + ["-Atc", "select count(*) from public.runner_effect; select count(*) from supabase_migrations.schema_migrations where version='20261104001213';"])
        if actual.stdout.strip().splitlines() != ["1", "1"]:
            raise AssertionError(f"duplicate guard mutated state: {actual.stdout}")
        print("runner_duplicate_refused_without_second_write=PASS")

        failure_sql = "create table public.runner_rollback(effect text not null);\ninsert into public.runner_rollback values ('must_rollback');\nselect 1/0;"
        failure_file = work / "failure.sql"
        failure_file.write_text(failure_sql)
        failure_driver = work / "failure-driver.sql"
        failure_driver.write_text(runner.build_driver(stage_sql(failure_file), failure_sql, runner.split_sql(failure_sql), expected_ledger_count=2))
        failure_db = f"pf_capacity_runner_fail_{uuid.uuid4().hex[:8]}"
        create_db(failure_db)
        psql_failure = (["docker", "exec", "-i", container, "psql", "-X", "-q", "-w", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", failure_db] if use_container else [str(PGBIN / "psql"), "-X", "-q", "-w", "-v", "ON_ERROR_STOP=1", "-h", str(sock), "-p", PORT, "-U", "postgres", "-d", failure_db])
        check(psql_failure + ["-c", "create schema supabase_migrations; create table supabase_migrations.schema_migrations(version text primary key,name text not null,statements text[] not null);"])
        check(psql_failure + ["-c", "insert into supabase_migrations.schema_migrations values ('20261103140120','serialize_guest_preorder_capacity',array['fixture']),('20261103140631','capacity_row_lock_conflict',array['fixture']);"])
        failed = run_driver(psql_failure, failure_driver)
        if failed.returncode == 0:
            raise AssertionError("injected SQL failure unexpectedly succeeded")
        actual = check(psql_failure + ["-Atc", "select to_regclass('public.runner_rollback') is null; select count(*) from supabase_migrations.schema_migrations where version='20261104001213';"])
        if actual.stdout.strip().splitlines() != ["t", "0"]:
            raise AssertionError(f"failed transaction left partial state: {actual.stdout}")
        print("runner_failure_rolls_back_ddl_and_ledger=PASS")
    finally:
        for path in container_files:
            if use_container:
                subprocess.run(["docker", "exec", container, "rm", "-f", path], text=True, capture_output=True)
        for database in reversed(created_dbs):
            if use_container:
                subprocess.run(["docker", "exec", container, "dropdb", "-U", "postgres", "--if-exists", database], text=True, capture_output=True)
            elif started:
                subprocess.run([str(PGBIN / "dropdb"), "-h", str(sock), "-p", PORT, "-U", "postgres", "--if-exists", database], text=True, capture_output=True)
        if started:
            subprocess.run([str(PGBIN / "pg_ctl"), "-D", str(data), "-m", "immediate", "-w", "stop"], text=True, capture_output=True)
        shutil.rmtree(work, ignore_errors=True)
        if work.exists():
            raise AssertionError("temporary PostgreSQL test directory cleanup failed")
        print("runner_disposable_postgres_cleanup=PASS")


if __name__ == "__main__":
    main()
