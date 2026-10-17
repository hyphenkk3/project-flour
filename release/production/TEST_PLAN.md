# Isolated validation plan

Use only a disposable database matching relevant Production schema and constraints, with synthetic records. A minimal hand-written harness cannot establish Production compatibility.

1. Provision from sanitized schema-only snapshot or reconstruct verified Production-only objects; record PostgreSQL version and schema fingerprint.
2. Confirm candidate versions absent and baseline helpers present.
3. Apply assignment, cutoff, refund metadata/RPC, then email gate. Apply refund table write lock only after exact app sources prove RPC-only writes.
4. Check one history record per applied candidate.
5. Assignment: authorized synthetic staff succeeds; reciprocal links, sold_at, one audit pair; anon/spoofed actor denied; duplicate/mismatch fails atomically.
6. Cutoff: no existing order/stock row changes; cutoff independent from collection window; guest order before cutoff succeeds and at/after is server-rejected.
7. Refund: test synthetic only; Owner/Manager general refund and Owner-only Fresh Pick cancellation; idempotency and net/report/timeline reconciliation; no provider money transfer.
8. Email: paused trigger and cron issue no pg_net request; queue/preferences unchanged; web and WhatsApp remain separate; no provider emails.
9. Verify ACLs, RLS, SECURITY DEFINER ownership/search_path and transaction rollback.
10. Save test evidence and destroy disposable DB.

Status: blocked on representative Production-shaped DB; no full-schema pass claimed.
