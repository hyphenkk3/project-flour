# Isolated rehearsal results

Date: 2026-10-17
Local PostgreSQL: 17.11
Scope: disposable localhost databases only. No hosted DEV or Production writes.

## Schema fidelity

A synthetic representative harness was built from read-only Production object definitions and the accepted release migrations. It included Supabase-like roles (anon, authenticated, service_role), auth.uid() semantics, staff profiles, orders, order items, Fresh Pick stock, audit/timeline tables, refunds, dispatch config, and an HTTP request recorder.

The harness included the stronger validated Production-style pickup/cutoff constraint and these synthetic historical cases before the migration run:
- Paid order points to stock, while stock.order_id is null.
- Sold stock points to a paid order, while order.extra_stock_id is null.
- Cancelled order retains a reciprocal historical stock link.
- Sold stock has no order link.

This is not a full Supabase or Production schema. Auth, PostgREST, RLS policy topology, storage, actual pg_net, the complete production payment allocation schema, production-only triggers/functions, and the old deployed application were not reproduced. Several helper/business functions were stubs. Full Production compatibility is therefore not proven.

## Candidate application

Applied one at a time with transaction rollback enabled to a disposable local database:
1. 20261017150000 assignment candidate — PASS.
2. 20261017151000 cutoff candidate — PASS; the stronger constraint was replaced.
3. 20261017152000 Refund V1 metadata/RPC candidate — PASS.
4. 20261017153000 database email pause candidate — PASS.
5. 20261017152100 refund table write-lock candidate — applied separately to a restored disposable clone — PASS.

The four primary candidates completed without SQL errors. Refund migration emitted only expected NOTICE messages for optional legacy constraints that were absent in the synthetic baseline.

## Focused checks

- Assignment: one authenticated synthetic Bakery assignment set stock.order_id, order.extra_stock_id and sold_at; one order timeline event and one stock audit event were present.
- Deferred reciprocal constraint: a representative deferrable constraint trigger accepted the valid assignment at commit.
- Authorization: anon execution denied; Crew role denied; a staff ID spoofed against a different authenticated caller was denied.
- Duplicate assignment: rejected and did not create another link/audit event.
- Atomic rollback: an injected local audit-write failure after link updates rolled the transaction back; both links, sold_at and audit rows remained absent for the synthetic failed pair.
- Existing synthetic edge records: order and stock fingerprints (including IDs, reciprocal links, lifecycle/status and sold_at) matched exactly before and after assignment/cutoff/refund/email migrations. Row counts remained three orders and four stock units.
- Cutoff: pickup starting at noon with an order cutoff at 10:00 AM on the same date passed the validation function; an expired cutoff was rejected. This validates the candidate validator with a stubbed pickup-hours helper, not the full public checkout RPC or real Production operating-hours functions.
- Refund: general refund wrapper recorded a synthetic RM25 ledger row; repeating the same request key returned the same refund ID and kept one row. Synthetic overpayment wrapper recorded RM10 metadata. Fresh Pick metadata wrapper recorded a synthetic RM100 refund and timeline metadata using a stubbed legacy cancellation core. The real Production cancellation core, complete payment allocations, report queries and provider transfer behavior were not exercised.
- Refund permissions: Crew denied general refund; Manager denied Owner-only Fresh Pick cancellation/refund. After separately applying the write-lock in a clone, direct authenticated table INSERT was denied while the audited general refund RPC still succeeded.
- Email pause: a synthetic notification trigger and cron sweep both returned with zero recorded HTTP requests; two synthetic queue rows and their statuses remained unchanged. No real email/provider send occurred. Web notifications, WhatsApp, direct old-app Resend calls and actual pg_net were not represented.

## Recovery rehearsal

A custom-format dump of the synthetic rehearsal database restored successfully into a separate disposable database. The restored copy retained the representative edge rows and notification queue rows. A deliberately failing transactional migration created no lasting table after rollback.

