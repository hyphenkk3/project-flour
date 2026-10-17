# Production release runbook — preparation only

This document is an execution checklist, not authorization. No step below has been run against Production. The separate refund write-lock candidate is never part of this initial release.

## 0. Source and package identity — read-only

Verify GitHub branch heads before release approval:

```sh
git ls-remote https://github.com/hyphenkk3/project-flour.git \
  refs/heads/codex/cake-size-availability-dev \
  refs/heads/codex/production-release-preparation-20261017
```

Expected application commit: `e3445e7757cfed418f7ab8d0e6dcf5f6177fd24b`.
Expected preparation commit at this review: `082c89d2dcc45169789fe8f061bf7e748e351524`.

Use a new clean checkout for the application, pinned to the exact application SHA. Confirm `git rev-parse HEAD` equals that SHA and `git status --porcelain` is empty. Never deploy from a dirty or differently based checkout. Keep the preparation branch separate from the application source.

## 1. Stop/go preflight — read-only

1. Verify project reference `cuowwlduhxxifmpvpltt` in the Supabase dashboard/API and confirm the Production domain. Never infer identity from a linked local project.
2. Confirm current migration history and baseline objects using `sql/preflight.sql`. If any intended migration name already exists, any excluded write-lock row exists, the project identity differs, a schema precondition fails, or mismatch counts unexpectedly increase: STOP. Do not retry or repair history.
3. Confirm the latest backup evidence, current Production deployment identity, Supabase binding and provider email pause readiness. Do not assume Vercel rollback can reverse database changes.
4. Resolve old-application compatibility before DDL: the exact legacy Production source/call sites are unavailable. Specifically establish whether it calls assignment, Fresh Pick checkout/cutoff, or any refund writer during the migration-to-deploy window. If that cannot be established, do not proceed without an Owner-approved controlled compatibility/maintenance plan.
5. Verify the Owner has separately approved the migration window, provider-side pause, and application deployment.

Read-only SQL invocation (use an approved read-only connection, with credentials supplied outside shell history):

```sh
psql "$PROD_READONLY_URL" -X -v ON_ERROR_STOP=1 -f release/production/sql/preflight.sql
```

## 2. Pause Production email at provider — external change; separate Owner approval required

Before applying the database pause, the Owner should select the **Whitebird Production** sending project in Resend and apply a provider-supported pause scoped only to Production. Confirm from the dashboard that the Production sending capability is disabled while Development keys/projects remain enabled. Do not revoke/rotate keys. If no scoped pause is available, STOP and obtain a provider-supported Production-only control.

The accepted DEV code's only identified Resend adapter is `src/foundation/staff/staff-notification-dispatch.ts`; route dispatch and scheduled helper call into that worker, and the accepted source has a hard-coded pause check. The old Production deployment may have other direct Resend send paths; its source is unavailable, so the provider pause is the independent barrier. Keep queues and history intact. Do not enable dispatch later until the failed backlog is reviewed and a no-catch-up disposition is approved.

## 3. Apply the six exact SQL payloads — Production writes; separate Owner approval required

Use the supported Supabase `apply_migration` API against project `cuowwlduhxxifmpvpltt`. For each row below, load only the exact named file from the reviewed preparation commit and make one API call with the listed `name`. The API-generated version is authoritative and must be captured in the execution log and verified in `schema_migrations`.

Apply sequentially, waiting for success and verifying the recorded name/version before moving to the next row:

| Order | API name | Exact SQL file |
|---|---|---|
| 1 | `assignment_fix` | `migrations/20261017150000_assignment_fix.sql` |
| 2 | `cut_extra_stock_actor_acl` | `migrations/20261017150500_cut_extra_stock_actor_acl.sql` |
| 3 | `cutoff` | `migrations/20261017151000_cutoff.sql` |
| 4 | `refund_v1` | `migrations/20261017152000_refund_v1.sql` |
| 5 | `email_pause` | `migrations/20261017153000_email_pause.sql` |
| 6 | `refund_total_rpc_acl` | `migrations/20261017154000_refund_total_rpc_acl.sql` |

Tool-call shape for each row (replace the name and SQL payload only from that row; this is an API call, not a shell command):

```text
supabase_apply_migration(
  project_id = "cuowwlduhxxifmpvpltt",
  name = "<exact API name from table>",
  query = "<entire exact SQL file contents>"
)
```

Never use a wildcard, a directory loop, `supabase db push`, `--include-all`, direct SQL execution for candidate DDL, or a call that applies more than one file. Never include `20261017152100_refund_v1_write_lock.sql`. Before every individual API call, recheck that its API name has no history row. After success, record the returned version and confirm exactly one history row by name. If response is ambiguous, do not retry: inspect history and live definitions first. If a name already exists, stop and inspect rather than replay.

## 4. Verify after migrations — read-only

Run `sql/postflight.sql` with a read-only Production connection. Require exactly one history row for each of the six API names; record the actual versions, verify function definitions/permissions, and ensure no row exists for `refund_v1_write_lock`. Compare pre/post mismatch counts, queue status counts, and existing business-record counts. Any unexpected difference is STOP.

## 5. Deploy the pinned application — Production write; separate Owner approval required

In a clean checkout at the exact accepted SHA, confirm Vercel is linked to team `hyphen-org` and project `project-flour`, verify the Production environment binds only to `cuowwlduhxxifmpvpltt`, and check the deployed branch/domain. Do not expose environment values.

```sh
vercel link --scope hyphen-org --project project-flour
vercel deploy --prod --yes
```

Capture the new deployment ID, URL and source SHA. Confirm READY, `whitebird.asia`, and the intended Production Supabase binding before considering the release live. Do not use a rollback as a database undo.

## 6. Non-mutating smoke checks — after approved deploy

Load the public home/catalogue and sign-in pages; use authorized staff sessions to load relevant dashboards. Do not submit orders, change prices/stock, record payments/refunds, trigger email/WhatsApp, or alter customer data as smoke tests. Run the postflight and compare pre/post counts. Stop on financial, order/stock, authentication/passkey, storage, notification, or environment mismatch.

## Excluded step

`20261017152100_refund_v1_write_lock.sql` is explicitly excluded from this release. It must not appear in any API call, SQL Editor paste, shell command, wildcard, loop, or bulk migration operation. It requires a separate future compatibility review and approval.
