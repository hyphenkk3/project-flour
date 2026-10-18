# Production-shaped rehearsal — 2026-10-18

**Purpose:** Run the already-prepared initial Production migration allowlist against the October 17 Production backup in an isolated environment, then record what was and was not established.

**Result:** Database restoration and the six SQL payloads passed. This is a substantial Production-data/schema rehearsal, but not full application/Auth/Storage runtime acceptance and not cutover authorization.

## Environment and isolation

- Used a temporary Vercel sandbox microVM after local Mac PostgreSQL startup was denied by shared-memory policy and Docker was unavailable in the local execution environment.
- Ran PostgreSQL 17.11 in a disposable container on Docker `network none`; the sandbox egress policy was deny-all.
- Disabled pg_cron execution with `cron.launch_active_jobs=off`. The restored cron catalog retained three active job rows, but they could not launch in the rehearsal.
- No DEV or Production database connection, application credential, Resend key, payment key, WhatsApp integration, webhook or external integration was configured.
- Original October 17 backup files on the Mac were not modified. A private working copy was used only inside the isolated, outbound-blocked rehearsal environment; no archive or schema content was uploaded to a repository or public storage.
- The Production schema/security review archive was used only for available ACL metadata. It contributed five schema ACL entries; it did not provide a complete replay of per-table/per-function ACLs.

## Restore

The custom-format PostgreSQL 17 backup restored into a fresh database using one transaction and exit-on-error. Final result: **0 errors, 0 warnings**. An earlier disposable setup hit local role/extension configuration issues; it was discarded before a successful restore. The successful environment used Supabase's PostgreSQL 17.11 image, the expected managed-role bootstrap, a dedicated rehearsal database, and network isolation. Nothing was silently skipped.

Restored catalog counts:

- 14 schemas
- 113 tables
- 605 functions
- 77 triggers
- 163 RLS policies

The Storage object archive contained 34 files. Its 34 object paths and byte sizes matched all 34 restored `storage.objects` metadata entries. A live Storage API read was not tested.

## Data preservation

The following counts were recorded both before and after the six migrations and matched exactly:

| Data set | Rows |
|---|---:|
| Orders | 83 |
| Fresh Pick / Extra Stock | 27 |
| Payments | 81 |
| Payment allocations | 81 |
| Refunds | 0 |
| Order timeline events | 906 |
| Extra Stock audit events | 129 |
| Auth users | 10 |
| WebAuthn/passkey credential rows | 4 |
| Storage object metadata | 34 |

The known data-integrity cases remained present after migration replay: 2 paid orders with a one-sided reciprocal stock link, 2 cancelled orders retaining historical stock links, and 2 sold stock rows without an order link. No migration was used to repair these records.

This is row-count and targeted relationship evidence, not a row-by-row cryptographic comparison of every business table. The migration payloads were SQL changes and the tracked table counts did not change.

## Migration allowlist replay

Copied from the preparation branch at the verified source baseline and applied one at a time via local `psql`, not via Supabase's migration API:

| Order | File | Result | SHA-256 |
|---:|---|---|---|
| 1 | `20261017150000_assignment_fix.sql` | PASS, exit 0 | `3f0ffeff65268adaca76b409376ec3bf7ed2d03e6c002a213fc3c1a26082013e` |
| 2 | `20261017150500_cut_extra_stock_actor_acl.sql` | PASS, exit 0 | `2a14b8b55b0b7a9cac63567229cd9830aa98c579f2d664a38600f939439cb021` |
| 3 | `20261017151000_cutoff.sql` | PASS, exit 0 | `413a0dfa123c8d76f4c396c895a24fc83b0d4c7b59712a8b26cc53b7e92ca7a7` |
| 4 | `20261017152000_refund_v1.sql` | PASS, exit 0 | `207f99075dcd985df69a4c903ffabfacf5876cc9d935f806a3686db1517ed6af` |
| 5 | `20261017153000_email_pause.sql` | PASS, exit 0 | `d4f6e66d70d4fa7105541618064f7f583825d359162cc7bc98c4e33042404c2a` |
| 6 | `20261017154000_refund_total_rpc_acl.sql` | PASS, exit 0 | `bed91997be9493cc1e3c37925238ad09415b0104c12c737998bd41952d711aee` |

`20261017152100_refund_v1_write_lock.sql` was never copied into the execution directory and was never run.

