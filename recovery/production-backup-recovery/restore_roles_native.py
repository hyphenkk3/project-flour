#!/usr/bin/env python3
"""Replay the reviewed November 15 roles dump through native psql locally.

The caller must provide decrypted SQL on stdin and a disposable Docker container
initialized with supabase_admin as PostgreSQL's bootstrap superuser (OID 10),
with Docker network mode `none`. Plaintext is held only in process memory and
streamed to psql over docker exec stdin.
"""
from __future__ import annotations

import argparse
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys

from audit_roles_archive import _split_sql, _type_and_details

MAX_SQL_BYTES = 16 * 1024 * 1024
DOCKER_TIMEOUT = 15
REPLAY_TIMEOUT = 180
EXPECTED_IMAGE = "pf-backup-test:17.6.1.167"
EXPECTED_IMAGE_ID = "sha256:95d83f580287f55cf14e5e79e52ec930e08a9db089852e282ffc62790eb2e21f"
EXPECTED_ROLE_DEFINITIONS = {
    "anon", "authenticated", "authenticator", "cli_login_postgres",
    "dashboard_user", "pgbouncer", "postgres", "service_role",
    "supabase_admin", "supabase_auth_admin", "supabase_etl_admin",
    "supabase_privileged_role", "supabase_read_only_user",
    "supabase_realtime_admin", "supabase_replication_admin",
    "supabase_storage_admin",
}
EXPECTED_PREDEFINED_ROLES = {
    "pg_create_subscription", "pg_monitor", "pg_read_all_data", "pg_signal_backend",
}
EXPECTED_MEMBERSHIPS = {
    ("anon", "authenticator", False, False, True),
    ("anon", "postgres", True, True, True),
    ("anon", "supabase_realtime_admin", False, False, True),
    ("authenticated", "authenticator", False, False, True),
    ("authenticated", "postgres", True, True, True),
    ("authenticated", "supabase_realtime_admin", False, False, True),
    ("authenticator", "postgres", True, True, True),
    ("authenticator", "supabase_storage_admin", False, False, True),
    ("pg_create_subscription", "postgres", True, True, True),
    ("pg_monitor", "postgres", True, True, True),
    ("pg_monitor", "supabase_etl_admin", False, True, True),
    ("pg_monitor", "supabase_read_only_user", False, True, True),
    ("pg_read_all_data", "postgres", True, True, True),
    ("pg_read_all_data", "supabase_etl_admin", False, True, True),
    ("pg_read_all_data", "supabase_read_only_user", False, True, True),
    ("pg_signal_backend", "postgres", True, True, True),
    ("postgres", "cli_login_postgres", False, False, True),
    ("service_role", "authenticator", False, False, True),
    ("service_role", "postgres", True, True, True),
    ("service_role", "supabase_realtime_admin", False, False, True),
    ("supabase_privileged_role", "postgres", False, True, True),
    ("supabase_privileged_role", "supabase_etl_admin", False, True, True),
}
BOOTSTRAP_MEMBERSHIPS = {
    ("pg_read_all_settings", "pg_monitor", False, True, True),
    ("pg_read_all_stats", "pg_monitor", False, True, True),
    ("pg_stat_scan_tables", "pg_monitor", False, True, True),
}


class RestoreError(Exception):
    pass


