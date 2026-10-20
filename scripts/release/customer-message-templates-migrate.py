#!/usr/bin/env python3
"""Apply only Customer Message Templates V1 after a separate Owner release approval.

The rehearsal mode accepts only a local Unix socket. Production apply requires a
fresh, exact approval and backup attestation; neither is included in this package.
"""

from __future__ import annotations

import argparse
from datetime import datetime, timedelta, timezone
import hashlib
import json
import os
from pathlib import Path
import stat
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[2]
MIGRATION = ROOT / "supabase/migrations/20261020075703_customer_message_templates_v1.sql"
MANIFEST = Path(__file__).with_name("customer-message-templates-production-ledger.json")
VERSION = "20261020075703"
NAME = "customer_message_templates_v1"
PROJECT = "cuowwlduhxxifmpvpltt"
HOST = f"db.{PROJECT}.supabase.co"
SQL_SHA256 = "5de1415347da65b727845c67c508e249f38c9fefe823dc2ae073857f74ba686a"
MANIFEST_SHA256 = "81da91a1e7842c3fa425b8ef8817e5b0999d31861964142f84c1833a187355ac"
BACKUP_DIR = Path("/Users/ycwee/Library/Application Support/Project Flour/Backups")
FUNCTIONS = (
    "customer_message_templates_is_active_staff",
    "customer_message_templates_can_manage",
    "_write_customer_message_template",
    "save_customer_message_template",
    "reset_customer_message_template",
    "restore_customer_message_template_revision",
)
EXPECTED_CATALOG = {
    "staff_columns": ["id:uuid", "auth_user_id:uuid", "display_name:text", "role_id:uuid", "is_active:boolean", "archived_at:timestamp with time zone"],
    "role_columns": ["id:uuid", "code:text"],
    "role_codes": ["bakery", "collection", "customer_operations", "manager", "owner"],
    "auth_uid": "ea3b41bf29e2ad573067939329aa088e",
    "ledger_columns": ["version:text", "name:text", "statements:ARRAY"],
}


class Stop(RuntimeError):
    pass


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def package() -> list[dict[str, str]]:
    if not MIGRATION.is_file() or digest(MIGRATION) != SQL_SHA256:
        raise Stop("approved migration file missing or SHA-256 changed")
    sql = MIGRATION.read_text()
    if "\\begin" in sql.lower() or "\\commit" in sql.lower() or "\ncommit;" in sql.lower():
        raise Stop("migration contains transaction control")
    if not MANIFEST.is_file() or digest(MANIFEST) != MANIFEST_SHA256:
        raise Stop("pinned Production ledger manifest missing or SHA-256 changed")
    data = json.loads(MANIFEST.read_text())
    entries = data.get("entries")
    if data.get("project_ref") != PROJECT or data.get("historical_count") != 161 or not isinstance(entries, list) or len(entries) != 161:
        raise Stop("Production ledger manifest identity or count mismatch")
    versions = [item["version"] for item in entries]
    if len(set(versions)) != 161 or VERSION in versions or any(not item.get("name") for item in entries):
        raise Stop("Production ledger manifest contains duplicate, missing, or feature versions")
    return entries


