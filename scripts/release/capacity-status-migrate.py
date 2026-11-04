#!/usr/bin/env python3
"""Apply the pinned capacity-status migration to DEV with canonical history.

This is a separately qualified replacement runner, not the historical runner.
It is deliberately pinned to one DEV project, one migration, and one version.
"""
from __future__ import annotations

import hashlib
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[2]
MIGRATION = ROOT / "supabase/migrations/20261104001213_capacity_status_consistency.sql"
PROJECT = "tzwtpxdcggesgjaqxkqr"
HOST = f"db.{PROJECT}.supabase.co"
VERSION = "20261104001213"
NAME = "capacity_status_consistency"
EXPECTED_SHA256 = "68bf1f61f463ae250238207b758106ac67f8c7df20d80a570c0a42e88867c7d4"
PREREQUISITES = ("20261103140120", "20261103140631")
FUNCTIONS = (
    ("public._assert_capacity_bucket(uuid)", "2fe623d8e5563808a166bca8447ca1f1", "search_path=\"\""),
    ("public._assert_order_capacity(uuid)", "e64765e09acc2b9f0350c08246fddf53", "search_path=\"\""),
    ("public._guest_preorder_item_fully_booked(date,uuid,uuid,uuid,integer)", "de2854270d3c0623abe3e0f9fbefc654", "search_path=public"),
    ("public._lock_capacity_order_item_row()", "8003abd4eb030e9500659142a148f9c8", "search_path=\"\""),
    ("public._lock_capacity_order_row()", "9527b7bab0ecaa5543a50b4a7710c8a6", "search_path=\"\""),
)


class Stop(RuntimeError):
    pass


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def split_sql(source: str) -> list[str]:
    """Split top-level SQL statements while respecting quotes/comments/dollar bodies."""
    out: list[str] = []
    start = 0
    i = 0
    n = len(source)
    single = double = False
    line_comment = False
    block_depth = 0
    dollar_tag: str | None = None
    while i < n:
        if line_comment:
            if source[i] == "\n":
                line_comment = False
            i += 1
            continue
        if block_depth:
            if source.startswith("/*", i):
                block_depth += 1
                i += 2
            elif source.startswith("*/", i):
                block_depth -= 1
                i += 2
            else:
                i += 1
            continue
        if dollar_tag:
            if source.startswith(dollar_tag, i):
                i += len(dollar_tag)
                dollar_tag = None
            else:
                i += 1
            continue
        ch = source[i]
        if single:
            if ch == "'":
                if i + 1 < n and source[i + 1] == "'":
                    i += 2
                    continue
                single = False
            elif ch == "\\" and i > 0 and source[i - 1] in "eE":
                i += 2
                continue
            i += 1
            continue
        if double:
            if ch == '"':
                if i + 1 < n and source[i + 1] == '"':
                    i += 2
                    continue
                double = False
            i += 1
            continue
        if source.startswith("--", i):
            line_comment = True
            i += 2
            continue
        if source.startswith("/*", i):
            block_depth = 1
            i += 2
            continue
        if ch == "'":
            single = True
            i += 1
            continue
        if ch == '"':
            double = True
            i += 1
            continue
        if ch == "$":
            match = re.match(r"\$[A-Za-z_][A-Za-z_0-9]*\$|\$\$", source[i:])
            if match:
                dollar_tag = match.group(0)
                i += len(dollar_tag)
                continue
        if ch == ";":
            piece = source[start:i + 1].strip()
            if piece and re.search(r"\S", re.sub(r"(?:--[^\n]*(?:\n|$)|/\*.*?\*/)", "", piece, flags=re.S)):
                out.append(piece[:-1].rstrip())
            start = i + 1
        i += 1
    if single or double or block_depth or dollar_tag:
        raise Stop("migration SQL has an unterminated quote or comment")
    tail = source[start:].strip()
    if tail and re.search(r"\S", re.sub(r"(?:--[^\n]*(?:\n|$)|/\*.*?\*/)", "", tail, flags=re.S)):
        out.append(tail)
    return out


def sql_literal(value: str, tag_prefix: str) -> str:
    tag = f"${tag_prefix}$"
    suffix = 0
    while tag in value:
        suffix += 1
        tag = f"${tag_prefix}_{suffix}$"
    return f"{tag}{value}{tag}"


