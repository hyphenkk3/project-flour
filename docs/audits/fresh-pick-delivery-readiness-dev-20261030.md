# Fresh Pick Delivery readiness correction — DEV record

## Source and scope

- Repository: `hyphenkk3/project-flour`
- Dedicated branch: `codex/fresh-pick-delivery-readiness-20261030`
- Base: Production source commit `f0a81f342102672bf3a74bd12415497332d17f38`
- Production deployment observed: `dpl_3azmsztrvSPhLqtEQHUGkbUqPfWb`
- DEV project used for database work: `tzwtpxdcggesgjaqxkqr`
- Production database, deployment and domains were not modified.
- The separately owner-approved storefront commit `40a916fe2e979cf0b04d59b473a12a6006db741e` was not changed or combined.

## Correction

The existing Bakery Mark Ready action requires `production_started_at`, while Start Production correctly rejects an order whose complete quantity is supplied by Fresh Pick inventory. The existing database whole-order readiness transition already performs the lifecycle, role, handoff, `ready_at`, and timeline checks, but does not independently validate Fresh Pick stock. Delivery was also excluded from the existing pickup/dine-in Fresh Pick synchronizer.

The correction adds a dedicated, explicit staff action for fully stock-backed guest Delivery orders. Its database function locks the order first, validates fully-paid eligibility and exact stock coverage/readiness in the same transaction, and delegates the actual state change and audit event to `mark_guest_order_ready`. It does not edit `ready_at` directly and does not change the standard Bakery production-completion route. The UI eligibility calculation is only a presentation gate; the database function is authoritative.

The lock ordering is deliberately order-first and acquires no stock-row locks. This avoids reversing the existing stock-row-then-order allocation lock sequence. The verified DEV writers serialize readiness-affecting changes through the order row or deferred readiness reconciliation before commit.

Migration file: `supabase/migrations/20261030072645_fresh_pick_delivery_guarded_ready.sql`.

DEV migration ledger entry: `20261030072849` / `fresh_pick_delivery_guarded_ready` (the migration service assigned its own ledger timestamp; the SQL body applied was the checked-in migration body). The function is `SECURITY DEFINER`, owned by `postgres`, uses fixed `search_path=public`, is executable by `authenticated` and `service_role`, and not executable by `anon`. Existing `mark_guest_order_ready(uuid,uuid)` and its implementation were left unchanged.

## Concurrency evidence (DEV only)

Two independent PostgreSQL connections were verified with distinct backend PIDs and overlapping transaction start times. Tests used bounded transactions and isolated synthetic DEV fixtures.

- Readiness vs stock readiness reversal: serialized; stock reversal subsequently committed and deferred reconciliation cleared `ready_at`; no stale-ready state.
- Readiness vs cancellation/refund: final order was canceled and unready.
- Readiness vs payment correction: payment correction waited; payment demotion committed and readiness was cleared.
- Readiness vs order-item quantity change: the exact-stock deferred constraint rejected the invalid quantity change.
- Readiness vs fulfilment change: serialized; final fulfilment was Pickup and the state remained consistent.
- Readiness vs delivery handoff: readiness preceded handoff; one event of each relevant type.
- Concurrent repeated Mark Ready: second request waited, returned the existing ready row; no duplicate event from the repeated action.
- Assignment to stock already sold/assigned, unconfirm/reversal guards, and handoff-before-ready were rejected by existing guards.
- Negative checks for unready stock, partial coverage, unpaid, unauthorized, canceled, non-Delivery, started production and wrong fulfilment were rejected.
- Pickup and Dine-in synchronizer definition was unchanged and its existing persisted readiness behavior remained present.

These tests establish serializable outcomes for the exercised DEV writer paths; they do not constitute a formal proof for every possible database writer or Production load condition.

## Application validation

Passed focused checks:

- `scripts/test-bakery-fresh-pick-readiness.ts`
- `scripts/test-m5-p1-bakery-board-eligibility.ts`
- `git diff --check`

The focused live-workspace script `scripts/test-m5-p3-bakery-ready-live.ts` was not used for acceptance: it requires `.env.local` and a service-role credential and creates test orders. No `.env.local` was present in this checkout.

A full `tsc --noEmit` and scoped ESLint attempt stalled in filesystem reads from the shared dependency installation (Node process blocked in `uv_fs_read`, no CPU progress) and was stopped. These checks are not claimed as passing. A full Vercel build/Preview was not started because the Vercel environment did not contain variables scoped to this feature branch, and the inherited Preview binding could not be proven DEV-only without exposing or changing credentials.

## DEV fixture cleanup

The test fixtures were isolated to DEV. Cleanup removed the removable synthetic orders, stock rows, linked refunds/payments/events, with counts checked. One synthetic unpaid order remains because its payment-correction history is protected by the database append-only trigger `payment_corrections_immutable`; the attempted cleanup transaction rolled back without partial deletion. The remaining order is `13087663-0550-479f-b96d-310cf0426f41` / `ORD-20261030-2713`, `awaiting_payment` / `unpaid`, with one linked stock row and immutable payment-correction row. No trigger was bypassed and no unrelated row was removed.

## Preview and release status

No DEV Preview was created. Vercel returned zero environment variables scoped to `codex/fresh-pick-delivery-readiness-20261030`. Existing project Preview variables were branch-scoped to other work, so effective bindings for this branch were ambiguous. The change is therefore not ready for Production release.

Production order `ORD-20261026-0003` was not modified. No new read-only query was run in this execution; the previously supplied Production evidence remains the latest evidence available here.

## Recovery status

- GitHub branch verified at `cbeabd7b0827d559a15f64d278918c4f7fb2165e`, parent `f0a81f342102672bf3a74bd12415497332d17f38`.
- The complete bundle under `recovery/fresh-pick-delivery-readiness-20261030/verified-final/` was verified and cloned independently. Restored HEAD is `c0f1900c437d8c22dfebf060b4be1cc674543d0e`; restored tree `697da2977bb24455ddeb4f8e646b39781c186490` matches the verified GitHub commit tree. The bundle commit SHA differs from the GitHub commit SHA because the connected GitHub service created the remote commit with its own commit metadata; the source tree and parent are identical.
- Bundle SHA-256: `e421342a6dd596e5f7b924b1ec3121bad3f33447df2db3cbadb8c6886585453c`.
- A Vercel Preview and remote build are still blocked because no environment variables are scoped to this feature branch and the inherited Preview binding was not proven DEV-only.
- No older recovery bundle or manifest was overwritten.

## Files changed

- `supabase/migrations/20261030072645_fresh_pick_delivery_guarded_ready.sql` — atomic DEV-only guarded transition.
- `src/workspaces/bakery/actions.ts` — explicit server action calling the guarded RPC.
- `src/workspaces/bakery/BakeryProductionActions.tsx` — explicit Delivery confirmation UI.
- `src/workspaces/bakery/BakeryOrderDetail.tsx` — UI-only eligibility presentation.
- `src/workspaces/bakery/eligibility.ts` — dedicated readiness surface.
- `scripts/test-bakery-fresh-pick-readiness.ts` — focused regression assertions.
- `docs/audits/fresh-pick-delivery-readiness-dev-20261030.md` — this record.
