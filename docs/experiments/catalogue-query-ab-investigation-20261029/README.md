# Catalogue query A/B diagnostic — 2026-10-29

## Scope and result

This diagnostic-only experiment compares the historical October 22 collection-embed query (A) with the refactored membership-then-root-cake query (B), using the same DEV project, public anonymous API key, collection, and shared response fields. It changes no storefront implementation, Production data, database schema, cache, or deployment.

**The bounded DEV HTTP experiment completed.** It ran 10 counterbalanced sequential A/B pairs and three concurrent requests per architecture against a six-cake DEV collection. All measured requests succeeded without HTTP failures or timeouts. The common selected fields and ordered membership IDs matched, but B returned an additional category-assignment projection that differed for one of six cakes. Therefore common-field results match, while full category output is not equivalent.

Observed per-sample total latency was higher for B (median 178 ms vs 144 ms; nearest-rank p95/max 343 ms vs 291 ms). B used two sequential REST requests and returned more bytes per sample. This is evidence of modest request-path overhead for this DEV dataset, not proof of Production `57014` causation or of an intrinsic slowdown in B's root SQL query. The probe bypasses Next.js cache behavior and cannot split network, gateway, PostgREST, and SQL time.

## Preserved source and ancestry

Repository: `hyphenkk3/project-flour`.

| Source point | SHA | Verification |
|---|---|---|
| Earlier Production source | `0e4007fbd7f603acd4b00b979661fcc27e072afb` | GitHub commit fetch PASS; live code ancestry available locally |
| Current Production source | `d5a29146958556a5a8910cb30001527c363f4124` | GitHub commit fetch PASS; source audit records it as the live deployment SHA |
| Stabilization source | `23bb7d036cb958f2a79e5e2cee898c823718089f` | GitHub commit fetch PASS |
| Latest DEV refinement | `910d9f37eac9db330432c13022e969f034fa321b` | GitHub commit fetch PASS; branch `codex/catalogue-timeout-recovery-20261029` |
| October 22 refactor | `4bca39e188752693c06fe65d5b67b803db0c5200` | Local commit; its parent is `27093854ed8b5c2997410ef4926a1340a5c82f28`; refactor is an ancestor of live |

Local starting commit `b2be85106efa3efc102773ac338fa922a1e66d8b` has tree `6f9112f4d834687ea0459063fc079a89de02ff2d`, the same tree as GitHub source commit `910d9f37eac9db330432c13022e969f034fa321b`. Its commit metadata differs. The diagnostic branch starts from this verified identical source tree; the permanent GitHub branch starts from the exact remote `910d9f3` commit.

The earlier comprehensive audit remains at [`docs/audits/catalogue-root-cause-audit-20261029.md`](../../audits/catalogue-root-cause-audit-20261029.md) and its separate preserved bundle. It records the Production incident timeline and prior source/log investigation; this experiment does not replace or overwrite it.

## Exact query change inspected

At the parent of `4bca39e` (`2709385`), `listHomepageCollectionPreviewCakes` used one `collection_cakes` REST request with `homepage_sort_order` and an embedded `library_cakes` selection. Its homepage cake selection included the direct category, tag assignments/tags, sizes and photos; it deliberately omitted category assignments. The query filtered `collection_id`, `available=true`, `show_on_homepage=true`, ordered by `homepage_sort_order`, then mapped the embedded cake and applied display pricing.

At `4bca39e` and in the current candidate, this path first selects `library_cake_id,homepage_sort_order` from `collection_cakes` using the same filters/order, then loads the selected IDs from root `library_cakes` with nested embeds. The shared root helper also requests category assignments in addition to the old homepage projection. The homepage wrapper and cache keys changed: the prior outer cache key included collection and price date; the new outer key uses collection ID, and current effective prices are applied outside that wrapper. Both paths use the 30-second merchandising revalidation configuration and catalogue invalidation tag. These are consequential differences to measure separately; a raw A-versus-B response-size comparison is not a projection-identical test.

The exact source-generated select strings and HTTP parameters are encoded in `scripts/diagnostics/catalogue-query-ab-20261029.mjs`. The probe compares common raw fields by hash without printing cake names, prices, photo URLs, IDs or response bodies, and separately counts actual category-set differences from B's added assignment embed. It uses only the DEV public key in the `apikey` header, sends no user Authorization token, enforces the exact DEV host, and applies the same 8-second request budget. It does not alter data.

