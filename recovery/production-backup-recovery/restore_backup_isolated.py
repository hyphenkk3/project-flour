#!/usr/bin/env python3
"""Restore the pinned PFBAK01 database/roles capture into isolated PostgreSQL.

The real Owner entry point accepts only the pinned November 15 backup directory.
Synthetic tests call run_restore() with synthetic encrypted fixtures. Plaintext
archives are kept in memory and sent through Docker stdin; no archive payload or
passphrase is written to disk.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import select
import shutil
import signal
import stat
import subprocess
import sys
import termios
import time
import uuid

import audit_roles_archive as role_audit
import restore_roles_native as role_restore

HERE = Path(__file__).resolve().parent
CRYPTO = HERE / "stream-crypto.js"
DEFAULT_ARCHIVE_DIR = Path.home() / "Library/Application Support/Project Flour/Backups/production-full-20261115T152443Z-5b9a8ac0"
EXPECTED_PROJECT = "cuowwlduhxxifmpvpltt"
EXPECTED_DB = "postgres"
EXPECTED_SERVER_VERSION_NUM = "170006"
EXPECTED_LEDGER_COUNT = 191
EXPECTED_LEDGER_LATEST = "20261106104602"
EXPECTED_CANDIDATE_MIGRATIONS = {
    "20261109110501", "20261109193000", "20261109213004",
    "20261111110823", "20261114120000",
}
EXPECTED_HASHES = {
    "database/database.dump.pfbackup": "382d85055f6a59492953dddb4644f5eb050e29d3f59e8b68137aacc53d7acf16",
    "database/roles.sql.pfbackup": "fc3eb126693f9cd154e8b3b55aebca04ce4b83f35b3c44ef54e4f1c527c4070f",
    "storage/storage.tar.pfbackup": "10b22ab606905764f61ea96b45f29793346d803684da94d6d33dd7b375e785a8",
}
EXPECTED_EXTENSIONS = {
    "btree_gist", "citext", "pg_cron", "pg_stat_statements",
    "pgcrypto", "supabase_vault", "uuid-ossp",
}
PINNED_IMAGE = "pf-backup-test:17.6.1.167"
PINNED_IMAGE_ID = "sha256:95d83f580287f55cf14e5e79e52ec930e08a9db089852e282ffc62790eb2e21f"
PFBAK_MAGIC = b"PFBAK01"
PFBAK_HEADER_BYTES = 51
MAX_PASS_BYTES = 4096
MAX_ROLE_PLAINTEXT = 16 * 1024 * 1024
MAX_DB_PLAINTEXT = 512 * 1024 * 1024
PROMPT_TIMEOUT_SECONDS = 120
DECRYPT_TIMEOUT_SECONDS = 900
DOCKER_TIMEOUT_SECONDS = 30
STARTUP_TIMEOUT_SECONDS = 120
RESTORE_TIMEOUT_SECONDS = 1800
DATA_TABLE_PATTERN = re.compile(r"(order|payment|customer|stock|inventory|cake|collection|profile|migration)", re.I)
CRITICAL_DATA_GROUPS = ("order", "payment", "customer", "cake", "stock", "profile", "migration")


class RestoreError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


class InterruptedRestore(RestoreError):
    pass


class ValidationReport:
    def __init__(self, path: Path):
        self.path = path
        self.data: dict = {
            "schema": "project-flour-isolated-restore-report-v1",
            "started_at_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "status": "RUNNING",
            "gates": [],
            "archive_hashes": {},
            "restore": {},
            "limitations": [],
        }
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        os.close(fd)
        self.flush()

    def flush(self) -> None:
        flags = os.O_WRONLY | os.O_TRUNC
        if hasattr(os, "O_NOFOLLOW"):
            flags |= os.O_NOFOLLOW
        fd = os.open(self.path, flags)
        try:
            os.fchmod(fd, 0o600)
            payload = (json.dumps(self.data, sort_keys=True, indent=2) + "\n").encode()
            view = memoryview(payload)
            while view:
                written = os.write(fd, view)
                view = view[written:]
            os.fsync(fd)
        finally:
            os.close(fd)

    def gate(self, name: str, status: str, **details) -> None:
        self.data["gates"].append({"name": name, "status": status, **details})
        self.flush()

    def finish(self, status: str, error_code: str | None = None) -> None:
        self.data["status"] = status
        self.data["finished_at_utc"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        if error_code:
            self.data["error_code"] = error_code
        self.flush()


def _secure_prompt(timeout: int = PROMPT_TIMEOUT_SECONDS) -> bytearray:
    try:
        tty_fd = os.open("/dev/tty", os.O_RDWR | getattr(os, "O_CLOEXEC", 0))
    except OSError as exc:
        raise RestoreError("controlling_tty_unavailable", "A controlling terminal is required") from exc
    old = None
    secret = bytearray()
    try:
        if not os.isatty(tty_fd):
            raise RestoreError("controlling_tty_unavailable", "A controlling terminal is required")
        old = termios.tcgetattr(tty_fd)
        hidden = list(old)
        hidden[3] &= ~termios.ECHO
        termios.tcsetattr(tty_fd, termios.TCSAFLUSH, hidden)
        if termios.tcgetattr(tty_fd)[3] & termios.ECHO:
            raise RestoreError("terminal_echo_control_failed", "Terminal echo could not be disabled")
        os.write(tty_fd, b"Existing PFBAK01 passphrase (hidden, timeout 120s): ")
        deadline = time.monotonic() + timeout
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0 or not select.select([tty_fd], [], [], remaining)[0]:
                raise RestoreError("passphrase_input_timeout", "Hidden passphrase input timed out")
            part = os.read(tty_fd, 1)
            if part in (b"\n", b"\r"):
                break
            if not part or part in (b"\x03", b"\x04"):
                raise RestoreError("passphrase_input_cancelled", "Passphrase input was cancelled")
            secret.extend(part)
            if len(secret) > MAX_PASS_BYTES:
                raise RestoreError("passphrase_input_too_long", "Passphrase input exceeded its limit")
        os.write(tty_fd, b"\n")
        if len(secret) < 24:
            raise RestoreError("passphrase_too_short", "Passphrase is shorter than the archive minimum")
        return secret
    except BaseException:
        for i in range(len(secret)):
            secret[i] = 0
        raise
    finally:
        try:
            if old is not None:
                termios.tcsetattr(tty_fd, termios.TCSAFLUSH, old)
        except BaseException as exc:
            for i in range(len(secret)):
                secret[i] = 0
            raise RestoreError("terminal_restore_failed", "Terminal settings could not be restored safely") from exc
        finally:
            os.close(tty_fd)


def _secret_pipe(secret: bytearray) -> int:
    read_fd, write_fd = os.pipe()
    try:
        payload = bytearray(secret)
        payload.append(10)
        view = memoryview(payload)
        while view:
            written = os.write(write_fd, view)
            view = view[written:]
        for i in range(len(payload)):
            payload[i] = 0
    except Exception:
        os.close(read_fd)
        raise
    finally:
        os.close(write_fd)
    return read_fd


def _minimal_crypto_env(secret_fd: int) -> dict[str, str]:
    return {
        "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
        "LANG": "C",
        "PF_SECRET_FD": str(secret_fd),
    }


def _decrypt_bytes(path: Path, secret: bytearray, max_bytes: int, stage: str) -> bytearray:
    read_fd = _secret_pipe(secret)
    proc = None
    try:
        proc = subprocess.Popen(
            ["node", str(CRYPTO), "decrypt", str(path)], stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, pass_fds=(read_fd,),
            close_fds=True, env=_minimal_crypto_env(read_fd), start_new_session=True,
        )
    except OSError as exc:
        os.close(read_fd)
        raise RestoreError("decryptor_unavailable", f"{stage} decryptor could not start") from exc
    os.close(read_fd)
    try:
        clear, _diagnostic = proc.communicate(timeout=DECRYPT_TIMEOUT_SECONDS)
    except subprocess.TimeoutExpired as exc:
        _kill_process_group(proc)
        proc.communicate()
        raise RestoreError("archive_decryption_timeout", f"{stage} authentication timed out") from exc
    except BaseException:
        _kill_process_group(proc)
        try:
            proc.communicate(timeout=10)
        except Exception:
            pass
        raise
    if proc.returncode != 0:
        raise RestoreError("archive_authentication_failed", f"{stage} archive authentication failed")
    if not clear or len(clear) > max_bytes:
        raise RestoreError("decrypted_archive_size_invalid", f"{stage} plaintext size is invalid")
    return bytearray(clear)


def _authenticate_and_discard(path: Path, secret: bytearray) -> dict[str, int | str]:
    read_fd = _secret_pipe(secret)
    proc = None
    try:
        proc = subprocess.Popen(
            ["node", str(CRYPTO), "decrypt", str(path)], stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, pass_fds=(read_fd,),
            close_fds=True, env=_minimal_crypto_env(read_fd), start_new_session=True,
        )
    except OSError as exc:
        os.close(read_fd)
        raise RestoreError("decryptor_unavailable", "Storage archive decryptor could not start") from exc
    os.close(read_fd)
    hasher = hashlib.sha256()
    total = 0
    read_error: list[BaseException] = []

    def drain() -> None:
        nonlocal total
        try:
            while True:
                chunk = proc.stdout.read(1024 * 1024)
                if not chunk:
                    break
                total += len(chunk)
                hasher.update(chunk)
        except BaseException as exc:  # thread error is reported without its data
            read_error.append(exc)

    import threading
    thread = threading.Thread(target=drain, daemon=True)
    thread.start()
    try:
        proc.wait(timeout=DECRYPT_TIMEOUT_SECONDS)
        thread.join(timeout=30)
        if thread.is_alive():
            raise RestoreError("storage_authentication_timeout", "Storage archive stream did not close")
        _diagnostic = proc.stderr.read()
    except subprocess.TimeoutExpired as exc:
        _kill_process_group(proc)
        proc.wait(timeout=10)
        thread.join(timeout=5)
        raise RestoreError("storage_authentication_timeout", "Storage archive authentication timed out") from exc
    except BaseException:
        _kill_process_group(proc)
        try:
            proc.wait(timeout=10)
        except Exception:
            pass
        thread.join(timeout=5)
        raise
    finally:
        for stream in (proc.stdout, proc.stderr):
            try:
                if stream is not None:
                    stream.close()
            except OSError:
                pass
    if read_error or proc.returncode != 0 or total == 0:
        raise RestoreError("archive_authentication_failed", "Storage archive authentication failed")
    return {"plaintext_bytes": total, "plaintext_sha256": hasher.hexdigest()}


def _kill_process_group(proc: subprocess.Popen) -> None:
    if proc.poll() is None:
        try:
            os.killpg(proc.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass


def _hash_file(path: Path) -> tuple[str, int]:
    digest = hashlib.sha256()
    size = 0
    with path.open("rb") as stream:
        while True:
            chunk = stream.read(1024 * 1024)
            if not chunk:
                break
            size += len(chunk)
            digest.update(chunk)
    return digest.hexdigest(), size


def _check_private_regular_file(path: Path) -> None:
    st = path.lstat()
    if not stat.S_ISREG(st.st_mode) or st.st_uid != os.getuid() or stat.S_IMODE(st.st_mode) & 0o077:
        raise RestoreError("archive_file_permissions_invalid", f"Archive file is not private: {path.name}")


def _check_private_directory(path: Path) -> None:
    st = path.lstat()
    if not stat.S_ISDIR(st.st_mode) or st.st_uid != os.getuid() or stat.S_IMODE(st.st_mode) & 0o077:
        raise RestoreError("archive_directory_permissions_invalid", "Backup/report directory permissions are not private")


def _json_integer_matches(value, expected: int) -> bool:
    """Match an exact JSON integer or its canonical decimal string encoding."""
    return ((type(value) is int and value == expected)
            or (type(value) is str and value == str(expected)))


def _json_int_equals(value, expected: int) -> bool:
    """Match a JSON integer without Python's bool/float equality coercions."""
    return type(value) is int and value == expected


