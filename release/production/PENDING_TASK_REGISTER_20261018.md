# Project Flour pending-task register — 2026-10-18

This register preserves previously identified work. It does not reopen accepted DEV workflows, change release scope, or authorize Production changes.

## Release gates still open

| Item | Status | Notes |
|---|---|---|
| Isolated API/pooler/background write-barrier checks | **PASS (isolated only)** | PostgREST/Supavisor denial and local cron/pg_net containment were accepted in the isolated rehearsal. This does not authorize or prove Production activation. Production cutover still requires the approved owner/admin path, in-flight drain, inactive-job verification, and a reversible reopening check. |
| Contain old application database writers | **Release blocker** | The legacy Production source is unrecoverable; its database roles, active connections and any direct SQL path are unknown. Do not repeat source-recovery searches without new actionable evidence. Prove the barrier rejects all application roles and drains their live sessions. |
| Production-only email containment | **Release blocker for email safety** | Read-only Vercel metadata shows one Production-scoped and two Preview-scoped RESEND_API_KEY entries, with no value fingerprint or key identity. Owner must privately match the Production value to its secured key record and confirm it is Production-exclusive. If this cannot be proven, do not disable any existing key; a separately approved dedicated Production key change is required. At cutover, pause only that verified key, keep database Email Pause enabled and the email cron inactive, preserve the queue, and prevent catch-up. Preview/DEV entries remain untouched. |
| Historical Auth data and Storage API recovery | **PASS in isolation** | Restored 10 Auth users, 4 passkey rows, and 10 linked profiles; the local Auth service read all 10 identities and pre/post row digests matched. All 34 archived Storage objects were read through the isolated API with matching sizes; private synthetic access denial and historical file-hash preservation passed. Historical-user login was not attempted. |
| Migration API version registration in rehearsal | **Release blocker for execution evidence** | The six payloads passed direct SQL replay, which intentionally does not write Supabase migration history. Production must use the supported API one exact payload at a time and inspect the returned version/history before any retry. |

| Production scheduler controls | **Read-only controls identified; cutover action pending** | Three Production cron jobs were active. cron.alter_job/cron.unschedule are executable by the inspected postgres role. pg_net extension/schema/functions were absent at inspection. During approved cutover, stop all three jobs, wait for no running executions, and resume only the two business jobs after postflight; keep email dispatch stopped. |\n\n## Accepted feature work / verification to retain

| Item | Status | Notes |
|---|---|---|
| Fresh Pick Ready-for-Collection override | **DEV accepted; keep in release scope** | Bakery Mark Ready/Undo acceptance and ordinary Owner Ready/Undo acceptance were completed. Do not repeat without new regression evidence. Verify only through the release’s approved Production smoke plan. |
| Crew/Collection refund-RPC direct test | **Owner-authorized skip** | No active Crew/Collection account is available. Do not create one solely for testing. Preserve this as an explicit skip, not a defect. |
| Fresh Pick Share Payment delivery verification | **Pending verification** | Retain the identified delivery verification. No broad rerun of payment/refund acceptance. |
| Previously documented Production data-integrity exceptions | **Owner review required; preserve records** | Rehearsal observed 2 paid one-sided reciprocal stock links, 2 cancelled orders with historical stock links, and 2 sold stock rows without order links. No automatic repair is permitted. Review records with the data owner before any manual correction or affected-order operation. |

## Deferred or follow-up work

| Item | Status | Notes |
|---|---|---|
| WhatsApp plus-sign issue on iPhone Business | **Deferred verification** | Keep separate from October 25 database release unless owner reprioritizes. |
| “+ Sent to Customer” confirmation UI | **Deferred** | Track as a UI follow-up. |
| Cake-size pricing/date display | **Pending verification** | Retain the existing verification item; do not expand the current release scope. |
| Multi-item Waiting List | **Pending verification** | Retain the existing multi-item scenario. |
| Staff Admin V1 | **Deferred feature** | Not required to rebuild or add to the current launch package. |
| Email-change verification issue | **Pending follow-up** | Separate from the initial email-disabled launch. |
| Photo recovery/editing follow-up | **Storage upload/replacement compatibility PASS; photo recovery/editing remains a follow-up** | Production managed Storage logs identify API v1.80.2; read-only live metadata confirms the `objects-current-version-index` marker and matching partial index. The exact v1.80.2 image passed isolated synthetic upload, upsert replacement and read-back; one restored historical object also read successfully. The earlier 42P10 came from the older v1.72.1 local image, not a demonstrated Production schema defect. No migration or code correction is needed. Keep the existing feature follow-up; reopen only on a new reproducible failure or managed schema/version change. |
| Production email backlog review | **Required before any future email reactivation** | Current launch decision keeps email disabled. Preserve historical queue records; do not mark them sent or delete them. Review failed/sent queue and define expiry/no-catch-up before re-enabling. |

## Handling

Keep these items separate from the six-migration release allowlist. Do not silently mark a pending item complete, repair historical Production records, activate email, or add deferred feature work to the October 25 release.

## Auth/Storage verification status

The historical Auth/Storage data-service checks above are complete. Do not rerun them without regression evidence. Historical Production passwords and passkeys must not be used for acceptance login. Remaining recovery limits are managed Auth configuration/key recovery and a real historical-user login path; retain these as recovery limitations, not failures of the restored-row/API checks.

## Final pre-cutover decision — 2026-10-18

No accepted feature test was reopened. The six approved SQL payloads remain the only initial migration allowlist; the refund write-lock stays excluded. Production and DEV remain untouched.

| Gate | Current status | Required before cutover |
|---|---|---|
| Production Resend key identity | **BLOCKED** | Owner privately matches the Production Vercel variable to a secured key record and proves Production-only scope; no secret is shared. Pause only that dedicated key under separate approval. |
| Email backlog | **Held / preserve** | Keep database pause on and email cron off; preserve rows/preferences; no automatic catch-up. |
| Fresh Production backup | **Owner action required** | Take and verify new encrypted DB+Storage archives immediately before release; do not overwrite October 17 evidence. |
| Storage upload/edit | **Compatibility unresolved** | Managed Production Storage API version is unknown. Local v1.72.1 upload against the restored schema fails 42P10; isolate matching service version before relying on photo create/replace. No migration is authorized. |
| Production cutover | **BLOCKED** | Follow RUNBOOK gates: pause/drain all three cron jobs, activate and verify write barrier, apply six exact files individually and record API versions, deploy pinned app, complete allowed smoke checks, and reopen only with Owner go/no-go. |

