# Cake-size availability — Production-baseline integration review

## A. Exact revisions and isolation

Recovered exact DEV `f7428991c63a1f1a90c48cd0b3a103417c929bae` through a separate bare clone. Remote DEV/Production tips matched the supplied revisions at review time. No revision substitution.

New persistent worktree: `/Users/ycwee/.codex/worktrees/cake-size-safe-integration/project-flour`.
Starting/current HEAD: `bc2b2c37432161c22ddcfd280223c1eda4c65d56` (detached).
Isolated Git store: `/Users/ycwee/.codex/worktrees/cake-size-safe-integration/repository.git`.

No commits, pushes, merges, deployments, hosted queries/writes, environment changes or email activation. No existing worktree was modified or copied wholesale. Dependencies are read via a node_modules symlink. SQL tests ran only against disposable databases on the explicit local port 55439; no migration ledger was updated. The original local report is transferred provenance, not this integration's current report.

## B. Transfer and reconciliation

Transferred the feature-only uncommitted diff and seven feature/test/report files from the completed cake-size worktree. Production file contents were retained outside feature hunks. No DEV source files were imported wholesale.

- `src/types/storefront.ts`: added availability fields alongside Production payment correction types.
- `StorefrontCartShell.tsx`: availability validation layered over Production mobile order-bar behavior.
- `CheckoutOrderSummary.tsx`: manually reconciled two selector hunks; retained Production date-resolved price labels and choices while adding visible disabled choices, explanations, and invalid-selection placeholders.
- `GuestCheckoutForm.tsx`: retained Production Promise-based per-size pricing cache, batch resolution and choice-price readiness. Its pricing/cache block from checkoutChoiceSizeIdsKey through checkoutPricesBySizeId is byte-identical to Production. The rejected old-price-cache formatting hunk was intentionally not applied.
- Browser fixture supplies the newer checkout price props. Two existing mobile source tests were updated only for the intentional stronger price-readiness guard and selected-date validation prop; behavior checks remain.

## C–D. DEV differences preserved and excluded

The recovered DEV-to-Production comparison has no functional differences in storefront checkout/cart files; those newer DEV behaviors already exist in Production and are retained: scheduled size-choice pricing, caching, mobile order bar, payment correction and confirmed-order handling.

Six non-email application files differ only in formatting/trailing commas or equivalent Tailwind class ordering: settlement.ts, timeline.ts, OrderWorkspaceForm.tsx, PaymentSection.tsx, owner/orders/actions.ts, owner/orders/queries.ts. No functional change was dropped. Four compile to identical JavaScript; the remaining PaymentSection/actions changes were reviewed as formatting/equivalent class order. Formatting-only DEV changes were not copied.

Excluded as explicitly authorized: DEV configurable email dispatch handlers, database-controlled master email gate, targeted/one-shot email testing and diagnostics, safe absolute email link changes, associated tests and `20261008120548_staff_notification_one_shot_test_scope.sql`. Retaining these could conflict with the hard-coded Production bridge. This candidate does not change the deployed DEV implementation.

Also excluded DEV's older cancellation grant (`authenticated` only); Production's `authenticated, service_role` grant is retained unchanged.

No unfinished Staff Email V1 recovery code or migrations were accessed for integration or included. Its worktree was untouched.

## E–G. Verification results

PASS: transferred availability unit/admin/server-action suite; real PostgreSQL guest/staff submission and price-resolver fixture suite; Chromium production-component fixture suite. October Thai Milk Tea Mango 4-inch pickup rejected, November 1 accepted, October preorder for November accepted. Stale live data and responses cannot modify cart; invalid date-change selections clear without substitution; photos and historical confirmed snapshots preserved.

PASS: TypeScript --noEmit --incremental false; git diff --check.

PASS: unchanged Production TypeScript email bridge suite exercised all five hard-coded guards (API, scheduler, worker, recipient helper, Resend adapter). Zero claim/send/completion/provider-fetch calls. The test was run via a temporary .mts copy because the repository's CJS tsx default rejects its top-level await; the temporary copy was removed, original test unchanged.

PASS: unchanged Production SQL bridge suite in named local disposable database whitebird_email_pause_bridge_disposable, checking disabled claim/finalization and unchanged historical rows. Fixture rolled back.

