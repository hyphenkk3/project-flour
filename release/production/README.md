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

The assignment and cutoff SQL are based on accepted DEV migrations 20261017012542 and 20261017022803 with fail-closed schema preconditions. The slicing candidate is based on accepted DEV migration 20261017142007; its Production target was checked read-only: the existing SECURITY DEFINER RPC already has the staff-role allowlist, confirmed/unsold/already-cut guards, row lock, and audit call, but does not bind the supplied actor and remains executable by anon through PUBLIC. The targeted replacement retains those business checks, calls Production's existing `_bind_rpc_actor` (read-only verified to use `auth.uid()`, bind `staff_profiles.auth_user_id`, reject inactive staff, and support `service_role`), and revokes PUBLIC/anon while granting authenticated and service_role. It only replaces the RPC definition and its EXECUTE ACL; it does not update stock, order, audit, or staff rows. The refund migration is based on accepted DEV 20261015010528 with table privilege revocation separated. The email candidate is based on actual Production trigger/sweep definitions inspected read-only.

The SQL filenames are release-candidate labels, not guaranteed database version values. The supported Supabase `apply_migration` API generates the authoritative `schema_migrations.version`; pass the explicit `name` shown in `RUNBOOK.md`, one exact file payload per call. The API result and the matching `schema_migrations` row are authoritative. Record each returned version in `MIGRATION_EXECUTION_LOG.md`; postflight verifies by migration `name` and reports the actual version, so generated versions cannot cause false failures. Before each call, confirm that the name has no history row. If a call is ambiguous, do not retry: inspect migration history and live definitions first. Never fabricate history or repair it manually. No bulk `db push`, `--include-all`, wildcard, or directory execution is permitted. The separately gated `20261017152100_refund_v1_write_lock.sql` is excluded from every initial-release call.

## Validation status

The assignment, slicing actor/ACL, cutoff, Refund V1, Email Pause, and financial-aggregate ACL candidates have passed the recorded isolated Production-shaped SQL/permission rehearsals. The slicing replay is documented in `TEST_RESULTS.md` (PostgreSQL 17.11, restored ACL-bearing schema, local-only synthetic identities/stock). The restore used local placeholders for Supabase-managed dependencies and did not emulate live Auth/PostgREST, an active scheduler, or Production business rows; it is not a full hosted-runtime guarantee. The refund write-lock remains excluded. Anonymous and authenticated direct aggregate calls were denied while service-role and postgres-owned internal calls remained available. This does not establish compatibility with the unrecoverable old Production application build or verify its environment bindings.

Production email queue snapshot: 412 failed, 19 sent, no other status; 76 failures met the prior inspected retryable criteria. Preserve all rows. Never reactivate dispatch until aged backlog is explicitly reviewed.

## Email safety

The accepted DEV application contains one Resend adapter in `src/foundation/staff/staff-notification-dispatch.ts`. Calls reach it through the staff dispatch API route and scheduled post-mutation helper; the route, scheduled helper, worker and adapter all check the hard-coded email pause before sending. The database migration separately returns before trigger/sweep `pg_net` requests. Thus the accepted source is paused, but the deployed Production source is unrecoverable and may contain direct Resend calls outside this gate. The database migration alone cannot prove or prevent those calls.

Before rollout, the Owner must use the Resend dashboard to select the **Whitebird Production** sending project and verify the pause control applies only to that project/domain/key. Pause outbound Production sending at the provider before database changes; do not revoke/rotate any key or change DEV. If the dashboard offers no scoped pause control, stop and obtain a provider-supported Production-only suppression method. Keep the database gate in place. Preserve queue/history/preferences; do not mark rows sent or delete them. Do not re-enable sending until the old failed backlog is reviewed and an explicit auditable suppression/expiry policy prevents catch-up. Web notifications and WhatsApp are separate and must remain active.

## Preconditions

1. Verify exact target project and current migration history.
2. Provision an isolated Production-shaped DB with synthetic data.
3. Run the read-only preflight and stop on any unexpected signature/constraint.
4. Confirm backup/restore, Auth/passkey and storage recovery readiness.
5. Resolve the compatibility gate for the live legacy app: identify its callers of the changed assignment, cutoff/checkout and refund RPCs, and verify the Production deployment's Supabase binding. If its deployed artifact cannot establish those call sites, compatibility remains unproven and rollout must pause for a controlled compatibility window or other approved validation.
6. Confirm the Production-only provider email pause; review and apply each named migration individually through the supported migration API; verify its returned version and postflight by name.
7. Obtain separate Owner approval for each Production migration, provider action, config change and deployment.

No DEV business data is included. Existing two paid orders with mismatched stock links remain unchanged and require separate data-owner review. The accepted application source is recoverable from its DEV release branch; the Crew/Collection live RPC test is intentionally skipped by Owner decision because no active account exists.
