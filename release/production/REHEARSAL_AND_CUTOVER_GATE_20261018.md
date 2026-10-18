# Production release rehearsal and cutover gate — 2026-10-18

Status: **Database restore and the six approved SQL payloads passed. Historical Auth identity reads and all 34 Storage API reads also passed in an isolated rehearsal. Full end-user recovery and Production cutover remain BLOCKED.** No Production or DEV service, records, configuration, provider, or deployment was changed.

## Baseline and allowlist

- Repository: `hyphenkk3/project-flour`
- Preparation branch and source before this record: `codex/production-release-preparation-20261017` at `ffe00a9cc00e05fd297cdbda28848bd904dbc040`
- Accepted application: `e3445e7757cfed418f7ab8d0e6dcf5f6177fd24b`
- Detailed evidence: [PRODUCTION_SHAPED_REHEARSAL_20261018.md](PRODUCTION_SHAPED_REHEARSAL_20261018.md) (including the follow-up Auth/Storage verification)
- Separate follow-up register: [PENDING_TASK_REGISTER_20261018.md](PENDING_TASK_REGISTER_20261018.md)

The only SQL payloads replayed were, individually and in this order:

1. `20261017150000_assignment_fix.sql`
2. `20261017150500_cut_extra_stock_actor_acl.sql`
3. `20261017151000_cutoff.sql`
4. `20261017152000_refund_v1.sql`
5. `20261017153000_email_pause.sql`
6. `20261017154000_refund_total_rpc_acl.sql`

**Excluded at every stage:** `20261017152100_refund_v1_write_lock.sql`. Candidate files remain outside `supabase/migrations`; no wildcard, directory push, or bulk migration command is permitted. The replay used direct SQL, so it did not register migration history. In Production, use the supported migration API with one exact payload at a time, inspect the returned version and matching history row, and never retry an ambiguous result before inspecting live state.

## Rehearsal result

The earlier local PostgreSQL shared-memory restriction was bypassed with a temporary, isolated PostgreSQL 17.11 container. The outer execution network policy denied outbound traffic; the database container had no network; `cron.launch_active_jobs=off`. No Production or DEV credentials or provider integrations were configured. The original October 17 backup archives remained unchanged.

The full database backup restored to a disposable database with **zero errors and zero warnings**. The six migration files each executed successfully. Tracked counts before and after matched: 83 orders, 27 Extra Stock rows, 81 payments, 81 allocations, 0 refunds, 906 order timeline events, 129 stock events, 10 Auth users, 4 WebAuthn credential rows, and 34 Storage object metadata rows. Post-replay checks retained 2 paid reciprocal-link inconsistencies, 2 cancelled orders with historical stock links, and 2 sold stock rows without an order link; no migration repaired or rewrote them.

For the restored schema, metadata counts were 14 schemas, 113 tables, 605 functions, 77 triggers and 163 RLS policies. Storage archive paths and byte sizes matched all 34 metadata entries; the subsequent follow-up verified API retrieval of all 34 objects.

Permission postconditions passed for the changed assignment, slicing, cutoff, refund and aggregate RPCs. Anonymous execution was denied for assignment, slicing, cutoff and the refund aggregate; expected authenticated/service-role grants were present. The notification trigger/sweep pause guard was present ahead of dispatch in the restored function definitions. A transaction-wrapped cron sweep left the email queue unchanged (412 failed, 19 sent). Egress was denied. No email, payment, WhatsApp, webhook or external HTTP request was sent.

## Scope and limitations

- The replay was SQL-level, not a running copy of the accepted application connected to restored Supabase Auth, PostgREST and Storage services. Customer checkout, full refund/payment flows, normal staff login, passkey login, and end-to-end app behavior against the restored records were **not tested** in this rehearsal.
- The dump's ownership/object-ACL fidelity is incomplete. Supabase role attributes and memberships were reconstructed from Owner-provided metadata; the ACL-bearing schema archive contained schema ACL entries, not a complete replay of all object grants. Migration-created function grants were checked, but this does not establish every pre-existing Production grant.
- Historical Auth and WebAuthn rows were restored with exact pre/post row-digest equality. The local Auth service health check and admin identity listing passed, but historical-user password/passkey login was not attempted; active Auth login tests used only synthetic identities.
- The restored database was wired to an isolated local Supabase Storage API: all 34 historical objects were retrieved with metadata-matching sizes, a synthetic private object was denied to anon, and historical file hashes matched before/after.
- The Supabase migration registry was not written by the direct SQL rehearsal. No history rows were fabricated. Production migration application must still be version-verified through the supported API.
- The trigger function `staff_notification_request_dispatch()` is catalogued with PUBLIC EXECUTE, but direct invocation fails because PostgreSQL trigger functions may only run as triggers; the tested API roles had no INSERT grant on its event table. This should remain on the permission review list.
- Database pause checks do not prove that the unrecoverable old Production application has no direct Resend call. A Production-scoped provider pause remains necessary before release; do not change it during preparation.

