# Catalogue query and pricing architecture design — 2026-10-29

## Decision scope

This is an investigation and design record only. No application behavior, Supabase database, Production deployment, or domain alias was changed. The investigation uses repository source, existing sanitized DEV metadata and the completed read-only DEV A/B measurements recorded in `docs/experiments/catalogue-query-ab-investigation-20261029/README.md`.

**Recommendation:** GO to a separately authorized, bounded DEV-only experiment of a one-request `collection_cakes` PostgREST embedding that includes the current category-assignment projection. Do not implement or deploy it as part of this phase. Evaluate pricing request reduction separately; do not cache effective prices until explicit schedule-edit invalidation is proven.

## Source points reviewed

| Point | SHA | What it represents |
|---|---|---|
| Earlier Production baseline | `0e4007fbd7f603acd4b00b979661fcc27e072afb` | Historical source requested for comparison |
| Current Production source | `d5a29146958556a5a8910cb30001527c363f4124` | Source tied to the live deployment in the supplied investigation record |
| Initial catalogue stabilization | `23bb7d036cb958f2a79e5e2cee898c823718089f` | Preserved stabilization candidate |
| Latest DEV refinement | `910d9f37eac9db330432c13022e969f034fa321b` | Source point from the completed timeout-recovery work |
| October 22 query refactor | `4bca39e188752693c06fe65d5b67b803db0c5200` | Adds membership-ID request followed by root `library_cakes` read |
| Pre-refactor parent | `27093854ed8b5c2997410ef4926a1340a5c82f28` | Historical one-request embedded collection query |
| A/B evidence commit | `924b24d5ccd4215bbb6669c905e2f3c1d834d537` | Verified GitHub commit containing the measured DEV A/B report |

The local diagnostic checkout was clean at local commit `777173741ee2f6c8a45c07481c87bd791cf087b1` before this documentation branch. Its tree was `d6ff96b2c6424d447b9b54966866c1dfa2961ed9`, identical to the GitHub A/B evidence commit's tree. Its commit metadata/history differs from the GitHub commit, so the recovery manifest records both identities rather than claiming they are the same commit.

The latest known Vercel domain mapping was read-only verified during this investigation: both `whitebird.asia` and `www.whitebird.asia` mapped to `dpl_66qLpJLTdJdZZkFKqPQfn5MmHGkG` in project `prj_3rmlAQzLSFOi15DEGczSuDYDq8xr`. No alias action occurred.

## Findings: catalogue behavior and category contract

### Category model

- The category-assignment migration describes the model as many-to-many and limits each cake to at most two assigned categories. It seeds multiple combinations (for example Chocolate + Nutty, Chocolate + Fruit, Tea + Fruit, and Local Inspired + Fruit).
- The same migration sets `library_cakes.category_id` to the first assignment by `sort_order`. Current create/edit actions also store the first selected category in `category_id` and separately replace assignment rows. This makes `category_id` a primary/legacy mirror, while the assignment relation is the current multi-category set.
- Current `mapStorefrontCake` prefers the assignment embed when present, sorts the full set and sets the display primary from the first sorted assignment. The direct category embed is a fallback for older schemas or omitted assignment embeds.
- Browse filters use OR semantics across assigned category IDs: a cake assigned to Chocolate and Fruit matches either selected category. `storefrontCategoryLabel` formats all assigned category names, and both storefront cards and cake detail render that label. Multiple categories are therefore intentional in both filtering and presentation.
- Existing sanitized DEV metadata reported 13 unique cakes across three visible homepage collections, five with multiple assignments. The six-cake A/B sample found one category-set difference between A (direct category only) and B (all assignments); this is a correctness difference, not noise to ignore. The sample does not prove a global invariant for every row.

### Eligibility, sorting and display fields

- Homepage collection rows are selected from `collection_cakes` with `collection_id`, `available=true`, `show_on_homepage=true`, ordered by `homepage_sort_order`.
- The application then filters cake status through `isOfferableStatus` and drops cakes with no visible sizes. The suggested embedded design must preserve these post-query filters; it should not silently convert database/RLS-hidden rows to a claimed empty catalogue.
- The current two-stage reader fetches the membership rows first, then unique, sorted cake IDs from root `library_cakes`, and reconstructs cake order from membership order. The root ID query itself has no ordering requirement because the application remaps by ID.
- The selected cake fields include description, status, sharing guide, allergens, direct category ID, category assignments, tag assignments/tags, sizes with base price and date-availability metadata, and photo metadata. The mapper sorts assignment/tag/size/photo arrays and chooses the configured default photo. The proposed one-request query must select the same fields and preserve the same mapping/fallback behavior.
- Browse is not identical to the homepage collection reader: it also reads publication catalogues, collection memberships and active/seasonal Library cake IDs, then combines current/historical availability and merchandising order. Do not apply the homepage experiment to Browse without a separate parity matrix.