def production_connection() -> tuple[list[str], dict[str, str]]:
    env = os.environ.copy()
    expected = {"PF_PROJECT_REF": PROJECT, "PGHOST": HOST, "PGPORT": "5432", "PGDATABASE": "postgres", "PGUSER": "postgres", "PGSSLMODE": "verify-full"}
    if any(env.get(key) != value for key, value in expected.items()):
        raise Stop("Production project, direct host, database identity, or verify-full TLS mismatch")
    for key in ("PGPASSWORD", "PGSERVICE", "PGSERVICEFILE", "PGHOSTADDR", "PGOPTIONS", "PGCONNECT_TIMEOUT"):
        if env.get(key):
            raise Stop(f"connection override {key} is forbidden")
    passfile = Path(env.get("PGPASSFILE", ""))
    if not passfile.is_file() or stat.S_IMODE(passfile.stat().st_mode) != 0o600:
        raise Stop("PGPASSFILE must be an existing mode-0600 file")
    env["PGOPTIONS"] = "-c lock_timeout=2000 -c statement_timeout=120000"
    env["PGCONNECT_TIMEOUT"] = "10"
    return ["psql", "-X", "-q", "-w", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-h", HOST, "-p", "5432", "-U", "postgres", "-d", "postgres"], env


def local_connection(socket: str, port: int, database: str) -> tuple[list[str], dict[str, str]]:
    path = Path(socket).resolve()
    if not path.is_dir() or not path.is_relative_to(Path("/private/tmp")) or not database.startswith("pf_cmt_rehearsal_"):
        raise Stop("rehearsal requires a disposable /private/tmp Unix socket and pf_cmt_rehearsal_ database")
    env = os.environ.copy()
    for key in ("PGPASSWORD", "PGSERVICE", "PGSERVICEFILE", "PGHOSTADDR", "PGOPTIONS"):
        env.pop(key, None)
    env["PGOPTIONS"] = "-c lock_timeout=2000 -c statement_timeout=120000"
    return ["psql", "-X", "-q", "-w", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-h", str(path), "-p", str(port), "-U", "postgres", "-d", database], env


def query(command: list[str], env: dict[str, str], sql: str) -> str:
    result = subprocess.run(command + ["-c", sql], env=env, text=True, capture_output=True, timeout=130)
    if result.returncode:
        raise Stop(f"read-only database check failed (psql exit {result.returncode}); inspect locally without retrying")
    return result.stdout.strip()


def verify_identity(command: list[str], env: dict[str, str], *, rehearsal: bool) -> None:
    sql = "select current_database()||'|'||current_user||'|'||current_setting('server_version_num')||'|'||coalesce(inet_server_addr()::text,'local')||'|'||coalesce((select ssl::text from pg_stat_ssl where pid=pg_backend_pid()),'f')"
    parts = query(command, env, sql).split("|")
    if len(parts) != 5 or parts[1] != "postgres" or not parts[2].startswith("17"):
        raise Stop("database user or PostgreSQL major version mismatch")
    if rehearsal:
        if not parts[0].startswith("pf_cmt_rehearsal_") or parts[3] != "local":
            raise Stop("rehearsal target is not the isolated local database")
    elif parts[0] != "postgres" or parts[3] == "local" or parts[4] != "true":
        raise Stop("Production database identity or TLS session mismatch")


def ledger(command: list[str], env: dict[str, str], expected: list[dict[str, str]], *, applied: bool) -> None:
    raw = query(command, env, "select version||chr(9)||name from supabase_migrations.schema_migrations order by version")
    rows = [tuple(line.split("\t")) for line in raw.splitlines()]
    wanted = sorted((item["version"], item["name"]) for item in expected)
    if applied:
        wanted.append((VERSION, NAME))
    if len(rows) != len(wanted) or len({row[0] for row in rows}) != len(rows) or sorted(rows) != sorted(wanted):
        raise Stop("ledger differs from the exact 161 historical version/name pairs plus approved feature state")


def catalog(command: list[str], env: dict[str, str], *, applied: bool) -> None:
    function_names = ",".join("'" + name + "'" for name in FUNCTIONS)
    sql = f"""select jsonb_build_object(
      'staff_columns',(select jsonb_agg(column_name||':'||data_type order by ordinal_position) from information_schema.columns where table_schema='public' and table_name='staff_profiles' and column_name in ('id','auth_user_id','role_id','is_active','archived_at','display_name')),
      'role_columns',(select jsonb_agg(column_name||':'||data_type order by ordinal_position) from information_schema.columns where table_schema='public' and table_name='roles' and column_name in ('id','code')),
      'role_codes',(select jsonb_agg(code order by code) from public.roles),
      'auth_uid',(select md5(pg_get_functiondef('auth.uid()'::regprocedure))),
      'ledger_columns',(select jsonb_agg(column_name||':'||data_type order by ordinal_position) from information_schema.columns where table_schema='supabase_migrations' and table_name='schema_migrations' and column_name in ('version','name','statements')),
      'target_table_count',((to_regclass('public.customer_message_templates') is not null)::int + (to_regclass('public.customer_message_template_revisions') is not null)::int),
      'target_function_count',(select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ({function_names}))
    )::text"""
    found = json.loads(query(command, env, sql))
    required = {**EXPECTED_CATALOG, "target_table_count": 2 if applied else 0, "target_function_count": 6 if applied else 0}
    if found != required:
        raise Stop("dependency or feature-object catalog preconditions differ; possible partial application")


def verify_feature(command: list[str], env: dict[str, str]) -> None:
    sql = """select jsonb_build_object(
      'templates',(select count(*) from public.customer_message_templates),
      'unique_keys',(select count(distinct template_key) from public.customer_message_templates),
      'seed_revisions',(select count(*) from public.customer_message_template_revisions where action='seed'),
      'default_bodies',(select count(*) from public.customer_message_templates where body=default_body and revision=1),
      'rls',(select bool_and(relrowsecurity) from pg_class where oid in ('public.customer_message_templates'::regclass,'public.customer_message_template_revisions'::regclass)),
      'anon_table_read',has_table_privilege('anon','public.customer_message_templates','SELECT'),
      'staff_table_read',has_table_privilege('authenticated','public.customer_message_templates','SELECT'),
      'staff_table_write',has_table_privilege('authenticated','public.customer_message_templates','INSERT,UPDATE,DELETE'),
      'anon_save',has_function_privilege('anon','public.save_customer_message_template(text,text,integer)','EXECUTE'),
      'staff_save',has_function_privilege('authenticated','public.save_customer_message_template(text,text,integer)','EXECUTE'),
      'policy_count',(select count(*) from pg_policies where schemaname='public' and tablename in ('customer_message_templates','customer_message_template_revisions'))
    )::text"""
    found = json.loads(query(command, env, sql))
    expected = {"templates": 19, "unique_keys": 19, "seed_revisions": 19, "default_bodies": 19, "rls": True,
                "anon_table_read": False, "staff_table_read": True, "staff_table_write": False,
                "anon_save": False, "staff_save": True, "policy_count": 2}
    if found != expected:
        raise Stop("post-migration defaults, revisions, RLS, or privileges differ")


def approval(path: Path, commit: str) -> None:
    if not path.is_file() or stat.S_IMODE(path.stat().st_mode) != 0o600:
        raise Stop("separate mode-0600 Owner approval file is absent")
    data = json.loads(path.read_text())
    backup = Path(data.get("backup_archive_path", ""))
    if not backup.is_file() or not backup.resolve().is_relative_to(BACKUP_DIR.resolve()):
        raise Stop("approved backup archive is missing from the protected backup directory")
    required = {"authorized": True, "project_ref": PROJECT, "feature_commit": commit, "migration_version": VERSION,
                "migration_sha256": SQL_SHA256, "ledger_manifest_sha256": MANIFEST_SHA256,
                "runner_sha256": digest(Path(__file__)), "backup_archive_sha256": digest(backup),
                "backup_verified_current_for_release": True, "backup_has_uncovered_changes": False}
    if any(data.get(key) != value for key, value in required.items()):
        raise Stop("Owner approval does not exactly bind source, runner, migration, ledger, project, and current verified backup")
    try:
        captured = datetime.fromisoformat(data["backup_captured_at_utc"].replace("Z", "+00:00"))
        verified = datetime.fromisoformat(data["backup_verified_at_utc"].replace("Z", "+00:00"))
    except (KeyError, TypeError, ValueError) as error:
        raise Stop("fresh backup capture and verification times are required") from error
    now = datetime.now(timezone.utc)
    if (captured.tzinfo is None or verified.tzinfo is None or captured > verified or verified > now
            or now - captured > timedelta(hours=24) or now - verified > timedelta(hours=2)):
        raise Stop("backup capture or currentness verification is stale or inconsistent")
    if not sys.stdin.isatty():
        raise Stop("interactive Production project confirmation is required")
    if input("Type the Production project reference to confirm the migration target: ").strip() != PROJECT:
        raise Stop("typed Production project reference mismatch")


def apply(command: list[str], env: dict[str, str], *, inject_rehearsal_failure: bool = False) -> None:
    body = MIGRATION.read_text()
    tag = "$pf_cmt_v1$"
    if tag in body:
        raise Stop("migration contains the runner ledger delimiter")
    statements = ["BEGIN;", "SET LOCAL lock_timeout = '2s';", "SET LOCAL statement_timeout = '120s';",
                  "SELECT pg_advisory_xact_lock(609986, 20261020);", body]
    if inject_rehearsal_failure:
        statements.append("SELECT 1 / 0;")
    statements.extend((f"INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES ('{VERSION}','{NAME}', ARRAY[{tag}{body}{tag}]::text[]);", "COMMIT;"))
    transaction = "\n".join(statements)
    with tempfile.TemporaryDirectory(prefix="pf-cmt-migration-", dir="/private/tmp") as directory:
        wrapper = Path(directory) / "transaction.sql"
        wrapper.write_text(transaction)
        os.chmod(wrapper, 0o600)
        result = subprocess.run(command + ["-f", str(wrapper)], env=env, text=True, capture_output=True, timeout=130)
    if result.returncode:
        raise Stop(f"migration transaction failed (psql exit {result.returncode}); no automatic retry; inspect ledger and catalog read-only")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mode", choices=("rehearsal", "production-check", "production-apply"), required=True)
    parser.add_argument("--socket")
    parser.add_argument("--port", type=int)
    parser.add_argument("--database")
    parser.add_argument("--approval-file", type=Path)
    parser.add_argument("--inject-rehearsal-failure", action="store_true")
    args = parser.parse_args()
    history = package()
    if args.inject_rehearsal_failure and args.mode != "rehearsal":
        raise Stop("failure injection is restricted to the isolated rehearsal mode")
    if args.mode == "rehearsal":
        if args.approval_file or not args.socket or not args.port or not args.database:
            raise Stop("rehearsal requires only a local socket, port, and disposable database")
        command, env = local_connection(args.socket, args.port, args.database)
    else:
        if args.socket or args.port or args.database:
            raise Stop("Production mode rejects rehearsal target overrides")
        command, env = production_connection()
    verify_identity(command, env, rehearsal=args.mode == "rehearsal")
    ledger(command, env, history, applied=False)
    catalog(command, env, applied=False)
    print("PREFLIGHT PASS: project/database, TLS or local socket, exact 161-entry ledger, dependencies, absent feature objects, pinned SQL")
    if args.mode == "production-check":
        return
    if args.mode == "production-apply":
        if not args.approval_file:
            raise Stop("separate Owner approval file required before any Production write")
        commit = subprocess.run(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True, capture_output=True, check=True).stdout.strip()
        approval(args.approval_file, commit)
        ledger(command, env, history, applied=False)
        catalog(command, env, applied=False)
    apply(command, env, inject_rehearsal_failure=args.inject_rehearsal_failure)
    ledger(command, env, history, applied=True)
    catalog(command, env, applied=True)
    verify_feature(command, env)
    print("COMMITTED AND VERIFIED: one allowlisted migration, 162 ledger entries, 19 defaults, revisions, RLS and grants")


if __name__ == "__main__":
    try:
        main()
    except (Stop, subprocess.TimeoutExpired) as error:
        print(f"STOP: {error}", file=sys.stderr)
        sys.exit(1)
