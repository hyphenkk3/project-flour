# Project Flour Phase 8 — Customer-Facing Catalogue Resilience

Date: 2026-10-29 (Asia/Kuching)

## Scope and verified baseline

This is design and synthetic failure-injection work only. No Production or DEV Supabase requests, data changes, migrations, deployments, or application edits were made.

- Production deployment: `dpl_66qLpJLTdJdZZkFKqPQfn5MmHGkG`, READY, Production target, source SHA `d5a29146958556a5a8910cb30001527c363f4124`.
- Read-only Vercel alias lookups confirmed both `whitebird.asia` and `www.whitebird.asia` map to that deployment.
- Source baseline: GitHub branch `codex/catalogue-resilience-phase8-20261029` was created from exact commit `910d9f37eac9db330432c13022e969f034fa321b`.
- GitHub API confirmed that branch still points to `910d9f37eac9db330432c13022e969f034fa321b` before this Phase 8 documentation/test commit. The commit is four commits ahead of the promoted app source, as previously recorded.
- The local clean source checkout used for static tracing is `b2be85106efa3efc102773ac338fa922a1e66d8b` from a preserved Phase 7 bundle. Relevant Phase 8 source files were compared with GitHub files at `910d9f37eac9db330432c13022e969f034fa321b` and matched. The local checkout does not contain the exact `910d9f3` Git object; consequently its bundle is a separately restorable equivalent-source diagnostic snapshot, while GitHub remains the authoritative exact-ancestry copy.
- `package.json` at the requested source SHA specifies Next.js `16.2.12`. The checkout has no installed `node_modules/next` or `node_modules/next/dist/docs`, so a version-matched local Next runtime-cache test could not be run without installing dependencies. No packages were installed.

## Current cache and request boundaries

1. Public cake display data is cached with Next `unstable_cache`, using 30-second revalidation and the `storefront-published-cakes` tag. Cached entries include public names/descriptions, status, categories/assignments, tags, sizes, and photo metadata. Collection membership/order is read outside the cake-ID display cache in `listAvailableCakes`; homepage collection previews wrap the membership query plus display lookup in a separate 30-second cache.
2. Homepage monthly/special collection selection has date-specific cache keys and the same global tag. The homepage hero is outside two independent Suspense sections. Fresh Picks and merchandising have separate failure handling; a section failure displays an explicit unavailable message, not a fabricated empty catalogue. The retry control calls `router.refresh()`.
3. `readCachedExtraPhotoRows` caches public photo metadata for 60 seconds and throws on transient errors rather than caching them as “no photo.” Fresh Pick stock rows themselves are fetched live from `extra_stock`; publication window/hold/readiness and date are evaluated on the request. Price is looked up for the visible pickup date. A stock read failure returns `temporarilyUnavailable` rather than asserting that stock is empty.
4. `coalescePublicCakeRead` is only an in-flight, process-local promise map (maximum 64 entries). It is not a settled result cache and does not share entries across serverless instances. It preserves the accepted same-process duplicate-read behavior and generation boundary.
5. Cake display reads retry once only for the recognized PostgreSQL statement-timeout text. The 8-second application `TimeoutError` is not retried. Cached callback errors throw; the cache callback does not intentionally convert transient errors into a successful empty list. Missing optional photo schema has a narrowly recognized compatibility fallback.

Next documents `unstable_cache` as persistent across requests/deployments, with `revalidate` as the interval after which refresh is due, not a maximum stale age. The Next revalidation guide says the last successfully generated result can remain served when revalidation throws and that the next request retries. This describes documented framework behavior, but it is not a direct runtime test of this app’s installed Next 16.2.12/Vercel path. The app’s dynamic routes use `connection()` and Data Cache entries; they are not all statically generated ISR pages. The exact stale behavior of a failed `unstable_cache` refresh in the deployed runtime remains a runtime-verification item.

## Invalidation map and safety boundary