## Recommended catalogue design (candidate B2)

For the homepage collection preview only, select `collection_cakes` once and embed its related `library_cakes` row through the existing foreign key, including the current complete display projection:

```text
collection_cakes
  select: homepage_sort_order,
          library_cakes(
            id, name, description, category_id, status,
            sharing_guide, allergens,
            direct category embed,
            category assignment -> category embeds,
            tag assignment -> tag embeds,
            size rows,
            photo rows
          )
  filters: collection_id = target,
           available = true,
           show_on_homepage = true
  order: homepage_sort_order ascending
```

This is a query shape proposal, not verified request output. PostgREST relationship embedding is based on foreign-key relationships; the repository's schema declares the required membership-to-cake and cake-to-child/category/tag relationships. A future experiment should build the query with the exact aliases/FK hints already used in the application and assert the returned relationship cardinality. Avoid `!inner` unless an explicit parity test proves it preserves the current treatment of missing/invisible child rows; a default left embed is the safer first comparison because the current code tolerates a missing cake row and filters it during mapping.

The query must preserve:

1. Membership filters and membership sort order.
2. The current application-side `isOfferableStatus` and non-empty-size checks.
3. Full assigned-category list and its ordering, plus direct `category_id` fallback.
4. Tag assignment visibility and ordering.
5. All size fields needed for displayed price, preorder and availability messaging.
6. Photo fields, photo sorting and default-photo selection.
7. The existing 30-second public display-cache/tag invalidation boundary.
8. Effective prices as a separate concern until price cache invalidation is proven.

### Why not a view or privileged function

An existing PostgREST embed can express the relation without adding a database object, elevated function or migration. The migrations show anonymous SELECT policies on category assignments/categories and public catalogue access policies for cake, size and photo rows; the request must continue using the public anonymous client and be tested through those exact policies. Supabase documents that RLS applies to exposed tables and warns that ordinary views can bypass underlying RLS unless created with `security_invoker=true` (Postgres 15+). A view/RPC would add security surface and migration work without current evidence it is needed. Do not substitute service-role access or weaken RLS.

