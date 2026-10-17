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


## Production slicing RPC security follow-up

Read-only inspection of the live Production project `cuowwlduhxxifmpvpltt` found one `public.cut_extra_stock_into_slices(uuid,uuid)` function owned by `postgres`, marked SECURITY DEFINER. It already has the Bakery/Manager/Owner role allowlist, confirmed/unsold/already-cut guards, row locking, and audit call. It does not call `_bind_rpc_actor`; effective EXECUTE is true for anon, authenticated, service_role, and postgres because PUBLIC execution remains granted. The function arguments are named `p_extra_stock_id` and `p_actor_staff_id`.

The required helper signatures and six stock columns referenced by the accepted DEV function are present in Production. The existing assignment-release migration runs first and defines the actor binder. Thus a separate targeted replacement is required; no existing Production data or history is repaired by this change.

Candidate `20261017150500_cut_extra_stock_actor_acl.sql` is prepared from accepted DEV migration `20261017142007`, preserving its locks, eligibility checks, single-row update, audit event, and role policy. It revokes PUBLIC/anon and explicitly grants authenticated/service_role. This candidate has not yet been replayed in a disposable database after preparation. No Production object or record was modified during this inspection.