## Write-barrier rehearsal

A disposable empty database owned by the reconstructed `postgres` role demonstrated that revoking database CONNECT from PUBLIC makes CONNECT false for `authenticator`, `anon`, `authenticated`, and `service_role`, while the owner `postgres` retains the maintenance connection. A pre-existing synthetic API-role session was terminated, and granting CONNECT back restored the effective privileges.

That primitive test is **not** a Production cutover barrier proof. On the restored Production-shaped database, the owner is `supabase_admin`; the reconstructed `postgres` role received a harmless “no privileges could be revoked” result and the API roles retained CONNECT. We did not elevate the role or alter object ownership to force the test. Before any cutover, an isolated rehearsal must run the barrier as the actual database owner/admin, verify any explicit CONNECT grants, prove application-role connections are rejected, terminate/drain existing app sessions, and verify the migration/admin path remains available. Scheduled writers must be stopped separately. The unrecoverable old application's database role and direct email paths remain unknown.

## Cutover decision and sequence

**Production cutover is BLOCKED.** Do not treat a maintenance page as the write barrier. The minimum candidate sequence, after the owner-approved barrier and recovery checks are independently proven, is:

1. Take and verify a fresh Production database and Storage backup using the established private workflow.
2. Apply a Production-only email provider pause; keep the database pause migration in the allowlist and retain queued history without marking messages sent.
3. Activate customer/staff maintenance presentation and stop scheduled/background writers.
4. As the verified database owner/admin, block new application-role database connections, confirm effective privileges, terminate/drain existing application sessions, and keep one narrowly controlled migration/admin session.
5. Apply only the six allowlisted SQL payloads individually through the supported API. After each, check the returned version, history row, and postconditions. Stop on any mismatch or ambiguous result.
6. Deploy only accepted application commit `e3445e7757cfed418f7ab8d0e6dcf5f6177fd24b` pinned to Production and verify its database binding.
7. Run read-only sign-in, permission, checkout eligibility/cutoff, inventory-link, refund-report, email-pause and Storage checks while the barrier remains active.
8. Reopen application-role connections and customer/staff writes only after every check passes and the Owner gives separate release approval. Keep email provider sending paused until the backlog is reviewed and catch-up behavior is explicitly controlled.

**STOP** if the backup/checksum is not verified, owner-level barrier cannot be applied and reversed in isolation, a privileged old-app connection remains, an unexpected migration version/object appears, staff/Auth access fails, or any postflight differs. On failure, keep writes blocked, do not retry a migration blindly, and do not reopen the old application against changed schema. Vercel rollback does not reverse SQL migrations; database recovery uses the separately verified backup/restore process, whose historical Auth service reading and Storage API retrieval are now verified locally, while historical-user password/passkey login recovery and restoration of Production-managed Auth configuration remain unverified.

## Service boundary

All restore and migration work in this record was isolated. Production and DEV databases, storage, deployments, provider settings, and business records remain untouched. No refund write-lock migration was used.

## Follow-up: historical Auth/Storage and Production controls — 2026-10-18

### Historical recovery results

- **Auth/passkey data: PASS.** The fresh isolated recovery database contains 10 historical Auth users, 4 WebAuthn credential records, and 10 linked staff profiles. Every profile and credential row links to a restored Auth user. The local Auth service health and admin read passed for all 10 identities. Auth-user and credential row digests were unchanged after service startup/read. No historical login or credential reset was attempted.
- **Storage reads/access: PASS.** The fresh isolated service exposed 34/34 historical public objects through its Storage API, each with a response size matching metadata. A private synthetic object was denied to anon (HTTP 400) and retrievable with the synthetic service role (HTTP 200), then removed. Historical file SHA-256 manifests matched before/after; the original backup archive remained unchanged. A separate exploratory synthetic upload returned HTTP 500 / PostgreSQL 42P10; no historical file changed and no schema workaround was made. Storage write compatibility is unverified and remains tied to the deferred photo-edit/upload flow.
- **Scope limit:** This proves Auth service reads restored identities and Storage API object access in the local isolated stack. It does not prove historical password/passkey login, restore a working managed Production Auth service, or validate the full accepted application against real identities.