PASS: byte-for-byte preservation of email pause source, bridge migration/tests, cancellation grant migration and Production checkout pricing/cache block. All existing Production migrations remain; only the cake-size migration is added.

26 unique relevant regression suites PASS:

- `scripts/test-storefront-cart-edit.ts`
- `scripts/test-storefront-cart-line-pricing.ts`
- `scripts/test-storefront-checkout-draft-first.ts`
- `scripts/test-storefront-checkout-date-confirmation.ts`
- `scripts/test-cake-size-order.ts`
- `scripts/test-library-cake-photos.ts`
- `scripts/test-storefront-cake-detail-query.ts`
- `scripts/test-storefront-cake-entry-scope.ts`
- `scripts/test-storefront-checkout-confirm.ts`
- `scripts/test-cake-size-price-ack.ts`
- `scripts/test-storefront-mobile-order-bar.ts`
- `scripts/test-storefront-mobile-add-to-order-feedback.ts`
- `scripts/test-storefront-mobile-catalogue-cart.ts`
- `scripts/test-storefront-repeated-add-to-order.ts`
- `scripts/test-storefront-cart-shell.ts`
- `scripts/test-payment-record-correction.ts`
- `scripts/test-customer-operations-history.ts`
- `scripts/test-storefront-checkout-loading.ts`
- `scripts/test-storefront-checkout-phase3.ts`
- `scripts/test-storefront-checkout-thin-render.ts`
- `scripts/test-storefront-checkout-interaction-lag.ts`
- `scripts/test-storefront-checkout-date-boundary.ts`
- `scripts/test-storefront-checkout-interactions.ts`
- `scripts/test-checkout-critical-path.ts`
- `scripts/test-checkout-date-confirmation-perf.ts`
- `scripts/test-payment-correction.ts`

Inherited FAIL: test-cart-pickup-compatibility.ts expects evaluateCartPickupCompatibility in checkout actions; test-library-cake-size-prices.ts rejects existing Fresh Picks use of library_cake_size_price_on. Both reproduced on clean exact Production source, as previously on 6b8a925. No unrelated fixes.

Focused lint: three inherited react-hooks/set-state-in-effect errors (cart empty-state reset, checkout confirmation error, draft hydration), reproduced on clean exact Production. No new lint findings. Full suite/lint is therefore not wholly green.

## Required scenarios

| # | Scenario | Local result / evidence |
|---|---|---|
| 1 | NULL dates remain available | PASS — engine, direct action, actual guest SQL submission |
| 2 | Available From inclusive | PASS — 2026-11-01, including anonymous direct SQL RPC |
| 3 | Available Until inclusive | PASS — 2026-11-30; until-only 2026-10-31 |
| 4 | Outside dates rejected | PASS — both sides, engine and actual SQL submission |
| 5 | Invalid range rejected | PASS — actual admin parser and database CHECK |
| 6 | October rejects Thai Milk Tea Mango 4 inch | PASS — named fixture, disabled browser control, guest/staff SQL rejection |
| 7 | November permits 4 inch | PASS — browser add and actual guest SQL |
| 8 | October preorder for November pickup | PASS — fixture business/lead-time context starts 2026-10-10, pickup 2026-11-01 accepted; no availability comparison to now() |
| 9 | Other Thai Milk Tea Mango sizes unchanged | PASS — 6/8-inch SQL submissions and unrestricted engine checks |
| 10 | Visible but disabled sizes | PASS — Chromium detail/sheet/checkout; card period text |
| 11 | Pickup changes revalidate | PASS — selection clears, no replacement/restoration, default photo returns |
| 12 | Stale carts cannot bypass | PASS — direct action with changed live dates, browser stale cart/response tests, direct order_items insert rejected |
| 13 | Server checkout rejection | PASS — actual guest SQL function, anonymous role, transaction leaves no partial order |
| 14 | Confirmed/historical orders unchanged | PASS — order/item JSON snapshots match after migration/date edits |
| 15 | Dated pricing preserved | PASS — actual unchanged price resolver, price independent of availability, scheduled guest unit price, browser cart quote |
| 16 | Size photos correct | PASS — selected size image, invalid-selection fallback, existing photo regression |
| 17 | Unrelated storefront regressions | 26 relevant regression suites PASS; two inherited failures reproduced on clean Production. Full hosted DEV integration remains pending. |