- Cake create/update/status, size/assignment update, popularity change, and delete actions call `revalidateStorefrontPublishedCakeCache` after successful data writes; it invalidates the global public-cake tag and, where supplied, a per-cake tag.
- Cake photo create/update/order/delete uses the same global and per-cake cache tags.
- Category and tag metadata changes invalidate the global public-cake tag.
- Collection membership, availability, homepage-preview selection/order, and collection publication actions route through `revalidateCollectionPaths`, which invalidates the global tag.
- The helper calls `revalidateTag(tag, "max")`, explicitly selecting stale-while-revalidate semantics, then increments a module-local generation used only by the process-local in-flight read coalescer.
- Price-schedule actions revalidate library paths; customer-visible effective prices are resolved separately through `library_cake_size_price_on` after public display cache lookup, using the current business date or selected pickup date. They are not intended to come from the shared cached display record.
- Fresh Pick physical-stock and fulfilment eligibility remain outside the public display cache. Final Fresh Pick submission uses `submit_guest_extra_order`; normal guest preorder submission uses the final `submit_guest_preorder` / combined voucher RPC, and checkout separately resolves pickup-date size prices. This audit did not execute those RPCs.

The global tag helps make public display refreshes coherent, but the `"max"` profile is stale-while-revalidate, not an immediate hard purge. The process-local generation only protects requests coalesced within one instance. A new fallback layer that cannot observe all invalidations could re-show an unpublished/deleted cake, a removed collection membership, outdated category/photo data, or an old price if it returns the entire prior display object. No positive “maximum safe stale age” is proven for that additional fallback. Therefore the safe maximum for a *new explicit fallback* is **zero seconds** until an invalidation mechanism with a demonstrated global version/fencing guarantee exists.

## Failure behavior by surface

- Homepage: hero renders outside separate Fresh Picks and merchandising Suspense boundaries. Catalogue errors are caught and rendered with “temporarily unavailable” messaging and a manual refresh affordance. Fresh Picks errors are explicitly distinguished from no stock.
- Browse: catalogue and offers are handled separately; a route-level error boundary offers retry for uncaught catalogue failures.
- Collection detail: page has a loading boundary and route-level error boundary. The collection read pipeline uses current membership and date-sensitive pricing; errors should fail the route section rather than being silently treated as an empty collection.
- Cake detail: current commercial/publication state is read separately from cached display metadata. If supplemental display data fails, the page shows an explicit warning and retains only the live display/ordering information that was successfully obtained. If live commercial data fails, route error handling applies.
- Genuine zero rows and query errors remain distinct: query paths throw on Supabase errors; successful empty arrays are ordinary data. Fresh Picks has an explicit `temporarilyUnavailable` flag.

## Pricing, availability, and ordering

`withEffectiveStorefrontPrices` makes `library_cake_size_price_on` calls after cached cake display rows are loaded. Calls are concurrent in batches of six, with later batches sequential. Existing prior source analysis estimated 7–8 price RPCs on a warm homepage; this Phase 8 work did not remeasure that count. Prices depend on the current business date or chosen pickup date and are not part of the intended shared display cache. A stale catalogue fallback must not reuse those prices: if current price resolution fails, the price should be presented unavailable and ordering blocked until resolved.

Fresh Picks’ display reads current stock and maps current fulfilment windows; checkout price resolution and the final submission RPC are separate. Standard checkout re-resolves size prices for the selected pickup date and the final submission RPC remains the authority. No stock, price, or order eligibility may be inferred from a stale browse object.

## Strategies evaluated

