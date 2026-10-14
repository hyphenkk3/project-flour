# Cake size pickup-date availability — local implementation report

Worktree: `/Users/ycwee/.codex/worktrees/cake-size-date-availability/project-flour`

Starting Git revision: `6b8a9256d1795c50a2afb9c0b8fc58cc3cbdb7f5`.

The checkout is isolated and persistent. Changes are uncommitted. No push, merge, deployment, DEV/Production migration, or live cake data update was performed. The original dirty checkout and staff email recovery worktrees were not edited. Dependencies were read through a node_modules symlink; no dependency installation or original source changes were made.

## Implemented

- Nullable `available_from` and `available_until` DATE columns, inclusive boundaries, and a database range constraint. NULL/NULL preserves availability.
- Both date inputs in the shared create/edit size form, date-only server parsing, clearing either date, readable periods, and validation errors. Existing IDs and base-price save semantics are preserved.
- Availability fields in all relevant full/lightweight size queries and draft size choices.
- Restricted sizes remain visible, disabled when ineligible or when no pickup date has been selected, with explanatory text. Catalogue cards show configured restrictions too.
- The existing pickup-date control is reused in the add sheet when dates matter. No current-calendar-date fallback is used to decide size availability.
- Detail and sheet selections clear when invalid. Cart/checkout keep invalid lines for explicit correction/removal, clear their selectable value, explain the restriction, and block submission. No replacement size is chosen automatically.
- Add-to-cart, quantity/size edits, and checkout preflight reload live data on the server. Malformed dates, mismatched cake/size IDs, stale catalogue snapshots, and responses overtaken by a draft/date change are rejected.
- An INSERT trigger at the shared `order_items` boundary enforces dates transactionally for guest submission, its voucher wrapper, staff preorders, and waiting-list conversion through staff creation. The size row is locked through commit to prevent a concurrent availability edit racing the final write. It uses SECURITY INVOKER, a fixed empty search path, and revoked direct public execution.
- Fresh Picks physical-stock orders retain their separate fulfilment rules (identified by `orders.extra_stock_id`). Existing order updates and snapshots are not subjected to the new INSERT guard.
- Pricing resolver/schedule code, photo uploads, and photo records are unchanged. Photos follow the valid selection and fall back to the existing default when that selection clears.

## Migration

`supabase/migrations/20261010082912_cake_size_pickup_date_availability.sql`

This contains schema/validation only. It does not set Thai Milk Tea Mango dates or rewrite prices or orders. It was executed only in a disposable local PostgreSQL fixture database.

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
| 17 | Unrelated storefront regressions | 10 targeted existing suites PASS. Two existing suites fail identically on the starting revision; full DEV integration remains pending. |

Fixtures were used. The live cake/size/photo IDs and actual Thai Milk Tea Mango data have NOT been verified. No live row was updated. Its intended eventual dates remain **2026-11-01 / NULL**.

## Tests executed

Feature suites:

- `scripts/test-cake-size-availability.ts` — PASS. Engine boundaries, real admin parser, real Server Action source with only its database loader substituted, stale data/ownership/input checks, photos, pricing and no substitution.
- `scripts/test-cake-size-availability-db.py` — PASS. A disposable PostgreSQL 17 database executes this migration and the repository's actual `submit_guest_preorder`, `create_staff_guest_preorder`, and `library_cake_size_price_on` bodies. Anonymous direct requests and raw insert attempts are included.
- `scripts/test-cake-size-availability-browser.mjs` — PASS. Chromium renders actual admin, cake detail/card, add sheet, cart and checkout summary components. Fixture service adapters use the real cart action source and local PostgreSQL pricing. These are component/fixture tests, not a deployed Next.js/Supabase end-to-end test.
- TypeScript `--noEmit --incremental false` — PASS.
- `git diff --check` — PASS.

Existing targeted suites, final results:

- `test-storefront-cart-edit.ts` — PASS.
- `test-storefront-cart-line-pricing.ts` — PASS.
- `test-storefront-checkout-draft-first.ts` — PASS.
- `test-storefront-checkout-date-confirmation.ts` — PASS.
- `test-cake-size-order.ts` — PASS.
- `test-library-cake-photos.ts` — PASS.
- `test-storefront-cake-detail-query.ts` — PASS. Its source assertion was updated for the intentional selected-date variable; it still verifies the existing pickup-date pricing resolver is used.
- `test-storefront-cake-entry-scope.ts` — PASS.
- `test-storefront-checkout-confirm.ts` — PASS.
- `test-cake-size-price-ack.ts` — PASS.
- `test-cart-pickup-compatibility.ts` — FAIL, inherited. It expects `evaluateCartPickupCompatibility` in checkout actions; that assertion fails on a clean starting-revision snapshot too.
- `test-library-cake-size-prices.ts` — FAIL, inherited. It asserts Fresh Picks actions must not mention `library_cake_size_price_on`; those untouched actions already mention it at the starting revision. The live section was never reached. Remote database variables were removed and no .env was loaded.

Some exact-source assertions initially failed after formatting/new guards. Incidental formatting was restored, the original loading guard was retained, and the intentional pricing-date assertion was updated. The final remaining suite failures were reproduced on a clean read-only source snapshot of the recorded revision.

Focused lint: all newly introduced feature issues are resolved. The availability engine, admin fields/actions, cart action/add sheet, detail/card selectors, checkout summary/actions pass. Three `react-hooks/set-state-in-effect` errors remain in existing `StorefrontCartShell.tsx` and `GuestCheckoutForm.tsx` effects (empty-cart fetch state, confirmation error state, draft hydration state). The same three errors were reproduced on clean starting-revision files. These unrelated effects were not changed. Thus the full focused lint command is not green, despite no new lint findings.

## Verification limits and risks

- This tests a minimal local PostgreSQL fixture, not a replay of the entire Supabase migration history or live RLS setup. Hours, lead-time clock, capacity, and add-on/fulfilment helpers are fixture stubs. Staff and guest order function bodies, pricing, and the new trigger/constraint are real.
- Waiting-list conversion coverage verifies the existing conversion delegates to staff creation and tests that shared write boundary. The entire waiting-list lifecycle was not run locally.
- The complete Next.js checkout page and authenticated admin-save flow against real Supabase remain DEV integration checks. The actual components, private size parser, cart action, and database submission paths have local coverage.
- No production build/deployed-site test was performed. No live credentials were copied into this worktree.
- Apply the schema migration before deploying code that selects the new columns. Keep all dates NULL until the new UI/server code is deployed and the target row has been verified. The actual cake row must then be configured under separately approved DEV work.
- The isolated starting revision deliberately excludes unrelated dirty work. Any eventual release integration must compare the approved release baseline, especially other concurrent checkout work, before merging.
- The two inherited regression failures prevent claiming the complete existing suite is green. No unrelated fixes were made.

## Exact files changed

- `docs/cake-size-availability-local.md`
- `scripts/fixtures/cake-size-availability-browser.tsx`
- `scripts/test-cake-size-availability-browser.mjs`
- `scripts/test-cake-size-availability-db.py`
- `scripts/test-cake-size-availability.ts`
- `scripts/test-storefront-cake-detail-query.ts`
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

## Local rerun

Use this persistent worktree. Test tools were the existing cached tsx/esbuild, bundled Playwright with installed Chrome, and local Homebrew PostgreSQL. No package/dependency files were modified.

The database/browser fixtures require the isolated scratch PostgreSQL socket `/private/tmp/flour-size-availability-pg-socket` on port `55439`. Test data is disposable; source work is never stored there. Initialize a fresh scratch server with PostgreSQL 17 before running the DB suite if needed. The Python test recreates only `flour_size_availability_test` on that explicit local socket/port and never reads environment credentials.

Run in order:

1. `node /Users/ycwee/.npm/_npx/95c8da6ffd4052b6/node_modules/tsx/dist/cli.mjs scripts/test-cake-size-availability.ts`
2. `python3 scripts/test-cake-size-availability-db.py`
3. `node scripts/test-cake-size-availability-browser.mjs`
4. `node node_modules/typescript/bin/tsc --noEmit --incremental false`

## Readiness

Generic implementation and local feature tests are ready for Phase 3 review. DEV migration/deployment, live row verification/configuration and full DEV testing require explicit approval. The baseline suite failures and remaining integration checks must be acknowledged before calling DEV validation complete. Production requires its own later approval. Stop here; no scheduled follow-up or deployment is configured.