### Production scheduler and email controls (read-only)

The Production project was queried read-only. At inspection, all three pg_cron jobs were active: staff-notification-email-dispatch-sweep (every 15 minutes), extra-walk-in-hold-reminders (every minute), and extra-walk-in-hold-expiry-cleanup (every minute), all running as postgres. The cron.alter_job and cron.unschedule functions exist, and the inspected postgres role had EXECUTE on them. No job was disabled or unscheduled. A future separately approved maintenance window should deactivate all three jobs, wait until cron.job_run_details shows no running executions, verify their inactive state, and only resume the two business jobs after postflight; the email sweep must remain stopped while email is disabled.

pg_net was not installed in the Production database at inspection, and no net schema or net.* functions were present. Therefore no Production pg_net request queue was available to pause at that time. Recheck only if the environment changes. The application notification history contained 412 failed and 19 sent records and no other statuses at inspection. Preserve these rows; do not mark them sent, delete them, or re-enable dispatch. The database Email Pause does not contain unknown direct Resend calls from the unrecoverable legacy application.

Vercel environment metadata was inspected with decryption disabled. The project has one Production-scoped RESEND_API_KEY variable and two Preview-scoped entries; no value was retrieved. This metadata does not identify which named Resend key is bound to the Production variable or prove the effective value in the existing CLI-uploaded deployment. Do not revoke or alter any key based on scope alone. Before cutover, the Owner must privately match the Production value to a dedicated Production Resend key using the secure key record/dashboard context. If the value cannot be identified or proven exclusive to Production, a provider-side pause cannot be safely targeted and email remains a release blocker. Revoke/pause only a verified Production-dedicated key after separate cutover approval; Preview keys must remain untouched.

### Current cutover gates

The isolated PostgREST/Supavisor write-barrier and local cron/pg_net containment checks previously accepted remain complete. Production scheduler controls are now identified but have not been changed. The actual Production write barrier still must be activated only in an approved cutover and verified before migrations. Direct legacy-app Resend behavior remains unverified and requires the provider-side Production-only containment above. The six-migration exact allowlist is unchanged; 20261017152100_refund_v1_write_lock.sql remains excluded.

## Final pre-cutover update — 2026-10-18

Preparation evidence at the start of this update: `d37e95a7d8ea76736cfe43b0766738fba8190c67`. The accepted application remains `e3445e7757cfed418f7ab8d0e6dcf5f6177fd24b`. The six-file migration allowlist above remains exact and unchanged; `20261017152100_refund_v1_write_lock.sql` remains excluded. The detailed executable gate is in [RUNBOOK.md](RUNBOOK.md); it supersedes earlier abbreviated cutover sequencing while preserving the evidence above.

### Targeted Storage upload diagnosis

The synthetic upload failure was isolated to the Storage upload upsert. Storage API image `v1.72.1` generates an insert into `storage.objects` with `ON CONFLICT (name, bucket_id)`. The October 17 restored Production schema has unique indexes for those columns only as partial indexes (`archived_at IS NULL` and `NOT is_versioned`), plus a separate unique key including `version`. A no-write local `EXPLAIN INSERT` reproduced SQLSTATE 42P10: no matching unique/exclusion constraint for the conflict target. No row was inserted and no historical object or metadata was modified.

This proves a mismatch between the restored Production schema and the local Storage API image, not whether the managed Production Storage service has the same version/query. The exact managed Storage API build was not verified. The accepted application uses `.upload()` for both cake-photo upload/replacement and library-asset create/replacement. Therefore the existing photo workflow is affected in the isolated pairing and remains a compatibility risk for Production. **No schema or application correction was made.** Do not add a Storage migration to the six-file allowlist. Before relying on uploads during launch, obtain the managed Production Storage API build/version evidence and reproduce against a matching Storage image in isolation. Otherwise defer photo upload/edit during the release window; preserve existing object reads.

### Production email key identity and containment

Read-only Vercel environment metadata exposes scopes only: one Production `RESEND_API_KEY` entry and two Preview entries. It does not provide a safe value fingerprint or identify the underlying Resend key. No key was decrypted, copied, changed, revoked, or tested. Scope is not proof that the Production value is a dedicated Production key.