def _validate_manifest(root: Path, manifest: dict, expected_hashes: dict[str, str],
                       storage_inventory: tuple[int, int]) -> None:
    if manifest.get("source_project_ref") != EXPECTED_PROJECT or manifest.get("database") != EXPECTED_DB:
        raise RestoreError("manifest_identity_mismatch", "Backup manifest identity does not match the pinned Production capture")
    if manifest.get("format") != "project-flour-full-production-recovery-v1":
        raise RestoreError("manifest_format_mismatch", "Backup manifest format is not the pinned capture format")
    if manifest.get("encryption", {}).get("format") != "PFBAK01" or manifest.get("encryption", {}).get("cipher") != "AES-256-GCM":
        raise RestoreError("manifest_encryption_mismatch", "Backup encryption metadata does not match PFBAK01")
    for key in ("preflight", "postflight"):
        item = manifest.get(key, {})
        ledger = item.get("ledger", {})
        if (item.get("project_ref") != EXPECTED_PROJECT or item.get("database") != EXPECTED_DB
                or not _json_integer_matches(item.get("server_version_num"), 170006)
                or not _json_int_equals(ledger.get("count"), EXPECTED_LEDGER_COUNT)
                or not _json_int_equals(ledger.get("distinct"), EXPECTED_LEDGER_COUNT)
                or ledger.get("latest") != EXPECTED_LEDGER_LATEST
                or not _json_int_equals(ledger.get("candidate_count"), 0)):
            raise RestoreError("manifest_ledger_baseline_mismatch", f"Captured {key} identity/ledger baseline differs")
    if not manifest.get("database_capture", {}).get("ledger_pre_post_match"):
        raise RestoreError("manifest_capture_consistency_failed", "Capture ledger pre/post checks did not match")
    listed = manifest.get("database_capture", {}).get("files", {})
    expected_names = {"database.dump.pfbackup", "roles.sql.pfbackup"}
    if set(listed) != expected_names:
        raise RestoreError("manifest_file_set_mismatch", "Database manifest file set differs")
    for relpath, expected_hash in expected_hashes.items():
        archive = root / relpath
        _check_private_regular_file(archive)
        digest, size = _hash_file(archive)
        if digest != expected_hash:
            raise RestoreError("archive_checksum_mismatch", f"Pinned checksum mismatch: {relpath}")
        manifest_name = Path(relpath).name
        if relpath.startswith("database/"):
            expected = listed.get(manifest_name, {})
        else:
            storage = manifest.get("storage_capture", {})
            expected = {"sha256": storage.get("archive_sha256"), "bytes": storage.get("archive_bytes")}
        if (expected.get("sha256") != expected_hash
                or not _json_int_equals(expected.get("bytes"), size)):
            raise RestoreError("manifest_archive_metadata_mismatch", f"Manifest metadata differs: {relpath}")
        with archive.open("rb") as stream:
            if stream.read(7) != PFBAK_MAGIC:
                raise RestoreError("archive_format_mismatch", f"PFBAK01 header mismatch: {relpath}")
    if (not _json_int_equals(manifest.get("storage_capture", {}).get("object_count"), storage_inventory[0])
            or not _json_int_equals(manifest.get("storage_capture", {}).get("object_bytes"), storage_inventory[1])):
        raise RestoreError("manifest_storage_inventory_mismatch", "Storage inventory metadata differs from pinned capture")


