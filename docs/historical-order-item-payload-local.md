# Historical order row identity: local correction

Starting revision: `730dd77b0d9c841b81b7525d030c38b027057833`.
Worktree: `/Users/ycwee/.codex/worktrees/cake-size-safe-integration/project-flour`.
Scope: local implementation/tests only; no commit, push, deployment, hosted query/write, fixture change, or migration.

## Root cause and correction

Order queries retain `order_items.id`. OrderWorkspaceForm initializes existing rows with `itemId: item.id`; its hidden `items_json` preserves that identity. The shared staff-preorder form parser retains `itemId`. The save action checks ownership, resolves historical prices/snapshots by identity, and consolidates existing items by their distinct row IDs. Its final atomic RPC serialization omitted `item_id`, losing that distinction just before submission.

The only production-code change adds `item_id: item.itemId` to each item in `save_guest_order_workspace_atomic`'s plan. Existing IDs are preserved, never generated or reassigned. Undefined IDs on genuinely new items are omitted by JSON serialization. Removed rows remain omitted from the final item list, following the installed database reconciliation contract. Historical quantities, prices, names, and size labels follow the existing action logic; date changes and genuinely changed selections still undergo database validation.

Repository-wide inspection found one application caller of this atomic RPC. Late-edit/approval serialization already includes `item_id` in `lateEditItemToRpc` and needed no change. No database validation, permissions, pricing, authorization, or audit logic changed.

## Changed files

- `src/workspaces/owner/orders/actions.ts`: one added payload field.
- `scripts/test-order-amendment-item-payload.mjs`: focused real Server Action/form parser tests with mocked external I/O.
- `docs/historical-order-item-payload-local.md`: this report.

## Verification results

| Verification | Result |
| --- | --- |
| Actual save action payload scenarios | 14/14 PASS |
| Baseline reproduction, field removed in memory | Expected FAIL: both original IDs absent |
| Amendment/availability disposable PostgreSQL fixture | 66 assertions PASS |
| Staff RPC authorization and waiting-list disposable fixture | 66 cases PASS |
| Existing availability scenario script and SQL coverage | PASS: original boundaries, October/November, stale cart/direct submissions, photos/pricing/history checks |
| Admin editor lifecycle tests | 16/16 PASS |
| Post-payment guard reconciliation | PASS |
| Fresh Pick cart | PASS |
| Waiting-list confirmation conversion | PASS |
| Payment correction | PASS |
| Cake size display order | PASS |
| Cake size price acknowledgement | PASS |
| TypeScript (`--noEmit --incremental false`) | PASS |
| Targeted lint: action and new test | PASS |
| Five email pause protections | PASS; zero external/provider/database/email calls in guard harness |
| Order lifecycle regression script | Inherited FAIL; same missing `guard_post_payment_customer_change` source assertion on unchanged HEAD |
| Library cake size prices regression script | Inherited FAIL; same forbidden `library_cake_size_price_on` source assertion on unchanged HEAD |

Focused scenarios cover equal-price rows, notes-only save, original IDs, duplicate cake-size rows, exact-row quantity changes, new rows, removed rows, date changes, size changes, historical prices/snapshots, RPC rejection with no fallback writes, authenticated audit actor, and foreign ID rejection. The new test executes the actual exported action and actual form parser, capturing the JSON passed to the RPC. Database tests separately exercise real SQL atomic rollback, unchanged paid historical editing, row-specific quantity/price preservation, authorization, audit/payment handling, and stock linkage. Mocked ancillary dependencies mean these local tests do not establish hosted browser acceptance or full external payment integration.

Inherited failures were reproduced using read-only HEAD source supplied in memory; no checkout/reset/stash was used. The unrelated email test's inherited synchronous-exception assertion was adapted only in a temporary in-memory harness, with mocked external boundaries. Email application/test source and the Staff Email V1 worktree were untouched. Tests used external-network blocking where applicable; the disposable database tests connect only to the explicit local Unix socket and never load hosted credentials.

## Remaining risk and next stage

No new failures or migration requirement identified. GO for a separately approved focused DEV application release. Hosted acceptance must still verify notes-only save and selected-row amendments on the referenced synthetic historical order, preserving both IDs, prices, snapshots, audit attribution, and availability rejection/rollback. DEV fixture records remain untouched during this stage. Production readiness is not established by this local correction.
