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

The exact source-generated select strings and HTTP parameters are encoded in `scripts/diagnostics/catalogue-query-ab-20261029.mjs`. The probe compares the common projection by hash without printing cake names, prices, photo URLs, IDs or response bodies. It also records the actual B projection separately. It uses only the DEV public key in the `apikey` header, sends no user Authorization token, enforces the exact DEV host, and applies the same 8-second request budget. It does not alter data.

## DEV access evidence

- Supabase project metadata returned ref `tzwtpxdcggesgjaqxkqr`, status `ACTIVE_HEALTHY`, PostgreSQL 17.6.1.155, region `ap-southeast-1`.
- A read-only transaction with `SET LOCAL ROLE anon` reported `current_user=anon`, `transaction_read_only=on`; three collections were visible to that role.
- The three DEV collections had respectively 5, 5 and 6 available homepage memberships. This supplies representative public DEV data without reading business records.
- Production project, Production data, customer records and live domains were not queried or modified for this experiment.
- The failed direct-network checks stopped at name resolution; no anonymous REST request was sent. The direct SQL check is not a substitute for an HTTP/PostgREST A/B measurement.

## Results and interpretation

| Measure | A — old embed | B — refactor | Status |
|---|---:|---:|---|
| REST calls on a direct uncached request | 1 by source shape | 2 by source shape (membership, then root cakes) | Static source count only; no request observed |
| Cold/warm latency, median/p95/max | — | — | BLOCKED |
| Underlying REST request latency | — | — | BLOCKED |
| Response bytes | — | — | BLOCKED |
| HTTP/SQL timeout rate | — | — | BLOCKED |
| Concurrent behavior | — | — | BLOCKED |
| Exact PostgREST query plan | — | — | BLOCKED; API unavailable here |
| Common-projection completeness/equivalence | — | — | BLOCKED |

The two-call source path does not mean B necessarily makes two backend reads on every homepage response: the outer Next cache can avoid both requests on a cache hit; on an outer cache miss the membership request runs, while the nested 30-second root-cake cache may hit or miss. No cache hit/revalidation instrumentation was available in this run. For `listAvailableCakes`, the source does not wrap the entire membership-plus-root operation in the same homepage cache, so its request behavior differs. Do not generalize one path's request count to all catalogue surfaces.

The failed test environment establishes neither that B is slower nor that B causes the intermittent Production 57014 failures. The historical failures and 57014s remain confirmed, but whether this October 22 refactor measurably worsens reliability remains **UNKNOWN / INCONCLUSIVE**. The first observed event close to a deployment-ready timestamp is not enough to attribute it to a cold cache; later incidents occurred hours later. No source-level fix or release recommendation follows from this unexecuted probe.

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

The script uses 10 counterbalanced sequential A/B pairs followed by three parallel requests per architecture (45 REST requests maximum including the one collection-discovery request), each request capped at 8 seconds. It prints aggregate timings, bytes, status counts and SHA-256s only. “First request” is not a guarantee of a database-cold cache. It does not exercise Next.js `unstable_cache`, Vercel multi-instance behavior, staff invalidation, or checkout. Any A/B common-projection mismatch invalidates the latency comparison until explained. No automated retries are performed by the probe.

## Safety and actions not performed

- No storefront implementation file changed.
- No Production or hosted DEV writes, DDL, migration, RLS/index/role/config changes, orders, stock, checkout, payments, notifications, domain/alias changes, or deployment occurred.
- The DEV check read only minimal public catalogue metadata under role `anon`.
- No `EXPLAIN ANALYZE`, load test, REST request, or cache mutation was performed.
- Existing accepted branches, reports and recovery archives were preserved.

## Decision

**Causal conclusion: INCONCLUSIVE.** The refactor changes both query architecture and projections/caching; there is a statically visible extra membership request on a cold homepage path and a larger root projection, but no measured latency, response-size or reliability delta. This is not enough to classify the refactor as a regression or to recommend reverting it.

**Next action:** execute the committed bounded probe from a network-connected Mac Terminal using only the DEV public key. If it passes network access, review the equivalence hashes and then use authenticated DEV observability to obtain query plans for the same anonymous calls. Until those results exist, retain the current source and do not claim a performance fix or regression.