def _docker_env() -> dict[str, str]:
    # Inherited DOCKER_HOST/DOCKER_CONTEXT/TLS overrides could silently select
    # a remote daemon. Use only the user's local Docker context configuration.
    allow = ("PATH", "HOME", "DOCKER_CONFIG")
    return {key: os.environ[key] for key in allow if key in os.environ}


def _docker(docker: str, args: list[str], *, input_bytes: bytes | None = None,
            timeout: int = DOCKER_TIMEOUT_SECONDS) -> tuple[bytes, bytes]:
    try:
        result = subprocess.run([docker, *args], input=input_bytes, stdout=subprocess.PIPE,
                                stderr=subprocess.PIPE, env=_docker_env(), timeout=timeout,
                                check=False)
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise RestoreError("docker_operation_failed", "Isolated Docker operation failed or timed out") from exc
    if result.returncode != 0:
        raise RestoreError("docker_operation_failed", "Isolated Docker operation failed")
    return result.stdout, result.stderr


def _verify_local_docker(docker: str) -> str:
    try:
        endpoint, _ = _docker(docker, ["context", "inspect", "--format",
                                      '{{(index .Endpoints "docker").Host}}'])
    except RestoreError as exc:
        raise RestoreError("docker_context_unavailable", "Docker context could not be verified") from exc
    host = endpoint.decode("utf-8", errors="replace").strip()
    if not host.startswith("unix://"):
        raise RestoreError("docker_context_not_local", "Docker context must use a local Unix socket")
    image, _ = _docker(docker, ["image", "inspect", PINNED_IMAGE, "--format", "{{.Id}}"])
    if image.decode().strip() != PINNED_IMAGE_ID:
        raise RestoreError("pinned_image_mismatch", "Pinned local PostgreSQL recovery image is unavailable or changed")
    return hashlib.sha256(host.encode()).hexdigest()


