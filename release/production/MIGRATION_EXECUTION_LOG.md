# Production migration execution log

This is an execution record, not an application instruction. No candidate below has been applied to Production as of preparation commit 082c89d2dcc45169789fe8f061bf7e748e351524.

For each individually approved `apply_migration` call, enter the API response version and the read-only-confirmed `schema_migrations` version. They must match. Never guess a version from a SQL filename. If a response is ambiguous, inspect history and live definitions before retrying. Do not record success until postflight passes.

| Order | API name | Source SQL file | Status | API returned version | History-confirmed version | Postflight |
|---|---|---|---|---|---|---|
| 1 | `assignment_fix` | `20261017150000_assignment_fix.sql` | NOT APPLIED | — | — | — |
| 2 | `cut_extra_stock_actor_acl` | `20261017150500_cut_extra_stock_actor_acl.sql` | NOT APPLIED | — | — | — |
| 3 | `cutoff` | `20261017151000_cutoff.sql` | NOT APPLIED | — | — | — |
| 4 | `refund_v1` | `20261017152000_refund_v1.sql` | NOT APPLIED | — | — | — |
| 5 | `email_pause` | `20261017153000_email_pause.sql` | NOT APPLIED | — | — | — |
| 6 | `refund_total_rpc_acl` | `20261017154000_refund_total_rpc_acl.sql` | NOT APPLIED | — | — | — |

Excluded: `refund_v1_write_lock` / `20261017152100_refund_v1_write_lock.sql`. Do not add an execution row for it unless a separate release is approved.
