#!/usr/bin/env python3
"""Read-only, metadata-only audit of a PFBAK01 pg_dumpall roles archive.

This reconstruction is new source. It never connects to PostgreSQL and never
executes SQL. Decrypted text exists only in process memory and is reduced to a
redacted inventory before any output is written.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import termios
import time

HERE = Path(__file__).resolve().parent
CRYPTO = HERE / "stream-crypto.js"
EXPECTED_ARCHIVE_SHA256 = "fc3eb126693f9cd154e8b3b55aebca04ce4b83f35b3c44ef54e4f1c527c4070f"
MAX_ARCHIVE_BYTES = 16 * 1024 * 1024
MAX_PLAINTEXT_BYTES = 16 * 1024 * 1024
DECRYPT_TIMEOUT_SECONDS = 120
ROLE = r'(?:"(?:[^"]|"")*"|[A-Za-z_][A-Za-z_0-9$.-]*)'


class AuditError(Exception):
    pass


def _secure_prompt(prompt="PFBAK01 passphrase (hidden): ") -> str:
    """Require a controlling tty and verified echo-off; there is no fallback."""
    try:
        fd = os.open("/dev/tty", os.O_RDWR | getattr(os, "O_CLOEXEC", 0))
    except OSError as exc:
        raise AuditError("controlling terminal unavailable") from exc
    old = None
    try:
        if not os.isatty(fd):
            raise AuditError("controlling terminal unavailable")
        old = termios.tcgetattr(fd)
        hidden = list(old)
        hidden[3] &= ~termios.ECHO
        termios.tcsetattr(fd, termios.TCSAFLUSH, hidden)
        if termios.tcgetattr(fd)[3] & termios.ECHO:
            raise AuditError("terminal echo could not be disabled")
        os.write(fd, prompt.encode("utf-8"))
        chunks = bytearray()
        while True:
            part = os.read(fd, 1)
            if part in (b"\n", b"\r"):
                break
            if not part:
                raise AuditError("terminal input ended")
            if part in (b"\x03", b"\x04"):
                raise AuditError("terminal input cancelled")
            chunks.extend(part)
            if len(chunks) > 4096:
                raise AuditError("passphrase input exceeds limit")
        os.write(fd, b"\n")
        try:
            value = chunks.decode("utf-8")
        except UnicodeDecodeError as exc:
            raise AuditError("passphrase encoding is invalid") from exc
        finally:
            for index in range(len(chunks)):
                chunks[index] = 0
        if len(value.encode("utf-8")) < 24:
            raise AuditError("passphrase is shorter than required")
        return value
    finally:
        if old is not None:
            termios.tcsetattr(fd, termios.TCSAFLUSH, old)
        os.close(fd)


def _passphrase_fd(value: str) -> int:
    read_fd, write_fd = os.pipe()
    try:
        secret = bytearray(value.encode("utf-8") + b"\n")
        try:
            view = memoryview(secret)
            while view:
                written = os.write(write_fd, view)
                view = view[written:]
        finally:
            for index in range(len(secret)):
                secret[index] = 0
    finally:
        os.close(write_fd)
    return read_fd


def _decrypt_in_memory(archive: Path, passphrase: str, crypto: Path = CRYPTO) -> bytearray:
    if not archive.is_file():
        raise AuditError("roles archive not found")
    stat = archive.stat()
    if stat.st_size <= 51 or stat.st_size > MAX_ARCHIVE_BYTES:
        raise AuditError("roles archive size outside audit limit")
    with archive.open("rb") as stream:
        if stream.read(7) != b"PFBAK01":
            raise AuditError("roles archive format mismatch")
    fd = _passphrase_fd(passphrase)
    env = {"PATH": os.environ.get("PATH", "/usr/bin:/bin"), "PF_SECRET_FD": str(fd)}
    proc = None
    try:
        proc = subprocess.Popen(
            ["node", str(crypto), "decrypt", str(archive)],
            stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            pass_fds=(fd,), env=env, close_fds=True,
        )
        output, _sanitized_away = proc.communicate(timeout=DECRYPT_TIMEOUT_SECONDS)
    except subprocess.TimeoutExpired as exc:
        if proc is not None:
            proc.kill()
            proc.communicate()
        raise AuditError("archive decryption timed out") from exc
    except OSError as exc:
        if proc is not None and proc.poll() is None:
            proc.kill()
            proc.communicate()
        raise AuditError("archive decryptor could not start") from exc
    finally:
        os.close(fd)
    if proc.returncode != 0:
        raise AuditError("archive authentication/decryption failed")
    if len(output) > MAX_PLAINTEXT_BYTES:
        raise AuditError("decrypted roles archive exceeds audit limit")
    return bytearray(output)


def _split_sql(sql: str) -> list[tuple[int, str]]:
    """Split statements without losing original line starts or quoting rules."""
    statements: list[tuple[int, str]] = []
    buf: list[str] = []
    line = 1
    start_line = 1
    i = 0
    state = "normal"
    dollar_tag = ""
    block_depth = 0
    while i < len(sql):
        ch = sql[i]
        nxt = sql[i + 1] if i + 1 < len(sql) else ""
        if state == "normal":
            if ch == "\\" and (i == 0 or sql[i - 1] == "\n"):
                end = sql.find("\n", i)
                if end < 0: end = len(sql)
                candidate = sql[i:end].strip()
                pending = "".join(buf)
                if candidate.startswith("\\") and not _has_sql(pending):
                    if candidate:
                        statements.append((line, candidate))
                    buf = []
                    consumed = sql[i:end + (1 if end < len(sql) else 0)]
                    line += consumed.count("\n")
                    start_line = line
                    i = end + (1 if end < len(sql) else 0)
                    continue
            if (not ch.isspace() and not (ch == "-" and nxt == "-")
                    and not (ch == "/" and nxt == "*")
                    and not _has_sql("".join(buf))):
                start_line = line
            if ch == "-" and nxt == "-":
                state = "line_comment"
                buf.extend((ch, nxt)); i += 2; continue
            if ch == "/" and nxt == "*":
                state = "block_comment"; block_depth = 1
                buf.extend((ch, nxt)); i += 2; continue
            if ch == "'": state = "single_quote"
            elif ch == '"': state = "double_quote"
            elif ch == "$":
                match = re.match(r"\$[A-Za-z_0-9]*\$", sql[i:])
                if match:
                    dollar_tag = match.group(0); state = "dollar_quote"
                    buf.extend(dollar_tag); i += len(dollar_tag); continue
            elif ch == ";":
                text = "".join(buf).strip()
                if text and _has_sql(text): statements.append((start_line, text))
                buf = []; start_line = line
                i += 1; continue
        elif state == "single_quote":
            if ch == "'" and nxt == "'": buf.extend((ch, nxt)); i += 2; continue
            if ch == "\\" and i + 1 < len(sql): buf.extend((ch, nxt)); i += 2; continue
            if ch == "'": state = "normal"
        elif state == "double_quote":
            if ch == '"' and nxt == '"': buf.extend((ch, nxt)); i += 2; continue
            if ch == '"': state = "normal"
        elif state == "dollar_quote":
            if sql.startswith(dollar_tag, i):
                buf.extend(dollar_tag); i += len(dollar_tag); state = "normal"; continue
        elif state == "line_comment":
            if ch in "\r\n": state = "normal"
        elif state == "block_comment":
            if ch == "/" and nxt == "*":
                block_depth += 1; buf.extend((ch,nxt)); i += 2; continue
            if ch == "*" and nxt == "/":
                block_depth -= 1; buf.extend((ch,nxt)); i += 2
                if block_depth == 0: state = "normal"
                continue
        buf.append(ch)
        if ch == "\n": line += 1
        i += 1
    tail = "".join(buf).strip()
    if tail and _has_sql(tail): statements.append((start_line, tail))
    if state not in ("normal", "line_comment"):
        raise AuditError("unterminated SQL quoting/comment structure")
    return statements


def _has_sql(text: str) -> bool:
    return bool(re.sub(r"(?s)/\*.*?\*/|--[^\n]*", "", text).strip())


def _unquote_identifier(token: str) -> str:
    if token.startswith('"') and token.endswith('"'):
        return token[1:-1].replace('""', '"')
    return token


def _outline_statement(statement: str) -> list[str]:
    """Return SQL token structure only; string/numeric literals are redacted."""
    token_re = re.compile(
        r"(?is)--[^\n]*|/\*.*?\*/|'(?:''|\\.|[^'])*'|\"(?:\"\"|[^\"])*\"|"
        r"\$[A-Za-z_0-9]*\$.*?\$[A-Za-z_0-9]*\$|[A-Za-z_][A-Za-z_0-9$]*|"
        r"\d+(?:\.\d+)?|::|[(),.;=*]|\S"
    )
    outline: list[str] = []
    for match in token_re.finditer(statement):
        token = match.group(0)
        if token.startswith("--") or token.startswith("/*"):
            continue
        if token.startswith("'") or token.startswith("$"):
            outline.append("<STRING_LITERAL>")
        elif token.startswith('"') and token.endswith('"'):
            outline.append('IDENT("' + token[1:-1].replace('""', '"') + '")')
        elif re.fullmatch(r"\d+(?:\.\d+)?", token):
            outline.append("<NUMERIC_LITERAL>")
        elif token[0].isalpha() or token[0] == "_":
            outline.append(token.upper())
        else:
            outline.append(token)
    return outline


def _type_and_details(statement: str) -> dict:
    normalized = re.sub(r"(?s)/\*.*?\*/|--[^\n]*", " ", statement).strip()
    upper = normalized.upper()
    result = {"type": "UNKNOWN", "roles": [], "dependencies": [], "grantor": None,
              "membership_options": [], "role_attributes": [], "password_clause": False,
              "classification": "unsupported", "supported_by_audit_parser": False}
    # Meta commands must be identified before SQL tokenization.
    if normalized.startswith("\\"):
        command = normalized.split(None, 1)[0]
        result.update(type="PSQL_META", meta_command=command,
                      classification="recognized_non_sql_directive",
                      supported_by_audit_parser=True)
        return result
    if re.match(r"(?is)^CREATE\s+ROLE\b", normalized):
        result["type"] = "CREATE ROLE"
        match = re.match(r"(?is)^CREATE\s+ROLE\s+(" + ROLE + r")", normalized)
        if match: result["roles"] = [_unquote_identifier(match.group(1))]
        result["password_clause"] = bool(re.search(r"(?is)\bPASSWORD\b", normalized))
        attrs = re.findall(r"(?i)\b(SUPERUSER|NOSUPERUSER|CREATEDB|NOCREATEDB|CREATEROLE|NOCREATEROLE|INHERIT|NOINHERIT|LOGIN|NOLOGIN|REPLICATION|NOREPLICATION|BYPASSRLS|NOBYPASSRLS|CONNECTION\s+LIMIT|VALID\s+UNTIL)\b", normalized)
        result["role_attributes"] = sorted({re.sub(r"\s+", " ", x.upper()) for x in attrs})
        result["classification"] = "role_definition"
        result["supported_by_audit_parser"] = bool(match) and not result["password_clause"]
        return result
    if re.match(r"(?is)^ALTER\s+ROLE\b.*\b(?:IN\s+DATABASE\b.*\b)?(?:SET|RESET)\b", normalized):
        result["type"] = "ALTER ROLE SET/RESET"
        match = re.match(r"(?is)^ALTER\s+ROLE\s+(" + ROLE + r")", normalized)
        if match: result["roles"] = [_unquote_identifier(match.group(1))]
        result["classification"] = "role_session_configuration"
        result["supported_by_audit_parser"] = bool(match)
        return result
    if re.match(r"(?is)^ALTER\s+ROLE\b", normalized):
        result["type"] = "ALTER ROLE"
        match = re.match(r"(?is)^ALTER\s+ROLE\s+(" + ROLE + r")", normalized)
        if match: result["roles"] = [_unquote_identifier(match.group(1))]
        result["password_clause"] = bool(re.search(r"(?is)\bPASSWORD\b", normalized))
        attrs = re.findall(r"(?i)\b(SUPERUSER|NOSUPERUSER|CREATEDB|NOCREATEDB|CREATEROLE|NOCREATEROLE|INHERIT|NOINHERIT|LOGIN|NOLOGIN|REPLICATION|NOREPLICATION|BYPASSRLS|NOBYPASSRLS|CONNECTION\s+LIMIT|VALID\s+UNTIL)\b", normalized)
        result["role_attributes"] = sorted({re.sub(r"\s+", " ", x.upper()) for x in attrs})
        result["classification"] = "role_alteration_or_configuration"
        result["supported_by_audit_parser"] = bool(match) and not result["password_clause"]
        return result
    if re.match(r"(?is)^GRANT\b", normalized):
        result["type"] = "GRANT"
        parameter_grant = re.match(
            r"(?is)^GRANT\s+(SET|ALTER\s+SYSTEM)\s+ON\s+PARAMETER\s+"
            r"(" + ROLE + r")\s+TO\s+(.+)$", normalized)
        if parameter_grant:
            privilege = re.sub(r"\s+", "_", parameter_grant.group(1).upper())
            parameter = _unquote_identifier(parameter_grant.group(2))
            tail = parameter_grant.group(3)
            granted_to = re.match(r"(?is)(.+?)(?:\s+WITH\s+|\s+GRANTED\s+BY\s+|$)", tail)
            grantees_text = granted_to.group(1) if granted_to else tail
            grantees = [_unquote_identifier(x) for x in re.findall(ROLE, grantees_text)]
            by = re.search(r"(?is)\bGRANTED\s+BY\s+(" + ROLE + r")", tail)
            result.update(
                roles=grantees,
                dependencies=[{"parameter": parameter, "privilege": privilege,
                               "grantee_roles": grantees}],
                grantor=_unquote_identifier(by.group(1)) if by else None,
                classification="configuration_parameter_privilege_grant",
                supported_by_audit_parser=bool(grantees),
            )
            return result
        match = re.match(r"(?is)^GRANT\s+(" + ROLE + r")\s+TO\s+(.+)$", normalized)
        if match:
            granted = _unquote_identifier(match.group(1))
            tail = match.group(2)
            granted_to = re.match(r"(?is)(.+?)(?:\s+WITH\s+|\s+GRANTED\s+BY\s+|$)", tail)
            grantees_text = granted_to.group(1) if granted_to else tail
            roles = [_unquote_identifier(x) for x in re.findall(ROLE, grantees_text)]
            result["roles"] = [granted] + roles
            result["dependencies"] = [{"granted_role": granted, "member_roles": roles}]
            by = re.search(r"(?is)\bGRANTED\s+BY\s+(" + ROLE + r")", tail)
            result["grantor"] = _unquote_identifier(by.group(1)) if by else None
            options = []
            for opt in ("ADMIN", "INHERIT", "SET"):
                if re.search(r"(?is)\b" + opt + r"\s+(?:TRUE|FALSE)\b", tail):
                    options.append(opt + "_" + re.search(r"(?is)\b" + opt + r"\s+(TRUE|FALSE)\b", tail).group(1).upper())
            if re.search(r"(?is)\bWITH\s+ADMIN\s+OPTION\b", tail): options.append("ADMIN_OPTION")
            result["membership_options"] = options
            result["classification"] = "role_membership_grant"
            result["supported_by_audit_parser"] = True
        return result
    if re.match(r"(?is)^REVOKE\b", normalized):
        result.update(type="REVOKE", classification="role_or_privilege_revocation",
                      supported_by_audit_parser=True)
        result["roles"] = [_unquote_identifier(x) for x in re.findall(ROLE, normalized[6:])]
        return result
    for prefix, kind in ((r"COMMENT\s+ON\s+ROLE\b", "COMMENT ON ROLE"),
                         (r"SECURITY\s+LABEL\s+ON\s+ROLE\b", "SECURITY LABEL ON ROLE"),
                         (r"ALTER\s+ROLE\b.*\bSET\b", "ALTER ROLE SET")):
        if re.match(r"(?is)^" + prefix, normalized):
            result.update(type=kind, classification="role_metadata", supported_by_audit_parser=True)
            if kind == "COMMENT ON ROLE":
                m = re.match(r"(?is)^COMMENT\s+ON\s+ROLE\s+(" + ROLE + r")", normalized)
                if m: result["roles"] = [_unquote_identifier(m.group(1))]
            return result
    if re.match(r"(?is)^SET\s+", normalized):
        result.update(type="SET", classification="session_setting", supported_by_audit_parser=True)
        return result
    if result["type"] == "UNKNOWN":
        words = re.match(r"(?is)^([A-Za-z]+)(?:\s+([A-Za-z]+))?", normalized)
        if words:
            result["type"] = " ".join(word.upper() for word in words.groups() if word)
    return result


def inventory_sql(data: bytes) -> dict:
    try: sql = data.decode("utf-8")
    except UnicodeDecodeError as exc: raise AuditError("decrypted archive is not UTF-8 SQL") from exc
    statements = _split_sql(sql)
    rows = []
    for line, statement in statements:
        detail = _type_and_details(statement)
        detail["line"] = line
        if not detail["supported_by_audit_parser"]:
            detail["token_outline"] = _outline_statement(statement)
        # Never preserve SQL text, literals, comments, or password values.
        rows.append(detail)
    counts: dict[str, int] = {}
    for row in rows: counts[row["type"]] = counts.get(row["type"], 0) + 1
    roles = sorted({role for row in rows for role in row.get("roles", [])}
                   | {row["grantor"] for row in rows if row.get("grantor")})
    definitions = sorted({row["roles"][0] for row in rows if row["type"] == "CREATE ROLE" and row["roles"]})
    referenced = sorted(set(roles) - set(definitions))
    memberships = [{"line": row["line"], **row["dependencies"][0], "grantor": row["grantor"],
                    "options": row["membership_options"]}
                   for row in rows if row["type"] == "GRANT" and row["dependencies"]]
    unsupported = [{"line": row["line"], "type": row["type"],
                    "token_outline": row.get("token_outline", [])}
                   for row in rows if not row["supported_by_audit_parser"]]
    return {
        "format": "project-flour-roles-audit-v1",
        "statement_count": len(rows), "statement_type_counts": dict(sorted(counts.items())),
        "statements_in_source_order": rows,
        "role_names": roles,
        "role_definitions": definitions,
        "referenced_roles_without_definition_in_archive": referenced,
        "membership_grants": memberships,
        "unsupported_statements": unsupported,
        "bootstrap_requirements": {
            "roles_to_precreate_or_map": referenced,
            "role_definition_count": len(definitions),
            "membership_count": len(memberships),
            "preserve_source_order": True,
            "execute_sql": False,
        },
        "archive_contains_password_clause": any(row["password_clause"] for row in rows),
        "audit_only": True,
    }


def audit_archive(archive: Path, expected_sha256: str, passphrase: str) -> dict:
    hasher = hashlib.sha256()
    with archive.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            hasher.update(chunk)
    digest = hasher.hexdigest()
    if digest != expected_sha256:
        raise AuditError("encrypted roles archive SHA-256 mismatch")
    plaintext = _decrypt_in_memory(archive, passphrase)
    try:
        result = inventory_sql(bytes(plaintext))
        result["archive_sha256"] = digest
        result["decrypted_bytes"] = len(plaintext)
        result["all_statement_forms_recognized"] = not result["unsupported_statements"]
        return result
    finally:
        for index in range(len(plaintext)):
            plaintext[index] = 0


def _write_private_new(path: Path, report: dict) -> None:
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(path.parent, 0o700)
    payload = (json.dumps(report, indent=2, sort_keys=True) + "\n").encode()
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(fd, "wb", closefd=False) as out:
            out.write(payload); out.flush(); os.fsync(out.fileno())
    finally:
        os.close(fd)
    os.chmod(path, 0o600)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path)
    parser.add_argument("--expected-sha256", default=EXPECTED_ARCHIVE_SHA256)
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args(argv)
    passphrase = ""
    try:
        passphrase = _secure_prompt()
        result = audit_archive(args.archive, args.expected_sha256, passphrase)
        _write_private_new(args.report, result)
        print(f"AUDIT_COMPLETED=YES statements={result['statement_count']} unsupported={len(result['unsupported_statements'])}")
        print(f"INVENTORY={args.report}")
        return 0
    except AuditError as exc:
        print(f"AUDIT_ONLY=STOP reason={exc}", file=sys.stderr)
        return 2
    except FileExistsError:
        print("AUDIT_ONLY=STOP reason=report path already exists", file=sys.stderr)
        return 2
    except Exception:
        print("AUDIT_ONLY=STOP reason=unexpected audit failure", file=sys.stderr)
        return 2
    finally:
        passphrase = ""


if __name__ == "__main__":
    raise SystemExit(main())