def _new_container(docker: str) -> str:
    name = "pfrestore-" + uuid.uuid4().hex[:16]
    run_id = name
    existing, _ = _docker(docker, ["ps", "-aq", "--filter", f"name=^{name}$"])
    if existing.strip():
        raise RestoreError("container_name_collision", "Generated isolated container name already exists")
    args = ["run", "--pull=never", "--detach", "--rm", "--network", "none",
            "--name", name, "--label", "project-flour.restore=1", "--label",
            f"project-flour.restore-run={run_id}", "--tmpfs",
            "/var/lib/postgresql/data:rw,nosuid,nodev,size=1024m", "--tmpfs",
            "/tmp:rw,nosuid,nodev,size=128m", "--tmpfs",
            "/docker-entrypoint-initdb.d:rw,nosuid,nodev,size=1m", "-e", "POSTGRES_USER=supabase_admin",
            "-e", "POSTGRES_DB=postgres", "-e", "POSTGRES_HOST_AUTH_METHOD=trust",
            PINNED_IMAGE, "postgres", "-c", "cron.launch_active_jobs=off",
            "-c", "shared_preload_libraries=pg_cron,pg_stat_statements"]
    try:
        output, _ = _docker(docker, args, timeout=90)
    except BaseException:
        _safe_container_remove(docker, name)
        raise
    container_id = output.decode().strip()
    if not re.fullmatch(r"[0-9a-f]{64}", container_id):
        _safe_container_remove(docker, name)
        raise RestoreError("container_start_failed", "Isolated PostgreSQL container did not start")
    return name


def _wait_ready(docker: str, container: str) -> None:
    deadline = time.monotonic() + STARTUP_TIMEOUT_SECONDS
    while time.monotonic() < deadline:
        state, _ = _docker(docker, ["inspect", "--format", "{{.State.Running}}|{{.HostConfig.NetworkMode}}|{{.Config.Image}}|{{.Image}}", container])
        if state.decode().strip() != f"true|none|{PINNED_IMAGE}|{PINNED_IMAGE_ID}":
            raise RestoreError("container_isolation_or_image_mismatch", "Container isolation or pinned image preflight failed")
        try:
            _docker(docker, ["exec", container, "pg_isready", "-U", "supabase_admin", "-d", "postgres"], timeout=5)
        except RestoreError:
            time.sleep(1)
            continue
        cron_settings = _psql(docker, container, "postgres",
                              "SELECT current_setting('cron.database_name')||'|'||current_setting('cron.launch_active_jobs')")
        if cron_settings != "postgres|off":
            raise RestoreError("isolated_cron_database_mismatch", "Disposable pg_cron jobs are not disabled")
        _psql(docker, container, "postgres", "CREATE DATABASE pf_bootstrap")
        return
    raise RestoreError("postgres_startup_timeout", "Isolated PostgreSQL startup timed out")


def _psql(docker: str, container: str, database: str, sql: str) -> str:
    args = ["exec", "-i", container, "psql", "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1",
            "-h", "/var/run/postgresql", "-U", "supabase_admin", "-d", database]
    try:
        result = subprocess.run([docker, *args], input=sql.encode(), stdout=subprocess.PIPE,
                                stderr=subprocess.PIPE, env=_docker_env(), timeout=DOCKER_TIMEOUT_SECONDS,
                                check=False)
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise RestoreError("local_catalog_query_failed", "Isolated catalog verification timed out") from exc
    if result.returncode != 0:
        raise RestoreError("local_catalog_query_failed", "Isolated catalog verification failed")
    return result.stdout.decode("utf-8", errors="strict").strip()


def _role_attribute_expectations(role_sql: bytes) -> dict[str, dict[str, bool]]:
    sql = role_sql.decode("utf-8", errors="strict")
    statements = role_audit._split_sql(sql)
    columns = {
        "SUPERUSER": "rolsuper", "NOSUPERUSER": "rolsuper",
        "CREATEDB": "rolcreatedb", "NOCREATEDB": "rolcreatedb",
        "CREATEROLE": "rolcreaterole", "NOCREATEROLE": "rolcreaterole",
        "INHERIT": "rolinherit", "NOINHERIT": "rolinherit",
        "LOGIN": "rolcanlogin", "NOLOGIN": "rolcanlogin",
        "REPLICATION": "rolreplication", "NOREPLICATION": "rolreplication",
        "BYPASSRLS": "rolbypassrls", "NOBYPASSRLS": "rolbypassrls",
    }
    expected: dict[str, dict[str, bool]] = {}
    true_tokens = {"SUPERUSER", "CREATEDB", "CREATEROLE", "INHERIT", "LOGIN", "REPLICATION", "BYPASSRLS"}
    for _, statement in statements:
        row = role_audit._type_and_details(statement)
        if row.get("type") != "ALTER ROLE":
            continue
        for role in row.get("roles", []):
            if role not in role_restore.EXPECTED_ROLE_DEFINITIONS:
                continue
            flags = expected.setdefault(role, {})
            for token in row.get("role_attributes", []):
                column = columns.get(token)
                if column:
                    value = token in true_tokens
                    if column in flags and flags[column] != value:
                        raise RestoreError("role_attribute_conflict", "Role archive contains conflicting role attributes")
                    flags[column] = value
    if set(expected) != role_restore.EXPECTED_ROLE_DEFINITIONS:
        raise RestoreError("role_attribute_inventory_mismatch", "Role attribute inventory is incomplete")
    return expected


def _role_valid_until_expectations(role_sql: bytes) -> dict[str, str]:
    expected: dict[str, str] = {}
    for _, statement in role_audit._split_sql(role_sql.decode("utf-8", errors="strict")):
        row = role_audit._type_and_details(statement)
        if row.get("type") != "ALTER ROLE" or "VALID UNTIL" not in row.get("role_attributes", []):
            continue
        match_role = re.match(r"(?is)^ALTER\s+ROLE\s+([^\s]+)", statement.strip())
        match_until = re.search(r"(?is)\bVALID\s+UNTIL\s+'((?:''|[^'])*)'", statement)
        if not match_role or not match_until:
            raise RestoreError("role_validity_source_unsupported", "Role validity syntax is unsupported")
        role = role_audit._unquote_identifier(match_role.group(1))
        expected[role] = match_until.group(1).replace("''", "'")
    return expected


