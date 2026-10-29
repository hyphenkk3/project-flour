# Catalogue query A/B diagnostic — 2026-10-29

## Scope and result

This is a diagnostic-only branch. It makes no storefront implementation changes, Production changes, database changes, cache changes, or deployments. The intended comparison is the historical October 22 collection-embed query (A) versus the refactored membership-then-root-cake query (B), using a 5–6-cake DEV homepage collection under anonymous RLS.

**The end-to-end A/B experiment is BLOCKED in this runtime.** DEV project identity and an anonymous, read-only SQL role check passed, but this environment could not resolve `tzwtpxdcggesgjaqxkqr.supabase.co` (`curl` exited with DNS error 6; Node `fetch` failed). No REST request reached Supabase. Consequently there are no measured HTTP timings, REST response sizes, REST error counts, completeness comparison, or PostgREST query plans from this run. The supplied script is a bounded, secret-free-output probe for execution from an environment that can resolve the DEV host; its results have not been run and must not be treated as evidence.

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

- Supabase project metadata returned ref `tzwtpxdcggesgjaqxkqr`, status `ACTIVE_HEALTHY`, PostgreSQL 17.6.1.155, region `ap-southeast-1`.
- A read-only transaction with `SET LOCAL ROLE anon` reported `current_user=anon`, `transaction_read_only=on`; three collections were visible to that role.
- The three DEV collections had respectively 5, 5 and 6 available homepage memberships. This supplies representative public DEV data without reading business records.
- Across the 13 unique cakes in those homepage selections, all 13 had visible category assignments and 5 had multiple assignments. Per collection, counts were 6 cakes/1 multi-category, 5/2 and 5/3. All direct `category_id` values matched at least one assignment in aggregate. Thus the actual A and B projections differ, and B can return multiple category refs where A had only the direct category embed. Full output equivalence is not established.
- Those visible active/seasonal cakes had 8, 7 and 8 size rows by collection. `withEffectiveStorefrontPrices` performs one `library_cake_size_price_on` RPC per size, in batches of six. Before the refactor these RPCs ran inside the homepage `unstable_cache` callback keyed by collection and price date; after it, they run outside the cached result on every `listHomepageCollectionPreviewCakes` call. Source plus DEV size counts therefore establishes 7–8 price RPCs on a current warm homepage preview call versus zero on a warm old whole-result cache hit. This is a concrete request-count regression; its latency and Production impact remain unmeasured.
- Production project, Production data, customer records and live domains were not queried or modified for this experiment.
- The failed direct-network checks stopped at name resolution; no anonymous REST request was sent. The direct SQL check is not a substitute for an HTTP/PostgREST A/B measurement.

## Results and interpretation

| Measure | A — old embed | B — refactor | Status |
|---|---:|---:|---|
| Base catalogue REST calls on an uncached request | 1 by source shape | 2 by source shape (membership, then root cakes) | Static source count only; no request observed |
| Effective-price RPCs on cold homepage cache fill | 7–8 by source and DEV size-row count | 7–8 by source and DEV size-row count | Static call path plus DEV aggregate counts; not HTTP-measured |
| Effective-price RPCs on warm homepage cache hit | 0 while old whole-result cache hits | 7–8 on each current invocation | Source-confirmed call placement plus DEV aggregate counts; runtime timing not measured |
| Cold/warm latency, median/p95/max | — | — | BLOCKED |
| Underlying REST request latency | — | — | BLOCKED |
| Response bytes | — | — | BLOCKED |
| HTTP/SQL timeout rate | — | — | BLOCKED |
| Concurrent behavior | — | — | BLOCKED |
| Exact PostgREST query plan | — | — | BLOCKED; API unavailable here |
| Common raw-projection completeness/equivalence | — | — | BLOCKED |
| Full mapped category equivalence | Single direct category | Assignments may yield multiple categories | Not equivalent field set; no HTTP response comparison |

The two-call source path does not mean B necessarily makes two backend reads on every homepage response: the outer Next cache can avoid both requests on a cache hit; on an outer cache miss the membership request runs, while the nested 30-second root-cake cache may hit or miss. No cache hit/revalidation instrumentation was available in this run. For `listAvailableCakes`, the source does not wrap the entire membership-plus-root operation in the same homepage cache, so its request behavior differs. Do not generalize one path's request count to all catalogue surfaces.