The exact Owner-only step is to privately match the Vercel Production variable to the secured key-creation/inventory record and confirm the key is exclusive to Production. If that record cannot identify the value, do not guess or disable an existing key. A separately approved, dedicated Production-key provisioning/update and deployment is then needed before a safe provider-side pause. At cutover, pause only the verified Production-exclusive provider key, keep the database pause enabled, leave the email cron job inactive, preserve all queue rows/preferences, and do not enable backlog catch-up. Preview/DEV keys and environment entries remain untouched.

### Authoritative cutover status

Production and DEV remain unchanged. The release remains **BLOCKED** until a fresh encrypted database+Storage backup is executed and verified with separate Owner approval, Production email key identity and targeted pause are established, the three cron jobs are paused/drained, the write barrier is activated through the tested owner/admin path, the six migrations are individually applied with actual API versions/history verified, the pinned app is deployed, smoke checks pass, and the Owner explicitly authorizes reopening writes. Photo upload/edit compatibility also remains an open, scoped gate; no speculative schema fix is approved. Email must remain disabled after launch.


## Targeted Storage and email-gate update — 2026-10-18

This update supersedes the earlier Storage upload/edit compatibility row above. The accepted 34-of-34 historical-read result remains in effect.

| Gate | Updated result | Evidence / action |
|---|---|---|
| Managed Storage version and upload/replacement | **PASS in isolated compatibility replay** | Read-only Production Storage logs identified managed API version `1.80.2`; read-only live metadata confirmed the `objects-current-version-index` marker and matching partial unique index. A fresh isolated clone ran that exact image and Production-shaped schema: synthetic create, upload, upsert replacement, read-back and cleanup all returned HTTP 200; no 42P10. A restored historical object also read successfully. The prior 42P10 came from the older local v1.72.1 image's incompatible conflict target. No new migration or schema correction is required. Production/DEV were not written. |
| Production email key identity / containment | **OPEN — Owner action remains** | Read-only Vercel environment metadata was requested with decryption disabled. It exposes target/scope and environment-variable metadata but no provider key fingerprint or Resend key ID; Production scope alone does not prove provider-key identity or exclusivity. The Owner must privately cross-reference the Production `RESEND_API_KEY` with the Resend key inventory/creation record and confirm that exact key is dedicated to Production. Do not share, decrypt for Codex, or paste the value. If the mapping or exclusivity cannot be proven, do not disable an existing key; keep the email gate open and require a separately approved, safely isolated Production-only provider control. |

The six-migration allowlist and order are unchanged. `20261017152100_refund_v1_write_lock.sql` remains excluded. The Storage result is a matched-version isolated test, not permission to make Production changes. All other cutover gates and explicit Owner approvals remain as recorded above.


## Resend key mapping verification — 2026-10-18

The Owner-provided Resend inventory is accepted: `Whitebird Production`, `Whitebird Development`, and `Whitebird Development V2` each have Sending access. No screenshot or inventory is being requested again.

Read-only Vercel metadata (decryption disabled) shows one Production-scoped and two Preview-scoped `RESEND_API_KEY` entries. It has no provider key ID, fingerprint, digest, or Resend name. The Production variable entry has not changed since its creation on 2026-09-03, before the current READY Production CLI deployment `dpl_9toGsEsDYhYHn17takiszAjxRgjy` (created 2026-10-13). The deployment metadata confirms the Production target and CLI source but exposes no deployment-specific secret fingerprint. This supports which Vercel scope is configured; it does not prove that the secret equals the Resend key named `Whitebird Production`. Because the deployment source is CLI and its metadata has no environment snapshot fingerprint, also verify from the Owner's deployment record/command that this deployment used the linked project's Production environment and did not pass a different `RESEND_API_KEY` override.

**Gate: OPEN / BLOCKED pending exact key-name match.** Minimum secure Owner action: on the Owner’s Mac, in the Vercel-linked Project Flour directory, run `vercel env run --environment=production -- node -e 'const c=require("node:crypto"); const k=process.env.RESEND_API_KEY; if(!k) process.exit(2); process.stdout.write(c.createHash("sha256").update(k).digest("hex")+"\\n")'`. This prints only a SHA-256 fingerprint, never the key. Privately compute the same fingerprints for the three saved Resend key values from the Owner’s password manager/creation records, entirely on that Mac, and compare locally. Do not send the fingerprints or values to Codex. Report only which inventory label matched. If the saved key values are unavailable or no match can be established, leave all keys unchanged; the minimum safe follow-up is a separately approved, dedicated Production-key setup and controlled cutover, not disabling an unidentified key. Preview/DEV remains unaffected.