def _role_setting_roles(role_sql: bytes) -> set[str]:
    statements = role_audit._split_sql(role_sql.decode("utf-8", errors="strict"))
    active: dict[str, set[str]] = {}
    count = 0
    for _, statement in statements:
        row = role_audit._type_and_details(statement)
        if row.get("type") == "ALTER ROLE SET/RESET":
            count += 1
            normalized = re.sub(r"(?s)/\*.*?\*/|--[^\n]*", " ", statement).strip()
            match_role = re.match(r"(?is)^ALTER\s+ROLE\s+([^\s]+)(?:\s+IN\s+DATABASE\s+([^\s]+))?\s+(SET|RESET)\s+(.+)$", normalized)
            if not match_role:
                raise RestoreError("role_setting_source_unsupported", "Role setting source syntax is unsupported")
            role = role_audit._unquote_identifier(match_role.group(1))
            action = match_role.group(3).upper()
            setting = match_role.group(4).strip().split(None, 1)[0].strip('"').lower()
            current = active.setdefault(role, set())
            if action == "RESET":
                if setting.upper() == "ALL":
                    current.clear()
                else:
                    current.discard(setting)
            else:
                current.add(setting)
    roles = {role for role, settings in active.items() if settings}
    if count != 15 or not active or not set(active).issubset(role_restore.EXPECTED_ROLE_DEFINITIONS):
        raise RestoreError("role_setting_inventory_mismatch", "Role setting source inventory differs")
    return roles


def _verify_role_catalog(docker: str, container: str, role_sql: bytes) -> dict:
    expected = _role_attribute_expectations(role_sql)
    names = sorted(expected)
    escaped = ",".join("'" + name.replace("'", "''") + "'" for name in names)
    query = (
        "SELECT rolname||'|'||rolsuper||'|'||rolcreatedb||'|'||rolcreaterole||'|'||rolinherit||'|'||"
        "rolcanlogin||'|'||rolreplication||'|'||rolbypassrls FROM pg_authid "
        f"WHERE rolname IN ({escaped}) ORDER BY rolname"
    )
    rows = _psql(docker, container, "postgres", query).splitlines()
    if len(rows) != len(expected):
        raise RestoreError("role_catalog_mismatch", "Restored role definition count differs")
    for line in rows:
        fields = line.split("|")
        if len(fields) != 8 or fields[0] not in expected:
            raise RestoreError("role_catalog_mismatch", "Restored role catalog is incomplete")
        observed = dict(zip(("rolsuper", "rolcreatedb", "rolcreaterole", "rolinherit",
                             "rolcanlogin", "rolreplication", "rolbypassrls"),
                            (field.lower() in {"t", "true"} for field in fields[1:])))
        for column, value in expected[fields[0]].items():
            if observed[column] != value:
                raise RestoreError("role_attribute_mismatch", "Restored role attributes differ from source statements")
    valid_until = _role_valid_until_expectations(role_sql)
    for role, timestamp in valid_until.items():
        literal = timestamp.replace("'", "''")
        expected_epoch = _psql(docker, container, "postgres",
            "SELECT extract(epoch FROM TIMESTAMPTZ '" + literal + "')::numeric::text")
        observed_epoch = _psql(docker, container, "postgres",
            "SELECT extract(epoch FROM rolvaliduntil)::numeric::text FROM pg_authid WHERE rolname='" + role + "'")
        if expected_epoch != observed_epoch:
            raise RestoreError("role_validity_mismatch", "Restored role validity differs from source statement")
    return {"role_definitions": len(rows), "attribute_comparisons": sum(len(v) for v in expected.values()),
            "valid_until_comparisons": len(valid_until)}


def _extensions_from_toc(toc: bytes) -> set[str]:
    names = set()
    for raw in toc.decode("utf-8", errors="replace").splitlines():
        match = re.search(r"\bEXTENSION\s+-\s+([A-Za-z0-9_-]+)(?:\s|$)", raw)
        if match:
            names.add(match.group(1))
    return names


def _restore_database(docker: str, container: str, db_bytes: bytearray) -> dict:
    # The archive was authenticated in full before the isolated cluster started.
    toc, _ = _docker(docker, ["exec", "-i", container, "pg_restore", "--list"], input_bytes=bytes(db_bytes), timeout=120)
    extensions = _extensions_from_toc(toc)
    if not EXPECTED_EXTENSIONS.issubset(extensions):
        raise RestoreError("archive_required_extensions_missing", "Database archive is missing a required extension")
    names_sql = ",".join("'" + name.replace("'", "''") + "'" for name in sorted(extensions))
    available = int(_psql(docker, container, "pf_bootstrap",
                          f"SELECT count(*) FROM pg_available_extensions WHERE name IN ({names_sql})") or "0")
    if available != len(extensions):
        raise RestoreError("archive_extension_control_missing", "Pinned PostgreSQL image lacks a required extension control")
    _psql(docker, container, "pf_bootstrap", "DROP DATABASE postgres WITH (FORCE)")
    args = ["exec", "-i", container, "pg_restore", "--exit-on-error", "--create",
            "--host=/var/run/postgresql", "--username=supabase_admin", "--dbname=pf_bootstrap"]
    try:
        result = subprocess.run([docker, *args], input=bytes(db_bytes), stdout=subprocess.PIPE,
                                stderr=subprocess.PIPE, env=_docker_env(), timeout=RESTORE_TIMEOUT_SECONDS,
                                check=False)
    except subprocess.TimeoutExpired as exc:
        raise RestoreError("database_restore_timeout", "Database restore exceeded its bound") from exc
    except OSError as exc:
        raise RestoreError("database_restore_failed", "Database restore process could not start") from exc
    if result.returncode != 0:
        raise RestoreError("database_restore_failed", f"Database restore failed (exit={result.returncode})")
    sequence_sets = sum(1 for line in toc.splitlines() if re.search(rb"\bSEQUENCE SET\b", line))
    return {"archive_toc_entries": sum(1 for line in toc.splitlines() if b";" in line and not line.startswith(b";")),
            "archive_sequence_set_entries": sequence_sets,
            "extensions": sorted(extensions), "extension_controls_present": available}