The price-cache relocation has a separate invalidation concern: current price-schedule actions call `revalidatePath` for Library routes but do not explicitly call `revalidateStorefrontPublishedCakeCache`. The previous homepage data cache was keyed by price date and tagged with the published-cakes tag; whether `revalidatePath` alone evicted that `unstable_cache` entry was not experimentally verified here. Do not simply move the pricing calls back inside a shared cache until that behavior is verified, or price-schedule updates could appear stale. The probe measures only catalogue REST shapes, not this cache/invalidation behavior.

## DEV access evidence

- Supabase project identity was `tzwtpxdcggesgjaqxkqr`; the probe verified that exact host before sending requests.
- A preflight using the DEV public publishable key returned HTTP 200 for one bounded `collection_cakes` GET. The diagnostic requests used only the `apikey` header, with no user `Authorization` token, so they exercised anonymous access/RLS.
- The selected public homepage collection contained six memberships. The probe's additional setup discovery GET returned 200 (958 bytes, about 298 ms).
- The A/B probe performed 40 bounded GETs: A made 13 underlying REST requests (10 sequential plus three concurrent); B made 26 (two sequential REST calls for each of 10 sequential and three concurrent flows); one collection-discovery request was excluded from the A/B totals. The separate key preflight was one additional GET.
- No cake names, IDs, prices, image URLs, row bodies, or credentials were emitted. The returned data was processed in memory and summarized by hashes, counts, timings and byte totals.
- Earlier aggregate DEV metadata showed 13 unique cakes across three collections, 5 with multiple category assignments; the actual six-cake A/B sample showed one differing category set and one B cake with multiple assignments.
- No Production project, customer records, or Production business data were accessed or modified.

## Results and interpretation

| Measure | A — historical embed | B — refactor | Notes |
|---|---:|---:|---|
| Sequential flows | 10 | 10 | 10 alternating A/B pairs; A-first then B-first by pair |
| REST calls per sequential flow | 1 | 2 | B performs membership GET followed by root-cake GET |
| Sequential total latency, median | 144.0 ms | 177.6 ms | B +33.6 ms / +23.3% in this sample |
| Sequential total latency, p95 / maximum | 290.5 / 290.5 ms | 342.6 / 342.6 ms | Nearest-rank p95 with n=10 equals maximum |
| Individual REST subrequest median / maximum | 143.9 / 290.4 ms | 68.8 / 245.2 ms | B values combine membership and root requests; not an end-to-end comparison |
| Response bytes per sequential flow, median | 8,944 | 10,747 | B +1,803 bytes / +20.2%; B includes a separate membership response and category assignments |
| HTTP failures / timeouts | 0 / 0 | 0 / 0 | Across 10 sequential flows and three concurrent flows per architecture |
| Concurrent group | 3 flows; 3 REST calls; 333.6 ms; 26,832 bytes | 3 flows; 6 REST calls; 321.6 ms; 32,241 bytes | Three concurrent flows only; B's aggregate group finished about 12 ms sooner despite twice the calls; too small to establish an advantage |
| Common selected projection | 6 rows | 6 rows | Hashes match: `ad346b9e…15c6330`; ordered membership IDs match |
| Category-assignment projection | Direct category only | Assignments included | One of six cakes differs; one B cake has multiple assignments. Full category output is not equivalent |
| Effective-price RPCs | Not measured by HTTP probe | Not measured by HTTP probe | Source-level estimate remains 0 on old warm whole-result cache hit vs 7–8 per current warm homepage call |
| PostgREST/SQL plan and server execution time | — | — | Not available from this client probe |

### Interpretation

For this modest DEV collection, B is slower end-to-end in the sequential measurement because its flow performs two dependent REST calls. Its individual REST subrequests are shorter in aggregate median, but those per-call values cannot be compared to A's one-call flow as if they represented total completion time. B's response is larger because it includes the extra membership response and category-assignment data. The common fields (including photos and sizes selected by both paths) and collection order match; the added category projection does not.

The three-flow concurrency result was close and is not evidence of a consistent concurrent benefit or regression. No requests timed out, so the experiment did not reproduce the intermittent stall. The 10-pair latency sample is small, uses one six-cake DEV collection, and measures client-observed HTTP time—not isolated SQL execution. No overall batch wall-clock duration was emitted by the probe.

The separate warm effective-price cost is not included in these A/B REST timings. Existing source/data analysis indicates 7–8 price RPCs can run on each current warm homepage preview call, versus zero on an old whole-result cache hit. The probe does not instrument Next.js cache hits or these RPCs, and this request-frequency change is not linked by trace to Production fingerprint `-3231686492694644454`.

