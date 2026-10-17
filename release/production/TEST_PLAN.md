# Isolated validation plan

Use only a disposable database matching relevant Production schema and constraints, with synthetic records. A minimal hand-written harness cannot establish Production compatibility.

1. Provision from sanitized schema-only snapshot or reconstruct verified Production-only objects; record PostgreSQL version and schema fingerprint.
2. Confirm each intended migration name is absent from history and baseline helpers are present. The API-generated version, not the SQL filename version, is recorded.
3. Apply assignment, slicing actor/ACL, cutoff, Refund V1, Email Pause, and financial-aggregate ACL candidates in the release order documented in README. Exclude the separate refund table write-lock.
4. Check exactly one history record per applied migration name; capture and record its actual generated version. On ambiguous API output, inspect history and live definitions before any retry.
5. Assignment: authorized synthetic staff succeeds; reciprocal links, sold_at, one audit pair; anon/spoofed actor denied; duplicate/mismatch fails atomically. Slicing: Bakery/Manager/Owner authenticated actors pass binding; anon and mismatched staff identity fail; only the selected confirmed unsold stock row changes; one audit event; duplicate cut rejected; authenticated/service_role remain allowed and anon denied.
6. Cutoff: no existing order/stock row changes; cutoff independent from collection window; guest order before cutoff succeeds and at/after is server-rejected.
7. Refund: test synthetic only; Owner/Manager general refund and Owner-only Fresh Pick cancellation; idempotency and net/report/timeline reconciliation; no provider money transfer.
8. Email: paused trigger and cron issue no pg_net request; queue/preferences unchanged; web and WhatsApp remain separate; no provider emails.
9. Verify ACLs, RLS, SECURITY DEFINER ownership/search_path and transaction rollback.
10. Save test evidence and destroy disposable DB.

Status: focused Production-shaped rehearsal passed, including slicing actor/ACL on PostgreSQL 17.11 using the ACL-bearing schema archive. See `TEST_RESULTS.md` for exact scope and limits. It did not emulate live Supabase Auth/PostgREST or an active scheduler, and it contained synthetic rather than Production business rows; do not describe it as full hosted-runtime validation. The separate refund write-lock remains excluded.