| Strategy | Customer experience | Correctness / consistency | Scope and assessment |
|---|---|---|---|
| A. Current behavior | Keeps the homepage shell and unrelated section visible; failed catalogue section says unavailable and offers manual retry. Cold failure has no catalogue until retry/recovery. | No fabricated empty result. Current price/stock/order checks remain live. Existing Next Data Cache revalidation semantics may serve stale last-good data; exact 16.2.12 path needs runtime confirmation. | **Safest now.** No new cache state or invalidation contract. Does not mask a cold-cache outage. |
| B. Additional bounded stale-on-error layer | Could show product cards during a transient failure. | A hard age cap alone does not solve known invalidation races. `revalidateTag(..., "max")` deliberately allows stale-while-revalidate; local generation is not global. Old product status, membership, price, image, or size could be shown. | **Reject for now.** No demonstrated globally visible invalidation fence or a safe projection that excludes all price/order authority and unavailable products. No positive stale-age bound can be justified. |
| C. Hybrid static shell + live catalogue | Keeps brand/header, informational content, unrelated homepage sections, loading/error message, and retry visible; only the failed live catalogue cards are withheld. | No stale product or price is authorized. Fresh Picks remains live; checkout remains authoritative. | **Preferred future experiment.** Existing Suspense/error isolation already moves in this direction. A further UI-only resilience experiment can improve status/retry clarity without introducing stale catalogue data. |

Reducing display query wait or retaining prior public data does not prove mitigation of PostgreSQL `57014`. The cause of intermittent database stalls remains unproven. The 30-second cache and request coalescing remain unchanged. A failed first load with no cache still must show an unavailable state; adding a retry here would violate the current no-extra-retry decision unless separately designed and bounded.

## Synthetic failure simulation

Files:

- `scripts/diagnostics/catalogue-resilience-simulation.mjs`
- `scripts/diagnostics/catalogue-resilience-simulation.test.mjs`

Command: `node --test scripts/diagnostics/catalogue-resilience-simulation.test.mjs`

Result: 19 model-level tests passed. Cases cover successful load, prior success followed by a transient failure, cold failure versus genuine empty, `57014`, app timeout with no retry, next-request recovery, explicit max age, in-flight invalidation fencing in the candidate model, category/photo change, price-freshness boundary, same-process coalescing and key isolation, separate-instance cache isolation, Fresh Pick stock not coming from catalogue data, and examples of Next-style stale retention after long age or unpropagated invalidation.

These tests validate the proposed policy model, not Next’s cache implementation or Vercel’s actual distributed invalidation. They deliberately show why an added stale fallback is unsafe: a disconnected instance that misses an invalidation can still return old data; the simulation’s bounded policy blocks stale only when its shared invalidation version is visible. The test uses fake data only and makes no network calls.

Runtime tests against Next 16.2.12’s `unstable_cache`, Vercel multi-instance cache propagation, and real application route rendering were **not run** because the source checkout has no installed Next package. No dependencies were installed. The simulator does not claim to prove Production timeout reduction or cross-instance safety.

## Decision and next validation

**HOLD** on implementing additional stale-on-error catalogue fallback. Current public data may already be retained by framework cache behavior, but the app has no explicit maximum stale age and tag invalidation intentionally allows stale refresh semantics. Adding another cache would create an independent invalidation problem.

**GO** only for a separate DEV-only presentation experiment that keeps independent page content visible, clearly distinguishes unavailable from empty, and offers retry without displaying stale prices, availability, or order controls. Before any stale card experiment, first run a version-matched Next 16.2.12/Vercel-compatible cache test for failed `unstable_cache` refreshes and hard-vs-SWR tag invalidation across two simulated instances. Do not authorize a Production release from these results.

Recommended acceptance tests for that future experiment: cold failure, warm revalidation failure, max-age expiry, each mutation class, tag propagation race, two instances, price-RPC failure, Fresh Pick stock change, recovery, and final checkout revalidation. Any stale data beyond the existing 30-second freshness window, stale item after a confirmed unpublish/remove, stale price/stock in an action control, or stale result beyond a known maximum is a rejection.

## Safety actions not performed

- No Production or DEV Supabase query or mutation.
- No database write, migration, RLS/index/settings change, order/payment/stock action, or credential access.
- No Production/Preview deployment, alias movement, or configuration change.
- No application source behavior or dependency changes.
- No attempt to state that this work fixes PostgreSQL timeout incidents.