def _run_docker(docker: str, args: list[str], *, input_bytes: bytes | None = None,
                timeout: int = DOCKER_TIMEOUT) -> bytes:
    env = {"PATH": os.environ.get("PATH", "/usr/bin:/bin"), "LANG": "C"}
    try:
        proc = subprocess.run(
            [docker, *args], input=input_bytes, stdout=subprocess.PIPE,
            stderr=subprocess.PIPE, env=env, timeout=timeout, check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise RestoreError("local disposable container command failed or timed out") from exc
    if proc.returncode:
        raise RestoreError("local disposable container command failed")
    return proc.stdout


def _psql(docker: str, container: str, sql: str, *, replay: bool = False) -> str:
    cmd = ["exec", "-i", container, "psql", "-X", "-A", "-t",
           "-v", "ON_ERROR_STOP=1", "-h", "/var/run/postgresql",
           "-U", "supabase_admin", "-d", "postgres"]
    try:
        proc = subprocess.run(
            [docker, *cmd], input=sql.encode("utf-8"), stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env={"PATH": os.environ.get("PATH", "/usr/bin:/bin"), "LANG": "C"},
            timeout=REPLAY_TIMEOUT if replay else DOCKER_TIMEOUT, check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise RestoreError("native PostgreSQL command failed or timed out") from exc
    if proc.returncode:
        # Do not forward psql output: the source contains role configuration values.
        raise RestoreError("native PostgreSQL role replay failed")
    return proc.stdout.decode("utf-8", errors="strict").strip()


def _container_preflight(docker: str, container: str) -> None:
    inspect = _run_docker(docker, ["inspect", "--format",
        "{{.State.Running}}|{{.HostConfig.NetworkMode}}|{{.Config.Image}}|{{.Image}}", container])
    if inspect.decode().strip() != f"true|none|{EXPECTED_IMAGE}|{EXPECTED_IMAGE_ID}":
        raise RestoreError("container must use the pinned PostgreSQL 17.6 image with network mode none")
    identity = _psql(docker, container,
        "SELECT current_user || '|' || (SELECT oid::text FROM pg_authid WHERE rolname=current_user) "
        "|| '|' || current_setting('server_version_num') || '|' || "
        "(SELECT rolsuper::text FROM pg_authid WHERE rolname=current_user);")
    fields = identity.split("|")
    if len(fields) != 4 or fields[0] != "supabase_admin" or fields[1] != "10" \
            or fields[2] != "170006" or fields[3] != "true":
        raise RestoreError("bootstrap identity/version preflight failed")
    predefined = _psql(docker, container,
        "SELECT count(*) FROM pg_roles WHERE rolname IN "
        "('pg_create_subscription','pg_monitor','pg_read_all_data','pg_signal_backend');")
    if predefined != "4":
        raise RestoreError("PostgreSQL 17 predefined role bootstrap is incomplete")


def _prepare(sql_bytes: bytes) -> tuple[bytes, int]:
    if not sql_bytes or len(sql_bytes) > MAX_SQL_BYTES or b"\x00" in sql_bytes:
        raise RestoreError("role archive input is empty or outside limits")
    try:
        sql = sql_bytes.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise RestoreError("role archive encoding is invalid") from exc
    statements = _split_sql(sql)
    rows = [_type_and_details(statement) for _, statement in statements]
    for row in rows:
        if not row.get("supported_by_audit_parser") or row.get("password_clause"):
            raise RestoreError("role archive contains unsupported or password-bearing SQL")

    type_counts: dict[str, int] = {}
    for row in rows:
        type_counts[row["type"]] = type_counts.get(row["type"], 0) + 1
    if (len(rows) != 75 or type_counts.get("CREATE ROLE") != 16
            or type_counts.get("ALTER ROLE") != 16
            or type_counts.get("ALTER ROLE SET/RESET") != 15
            or type_counts.get("GRANT") != 23 or type_counts.get("SET") != 3
            or type_counts.get("PSQL_META") != 2):
        raise RestoreError("role archive inventory does not match the reviewed 75-statement structure")

    role_definitions = {role for row in rows if row["type"] == "CREATE ROLE" for role in row["roles"]}
    if role_definitions != EXPECTED_ROLE_DEFINITIONS:
        raise RestoreError("role definition set differs from reviewed inventory")
    memberships = [row for row in rows if row["classification"] == "role_membership_grant"]
    if len(memberships) != 22 or {row["grantor"] for row in memberships} != {"supabase_admin"}:
        raise RestoreError("role membership grantors/count differ from reviewed inventory")
    seen = set()
    for row in memberships:
        for dependency in row["dependencies"]:
            for member in dependency["member_roles"]:
                seen.add((dependency["granted_role"], member))
    if seen != {(role, member) for role, member, *_ in EXPECTED_MEMBERSHIPS}:
        raise RestoreError("role membership dependencies differ from reviewed inventory")
    parameter_grants = [row for row in rows if row["classification"] == "configuration_parameter_privilege_grant"]
    if len(parameter_grants) != 1 or parameter_grants[0]["dependencies"] != [{
        "parameter": "log_min_messages", "privilege": "SET",
        "grantee_roles": ["supabase_realtime_admin"],
    }]:
        raise RestoreError("parameter privilege dependency differs from reviewed inventory")

    output: list[str] = []
    skipped_bootstrap_create = 0
    for (_, statement), row in zip(statements, rows):
        if row["type"] == "CREATE ROLE" and row["roles"] == ["supabase_admin"]:
            normalized = re.sub(r"(?s)/\*.*?\*/|--[^\n]*", " ", statement).strip().rstrip(";").strip()
            if (skipped_bootstrap_create or row["role_attributes"] or row["password_clause"]
                    or not re.fullmatch(r'(?is)CREATE\s+ROLE\s+(?:"supabase_admin"|supabase_admin)', normalized)):
                raise RestoreError("bootstrap role definition is not the reviewed bare CREATE ROLE form")
            output.append("-- supabase_admin already exists as verified bootstrap OID 10; ALTER ROLE follows\n")
            skipped_bootstrap_create += 1
        elif row["type"] == "PSQL_META":
            output.append(statement + "\n")
        else:
            output.append(statement + ";\n")
    if skipped_bootstrap_create != 1:
        raise RestoreError("expected one bare supabase_admin bootstrap role definition")
    return "".join(output).encode("utf-8"), len(rows)


def _verify_graph(docker: str, container: str) -> None:
    expected_values = ",\n".join(
        "('%s','%s',%s,%s,%s)" % (role, member,
            str(admin).lower(), str(inherit).lower(), str(set_option).lower())
        for role, member, admin, inherit, set_option in sorted(EXPECTED_MEMBERSHIPS)
    )
    builtin_values = ",\n".join(
        "('%s','%s',%s,%s,%s)" % (role, member,
            str(admin).lower(), str(inherit).lower(), str(set_option).lower())
        for role, member, admin, inherit, set_option in sorted(BOOTSTRAP_MEMBERSHIPS)
    )
    query = f"""
WITH expected(role_name,member_name,admin_option,inherit_option,set_option) AS (VALUES {expected_values}),
builtin(role_name,member_name,admin_option,inherit_option,set_option) AS (VALUES {builtin_values}),
actual AS (
 SELECT r.rolname role_name,u.rolname member_name,g.rolname grantor_name,
        m.admin_option,m.inherit_option,m.set_option
 FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.roleid
 JOIN pg_roles u ON u.oid=m.member JOIN pg_roles g ON g.oid=m.grantor
),
source_mismatch AS (
 SELECT count(*) n FROM expected e LEFT JOIN actual a
 ON (a.role_name,a.member_name)=(e.role_name,e.member_name)
 WHERE a.role_name IS NULL OR a.grantor_name <> 'supabase_admin'
    OR a.admin_option <> e.admin_option OR a.inherit_option <> e.inherit_option
    OR a.set_option <> e.set_option
),
builtin_mismatch AS (
 SELECT count(*) n FROM builtin e LEFT JOIN actual a
 ON (a.role_name,a.member_name)=(e.role_name,e.member_name)
 WHERE a.role_name IS NULL OR a.admin_option <> e.admin_option
    OR a.inherit_option <> e.inherit_option OR a.set_option <> e.set_option
),
counts AS (
 SELECT count(*) FILTER (WHERE grantor_name='supabase_admin') total,
        count(*) FILTER (WHERE (role_name,member_name) IN
          (SELECT role_name,member_name FROM expected)) source_total,
        count(*) FILTER (WHERE (role_name,member_name) IN
          (SELECT role_name,member_name FROM builtin)) builtin_total
 FROM actual
)
SELECT (SELECT n FROM source_mismatch)||'|'||(SELECT n FROM builtin_mismatch)||'|'
       ||total||'|'||source_total||'|'||builtin_total
FROM counts;
"""
    result = _psql(docker, container, query)
    if result != "0|0|25|22|3":
        raise RestoreError("restored role graph or membership options did not match expectations")
    parameter = _psql(docker, container,
        "SELECT has_parameter_privilege('supabase_realtime_admin','log_min_messages','SET');")
    if parameter != "t":
        raise RestoreError("restored parameter privilege did not match expectations")


def replay(container: str, sql_bytes: bytes) -> int:
    docker = shutil.which("docker")
    if not docker:
        raise RestoreError("Docker client unavailable")
    _container_preflight(docker, container)
    prepared, statement_count = _prepare(sql_bytes)
    _psql(docker, container, prepared.decode("utf-8"), replay=True)
    _verify_graph(docker, container)
    return statement_count


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--container", required=True, help="running isolated pinned PostgreSQL 17.6 container name")
    args = parser.parse_args()
    try:
        data = sys.stdin.buffer.read(MAX_SQL_BYTES + 1)
        count = replay(args.container, data)
    except RestoreError as exc:
        print(f"HOLD: {exc}", file=sys.stderr)
        return 2
    except Exception:
        print("HOLD: unexpected local role replay failure", file=sys.stderr)
        return 2
    print(f"ROLE_ARCHIVE_REPLAY=PASS statements={count} membership_grants=22 bootstrap=supabase_admin_oid10")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