def _verify_database(docker: str, container: str, role_sql: bytes,
                     expected_sequence_values: int) -> dict:
    identity = _psql(docker, container, "postgres",
        "SELECT current_setting('server_version_num')||'|'||current_user||'|'||"
        "(SELECT oid::text FROM pg_authid WHERE rolname=current_user)||'|'||"
        "(SELECT rolname FROM pg_roles WHERE oid=(SELECT datdba FROM pg_database WHERE datname=current_database()))")
    if identity != "170006|supabase_admin|10|postgres":
        raise RestoreError("restored_database_identity_mismatch", "Restored database identity or owner differs")
    ext_rows = _psql(docker, container, "postgres",
                     "SELECT extname FROM pg_extension ORDER BY extname").splitlines()
    if not EXPECTED_EXTENSIONS.issubset(set(ext_rows)):
        raise RestoreError("restored_extensions_missing", "One or more required extensions did not restore")
    ledger = _psql(docker, container, "postgres",
        "SELECT count(*)||'|'||count(DISTINCT version)||'|'||max(version)::text||'|'||"
        "count(*) FILTER (WHERE version::text IN "
        "('20261109110501','20261109193000','20261109213004','20261111110823','20261114120000')) "
        "FROM supabase_migrations.schema_migrations")
    if ledger != f"{EXPECTED_LEDGER_COUNT}|{EXPECTED_LEDGER_COUNT}|{EXPECTED_LEDGER_LATEST}|0":
        raise RestoreError("restored_migration_ledger_mismatch", "Restored migration ledger differs from the pinned baseline")
    sequences = _psql(docker, container, "postgres",
        "SELECT count(*)||'|'||count(*) FILTER (WHERE last_value IS NOT NULL) "
        "FROM pg_sequences WHERE schemaname NOT IN ('pg_catalog','information_schema')")
    seq_total, seq_values = (sequences.split("|") + ["0", "0"])[:2]
    if int(seq_total) == 0 or int(seq_values) == 0 or int(seq_total) != expected_sequence_values:
        raise RestoreError("restored_sequences_missing",
                           f"Sequence counts differ: total={seq_total}, populated={seq_values}, archive={expected_sequence_values}")
    acl_counts = _psql(docker, container, "postgres", """
SELECT (SELECT count(*) FROM pg_class WHERE relnamespace NOT IN ('pg_catalog'::regnamespace,'information_schema'::regnamespace) AND relacl IS NOT NULL)
 ||'|'||(SELECT count(*) FROM pg_namespace WHERE nspacl IS NOT NULL)
 ||'|'||(SELECT count(*) FROM pg_proc WHERE proacl IS NOT NULL)
 ||'|'||(SELECT count(*) FROM pg_default_acl)
 ||'|'||(SELECT count(*) FROM pg_class c JOIN pg_roles r ON r.oid=c.relowner WHERE c.relnamespace NOT IN ('pg_catalog'::regnamespace,'information_schema'::regnamespace) AND r.rolname<>'supabase_admin')
 ||'|'||(SELECT count(*) FROM pg_class WHERE relrowsecurity)
 ||'|'||(SELECT count(*) FROM pg_policies);
""")
    acl_fields = [int(x) for x in acl_counts.split("|")]
    if len(acl_fields) != 7 or sum(acl_fields[:4]) == 0 or acl_fields[4] == 0:
        raise RestoreError("restored_acl_or_ownership_missing", "Restored ownership/ACL metadata is incomplete")
    schema_meta = _psql(docker, container, "postgres", """
SELECT (SELECT count(*) FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema'))
 ||'|'||(SELECT count(*) FROM information_schema.columns WHERE table_schema NOT IN ('pg_catalog','information_schema'))
 ||'|'||(SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema'));
""")
    table_count, column_count, function_count = [int(x) for x in schema_meta.split("|")]
    if table_count == 0 or column_count == 0 or function_count == 0:
        raise RestoreError("restored_schema_incomplete", "Restored schema inventory is empty or incomplete")
    table_list = _psql(docker, container, "postgres", """
SELECT schemaname||'|'||tablename FROM pg_catalog.pg_tables
WHERE schemaname IN ('public','auth','storage','supabase_migrations') ORDER BY schemaname,tablename;
""").splitlines()
    selected: list[tuple[str, str, str]] = []
    groups: dict[str, list[int]] = {group: [0, 0] for group in CRITICAL_DATA_GROUPS}
    for row in table_list:
        parts = row.split("|", 1)
        if len(parts) != 2:
            continue
        schema, table = parts
        if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", schema) or not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", table):
            continue
        if DATA_TABLE_PATTERN.search(table):
            selected.append((schema, table, f'"{schema}"."{table}"'))
    for schema, table, qualified in selected:
        count = int(_psql(docker, container, "postgres", "SELECT count(*) FROM " + qualified) or "0")
        lower = table.lower()
        for group in CRITICAL_DATA_GROUPS:
            if group in lower or (group == "customer" and schema == "auth" and table == "users"):
                groups[group][0] += 1
                groups[group][1] += count
        if (schema, table) == ("supabase_migrations", "schema_migrations"):
            groups["migration"][0] = max(groups["migration"][0], 1)
            groups["migration"][1] = max(groups["migration"][1], EXPECTED_LEDGER_COUNT)
    missing = [group for group, counts in groups.items() if counts[0] == 0]
    if missing:
        raise RestoreError("critical_data_groups_missing", "One or more required business-data categories are absent")
    empty = [group for group, counts in groups.items() if counts[1] == 0]
    if empty:
        raise RestoreError("representative_data_missing", "One or more required data categories contain no representative rows")
    role_setting_roles = _role_setting_roles(role_sql)
    role_settings = _psql(docker, container, "postgres", """
SELECT r.rolname||'|'||coalesce(d.datname,'')||'|'||array_to_string(s.setconfig,E'\\x1f')
FROM pg_db_role_setting s JOIN pg_roles r ON r.oid=s.setrole
LEFT JOIN pg_database d ON d.oid=s.setdatabase
WHERE r.rolname IN ('anon','authenticated','authenticator','postgres','supabase_admin','supabase_auth_admin','supabase_read_only_user','supabase_realtime_admin','supabase_storage_admin')
ORDER BY r.rolname,coalesce(d.datname,'');
""").splitlines()
    settings_hash = hashlib.sha256("\n".join(role_settings).encode()).hexdigest()
    settings_count = len(role_settings)
    observed_setting_roles = {line.split("|", 1)[0] for line in role_settings}
    if not role_setting_roles.issubset(observed_setting_roles):
        raise RestoreError("restored_role_settings_missing",
                           "Role-setting role catalog differs: expected=" + ",".join(sorted(role_setting_roles))
                           + " observed=" + ",".join(sorted(observed_setting_roles)))
    return {
        "identity": "PASS", "server_version_num": EXPECTED_SERVER_VERSION_NUM,
        "database_owner": "postgres", "required_extensions_installed": sorted(EXPECTED_EXTENSIONS),
        "extensions_installed": sorted(ext_rows),
        "migration_ledger": {"count": EXPECTED_LEDGER_COUNT, "distinct": EXPECTED_LEDGER_COUNT,
                             "latest": EXPECTED_LEDGER_LATEST, "candidate_count": 0},
        "sequences": {"count": int(seq_total), "archive_set_entries": expected_sequence_values,
                      "with_last_value": int(seq_values)},
        "acl_object_counts": {"relations": acl_fields[0], "schemas": acl_fields[1],
                              "routines": acl_fields[2], "default_acl": acl_fields[3],
                              "rls_tables": acl_fields[5], "policies": acl_fields[6]},
        "non_bootstrap_owned_relation_count": acl_fields[4],
        "schema_counts": {"tables": table_count, "columns": column_count, "functions": function_count},
        "critical_data_groups": {name: {"table_count": value[0], "row_count": value[1]}
                                  for name, value in groups.items()},
        "role_settings": {"source_statements_replayed": 15,
                           "source_roles_present_in_catalog": len(role_setting_roles),
                           "catalog_rows": settings_count,
                           "catalog_sha256": settings_hash,
                           "values_emitted": False},
        "storage_objects_restored": "UNSUPPORTED_BY_DATABASE_COORDINATOR",
        "exact_extension_version_parity": "UNSUPPORTED_SOURCE_VERSION_METADATA_NOT_PINNED",
    }