The migration registry exists in the restored schema, but direct SQL replay does not register versions. No history rows were fabricated. The supported Production migration API still must be used one exact file at a time and its generated version checked before any retry.

## Postconditions and targeted behavior

- Assignment, cutoff, refund, slicing and aggregate-RPC postflight predicates passed.
- Anonymous EXECUTE was false for assignment, slicing, cutoff and `order_refunds_total`; expected authenticated/service-role access remained for the applicable operations. The refund aggregate is service-role-only.
- The slicing function remained SECURITY DEFINER, retained actor binding, row locking and eligible-stock guards. Its authenticated grants were present.
- Existing paid mismatches and historical links remained; the migrations did not run a data repair.
- The cron sweep was called in a transaction and rolled back. The notification delivery queue remained at 412 failed and 19 sent; no delivery statuses changed. The paused guard appeared before the dispatcher step in the restored trigger/sweep function definitions.
- `staff_notification_request_dispatch()` is a trigger function and its public EXECUTE catalog grant does not make a direct SELECT invocation usable: PostgreSQL returned “trigger functions can only be called as triggers.” The API roles had no INSERT privilege on `staff_notification_events`. A synthetic event-trigger invocation was therefore not completed on the restored database.
- No real email, payment, WhatsApp, webhook or network request was possible or sent.

## Reversible database barrier experiment

A separate empty local database owned by `postgres` was used to isolate the database CONNECT barrier mechanics:

1. `REVOKE CONNECT ... FROM PUBLIC` made effective CONNECT false for authenticator, anon, authenticated and service_role, while the owner postgres retained CONNECT.
2. A pre-existing synthetic authenticator-role session was terminated successfully using the available signal privilege.
3. Regranting CONNECT to PUBLIC restored the prior effective connection state, with no test sessions remaining.

This is a **mechanism test only**, not proof that Production can safely activate the barrier. On the restored Production-shaped database, the database owner was `supabase_admin`; the reconstructed postgres role could not revoke that owner's database ACL, and the effective API-role CONNECT privileges remained true. We did not elevate roles, change restored ownership, or weaken the safety model. A faithful rehearsal must execute the same test as the actual database owner/admin and verify explicit grants. Scheduled job stopping also must be separately verified for the managed Production project.

A transaction rollback probe in the separate empty database removed both its synthetic table and row after ROLLBACK. No deliberately failed release migration was run against the restored Production-data copy.

## Limits and unresolved gates

| Area | Result |
|---|---|
| Full database restore and SQL migration compatibility | **PASS**, within this PostgreSQL 17.11 replay |
| Historical counts and known edge-case preservation | **PASS** for the tracked counts and relationship cases |
| Migration API version registration | **NOT TESTED**; direct SQL intentionally does not write history |
| Full pre-existing per-object ACL/ownership fidelity | **PARTIAL**; role metadata was reconstructed from Owner-provided values; archive ACL coverage was incomplete |
| Auth user/passkey database rows | **PASS** for restore/counts |
| Actual password or passkey login/recovery | **NOT TESTED**; no running Supabase Auth service was wired to the restored database |
| Storage archive/metadata correspondence | **PASS** |
| Actual Storage API/object serving | **NOT TESTED** |
| Customer/staff application workflows connected to restored Production data | **NOT TESTED** |
| Refund/provider transfer, external email/WhatsApp/webhooks | **NOT TESTED** and intentionally impossible in this environment |
| DB email gate for the tested cron sweep | **PASS**; queue unchanged, egress denied |
| All email paths in the unknown old Production application | **BLOCKED**; old source/provider behavior is not available here |
| Database write barrier on an owner-controlled isolated DB | **PASS** for generic PostgreSQL ACL/session mechanics |
| Database write barrier on a Production-shaped Supabase-owned DB | **BLOCKED**; actual owner/admin execution and effective grants were not available |
| Production migration history/API behavior | **NOT TESTED** |

## Decision

The earlier runtime blocker is resolved, and the six exact migration payloads have now passed a restore-and-replay against the October 17 database backup. **Production release remains blocked** until owner-level barrier activation/reversal is faithfully rehearsed, the old app's privileged database paths are contained, Production email is paused through a Production-scoped provider control, and actual Auth/passkey/Storage/application smoke paths are proven in a safe environment. No change is authorized on Production by these results.