def build_driver(migration_path: Path, sql: str, statements: list[str], expected_ledger_count: int = 189) -> str:
    path = str(migration_path.resolve())
    if "'" in path or "\n" in path or "\r" in path:
        raise Stop("migration path cannot be safely represented for psql include")
    statement_array = ",\n  ".join(sql_literal(s, "pf_capacity_stmt") for s in statements)
    guard = f"""DO $runner_guard$
BEGIN
  IF (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '{VERSION}') <> 0 THEN
    RAISE EXCEPTION 'capacity migration target version is already present';
  END IF;
  IF (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '{PREREQUISITES[0]}') <> 1
     OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '{PREREQUISITES[1]}') <> 1 THEN
    RAISE EXCEPTION 'required capacity prerequisite migration history is missing or duplicated';
  END IF;
  IF (SELECT count(*) FROM supabase_migrations.schema_migrations) <> {expected_ledger_count} THEN
    RAISE EXCEPTION 'migration ledger changed since preflight';
  END IF;
END;
$runner_guard$;
"""
    return (
        "SET LOCAL lock_timeout = '3s';\n"
        "SET LOCAL statement_timeout = '5min';\n"
        "SELECT pg_advisory_xact_lock(609986, 20261104);\n"
        + guard
        + f"\\i '{path}'\n"
        + "INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES (\n"
        + f"  '{VERSION}', '{NAME}', ARRAY[\n  {statement_array}\n]::text[]\n);\n"
    )


def connection() -> tuple[list[str], dict[str, str]]:
    env = os.environ.copy()
    expected = {
        "PF_PROJECT_REF": PROJECT,
        "PGHOST": HOST,
        "PGPORT": "5432",
        "PGDATABASE": "postgres",
        "PGUSER": "postgres",
        "PGSSLMODE": "verify-full",
    }
    if any(env.get(k) != v for k, v in expected.items()):
        raise Stop("DEV project, direct host, database, user, port, or verify-full TLS mismatch")
    for key in ("PGPASSWORD", "PGSERVICE", "PGSERVICEFILE", "PGHOSTADDR", "PGOPTIONS"):
        if env.get(key):
            raise Stop(f"forbidden PostgreSQL connection override: {key}")
    passfile = Path(env.get("PGPASSFILE", ""))
    if not passfile.is_file() or stat.S_IMODE(passfile.stat().st_mode) != 0o600:
        raise Stop("PGPASSFILE must exist with mode 0600")
    env["PGCONNECT_TIMEOUT"] = "10"
    cmd = ["psql", "-X", "-q", "-w", "-A", "-t", "-v", "ON_ERROR_STOP=1",
           "-h", HOST, "-p", "5432", "-U", "postgres", "-d", "postgres"]
    return cmd, env


def run(cmd: list[str], env: dict[str, str], sql: str) -> str:
    result = subprocess.run(cmd + ["-c", sql], env=env, text=True, capture_output=True, timeout=130)
    if result.returncode:
        raise Stop(f"read-only PostgreSQL query failed (psql exit {result.returncode})")
    return result.stdout.strip()


def preflight(cmd: list[str], env: dict[str, str]) -> None:
    identity = run(cmd, env, """select current_database()||'|'||current_user||'|'||current_setting('server_version_num')||'|'||coalesce(inet_server_addr()::text,'local')||'|'||coalesce((select ssl::text from pg_stat_ssl where pid=pg_backend_pid()),'f')""").split("|")
    if len(identity) != 5 or identity[0] != "postgres" or identity[1] != "postgres" or not identity[2].startswith("17") or identity[3] == "local" or identity[4] != "true":
        raise Stop("connected database identity or TLS verification failed")
    if not MIGRATION.is_file() or digest(MIGRATION) != EXPECTED_SHA256:
        raise Stop("approved migration is missing or its SHA-256 changed")
    history = run(cmd, env, f"""select
      count(*) filter (where version='{PREREQUISITES[0]}'),
      count(*) filter (where version='{PREREQUISITES[1]}'),
      count(*) filter (where version='{VERSION}'),
      count(*)
      from supabase_migrations.schema_migrations""").split("|")
    if history != ["1", "1", "0", "189"]:
        raise Stop(f"DEV migration ledger precondition mismatch: {history}")
    for signature, fingerprint, search_path in FUNCTIONS:
        found = run(cmd, env, f"""select md5(pg_get_functiondef(p.oid))||'|'||r.rolname||'|'||p.prosecdef::text||'|'||coalesce(array_to_string(p.proconfig,','),'')||'|'||has_function_privilege('anon',p.oid,'EXECUTE')::text||'|'||has_function_privilege('authenticated',p.oid,'EXECUTE')::text
          from pg_proc p join pg_roles r on r.oid=p.proowner where p.oid='{signature}'::regprocedure""")
        expected = f"{fingerprint}|postgres|true|{search_path}|false|false"
        if found != expected:
            raise Stop(f"function prerequisite mismatch for {signature}")