def _safe_container_remove(docker: str, container: str) -> bool:
    try:
        existing, _ = _docker(docker, ["ps", "-aq", "--filter", f"name=^{container}$"], timeout=10)
    except RestoreError:
        return False
    if not existing.strip():
        return True
    try:
        _docker(docker, ["rm", "-f", container], timeout=30)
    except RestoreError:
        return False
    try:
        remaining, _ = _docker(docker, ["ps", "-aq", "--filter", f"name=^{container}$"], timeout=10)
    except RestoreError:
        return False
    return not remaining.strip()


def run_restore(archive_dir: Path, report_path: Path, passphrase: bytearray | None = None,
                *, permit_synthetic_path: bool = False,
                expected_hashes: dict[str, str] | None = None,
                storage_inventory: tuple[int, int] | None = None, phase_hook=None) -> dict:
    archive_dir = archive_dir.resolve(strict=True)
    if not permit_synthetic_path and archive_dir != DEFAULT_ARCHIVE_DIR.resolve(strict=True):
        raise RestoreError("archive_path_not_pinned", "Only the pinned November 15 archive directory is permitted")
    _check_private_directory(archive_dir)
    validation_dir = archive_dir / "validation"
    _check_private_directory(validation_dir)
    report_path = report_path.resolve(strict=False)
    if report_path.parent != validation_dir.resolve(strict=True):
        raise RestoreError("report_path_invalid", "Validation report must be created inside the backup validation directory")
    report = ValidationReport(report_path)
    docker = shutil.which("docker")
    node = shutil.which("node")
    if not docker or not node or not CRYPTO.is_file():
        report.gate("local_tools", "FAIL")
        report.finish("FAIL", "local_tool_missing")
        raise RestoreError("local_tool_missing", "Required local Docker or Node tool is unavailable")
    container = None
    db_plain = bytearray()
    roles_plain = bytearray()
    local_secret = passphrase
    failure: RestoreError | None = None
    try:
        manifest_path = archive_dir / "manifest.json"
        _check_private_regular_file(manifest_path)
        try:
            manifest = json.loads(manifest_path.read_text())
        except Exception as exc:
            raise RestoreError("manifest_unreadable", "Backup manifest could not be read") from exc
        if permit_synthetic_path:
            if local_secret is None or expected_hashes is None or storage_inventory is None:
                raise RestoreError("synthetic_test_profile_required", "Synthetic tests require a passphrase, hashes, and storage profile")
        elif expected_hashes is not None:
            raise RestoreError("production_hash_profile_override_forbidden", "Production archive hashes cannot be overridden")
        elif storage_inventory is not None:
            raise RestoreError("production_storage_profile_override_forbidden", "Production Storage inventory cannot be overridden")
        else:
            expected_hashes = EXPECTED_HASHES
            storage_inventory = (44, 88668762)
        _validate_manifest(archive_dir, manifest, expected_hashes, storage_inventory)
        report.data["archive_hashes"] = expected_hashes.copy()
        report.data["capture_identity"] = {
            "project_ref": EXPECTED_PROJECT, "database": EXPECTED_DB,
            "server_version_num": EXPECTED_SERVER_VERSION_NUM,
            "ledger_count": EXPECTED_LEDGER_COUNT, "ledger_latest": EXPECTED_LEDGER_LATEST,
        }
        report.gate("archive_hashes_and_manifest", "PASS", files=3)
        docker_context_sha = _verify_local_docker(docker)
        report.gate("docker_context_and_pinned_image", "PASS", docker_context_endpoint_sha256=docker_context_sha,
                    image=PINNED_IMAGE, image_id=PINNED_IMAGE_ID)
        if local_secret is None:
            local_secret = _secure_prompt()
        if len(local_secret) < 24:
            raise RestoreError("passphrase_too_short", "Passphrase is shorter than the archive minimum")
        roles_path = archive_dir / "database/roles.sql.pfbackup"
        database_path = archive_dir / "database/database.dump.pfbackup"
        storage_path = archive_dir / "storage/storage.tar.pfbackup"
        roles_plain = _decrypt_bytes(roles_path, local_secret, MAX_ROLE_PLAINTEXT, "Roles")
        db_plain = _decrypt_bytes(database_path, local_secret, MAX_DB_PLAINTEXT, "Database")
        storage_info = _authenticate_and_discard(storage_path, local_secret)
        report.gate("pfbak01_authentication", "PASS", roles_plaintext_bytes=len(roles_plain),
                    database_plaintext_bytes=len(db_plain), storage_plaintext_bytes=storage_info["plaintext_bytes"],
                    storage_plaintext_sha256=storage_info["plaintext_sha256"])
        container = _new_container(docker)
        _wait_ready(docker, container)
        if phase_hook:
            phase_hook("container_ready", container)
        role_count = role_restore.replay(container, bytes(roles_plain))
        attr_result = _verify_role_catalog(docker, container, bytes(roles_plain))
        report.gate("native_role_replay", "PASS", source_statements=role_count,
                    membership_grants=22, role_definitions=attr_result["role_definitions"],
                    role_attribute_comparisons=attr_result["attribute_comparisons"],
                    valid_until_comparisons=attr_result["valid_until_comparisons"],
                    original_grantor="supabase_admin", network_mode="none")
        db_restore = _restore_database(docker, container, db_plain)
        report.gate("database_restore_with_owner_and_acl", "PASS", **db_restore)
        verified = _verify_database(docker, container, bytes(roles_plain),
                                    db_restore["archive_sequence_set_entries"])
        report.data["restore"] = verified
        report.gate("restored_database_validation", "PASS", ledger=verified["migration_ledger"],
                    schema_counts=verified["schema_counts"], sequence_counts=verified["sequences"],
                    critical_data_groups=verified["critical_data_groups"],
                    acl_object_counts=verified["acl_object_counts"],
                    role_settings=verified["role_settings"])
        if phase_hook:
            phase_hook("database_validated", container)
        report.data["limitations"] = [
            "Storage archive authentication was verified; Storage object extraction/restoration is outside this database coordinator.",
            "Production extension version parity is unsupported because the capture metadata does not pin source extension versions.",
            "Auth/Storage platform control-plane state, global roles, cron service state, and Supabase secrets are not reconstructed by a local PostgreSQL restore.",
            "The Production database archive itself has not been decrypted or restored in this qualification; its compatibility is tested only when the Owner executes the pinned procedure.",
        ]
        report.gate("storage_object_restore", "UNSUPPORTED", reason="database-only coordinator")
        report.gate("source_extension_version_parity", "UNSUPPORTED", reason="source versions not pinned in capture manifest")
        report.gate("supabase_control_plane_recovery", "UNSUPPORTED", reason="outside database archive")
        report.gate("actual_production_database_archive_restore", "UNSUPPORTED", reason="synthetic archives used for qualification")
        report.finish("PASS")
        return report.data
    except RestoreError as exc:
        failure = exc
        report.gate(exc.code, "FAIL")
        report.finish("FAIL", exc.code)
        raise
    except KeyboardInterrupt as exc:
        failure = RestoreError("restore_interrupted", "Restore was interrupted")
        report.gate(failure.code, "FAIL")
        report.finish("FAIL", failure.code)
        raise failure from exc
    except Exception as exc:
        failure = RestoreError("unexpected_local_restore_failure", "Unexpected isolated restore failure")
        report.gate(failure.code, "FAIL")
        report.finish("FAIL", failure.code)
        raise failure from exc
    finally:
        for secret in (local_secret, roles_plain, db_plain):
            if isinstance(secret, bytearray):
                for i in range(len(secret)):
                    secret[i] = 0
        if container:
            removed = _safe_container_remove(docker, container)
            report.data["container_cleanup"] = "PASS" if removed else "FAIL_CONTAINER_REMAINS"
            if not removed:
                report.data["container_name"] = container
                if report.data.get("status") == "PASS":
                    report.data["status"] = "FAIL"
                    report.data["error_code"] = "container_cleanup_failed"
            report.flush()


