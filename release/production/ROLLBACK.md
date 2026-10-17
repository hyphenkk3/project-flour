# Recovery and rollback

Preparation only; no Production action performed. None of the restore procedures below has been demonstrated.

## Application
Record the current Production deployment ID, source commit and env binding immediately before release. Keep the prior verified deployment available and route back only after confirming its domain and project binding. Current live deployment/source is not verified, so app rollback is not ready until access confirms it. Recheck login, passkeys, Supabase and storage after rollback.

## Database
A general restore after live writes can erase later orders, payments, refunds, inventory and audit events. Do not use restore as routine rollback.
- Assignment: do not revert to broken linking/anon grants. Do not silently repair the two known historical paid-order mismatches.
- Cutoff: retain unless a verified defect requires a forward fix; the candidate changes no business rows.
- Refund: never delete refund rows or audit history. Disable an entry point only after confirming call sites.
- Email: keep pause closed on failure; do not reopen with old queue rows pending.

For severe data incident, stop writes and have DBA/Owner choose PITR time and acceptable loss window. Restore test is incomplete; do not claim a verified restore.

## Auth and storage
Candidate SQL does not alter auth users, passkeys, identity providers, buckets or files. That is not proof they can be restored. Verify configuration/backup ownership and complete an isolated restore rehearsal.

## Stop conditions
Stop on wrong project, unexpected migration collision, schema signature mismatch, existing data precondition failure, unverified app binding, failed backup evidence, financial discrepancy, order-stock inconsistency increase, Auth/passkey regression, storage issue, email request leakage or unexpected queue-state change.
