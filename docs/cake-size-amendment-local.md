# Cake-size consolidated local fixes — 10 October 2026

## Scope and preservation

Worktree: /Users/ycwee/.codex/worktrees/cake-size-safe-integration/project-flour
Starting and final HEAD: bc2b2c37432161c22ddcfd280223c1eda4c65d56 (uncommitted candidate).
No hosted writes, migrations, deployments, commits, pushes, merges, Production database access or email sending occurred. Staff Email V1 and the original dirty checkout were not modified. Disposable local PostgreSQL was stopped after testing.

## Root causes and solutions

A. INSERT-only enforcement left pickup-date updates, cake/size changes and item reassignment unchecked. Added selection UPDATE validation and deferred final-order validation. Dates use inclusive boundaries. Genuine date changes validate retained items; unrelated changes do not retroactively invalidate historical selections. Missing pickup dates are rejected for preorder amendments.

B. sync_guest_order_items deleted and reinserted all historical lines. Its replacement retains IDs, original prices and snapshot labels for unchanged selections. It updates quantities in place, validates genuine selection changes and deletes only removed lines. For multiple historical rows of the same cake/size, unchanged aggregate input preserves every row; ambiguous quantity changes are rejected. The order form identifies each historical row and displays its historical price, implementing the owner's decision to choose the specific row. Row IDs carry through late-edit approval serialization and are checked against the target order.

C. Staff save made separate database calls, permitting partial persistence. A new actor-bound save_guest_order_workspace_atomic RPC changes order details, items, complimentary items, addons, fulfilment, payment-state reconciliation, customer-change counting and audit/confirmation invalidation in one transaction. Existing authorization, paid-order override, cross-month and late-edit rules remain. Existing payment and change-guard functions are called rather than replaced. Constraint checks complete before RPC returns. The application performs one mutation and returns clear validation errors.

## UPDATE-path inventory

- Owner/Manager order workspace: now atomic RPC; retained historical rows preserved; genuine size/date amendments checked.
- Customer Operations date/detail editing: existing authorized update path retained; database trigger protects pickup-date amendments and availability errors are shown clearly.
- Post-payment customer changes: existing guard and count/override policy retained, inside the atomic transaction for workspace saves. No paid/confirmed blanket exemption.
- Cross-month and late-edit approvals: existing approval RPCs already transact date and item sync together; database validation applies and sync preserves unchanged historical rows. Historical row identity is carried through late-edit payloads.
- Waiting-list conversion and staff/guest/voucher creation: INSERT enforcement remains. Shared item insertion cannot bypass validation.
- Permitted direct SQL/API order date, item size/cake and item-to-order updates: same triggers apply under existing permissions/RLS. No new direct-update grants or staff override.
- Fresh Pick order/item updates: deferred physical-stock checks require linked, confirmed, uncut matching units. Mere extra_stock_id markers are insufficient.
- No new customer self-service amendment workflow was introduced. Administrative privileges capable of disabling triggers remain the existing privileged trust boundary.

## Fresh Pick and visibility

Legitimate physical-stock checkout remains allowed outside preorder dates. Deferred checking allows existing checkout RPCs to insert items before assigning stock within the same transaction. Primary stock must belong to the order; matching linked stock must cover quantities. Marker impersonation, mismatched sizes and excess quantities are rejected. Existing stock creation, holds, payment, fulfilment and authorization code was not changed. Read-only DEV inspection found 10 linked-stock orders, zero unlinked primary stock records and zero stock/item mismatches; authenticated users cannot forge stock linkage through current RLS. No Production catalogue data was read.

Publication/visibility settings remain independent of pickup-date eligibility. No setting or record is automatically enabled on November 1. Thai Milk Tea Mango 4-inch/photo missing in DEV is expected; no Production synchronization or DEV creation occurred.

## Migrations

