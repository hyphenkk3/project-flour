# Production release rehearsal and cutover gate — 2026-10-18

Status: **BLOCKED at isolated runtime setup.** No DEV or Production service was changed. No migration was run. The six approved SQL payloads and the accepted application were not altered.

## Confirmed preparation baseline

- Release-preparation branch: `codex/production-release-preparation-20261017`
- Baseline commit: `6f4748e5c73e3a7037a42cc79fec5fb81d13b80c`
- Accepted application: `e3445e7757cfed418f7ab8d0e6dcf5f6177fd24b`
- Initial migration allowlist, in order:
  1. `20261017150000_assignment_fix.sql`
  2. `20261017150500_cut_extra_stock_actor_acl.sql`
  3. `20261017151000_cutoff.sql`
  4. `20261017152000_refund_v1.sql`
  5. `20261017153000_email_pause.sql`
  6. `20261017154000_refund_total_rpc_acl.sql`
- Explicitly excluded: `20261017152100_refund_v1_write_lock.sql`. It must not be included by wildcard, directory push, or bulk migration command.

## Rehearsal attempt and boundary

The unchanged October 17 backup remains under the Owner's private Project Flour backup directory. A fresh private copy of the prior PostgreSQL 17 restore was made under `/private/tmp/project-flour-prod-rehearsal-20261018`; startup was attempted with TCP disabled, a private Unix socket, and background extension workers disabled. The sandbox denied PostgreSQL shared-memory setup (`shmat/shmget: Operation not permitted`) both with its default mode and with mmap shared memory. The copied database remained stopped. No SQL was executed against it, and the original backup and prior restore were left unchanged.

Docker is not installed in this execution environment, so a Supabase-compatible local Auth, PostgREST, Storage, and scheduler stack cannot be started here. The connected repository confirms the release-preparation baseline is still exactly the supplied commit. Its release README records prior SQL-only rehearsals, but those do not substitute for this requested replay against October 17 business rows or for full Auth/Storage/application tests.

### Required Owner action to unblock

On the Mac, install or start Docker Desktop (or provide an already-running local Docker-compatible runtime), then confirm that `docker info` succeeds. Do not provision a cloud Supabase project for this rehearsal. The next run should use a fresh local Supabase stack, the October 17 encrypted database and Storage archives, a disposable local environment file with no Production/DEV keys or provider credentials, and an outbound-network deny rule. Restore the backup into that stack, disable all local scheduled jobs, then execute only the six-file allowlist above. Keep the backup source read-only and the local rehearsal directory owner-only. If local egress cannot be denied, stop rather than use live integrations.

This environment also lacks Docker; no container setup or project was created. Do not send database passwords or encryption passphrases in chat.

## Isolation checks required before replay

A rehearsal is GO only after all of these are evidenced:

- The database endpoint is local and the app's Supabase URL/key pair identifies only the disposable local project.
- The accepted app is configured only with that local URL and synthetic credentials.
- No Production or DEV environment file is loaded; no Resend, payment-provider, WhatsApp, webhook, or other live integration secret is present.
- Outbound network access from the local runtime is denied. Provider calls are mocked or fail closed.
- Scheduled jobs are inactive; no restored cron/queue task can dispatch.
- The six SQL files are applied one at a time in listed order. Record the exact filename, SHA-256, start/end result, and postcondition for each.
- Stop on any failed precondition, unexpected object change, nonempty transaction residue, or ambiguous result. Do not retry an ambiguous application until local schema state has been inspected.
- Do not include the refund write-lock candidate.

## Production cutover gate

**A complete Production write barrier is not established by this package.** A maintenance page or Vercel deployment protection alone does not prevent clients with Supabase access from calling the Data API directly, existing authenticated sessions from issuing writes, database jobs from running, or an unrecoverable old server deployment from calling its own routes/provider.

Before the October 25 cutover, prepare and rehearse a small, reversible maintenance gate with two layers:

1. An application maintenance flag that rejects every customer/staff mutation route and server action, including direct requests; show read-only maintenance UI. This covers the application tier, not direct Supabase clients.
2. A database-side write barrier that rejects INSERT/UPDATE/DELETE/TRUNCATE for application business tables across anon, authenticated, service-role, RPC, and scheduled paths, while allowing a narrowly controlled migration connection. The barrier must be tested against direct PostgREST and RPC calls and have an auditable on/off state. Do not rely on UI hiding or role defaults. If this cannot be implemented without broad permission changes, stop and do not release.

The barrier must be installed and rehearsed before the release window. During cutover, activate the app gate, stop schedules/background writers, activate the DB barrier, and wait for in-flight writes to drain. Pause Production email at the provider as a separate scoped action because the database email gate cannot establish that an unrecoverable old application has no direct provider sender. Do not change provider settings during preparation.

Only with those controls active should the operator apply the six exact files individually, verify their recorded migration names/versions and postconditions, deploy the accepted application commit, and run read-only smoke checks for sign-in, required RPC permissions, Fresh Pick eligibility/cutoff, assigned stock, refund reporting, and Storage reads. Keep the barrier active if any check fails. Reverse the application deployment only to a verified prior deployment; a Vercel rollback does not reverse database migrations. Do not run down migrations or rewrite migration history. Re-open writes only after the new app and database checks pass, all in-flight behavior is understood, and the Owner gives the separate Production-release approval.

## Current decision

- Isolated migration/data replay: **BLOCKED** by local shared-memory policy and missing Docker runtime.
- Full accepted-app/Auth/Storage rehearsal: **BLOCKED** until the local Supabase runtime is available.
- Production cutover: **BLOCKED** until the two-layer write barrier is implemented and rehearsed, old-app/direct-provider paths are contained, and recovery controls remain acceptable.
- No Production or DEV action is authorized or performed by this status record.