def _report_path(root: Path) -> Path:
    directory = root / "validation"
    stamp = time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())
    return directory / f"restore-coordinator-{stamp}-{os.getpid()}-{uuid.uuid4().hex[:8]}.json"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.parse_args()
    root = DEFAULT_ARCHIVE_DIR
    report = _report_path(root)
    try:
        previous = signal.getsignal(signal.SIGTERM)
        def stop_for_signal(signum, _frame):
            raise InterruptedRestore("restore_interrupted", f"Restore interrupted by signal {signum}")
        signal.signal(signal.SIGTERM, stop_for_signal)
        try:
            result = run_restore(root, report)
            if result.get("status") != "PASS":
                raise RestoreError("container_cleanup_failed", "Isolated restore did not finish with all cleanup gates passing")
        finally:
            signal.signal(signal.SIGTERM, previous)
    except RestoreError as exc:
        print(f"RESTORE_STATUS=FAIL code={exc.code}", file=sys.stderr)
        if report.exists():
            print(f"REPORT={report}", file=sys.stderr)
        return 2
    except KeyboardInterrupt:
        print("RESTORE_STATUS=FAIL code=restore_interrupted", file=sys.stderr)
        return 130
    print("RESTORE_STATUS=PASS")
    print(f"REPORT={report}")
    print("DATABASE=RESTORED_IN_ISOLATED_POSTGRESQL_17_6")
    print("PRODUCTION_CONNECTION=NONE")
    return 0


if __name__ == "__main__":
    sys.exit(main())