- Preserved 20261010103300_cake_size_availability_trigger_acl_hardening.sql: only revoke trigger-function EXECUTE from PUBLIC, anon, authenticated and service_role. Owner remains executable; runtime triggers and guest/staff insertion still work.
- New 20261010104124_cake_size_order_amendment_safety.sql: replacement item validation/sync, UPDATE and deferred stock/date triggers, actor-bound atomic workspace RPC; narrowly scoped grants for the new RPC and revoke direct execution of the new trigger-only validator.
- Already-applied source 20261010082912_cake_size_pickup_date_availability.sql unchanged. DEV recorded version 20261010102526; DO NOT reapply or repair its history.
- Original SHA-256 adc82572bc7585e11ff1d4d9400ad14cc13955b707485f7bbaaea8b59356109d.
- ACL SHA-256 b05427e72f313cc52cf2a940c9a534a4bf97c0ada7620d2158eb0f78a50e4960.
- Existing size IDs, prices, photos, pricing functions, order snapshots and email functions/configuration are not altered. No global default privilege changes.
- Deferred trigger-only validator is SECURITY DEFINER with empty search_path and revoked direct EXECUTE: anonymous guest RPC returns before deferred checks run, so invoker privileges cannot read protected orders. It performs validation/locks only. Existing immediate validator remains SECURITY INVOKER.

## Validation

- All original 17 scenarios: PASS across unit/direct server-action, local SQL and browser fixtures. October pickup is rejected; an October order for November pickup is accepted. Fixtures represent Thai Milk Tea Mango, not a verified live Production row.
- Local disposable database: 66 PASS assertions covering original boundaries, ACL/owner/unrelated permissions, direct submissions, both demonstrated UPDATE bypasses, reassignment, unchanged paid/history edits, atomic rollback after item and ancillary failures, authorization/customer-change guards, confirmation/payment audit, voucher/waiting-list shared paths, Fresh Pick linkage and historical row choice.
- Browser: PASS visible-disabled explanations, no date, October/November, date-change invalidation without substitution, photos, cart/stale-response rejection and admin create/edit/clear.
- Regression scripts: 38/46 PASS; all original 26 relevant integration suites PASS. Eight failures reproduced on a clean exact Production baseline and left unchanged (listed below).
- TypeScript noEmit: PASS.
- Focused lint: no new errors. OrderWorkspaceForm has three inherited set-state-in-effect errors and two warnings, reproduced on the clean Production baseline. Prior storefront lint failures remain outside this correction; this is not a claim of repository-wide clean lint.
- All five Production application email guards: PASS, external network blocked, zero provider calls and zero sends. Production bridge test's inherited synchronous-exception assertion required a temporary local async wrapper to run; temporary file removed and its source unchanged. Staff Email V1's corrected harness remains untouched.
- Updated post-payment regression assertion now checks atomic boundary; existing decision tests retained and PASS.

Fixture limits: real guest/staff submission and date-price SQL bodies are exercised; voucher/waiting-list adapters share representative creation paths; ancillary fulfilment/addon/authorization/payment-guard dependencies are mocked in the isolated fixture. This does not establish hosted end-to-end payment or full live Fresh Pick lifecycle behavior. Corresponding local regression suites passed where baseline allows; approved DEV testing remains required. No real customer orders used.

Inherited regression failures:
- scripts/test-extra-phase6-fresh-picks.ts
- scripts/test-fresh-picks-date-progression.ts
- scripts/test-customer-operations-assisted-fulfilment.ts
- scripts/test-operations-approvals.ts
- scripts/test-whole-cake-customer-fulfilment.ts
- scripts/test-dine-in-reservation-serving-window.ts
- scripts/test-cart-pickup-compatibility.ts
- scripts/test-library-cake-size-prices.ts

## Files changed in this stage

- scripts/test-cake-size-amendment-db.py
- scripts/test-post-payment-customer-change-guard-reconciliation.ts
- src/engines/operations/approvals.ts
- src/workspaces/customer-operations/orders/actions.ts
- src/workspaces/owner/orders/OrderWorkspaceForm.tsx
- src/workspaces/owner/orders/actions.ts
- src/workspaces/owner/orders/staff-preorder-form.ts
- supabase/migrations/20261010104124_cake_size_order_amendment_safety.sql
- docs/cake-size-amendment-local.md

## Proposed DEV sequence — requires separate approval