def main() -> None:
    if len(sys.argv) != 2 or sys.argv[1] not in {"preflight", "apply"}:
        raise Stop("usage: capacity-status-migrate.py preflight|apply")
    cmd, env = connection()
    preflight(cmd, env)
    print("PREFLIGHT=PASS project=tzwtpxdcggesgjaqxkqr postgres=17.6 tls=verify-full ledger=189 prereqs=1,1 target=absent fingerprints=PASS")
    if sys.argv[1] == "preflight":
        return
    source = MIGRATION.read_text(encoding="utf-8")
    statements = split_sql(source)
    if len(statements) != 2 or any(re.search(r"(?im)^\s*(begin|commit|rollback)\s*;", s) for s in statements):
        raise Stop("migration statement split or transaction-control check failed")
    driver = build_driver(MIGRATION, source, statements)
    with tempfile.TemporaryDirectory(prefix="pf-capacity-status-", dir="/private/tmp") as tmp:
        wrapper = Path(tmp) / "transaction.sql"
        wrapper.write_text(driver, encoding="utf-8")
        os.chmod(wrapper, 0o600)
        result = subprocess.run(cmd + ["--single-transaction", "-f", str(wrapper)], env=env, text=True, capture_output=True, timeout=330)
    if result.returncode:
        # Deliberately do not retry: commit outcome must be inspected read-only.
        raise Stop(f"transaction failed or outcome is ambiguous (psql exit {result.returncode}); inspect DEV ledger and function fingerprints read-only before any retry")
    post = run(cmd, env, f"""select
      count(*) filter (where version='{VERSION}' and name='{NAME}')::text||'|'||count(*)::text||'|'||
      (select count(*)::text from pg_proc p join pg_roles r on r.oid=p.proowner
       where p.oid in (
         'public._assert_capacity_bucket(uuid)'::regprocedure,
         'public._assert_order_capacity(uuid)'::regprocedure,
         'public._guest_preorder_item_fully_booked(date,uuid,uuid,uuid,integer)'::regprocedure,
         'public._lock_capacity_order_item_row()'::regprocedure,
         'public._lock_capacity_order_row()'::regprocedure
       ) and r.rolname='postgres' and p.prosecdef
         and not has_function_privilege('anon',p.oid,'EXECUTE')
         and not has_function_privilege('authenticated',p.oid,'EXECUTE')
         and pg_get_functiondef(p.oid) like '%''confirmed''%')||'|'||
      (select count(*)::text from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
       where n.nspname='public' and not t.tgisinternal and t.tgenabled='O'
         and t.tgname=any(array['lock_production_capacity_orders','lock_production_capacity_order_items','lock_production_capacity_definitions','lock_production_capacity_holds','assert_production_capacity_orders','assert_production_capacity_order_items','assert_production_capacity_definitions','assert_production_capacity_holds']))
      from supabase_migrations.schema_migrations""")
    if post != "1|190|5|8":
        raise Stop(f"post-commit ledger assertion failed: {post}; do not retry")
    print("MIGRATION=COMMITTED_AND_VERIFIED version=20261104001213 count=190 functions=5 triggers=8")


if __name__ == "__main__":
    try:
        main()
    except (Stop, subprocess.TimeoutExpired) as exc:
        print(f"STOP: {exc}", file=sys.stderr)
        raise SystemExit(1)