Relevant documentation: [Supabase joins and nested tables](https://supabase.com/docs/guides/database/joins-and-nesting), [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security).

## Effective-price RPC trace

### Current flow

- `listHomepageCollectionPreviewCakes` reads the 30-second cached collection cake display result, then calls `withEffectiveStorefrontPrices(cakes, toBusinessDateKey())` outside that cache.
- `withEffectiveStorefrontPrices` flattens every returned cake's size rows and calls `library_cake_size_price_on(size_id, business_date)` once per size, with up to six RPCs in parallel per batch. For seven or eight sizes, it executes two concurrent waves (six, then one or two). Homepage featured collection previews themselves are started concurrently by the homepage component.
- Existing DEV aggregate metadata found 7–8 size rows in each representative collection, so 7–8 price RPCs per collection-preview invocation is a source/data estimate. The actual whole homepage request may invoke more if multiple featured collections contain distinct sizes; common cakes/sizes can also be queried repeatedly across separate collection invocations. The A/B HTTP probe did not instrument these RPCs, so this is not a measured HTTP count.
- The older homepage cache enclosed the priced collection result and was keyed by collection and business price date. Its warm hit could avoid the per-size price RPCs; the current cached cake read does not cache the price result, so each preview call recomputes effective display prices. This is an established request-count difference, not proof that the price RPCs caused `library_cakes` SQL timeouts.
- `library_cake_size_price_on` selects the unique schedule whose inclusive `effective_from`/`effective_to` covers the requested date, otherwise falls back to `library_cake_sizes.price`; overlapping matches raise. It is `STABLE`, `SECURITY DEFINER`, fixes `search_path=public`, revokes PUBLIC execute, and grants execute to `anon` and `authenticated`.
- The homepage uses the current Malaysia/Singapore business date, and price resolution is keyed by that date in the old cache. Date-specific keys avoid carrying a previous date into the next business date, but same-day schedule edits still need explicit invalidation if effective prices are cached.
- Price schedule create/update/delete actions currently call `revalidatePath` for Library routes but do not explicitly call `revalidateStorefrontPublishedCakeCache`. Other cake/category/tag/photo/collection mutation paths call the storefront tag invalidator. Whether path revalidation alone evicts an `unstable_cache` price result was not demonstrated. This is a concrete unresolved risk, not proof that current displayed price is stale.

### Checkout remains authoritative

The storefront checkout price resolver sends the pickup date and unique size IDs to `library_cake_size_price_on`. The guest preorder SQL function independently recalculates applicable price for the pickup date, verifies the submitted price acknowledgement if present, rechecks cake status, active collection membership, size ownership and fully-booked availability, and stores the SQL-calculated price. Display caches must never authorize orderability, price acknowledgement, stock or checkout. No checkout mutation was performed in this investigation.

## Candidate design comparison

| Design | Catalogue/API requests | Price request behavior | Correctness/security | Performance expectation and risk |
|---|---:|---|---|---|
| **A. Current two-stage + current price placement** | On homepage display-cache miss: membership GET then root cake GET; warm cake-data cache can reduce these. | Per returned size, `library_cake_size_price_on`; 7–8 per representative collection; outside cached cake result. | Current multi-category behavior preserved. Anonymous client/RLS. Checkout independently authoritative. | Measured historical A/B flow B is modestly slower in the small DEV sample. The root query may not itself be slower; timeout cause unknown. Warm homepage still performs price RPCs. |
| **B2. One embedded collection-to-cake read + current price placement** | One catalogue REST request on a miss; still separate per-size price RPCs. | Same as current unless separately changed. | Can preserve all current output only if it embeds both direct category and assignments plus all tags/sizes/photos, and retains status/size filtering, ordering and RLS. No view/RPC/migration required. | Removes one dependent HTTP round trip and membership reassembly. It may create a larger PostgREST statement with relationship joins/JSON aggregates and the same child RLS checks. Payload may rise due to adding assignments; exact size and server time are unmeasured. Does not establish fewer or faster PostgreSQL executions or resolve 57014. |
| **C1. Request-scoped price-RPC deduplication** | Catalogue count unchanged. | Reuses a resolved/in-flight `(size_id, business_date)` result only within the same server request/render. | Safe only if scope is genuinely request-local; no process-global cache or cross-user state. It cannot make a stale result authoritative; checkout still recalculates. | Saves calls only when the same size/date is requested more than once in one request, e.g. shared cakes across homepage sections. It saves nothing when every size appears once. Must verify Next/React cache scope and rejected-promise cleanup. |
| **C2. Batched public price resolver** | Catalogue count unchanged; price HTTP calls can become one per rendered price batch instead of one per size. | A new narrow multi-size/date RPC could call/replicate the existing price rules and return only `(size_id, price)` for caller-supplied IDs. | Requires a new migration and security review: fixed search path, minimal output, preserve overlap errors, grants limited to `anon, authenticated`, no direct table grants or RLS bypass in app. Checkout remains per-item authoritative. | Potentially removes several PostgREST round trips (7–8 to 1 per collection) but may still do equivalent DB work. Do not claim lower SQL time without DEV plan/measurements. This is a separate database proposal and is not authorized here. |
| **C3. Shared cached effective prices** | Could make warm price HTTP calls zero. | Cache key must include size and business date or a stable batch key. | Unsafe to advance until price-schedule edits explicitly invalidate relevant price tags; prove same-day edit/create/delete visibility and date-boundary expiry. | Highest stale-price risk. Keep on HOLD pending invalidation proof. |

## Existing A/B measurements and timeout interpretation

The completed direct DEV A/B experiment compared historical A with current B for one six-cake collection, 10 counterbalanced sequential pairs, and three concurrent flows per architecture. It found:

- A: 1 REST request per flow; median end-to-end 144.0 ms; nearest-rank p95/max 290.5 ms; median 8,944 bytes.
- B: 2 sequential REST requests per flow; median end-to-end 177.6 ms; nearest-rank p95/max 342.6 ms; median 10,747 bytes.
- Zero HTTP failures/timeouts. Three concurrent flows per architecture were too few to establish a difference.
- Common selected fields and ordered membership IDs matched, but category sets differed for one of six cakes because A omitted assignment rows.

These numbers are client-observed DEV timings; they do not isolate network, PostgREST or SQL execution and do not represent B2, because B2 (one request including assignments) has not been run. Fewer HTTP requests can reduce application/API round trips; it does not by itself prove fewer PostgreSQL executions, less join/aggregation work, lower SQL latency, lower concurrency or a lower timeout probability. If B2 retains equivalent nested joins, the failing root `library_cakes` SQL fingerprint could still time out. The Production query's intermittent `57014` cause remains unknown.

## Recommended controlled DEV experiment

**Stage 1 — catalogue read only:** compare A2 (current two-stage source) with B2 (one embedded membership query with complete assignment projection). Use only DEV project `tzwtpxdcggesgjaqxkqr`, a public anonymous key, no user JWT/service key, same 5–6 cake collection, same selected fields, same API region/network and 8-second per-request limit. Do not write to DEV. Record exact query strings in the test report, no row bodies or IDs.

1. Run a key/host identity preflight and a one-row read-only anon GET.
2. For every query, normalize only ordering of child arrays; preserve top-level membership order. Compare full mapped output including membership IDs/order, publication eligibility, categories/primary category, tags, sizes and all pricing metadata, photo arrays/default image, and empty/error semantics. Hash sanitized output; do not emit cake names, IDs, prices or URLs.
3. If any output mismatch remains, stop performance comparison until explained. A2/B2 must include identical assignment projections.
4. Run 30 alternating paired sequential samples per architecture. Use the same dataset and alternate which design runs first. Report median, nearest-rank p95, max, status, bytes, REST count, plus each subrequest and total flow. Call the first request “first sample”, never “database cold”.
5. Run at most three simultaneous flows per architecture, in isolated short groups. No bursts/load testing; cap at 8 seconds per HTTP request and abort on error spikes.
6. Pre-register a useful-read-path bar: exact full output parity; B2 must use one fewer REST request per uncached flow; B2 median should improve by at least 10% against A2 and p95 must not regress by more than 5%; zero errors/timeouts in the bounded sample. Failure to hit the bar means do not advance the query change. This is only a DEV acceptance criterion, not Production reliability proof.
7. If available without executing user data scans, inspect DEV query stats or a safely prepared `EXPLAIN` for corresponding role/query shape. Do not infer SQL plans from client timings or use Production `EXPLAIN ANALYZE`.

**Stage 2 — pricing, separately:** use test-only instrumentation to count the current exact per-size RPCs for one warm homepage render and multiple featured collections, while keeping output sanitized. First test request-scoped deduplication under the actual Next request boundary. If the benefit is negligible, stop. Only if material duplicate calls remain, prepare a separately authorized DEV branch for a narrow batch RPC. Use reversible synthetic DEV price schedules (new test-only size/fixture or isolated schema) to test one day before, start day, end day, day after, same-day create/update/delete invalidation, failure/overlap semantics, and compare display price to the existing single-size RPC. Do not cache shared price results until invalidation is proven. Verify checkout still recalculates price and availability before any order insert; do not create an order in this design phase.

**Reject the design** if output parity fails, anon RLS changes are needed, category/ordering/photo/size fields disappear, empty response semantics change, or one-request payload / p95 worsens beyond the threshold. Reject any cached price proposal if same-day schedule mutations or business-date transitions can show stale values. No Production benchmark is permitted.

## Security, RLS, and data boundary

- The candidate uses only existing public PostgREST relations and the anonymous public client. It must not use service-role credentials, a private connection, or an elevated user role.
- Existing migrations define public SELECT policy for category assignment/category rows and scoped public catalogue reads for cakes/sizes/photos; collection memberships are scoped by `available` and customer-facing collection state. Keep every source query on the same `anon` role so joins are filtered by the same RLS policies. Verify returned rows against current app behavior before acceptance.
- A view is not the default recommendation: Supabase documents that a view can execute with owner permissions and bypass RLS unless it is configured as `security_invoker` (Postgres 15+). A new function would require additional grant/search-path/security-definer review. Existing embeds avoid that migration surface.
- No orders, profiles, payments, stock, inventory, staff data, or customer row contents were accessed or changed for this architecture report.

## Expected benefit and unresolved risks

The best-supported immediate optimization candidate is B2, because the source and limited DEV sample show the current miss path requires two dependent REST requests and B2 can express the same membership/cake relation in one PostgREST call. The expected win is one fewer client/API round trip and removal of client-side ID reassembly; the old-to-current DEV data measured 33.6 ms median overhead, but B2's exact gain is not measured. Do not use the 33.6 ms as B2's promised improvement.

The existing price path is a separate source-confirmed request-count increase: a warm homepage display result can still trigger 7–8 price RPCs per representative collection-preview invocation, and selected collections run concurrently. This can increase API/database work, but it is not tied to the incident fingerprint and does not prove it caused `library_cakes` timeouts. A batch price API might reduce HTTP calls but could leave SQL work intact. Shared cache risks stale prices because schedule actions do not explicitly invalidate the public catalogue cache tag.

**Root-cause status:** October 22 refactor introduces an extra dependent REST round trip and category projection (measured path overhead); it is not established as the cause of PostgreSQL `57014`. Database/platform stall cause and any causal link from price RPC volume remain unknown.

## Actions not performed

- No application source or test behavior changed.
- No DEV or Production SQL, DDL/DML, migrations, RLS/policy/index/configuration changes.
- No deployment, promotion, domain alias, or environment-variable change.
- No Production Supabase request or business-data read.
- No load test, synthetic order, cache mutation, price fixture, or checkout submission.
- No implementation of the proposed one-request query, price batch, request-level deduplication, or cached pricing.