1. Read-only preflight: reverify deployed DEV/Production revisions against the Production safety baseline, DEV project tzwtpxdcggesgjaqxkqr, original recorded version 20261010102526, schema/RLS/ACL/dependency functions, migration hashes and physical-stock linkage. Stop on new conflicts. Do not assume previous deployment revisions remain current.
2. Obtain explicit single-file migration approval for ACL 20261010103300 followed by amendment 20261010104124, each reviewed SQL only, transactional application with actual applied version recorded. No directory-wide push, history repair, original reapplication, unrelated 17 migrations, Production SQL email bridge or Staff Email V1 migrations.
3. Verify schema/triggers/ACL, unchanged pricing/RLS/IDs/history and gates/test mode OFF. Use rolled-back synthetic validations; avoid real order mutations.
4. Separately authorize Git release preparation and application deployment. Reconcile with latest deployed functionality before any commit/integration. Deploy only the cake-size candidate to DEV, retain all five hard-coded pauses, then verify the actual deployed revision. Minimize the interval between database and application changes because the old staff application has the former multi-call save behavior.
5. Separately approve representative DEV 4-inch test data/photo; verify exact DEV cake/size relationship before creation, use Available From 2026-11-01/Until NULL. Do not copy Production data or automatically change public visibility.
6. DEV checklist: (1) NULL unrestricted; (2) start inclusive; (3) end inclusive; (4) outside rejected; (5) invalid range rejected; (6) October 4-inch rejected; (7) November accepted; (8) October preorder for November accepted; (9) other sizes unchanged; (10) visible disabled; (11) date change invalidates selection; (12) stale carts rejected; (13) direct checkout submission rejected; (14) confirmed history preserved; (15) dated prices preserved; (16) size photos correct; (17) storefront regressions. Also verify both UPDATE bypasses, historical specific-row selection, atomic item/ancillary rollback, approval/customer-count/audit behavior, legitimate outside-window Fresh Pick and forged-link rejection, guest/staff/voucher/waiting-list checkout, publication separation and all five email pauses with zero provider calls.
7. Rollback: prefer forward correction. Additive schema can remain after application rollback, but returning to old multi-call staff saves with restricted dates may cause amendment failures; use a compatible atomic-save application or suspend affected edits while recovering. Do not automatically remove safeguards, clear business dates, rewrite history or drop preserved snapshots. Any hosted rollback requires separate approval.

## Recommendation

GO for separately approved DEV preflight and review of these two follow-up migrations. NO-GO for automatic hosted application/deployment or Production release. Remaining blockers are explicit hosted approvals, current deployment reconciliation and DEV end-to-end verification; inherited unrelated failures remain documented. No unresolved business-policy decision remains after the specific-historical-row instruction.

## Complete candidate inventory relative to HEAD

- scripts/test-post-payment-customer-change-guard-reconciliation.ts
- scripts/test-storefront-cake-detail-query.ts
- scripts/test-storefront-cart-shell.ts
- scripts/test-storefront-mobile-add-to-order-feedback.ts
- src/engines/operations/approvals.ts
- src/types/library-cake.ts
- src/types/storefront.ts
- src/workspaces/customer-operations/orders/actions.ts
- src/workspaces/library/cakes/CakeSizeFields.tsx
- src/workspaces/library/cakes/actions.ts
- src/workspaces/library/cakes/queries.ts
- src/workspaces/owner/orders/OrderWorkspaceForm.tsx
- src/workspaces/owner/orders/actions.ts
- src/workspaces/owner/orders/staff-preorder-form.ts
- src/workspaces/storefront/cart/AddToOrderSheet.tsx
- src/workspaces/storefront/cart/StorefrontCartShell.tsx
- src/workspaces/storefront/cart/actions.ts
- src/workspaces/storefront/cart/cart-order-summary.ts
- src/workspaces/storefront/catalog/CakeDetailPickupScope.tsx
- src/workspaces/storefront/catalog/CakeDetailPurchasePanel.tsx
- src/workspaces/storefront/catalog/StorefrontCakeCard.tsx
- src/workspaces/storefront/catalog/StorefrontCakeDetailView.tsx
- src/workspaces/storefront/catalog/queries.ts
- src/workspaces/storefront/checkout/CheckoutOrderSummary.tsx
- src/workspaces/storefront/checkout/GuestCheckoutForm.tsx
- src/workspaces/storefront/checkout/actions.ts
- src/workspaces/storefront/checkout/preorder-draft.ts
- docs/cake-size-availability-local.md
- docs/cake-size-safe-integration.md
- scripts/fixtures/cake-size-availability-browser.tsx
- scripts/test-cake-size-amendment-db.py
- scripts/test-cake-size-availability-browser.mjs
- scripts/test-cake-size-availability-db.py
- scripts/test-cake-size-availability.ts
- src/engines/menu/cake-size-availability.ts
- supabase/migrations/20261010082912_cake_size_pickup_date_availability.sql
- supabase/migrations/20261010103300_cake_size_availability_trigger_acl_hardening.sql
- supabase/migrations/20261010104124_cake_size_order_amendment_safety.sql