There is a source-confirmed warm-hit increase in effective-price DB requests: the old cache contained effective prices, while the new code applies the same 7–8 per-size RPCs after the cache. This is evidence the October 22 refactor increased warm homepage database work. The cold path also adds a membership REST request and the B root query adds category-assignment data.

These changes plausibly add homepage latency and database pressure. They do not prove the `library_cakes` statement-timeout root cause: `library_cake_size_price_on` is a separate RPC, and no incident trace ties its calls to fingerprint `-3231686492694644454`. Direct A/B HTTP latency, response size, errors and query-time impact remain **UNKNOWN / INCONCLUSIVE**. A first failure near READY does not prove cold cache caused it; later failures hours later weaken that explanation.

## Query-plan boundary

The Supabase SQL connector can run read-only SQL as `anon`, but it cannot expose the exact SQL generated by PostgREST for the two HTTP requests. A hand-written SQL join or `EXPLAIN` would be an approximation and could not fairly isolate the embedded PostgREST relationship plan. No approximate plan was substituted. The supplied script captures client request time/bytes and status only; it cannot separate network, PostgREST and SQL time or provide the server query plan.

## Reproducible probe

Run from a network-connected Mac Terminal after using the DEV project's public anon/publishable key only. Do not use a service-role key. Read the key via a hidden prompt so it is not echoed or written to shell history:

```bash
cd ~/Desktop/project-flour/work/catalogue-query-ab-investigation-20261029
read -s -p 'DEV public anon/publishable key: ' SUPABASE_ANON_KEY; printf '\n'; export SUPABASE_ANON_KEY
export SUPABASE_URL='https://tzwtpxdcggesgjaqxkqr.supabase.co'
node scripts/diagnostics/catalogue-query-ab-20261029.mjs
unset SUPABASE_ANON_KEY SUPABASE_URL
```

The script uses 10 counterbalanced sequential A/B pairs followed by three parallel requests per architecture (40 REST requests maximum including the one collection-discovery request), each request capped at 8 seconds. It prints aggregate timings, bytes, status counts, common-field hashes, cake-order parity and category projection differences only. “First request” is not a guarantee of a database-cold cache. It does not exercise Next.js `unstable_cache`, Vercel multi-instance behavior, staff invalidation, or checkout. Any common-projection mismatch invalidates the latency comparison until explained. No automated retries are performed by the probe.

## Safety and actions not performed

- No storefront implementation file changed.
- No Production or hosted DEV writes, DDL, migration, RLS/index/role/config changes, orders, stock, checkout, payments, notifications, domain/alias changes, or deployment occurred.
- The DEV check read only minimal public catalogue metadata under role `anon`.
- No `EXPLAIN ANALYZE`, load test, REST request, or cache mutation was performed.
- Existing accepted branches, reports and recovery archives were preserved.

## Decision

**Causal conclusion: PARTIAL.** A source- and DEV-data-backed warm-hit request-count regression is confirmed: 7–8 effective-price RPCs run on each current homepage preview call, while the prior warm whole-result cache avoided those calls. The new cold path also makes two catalogue REST calls instead of one. Actual latency and any causal contribution to Production 57014 remain unmeasured; the refactor is not proven to cause the intermittent timeouts.

**Recommended correction to evaluate after the diagnostic:** reduce the repeated warm-hit effective-price reads while preserving date-sensitive freshness and explicit invalidation. A price cache is only safe after verifying the price-schedule actions invalidate it; the low-risk control is an isolated DEV experiment that compares the old cache boundary and current per-call RPC path while checking changed schedule visibility. Separately, measure A/B base query latency and exact result parity. No source fix is authorized by this experiment.

**Next action:** execute the committed bounded probe from a network-connected Mac Terminal using only the DEV public key. Review common-field parity, category differences and timing. Then verify price-schedule cache invalidation before recommending any cache-boundary change; obtain exact anonymous PostgREST plans/trace evidence before attributing the Production `57014` incidents.

## Investigation source commit

- GitHub branch: `codex/catalogue-query-ab-investigation-20261029`
- The GitHub branch head and local bundle commit are recorded in the external recovery manifest; the committed source trees match.
- Source changes are limited to this diagnostic report and the bounded DEV probe. No application behavior changed.
