# Project Flour pending-task register — 2026-10-18

This register preserves previously identified work. It does not reopen accepted DEV workflows, change release scope, or authorize Production changes.

## Release gates still open

| Item | Status | Notes |
|---|---|---|
| Owner-level Production-shaped database barrier rehearsal | **Release blocker** | The isolated PostgreSQL owner-ACL/session test passed, but the restored Supabase-shaped database is owned by `supabase_admin`; the available reconstructed `postgres` role could not alter that database ACL. Rehearse as the actual database owner/admin before any Production cutover. |
| Contain old application database writers | **Release blocker** | The legacy Production source is unrecoverable; its database roles, active connections and any direct SQL path are unknown. Do not repeat source-recovery searches without new actionable evidence. Prove the barrier rejects all application roles and drains their live sessions. |
| Production-only email containment | **Release blocker for email safety** | The database Email Pause covers tested database dispatch. Direct Resend behavior in the legacy app remains unknown. A Production-scoped provider pause is needed before release; do not reactivate queued email without backlog review and an explicit no-catch-up policy. |
| Functional Auth/passkey and Storage recovery | **Release blocker for recovery confidence** | Database rows and object archive correspondence were checked, but password/passkey login and actual Storage API reads from a restored Supabase service were not demonstrated. |
| Migration API version registration in rehearsal | **Release blocker for execution evidence** | The six payloads passed direct SQL replay, which intentionally does not write Supabase migration history. Production must use the supported API one exact payload at a time and inspect the returned version/history before any retry. |

## Accepted feature work / verification to retain

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
| Photo recovery/editing follow-up | **Deferred follow-up** | Preserve existing recovery/editing task. |
| Production email backlog review | **Required before any future email reactivation** | Current launch decision keeps email disabled. Preserve historical queue records; do not mark them sent or delete them. Review failed/sent queue and define expiry/no-catch-up before re-enabling. |

## Handling

Keep these items separate from the six-migration release allowlist. Do not silently mark a pending item complete, repair historical Production records, activate email, or add deferred feature work to the October 25 release.
