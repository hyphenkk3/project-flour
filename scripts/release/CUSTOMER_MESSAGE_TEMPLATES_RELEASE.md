# Customer Message Templates V1 — Production preparation

This file prepares a later, separately approved release. It does not authorize a Production migration or deployment.

## Package and current baseline

- Approved migration: `20261020075703_customer_message_templates_v1.sql` only.
- SQL SHA-256: `5de1415347da65b727845c67c508e249f38c9fefe823dc2ae073857f74ba686a`.
- Pinned Production ledger: `customer-message-templates-production-ledger.json`, 161 exact historical version/name pairs, SHA-256 `81da91a1e7842c3fa425b8ef8817e5b0999d31861964142f84c1833a187355ac`.
- Expected ledger after the one migration: 162 entries, with the original 161 unchanged.
- Production project: `cuowwlduhxxifmpvpltt`; direct TLS database host: `db.cuowwlduhxxifmpvpltt.supabase.co`.
- Historical repository timestamp differences are deliberately left as recorded. Do not run repository-wide migration push or repair the ledger.

## Release-time preflight

1. Recheck GitHub `main`, the exact approved feature commit, Vercel Production, project identity, current database schema and all 161 pinned ledger version/name pairs. Stop if any ref, dependency, target object or ledger entry differs. The candidate feature migration and both target tables must be absent.
2. Inspect current Production business and Storage activity. Create a fresh full encrypted Production backup using the established Project Flour method. Verify the database dump, Auth/business data, roles, schema, migration ledger, actual Storage files, manifest, checksums, encryption, and an isolated restore. Preserve older backups. Document any unavoidable database/Storage non-atomic capture gap and require specific Owner acceptance before proceeding.
3. Confirm the backup covers the live state. Record its protected path, SHA-256, UTC capture/verification times, and whether any later changes remain uncovered. Do not set the current-backup field for a historical archive or accept a stale-backup exception from another release.
4. Obtain separate explicit Owner authorization for the exact feature commit, this runner revision, this migration hash, this ledger manifest, this Production project and the verified backup. Create an owner-only (mode 0600) approval JSON **only after** that authorization; the runner does not ship one. It requires `authorized`, `project_ref`, `feature_commit`, `migration_version`, `migration_sha256`, `ledger_manifest_sha256`, `runner_sha256`, `backup_archive_path`, `backup_archive_sha256`, `backup_verified_current_for_release=true`, `backup_has_uncovered_changes=false`, `backup_captured_at_utc`, and `backup_verified_at_utc`.
5. Use the direct database connection with `PGSSLMODE=verify-full`, an owner-only `PGPASSFILE`, explicit `PF_PROJECT_REF`, `PGHOST`, `PGPORT`, `PGDATABASE` and `PGUSER`. Never print credentials. Use a stable connection route, as the prior release demonstrated that local network changes can interrupt an open transaction.
6. Run the runner in `production-check` mode first. It is read-only and checks TLS, PostgreSQL identity, exact history and object preconditions. If any check differs, stop. The `production-apply` mode requires the approval file and typed project confirmation. It rechecks the ledger and catalog just before writing.

## Execution and validation after separate approval

The runner applies the one pinned SQL file and its ledger row inside one PostgreSQL transaction. It sets `lock_timeout=2s` and `statement_timeout=120s`, takes a transaction advisory lock and never retries automatically. A failure requires a read-only ledger/object audit before any further proposal.

After success, independently verify 162 unique ledger entries with the original 161 version/name pairs unchanged; exactly 19 seeded templates and 19 seed revisions; RLS on both tables; Owner/Manager write checks; authenticated staff read access; and denied anonymous reads/writes and direct staff table writes. Only then deploy the exact reviewed feature commit through the established GitHub/Vercel Production process. Confirm a READY deployment and live SHA, then perform non-mutating message, Bakery, Collection and checkout smoke checks.

If application deployment fails, restore the previous READY Vercel deployment while retaining the additive template tables. Application rollback does not reverse database changes. Preserve migration evidence and avoid deleting template revisions. Any database restore or rollback requires a separately reviewed recovery decision using the fresh encrypted backup and accounting for post-capture business changes.
