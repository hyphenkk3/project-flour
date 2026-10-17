# Production release preparation package

Status: prepared only; nothing applied or deployed to Production.
Application release candidate: codex/cake-size-availability-dev at e3445e7757cfed418f7ab8d0e6dcf5f6177fd24b (remote branch verified). The Production-preparation branch remains separate.
Branch: codex/production-release-preparation-20261017.

Candidates are outside supabase/migrations so ordinary CLI pushes cannot include them. This is intentional.

| Order | Candidate | Purpose | Gate |
|---|---|---|---|
| 1 | 20261017150000_assignment_fix.sql | Future assignment reciprocal link, bound actor and anon revocation | Helper/audit signatures must match |
| 2 | 20261017150500_cut_extra_stock_actor_acl.sql | Bind slicing actor to authenticated staff and remove anon/PUBLIC execution | Requires assignment migration first; production signature/helpers/columns verified read-only |
| 3 | 20261017151000_cutoff.sql | Independent Bakery ordering cutoff | Verify Prod-shaped schema and existing rows |
| 4 | 20261017152000_refund_v1.sql | Metadata and audited RPC wrappers | Review every existing app writer |
| 5 | 20261017153000_email_pause.sql | Gate DB trigger/scheduled dispatch | Does not cover direct app/provider paths; provider stop also required |
| 6 | 20261017154000_refund_total_rpc_acl.sql | Restrict direct API access to the six SECURITY DEFINER order financial aggregates | Caller inventory and role-denial checks passed |

20261017152100_refund_v1_write_lock.sql remains a separate, conditional candidate and is excluded from the initial Production rollout.

The assignment and cutoff SQL are based on accepted DEV migrations 20261017012542 and 20261017022803 with fail-closed schema preconditions. The slicing candidate is based on accepted DEV migration 20261017142007; its Production target was checked read-only: the existing SECURITY DEFINER RPC already has the staff-role allowlist, confirmed/unsold/already-cut guards, row lock, and audit call, but does not bind the supplied actor and remains executable by anon through PUBLIC. The targeted replacement retains those business checks, calls the assignment migration's `_bind_rpc_actor`, and revokes PUBLIC/anon while granting authenticated and service_role. It only replaces the RPC definition and its EXECUTE ACL; it does not update stock, order, audit, or staff rows. The refund migration is based on accepted DEV 20261015010528 with table privilege revocation separated. The email candidate is based on actual Production trigger/sweep definitions inspected read-only.

The candidate names express intended ordering only. Previous Supabase migration API use generated an authoritative version different from the source filename. At future approved application, submit exactly one reviewed SQL payload per call to the supported migration API, capture its returned/recorded version, verify live definitions and history, then reconcile the source filename to that actual version in a new commit. Never fabricate history or replay SQL after an ambiguous response; inspect history and live objects first. Recheck collisions immediately before applying. Do not use bulk db push, --include-all, or history repair.

## Validation status

The assignment, cutoff, Refund V1, and Email Pause candidates passed the previous Production-shaped SQL and permission rehearsal; the refund write-lock was excluded. The financial aggregate ACL candidate was separately tested. The new slicing candidate has not yet had an isolated SQL replay; its Production definition and required schema dependencies were checked read-only, so do not treat the candidate as rehearsed until that focused test passes. The added financial-helper ACL migration was separately tested in a disposable PostgreSQL 17 database restored from the local ACL-bearing schema-only archive. Anonymous and authenticated direct calls were denied; service-role access, postgres-owned internal calls, and authenticated refund RPC grants remained available. The application checkout and Production were not changed. This targeted permission result is not a final Production deployment clearance: current Production app build/bindings, Vercel environment values, Resend setup, and recovery readiness remain separate release gates.

Production email queue snapshot: 412 failed, 19 sent, no other status; 76 failures met the prior inspected retryable criteria. Preserve all rows. Never reactivate dispatch until aged backlog is explicitly reviewed.

## Email safety

The DB pause returns before both pg_net trigger and scheduled sweep requests. It preserves queues, preferences, web records, and the active schedule. Current Production legacy claim/finalization RPCs are no-op, but this does not prove an old application cannot call Resend directly. Owner/provider dashboard action is needed: pause sending at provider or disable a verified email-only key. Do not revoke a shared/unknown key.

The accepted DEV application code includes the pause in these paths: staff dispatch route, scheduled dispatch helper, worker, recipient sender and Resend adapter; UI hides email preference controls while preserving saved choices and Web controls. The code needs to be included in a future approved Production application release, but the current Production source/build is unverified. This DB gate is defense-in-depth, not proof all legacy app paths are closed.

Restoration requires a separate Owner decision. Review and disposition old queued failures first; never delete rows or mark them sent. Implement a separate auditable expiry/suppression policy and ensure no automatic catch-up before reopening provider/application delivery.

## Preconditions

1. Verify exact target project and current migration history.
2. Provision an isolated Production-shaped DB with synthetic data.
3. Run the read-only preflight and stop on any unexpected signature/constraint.
4. Confirm backup/restore, Auth/passkey and storage recovery readiness.
5. Verify deployed app source, bindings, all refund writers and all email send paths.
6. Review and test each migration in isolation; postflight each.
7. Obtain separate Owner approval for each Production migration, provider action, config change and deployment.

No DEV business data is included. Existing two paid orders with mismatched stock links remain unchanged and require separate data-owner review. The accepted application source is recoverable from its DEV release branch; the Crew/Collection live RPC test is intentionally skipped by Owner decision because no active account exists.