**Causal conclusion: PARTIAL.** The October 22 architecture has a measured, modest end-to-end latency and payload overhead on this DEV sample, chiefly consistent with an extra dependent membership request and extra projection. This is a measurable path regression under the tested conditions, not evidence that the root `library_cakes` query itself is slower or that the refactor caused Production `57014` cancellations. Production cause and timeout reliability remain unresolved.

## Query-plan boundary

The Supabase SQL connector can run read-only SQL as `anon`, but it cannot expose the exact SQL generated by PostgREST for the two HTTP requests. A hand-written SQL join or `EXPLAIN` would be an approximation and could not fairly isolate the embedded PostgREST relationship plan. No approximate plan was substituted. The supplied script captures client request time/bytes and status only; it cannot separate network, PostgREST and SQL time or provide the server query plan.

## Reproducible probe

The exact diagnostic script is `scripts/diagnostics/catalogue-query-ab-20261029.mjs`. It uses only Node built-ins and has an eight-second timeout per HTTP request. It sends at most 40 GETs within the probe: one setup discovery, ten counterbalanced sequential pairs, and three parallel flows per architecture. Peak parallelism is three flows; in B, each flow performs its membership and cake requests sequentially. It makes no retries and never prints keys or returned records.

In Mac Terminal, first start a Bash shell with `bash`. At the `bash-3.2$` prompt, enter the hidden-key command **by itself**:

```bash
read -r -s -p 'DEV public anon/publishable key: ' SUPABASE_ANON_KEY; printf '\n'
```

When the hidden prompt appears, paste only the enabled public key from DEV project `tzwtpxdcggesgjaqxkqr`, press Return, and wait for the Bash prompt to return. Do not paste the remaining commands while `read` is waiting. Then enter:

```bash
export SUPABASE_ANON_KEY
export SUPABASE_URL='https://tzwtpxdcggesgjaqxkqr.supabase.co'
node scripts/diagnostics/catalogue-query-ab-20261029.mjs
unset SUPABASE_ANON_KEY SUPABASE_URL
```

The recorded run used Node `v26.5.1`. A separate preflight confirmed the key was accepted (HTTP 200); the probe itself then returned the sanitized JSON captured in this report. The probe does not control for database-cold cache state, execute the Next.js `unstable_cache`, measure actual homepage price-RPC counts, or provide a Postgres execution plan. Any category mismatch must be preserved as a correctness difference, not treated as parity.

## Safety and actions not performed

- No storefront implementation file changed; only the diagnostic report and probe are on this branch.
- All measured requests were read-only GETs to DEV under anonymous public-key access. No business records, orders, stock, checkout, payments, notifications, schema, RLS, indexes, credentials, or configuration were changed.
- No Production database connection, deployment, promotion, or alias change occurred.
- No `EXPLAIN ANALYZE` or load test was run. Concurrent testing was limited to three simultaneous flows per architecture.
- The production domains remain on the previously verified live deployment; no operation in this experiment could move aliases.

## Decision

**Measured result:** B had a 23.3% higher median sequential flow latency and 17.9% higher nearest-rank p95/max than A for the tested DEV collection, with zero failures in either architecture. B also used twice as many underlying REST calls per flow and returned 20.2% more bytes. In the three-flow concurrency sample, B completed slightly sooner; the sample is too small to establish a concurrent advantage.

**Correctness:** Common raw fields and ordered memberships matched; the full projections did not. B returned category assignments, with one category-set difference among six cakes. The probe did not compare date-derived effective prices. Do not claim full functional equivalence.

**Recommended correction to evaluate, not implement here:** if lower request latency is prioritized, compare a single-request historical embed against a refactored projection that retains any required category-assignment behavior. Before caching effective prices again, verify explicit invalidation after price-schedule edits. Neither finding proves the Production `57014` root cause, and no fix or release is authorized by this experiment.

**Next action:** preserve these measurements, then obtain a second modest DEV sample with the category output contract made explicit and measure price-schedule invalidation/RPCs separately. Any application change needs separate authorization and focused review.

## Investigation source commit

- GitHub branch: `codex/catalogue-query-ab-investigation-20261029`
- The GitHub branch head and local bundle commit are recorded in the external recovery manifest; the committed source trees match.
- Source changes are limited to this diagnostic report and the bounded DEV probe. No application behavior changed.