Fixtures were used. The live cake/size/photo IDs and actual Thai Milk Tea Mango data have NOT been verified. No live row was updated. Its intended eventual dates remain **2026-11-01 / NULL**.


## H. Migration compatibility

`20261010082912_cake_size_pickup_date_availability.sql` is byte-identical to the completed feature migration. It adds nullable DATE columns, inclusive validation, a reversed-range CHECK and an INSERT-only order-item trigger. No IDs/prices/photos/history rewrite or data updates. No existing RPC is replaced. The trigger covers guest/voucher, staff and shared waiting-list conversion writes; physical-stock Fresh Picks retain their separate rules. All Production migrations, including pause bridge and service-role grant, remain unchanged. No unfinished V1 migration included.

The new timestamp follows existing Production migrations, but the actual DEV migration ledger, triggers, permissions/RLS and lock duration are unverified. Compatibility is a local/source review, not proof of hosted schema compatibility. Never blindly apply every pending migration from this Production-based tree to DEV.

## I–J. Risks and next-stage recommendation

GO for separately approved DEV preflight/testing preparation; NO-GO for immediate migration/deployment until the exact DEV migration delta is reviewed and approved. Local integration has no unresolved source conflicts or demonstrated new behavioral regressions. The two inherited tests and three lint errors remain.

Local SQL uses minimal fixture schema and stubs for business hours/capacity/add-on helpers; browser tests are component fixtures, not full deployed Next.js/Supabase E2E. Full waiting-list lifecycle, authenticated admin save, full migration/RLS history and build/deployed checks remain pending.

Thai Milk Tea Mango live cake/size/photo IDs remain unverified. No row was changed. Under future explicit approval, query all matching cake/size records, verify unique identity and unchanged prices/photos, then set only the confirmed 4-inch row to 2026-11-01 / NULL. Test all 17 scenarios on DEV. No Production rollout is authorized.

Before release: recheck live revisions; review DEV ledger and identify only approved migration deltas; retain the Production pause bridge; apply approved schema before app code selects new columns; initially leave restrictions NULL; deploy only the approved candidate to DEV; separately approve the identified target-row setting. Retain additive schema on app rollback and retain enforcement while restrictions are active. Database rollback/clearing dates requires approval.

## Exact integrated files relative to Production

- `docs/cake-size-availability-local.md`
- `docs/cake-size-safe-integration.md`
- `scripts/fixtures/cake-size-availability-browser.tsx`
- `scripts/test-cake-size-availability-browser.mjs`
- `scripts/test-cake-size-availability-db.py`
- `scripts/test-cake-size-availability.ts`
- `scripts/test-storefront-cake-detail-query.ts`
- `scripts/test-storefront-cart-shell.ts`
- `scripts/test-storefront-mobile-add-to-order-feedback.ts`
- `src/engines/menu/cake-size-availability.ts`
- `src/types/library-cake.ts`
- `src/types/storefront.ts`
- `src/workspaces/library/cakes/CakeSizeFields.tsx`
- `src/workspaces/library/cakes/actions.ts`
- `src/workspaces/library/cakes/queries.ts`
- `src/workspaces/storefront/cart/AddToOrderSheet.tsx`
- `src/workspaces/storefront/cart/StorefrontCartShell.tsx`
- `src/workspaces/storefront/cart/actions.ts`
- `src/workspaces/storefront/cart/cart-order-summary.ts`
- `src/workspaces/storefront/catalog/CakeDetailPickupScope.tsx`
- `src/workspaces/storefront/catalog/CakeDetailPurchasePanel.tsx`
- `src/workspaces/storefront/catalog/StorefrontCakeCard.tsx`
- `src/workspaces/storefront/catalog/StorefrontCakeDetailView.tsx`
- `src/workspaces/storefront/catalog/queries.ts`
- `src/workspaces/storefront/checkout/CheckoutOrderSummary.tsx`
- `src/workspaces/storefront/checkout/GuestCheckoutForm.tsx`
- `src/workspaces/storefront/checkout/actions.ts`
- `src/workspaces/storefront/checkout/preorder-draft.ts`
- `supabase/migrations/20261010082912_cake_size_pickup_date_availability.sql`