This verifies only the local synthetic database backup and transaction rollback. It does not verify restoration of a Production backup, Supabase Auth/passkeys, Storage objects, PITR, or a live application rollback.

## Release interpretation

- The assignment/cutoff/refund schema/email-gate candidates are syntactically executable against this represented subset and their tested behavior matched the tested assertions.
- Keep the refund table write-lock excluded from the initial rollout until the actual Production application and every writer are confirmed to use RPCs rather than direct DML.
- The email database gate blocks only the observed trigger and scheduled HTTP request paths. A provider-side send pause and verification of the current Production application remain necessary to guarantee no application email can escape.
- Do not apply any candidate to Production based on this rehearsal alone. A sanitized complete Production schema or equivalent reviewed schema-only reconstruction and a full production-shaped test are still required.


## Production slicing RPC security follow-up — local PostgreSQL 17.11 replay

Date: 2026-10-17
Target: disposable local PostgreSQL 17.11 restored from the reviewed ACL-bearing Production schema archive. PostgreSQL was bound only to a private Unix socket with no TCP listener; no scheduler jobs or external integrations were enabled. The archive was not modified, uploaded, or committed.

### Restore fidelity and limits

The schema-only restore completed after matching local Supabase dependencies required by the archive: `citext`, `btree_gist`, Supabase role placeholders, a `dashboard_user` ACL placeholder, and an empty `cron` schema. No business rows or scheduled jobs were restored. The restored metadata contained 99 tables, 75 triggers, and 161 RLS policies; all 99 tables were under auth/public/storage. Production function definitions were restored from the archive rather than replaced with stubs. The custom local `cron` schema had no jobs, and no external service was available to the local database.

Because this was a schema-only archive, the database contained no pre-existing Production orders or stock to compare. No Production data was read or changed. The test created eight synthetic stock rows and synthetic staff/auth identities only in the disposable database.

### Migration replay

Applied individually, in the requested order, with no SQL changes:
1. `20261017150000_assignment_fix.sql` — PASS.
2. `20261017150500_cut_extra_stock_actor_acl.sql` — PASS.

Both completed without SQL errors. The assignment migration was included only as the required local dependency and was not applied to any hosted database.

### Targeted security and integrity results

- Anonymous EXECUTE: denied; effective function privilege check returned false.
- Authenticated Bakery, Manager, and Owner: each successfully cut one eligible confirmed unsold synthetic stock row.
- Customer Operations: rejected by the role allowlist.
- Authenticated Bakery supplying another staff member's ID: rejected by `_bind_rpc_actor`.
- Authenticated request with no bound user identity but a supplied staff ID: rejected as unauthenticated.
- Sold, Proposed, and already-cut stock: each rejected and left unchanged.
- Actor binding: each successful stock update and its sole `cut_into_slices` audit event recorded the matching authenticated staff profile. Exactly one cut event existed for each of the three successful rows; no cut event was emitted for rejected attempts.
- Atomicity: a successful local cut followed by transaction rollback left both stock fields and its cut audit event unchanged.
- Lock/update protection: the restored function retains `SELECT ... FOR UPDATE` and a guarded single-row update requiring confirmed lifecycle, unsold state, and no prior cut. No order row was changed; the schema-only restore had zero orders.
- Existing Production history and business rows were not present in the schema-only database, so historical row preservation cannot be established by this rehearsal. The candidate migration itself changes the RPC definition and grants only; its exercised business effects were limited to explicit synthetic calls.

### Release interpretation

The slicing candidate is **locally validated against the restored Production schema and ACL metadata** for the tested role, stock eligibility, actor binding, audit, and transaction behavior. The restore used local Supabase dependency placeholders and did not emulate a live Supabase Auth/PostgREST gateway, active cron scheduler, or Production business rows. This does not prove full Production runtime compatibility or historical-data preservation. Keep the separate refund write-lock migration excluded from the initial rollout. No Production object, migration history, or record was modified.
