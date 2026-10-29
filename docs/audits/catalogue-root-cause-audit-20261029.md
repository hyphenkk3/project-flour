# Project Flour catalogue instability — root-cause audit

Audit date: 2026-10-29, Asia/Kuching (UTC+08:00). Scope: read-only source, deployment, Supabase logs and database metadata. No application, database, configuration or deployment changes were made.

## Executive conclusion

Production shows two distinct failures:

1. PostgreSQL canceled statements for fingerprint -3231686492694644454 with SQLSTATE 57014. Supabase Edge recorded GET /rest/v1/library_cakes HTTP 500s in those same windows. At 09:30 UTC the live Vercel application also logged the database timeout text. This confirms slow executions of this public catalogue query sometimes reach the database statement-timeout path.
2. The application has its own 8-second AbortSignal timeout and logs TimeoutError when that deadline expires. On 2026-10-29 00:44 UTC, application timeouts and PostgreSQL cancellations occurred within the same second, but there is no shared request/trace ID proving they were the same individual request.

The audit cannot establish why the query sometimes takes seconds although completed query statistics are normally fast. Current catalogue tables contain only tens of rows, expected primary/foreign-key indexes exist, and a later point-in-time pg_locks snapshot had zero ungranted locks. Completed query statistics show no shared reads or temporary writes. However historical CPU, memory, I/O, pooler occupancy, PostgREST worker state and per-request plans were unavailable. Resource pressure, plan instability, RLS subquery cost and cache-miss concurrency therefore remain possible but unproven.

The clearest application-side candidate is the 2026-10-22 query refactor: collection/home display code began fetching membership IDs separately and then querying library_cakes by IDs with nested category, assignment, tag, size and photo embeds, cached for 30 seconds. This is the query family associated with the failing fingerprint. It predates the first retained DB timeout by several days and is present in the earlier 0e4007f source. It is a probable contributor, not a proven cause. The later live release d5a2914 did not change catalogue query source; its direct commit concerns only new-order name formatting. No evidence attributes the timeouts to that feature.

No single root cause is proven. The candidate source changes on DEV reduce identical in-process cold reads and remove an added second 8-second wait. They do not prove the DB issue is resolved. No Production promotion, rollback, database write, migration or configuration change was performed.

## Source and deployment preservation

GitHub API commit reads independently verified these four owner-provided commits in hyphenkk3/project-flour:

| Reference | Verified SHA | Finding |
|---|---|---|
| Earlier Production baseline | 0e4007fbd7f603acd4b00b979661fcc27e072afb | Reachable on GitHub; catalogue query present |
| Current live Production source | d5a29146958556a5a8910cb30001527c363f4124 | Reachable; no catalogue query changes versus 0e4007f |
| Initial stabilization | 23bb7d036cb958f2a79e5e2cee898c823718089f | Reachable; adds in-process public-read coalescing and bounded 57014 retry |
| Latest DEV refinement | 910d9f37eac9db330432c13022e969f034fa321b | Reachable; removes retry of the separate app-generated TimeoutError |

The active Production deployment was read as READY: dpl_66qLpJLTdJdZZkFKqPQfn5MmHGkG, SHA d5a29146958556a5a8910cb30001527c363f4124, project prj_3rmlAQzLSFOi15DEGczSuDYDq8xr, region sin1. Its deployment-alias listing includes whitebird.asia and www.whitebird.asia (plus the project alias). Application rollback remains dpl_AQdJv7YhMrkK7D9ePYoAyhMV1Vt4.

The permanent DEV branch codex/catalogue-timeout-recovery-20261029 is recorded at GitHub SHA 910d9f37eac9db330432c13022e969f034fa321b. The preserved local source commit b2be85106efa3efc102773ac338fa922a1e66d8b has the identical tree 6f9112f4d834687ea0459063fc079a89de02ff2d; its commit metadata differs because the GitHub connector created a separate equivalent commit. The existing recovery manifest documents this. The new audit branch is documentation-only.

## Incident timeline

Times are Malaysia time (MYT, UTC+08:00) and UTC. Earliest observable means earliest retained, verified record, not necessarily onset.

| MYT / UTC | Deployment or source | Observation | Interpretation |
|---|---|---|---|
| Oct 22 22:42 MYT / Oct 22 14:42 UTC | Commit 4bca39e188752693c06fe65d5b67b803db0c5200 | Query refactor: fetch collection membership IDs, then fetch those cake IDs from root library_cakes with nested embeds; cache display result for 30s. | Concrete source change that created the later root-table query family; no performance data from that date. |
| Oct 24 16:07 MYT / 08:07 UTC | Commit 0973b1277bbb41216e9c890cc70f63970dd00b46 | Removed redundant direct-category embed when assignment embeds are present. | Query simplification. |
| Oct 24 16:59 MYT / 08:59 UTC | Commit 6d54d5c544ba9e27bc0117080df0d3a81bd4fb1a | Restored direct-category embed as a compatibility/baseline path. | Reintroduced one relationship; causal effect unknown. |
| Oct 27 16:42 MYT / 08:42 UTC | dpl_AQdJv7YhMrkK7D9ePYoAyhMV1Vt4, SHA 0e4007f... | Production-target deployment READY. | Query path already present; previous known-good timings are unavailable. |
| Oct 28 12:39:55 MYT / 04:39:55 UTC | dpl_66qLpJLTdJdZZkFKqPQfn5MmHGkG, SHA d5a2914... | Deployment created; READY 12:41:06.777 MYT / 04:41:06.777 UTC. | Release changes files outside catalogue query source. |
| Oct 28 12:41:12–12:41:30 MYT / 04:41:12.521–04:41:30.423 UTC | Live dpl_66q... | Six library_cakes Edge 500s and six Postgres 57014 cancellations, fingerprint -3231686492694644454. Failed Edge origin median 12.091s, p95 21.544s; successful 200 median 0.433s, p95 0.605s. PostgREST sample: 28 timeout-manager messages and six 57014 mentions. | First confirmed DB timeout cluster, about six seconds after deployment READY. Timing is notable but query source did not change in d5. |
| Oct 28 17:08:16 MYT / 09:08:16.799–09:08:16.974 UTC | Live dpl_66q... | Three same-fingerprint 57014 cancellations and three Edge 500s. Failure median 4.204s, p95 4.288s; success median 0.270s, p95 1.850s. PostgREST sample: 24 timeout-manager messages, three 57014 mentions. | Recurrence hours later weakens a one-time cold-start explanation. |
| Oct 28 17:30:30–17:30:44 MYT / 09:30:30.903–09:30:44.245 UTC | Live dpl_66q... | Vercel /login logged app TimeoutError; /order logged statement-timeout errors for homepage-popular and homepage-collection reads. Supabase had two same-fingerprint 57014s at 09:30:43.472–43.590 UTC and two Edge 500s (failed origin median 3.696s, p95 3.707s). | Both mechanisms directly observed in the same minute; no trace join proves request identity. |
| Oct 29 08:44:28–08:44:58 MYT / 00:44:28.612–00:44:58.585 UTC | Staged dpl_6pAh..., SHA 23bb7d0... | Nine same-fingerprint 57014 cancellations. At 00:44:58.407 and .625, Vercel logged app 8-second aborts for GET /order/collection/<id> and GET /. Edge had 13 successful library_cakes reads (median 0.820s, max 7.458s) and no library_cakes 500 in that two-minute sample. | Shows the app abort boundary and DB cancellations can occur in the same interval; no common ID establishes they are the same request. |

Earliest retained database failure is Oct 28 04:41 UTC. Aggregated Vercel error records contain older timeout clusters dating to September, but they do not establish the onset of this exact catalogue incident. No evidence supports a claim that all traffic was reliable until this first 57014.

## Application source and behavior comparison

### Query architecture before the first incident

Commit 4bca39e on Oct 22 changed collection listing from one collection_cakes relationship query embedding cakes to two stages: (1) read available collection cake IDs/order, then (2) read root library_cakes rows using an ID filter and nested category, category-assignment, tag-assignment, size and photo relationships. Homepage collection previews use a similar split. The display read is stored in Next unstable_cache with sorted ID-set key, 30-second revalidation and catalogue tags. This may reduce duplicated display payload work and enable cache reuse, but it changes the root PostgREST query and adds an extra REST request to the collection flow. Its latency effect was not measured when introduced.

Oct 24 commits removed and then restored the direct category relation. Current 0e4007f/d5a2914 source includes that direct relation in addition to assignments/tags/sizes/photos.

### Live source versus stabilization

Source diff 0e4007f to d5a2914 contains no changes in storefront catalogue/home/collection query code. The d5a2914 commit directly changes six files for new-order name formatting. It is not a demonstrated query regression.

Commit 95985ec (represented later by 23bb7d0) added in-process coalescing for identical public cake reads and at most one retry for a recognized SQL statement-timeout error. This was not live in d5a2914. It can reduce duplicate identical cold reads within one process; no cross-instance Vercel evidence exists.

Intermediate commit 155a604 added a retry for the app's own internal TimeoutError, making a persistent 8-second abort wait about 16 seconds. Synthetic results measured 16,138ms/two fetches. Latest DEV refinement 910d9f3 removes that retry and retains the separate one-time 57014 retry. Neither stabilization commit is Production.

### Timeout, cache and page behavior

- Public Supabase fetch has an 8,000ms AbortSignal timeout (DATA_FETCH_TIMEOUT_MS).
- Current database settings: global statement_timeout 120,000ms; role settings anon=3s, authenticated=8s, authenticator=8s; no relevant public-function proconfig override found. Anonymous browser catalogue reads likely execute as anon and therefore use the 3-second role setting. Historic values at incident times are unknown.
- PostgREST timeout-manager records are separate platform messages. Their counts exceed the SQLSTATE counts; no request-level correlation was exposed.
- Display cache is 30 seconds with tagged invalidation. Checkout uses separate session-aware reads and authoritative price/availability/order RPC paths; display cache is not the source of order eligibility or current price.
- HomeHero is outside separately suspended Fresh Picks and merchandising sections. A failed optional section should not hold the hero, but section content can remain in a fallback or unavailable state. Collection cake content is behind its own loading boundary and can remain pending.
- The app has no tested guarantee that an expired cache entry is served stale after refresh failure; this audit does not assume stale-on-error.
- Staff polling was changed in 0e4007f to pause in hidden tabs, reducing fallback reads while hidden. Historical total staff traffic was not available.
- Installed Next.js 16 docs state unstable_cache persists results across requests and deployments and invokes its callback on cache miss/revalidation. Actual cache-hit, revalidation and failed-refresh serving behavior was not measured under this deployment.

## Database and PostgREST evidence

### Request/query

Sanitized Edge logs show GET /rest/v1/library_cakes filtered by an ID set of five to six cakes. The select includes a small cake row and nested direct category, category assignments with categories, tag assignments with tags, sizes/pricing-date fields, and photos/display fields. Postgres logs show PostgREST-generated lateral joins, row_to_json and JSON aggregation. Full normalized SQL was truncated in retained logs; fingerprint is -3231686492694644454.

### Completed-query statistics and data volume

Current read-only pg_stat_statements rows for the fingerprint:

| Role | Calls | Mean | Max | Shared blocks hit/read | Temp blocks written |
|---|---:|---:|---:|---:|---:|
| anon | 1,623 | 20.69 ms | 1,236.6 ms | 154,779 / 0 | 0 |
| authenticated | 54 | 3.52 ms | 19.2 ms | 913 / 0 | 0 |

Statistics reset at 2026-09-27 19:59 UTC. These are cumulative completed statements, not incident-time distributions; canceled statements may not be represented.

Current aggregate counts: 23 library cakes, 10 categories, 35 category assignments, 5 tag assignments, 32 sizes and 32 photos. These small counts argue against sheer catalogue growth as the likely cause. They are current, not historical.

### Indexes, RLS and plans

- Root library_cakes.id filter has a primary-key index. Catalog inspection found relationship indexes for category, category assignments, tag assignments, sizes and photos. No obvious absent PK/FK join index was established.
- Public select policies exist on relevant relations. library_cakes has public policies for history, active collection, live browse and popular cakes. photos and sizes have policies with correlated EXISTS predicates for history/collection/browse/popular. Such policy evaluation can add work beneath embeds but no plan demonstrates that it dominates.
- Several relation statistics were last analyzed late September/early October. Tables are tiny; no incident-time plan or estimate proves stale statistics were causal.
- No EXPLAIN ANALYZE, Production load test, schema/write/index/RLS/config change was run. A representative query plan under the true anon role and RLS was not obtained.

### Resource health and history

Current project metadata: ACTIVE_HEALTHY, PostgreSQL 17.6.1.166, region ap-southeast-1. Vercel function region sin1 is nominally colocated. A later point-in-time activity/locks snapshot had no waiting locks; it cannot prove there was no historical contention. Sampled PgBouncer logs contained no pool-timeout keywords, but coverage is not enough to rule out pool pressure. Historical CPU, memory, I/O, connection occupancy and PostgREST worker telemetry were unavailable. Project health is a current summary, not an incident trace.

Relevant catalogue schema migrations for categories, tags, photos, browsing and sizes/prices accumulated from early September into October. The manually executed Oct 27 compatibility migration changed complimentary-entitlement/order RPCs and a helper; it did not change library_cakes reads, their indexes/policies or data.

## Distinguishing timeout mechanisms

| Mechanism | Evidence | Meaning | Correlation limits |
|---|---|---|---|
| PostgreSQL 57014 | Explicit log “canceling statement due to statement timeout” for the fingerprint | Database canceled a statement after its effective budget | Strongly correlated with library_cakes Edge 500s; no shared request ID for exact pairing |
| PostgREST timeout manager | “Thread killed by timeout manager” messages in the same windows | API worker deadline/cancellation activity | Aggregate counts are larger than DB cancellations; exact relationship is unknown |
| Application timeout | Vercel TimeoutError; source sets 8-second abort | Next.js stopped waiting for an HTTP call | Can race database cancellation or be independent; Oct 29 timestamps are near each other but not trace-linked |

Edge origin duration is not PostgreSQL execution duration; it includes API/network/runtime time and may exceed current role timeout.

## Quantitative comparison and limits

### Hosted windows

Successful library_cakes 200s had medians 179–433ms in Oct 28 sampled windows, while failed-request origin medians were about 3.7–12.1s. The Oct 29 sample had 13 successful reads (median 820ms, max 7.458s) and nine DB cancellations but no Edge 500 in the two-minute slice. This is bounded log evidence, not a stable service percentile; no production load test was run.

### Deterministic synthetic fetch measurements

Existing fake-fetch tests used an 8-second per-attempt timeout. They measure app timeout policy and fetch-call counts, not database execution:

| Scenario | Elapsed | Underlying fetches |
|---|---:|---:|
| Fast success | 15ms | 1 |
| Eight independent cold reads, no in-process dedupe | 8,052ms | 8 |
| Eight identical cold reads coalesced, one timeout | 8,135ms | 1 |
| Intermediate retry source, persistent app timeout | 16,138ms | 2 |
| Intermediate source, timeout then success | 8,134ms | 2 |
| Latest DEV refinement, internal timeout (accelerated 80ms test) | 82ms | 1 |
| Latest DEV refinement, next request succeeds | 0ms | 1 |
| Latest DEV refinement, 57014 then retry success | two underlying reads | 2 |

Latest source retains the 30-second cache. This shows bounded code behavior only, not database performance, cross-instance Vercel concurrency, or a Production root-cause fix.

## Ranked causes

| Candidate | Classification | Evidence and limitation |
|---|---|---|
| Intermittent slow nested library_cakes read canceled by DB statement timeout | CONFIRMED proximate failure; root cause unknown | Same fingerprint and explicit 57014 align with Edge 500s. Why execution slows is unknown. |
| Oct 22 root library_cakes + nested embed/cache architecture | PROBABLE contributor, unproven | Source change creates failing query family and extra collection REST read; no before/after runtime or plan data. |
| PostgREST lateral JSON aggregation and RLS EXISTS subqueries amplify plan cost | POSSIBLE | Query shape/policies support plausibility; no anon-role plan proving material overhead. |
| Transient database resource or pool pressure | POSSIBLE | Intermittency and timeout logs; no historical CPU/memory/I/O/pool/worker data. |
| Cache cold-start/stampede at d5 promotion | POSSIBLE, not sufficient alone | First cluster begins ~6s after READY; recurrences hours later and next day; no cache-miss trace. |
| d5 name-formatting/UI changes caused catalogue regression | RULED OUT at source-diff level | Catalogue query files unchanged; d5 direct commit changes only new-order name paths. |
| Large current catalogue volume or missing obvious relationship index | NOT SUPPORTED / unlikely | Current counts 5–35 related rows and expected indexes; historical counts/plans missing. |
| 60-second cache alone fixes 57014 | NOT ESTABLISHED | Synthetic 30s vs 60s reduced timed reads from 3 to 2 over 65s, but not eight simultaneous cold reads; no hosted DB-call telemetry. |

## Correction plan (not implemented)

1. Ask Supabase Support for incident-time plan/runtime and effective role settings for fingerprint -3231686492694644454 at 2026-10-28 04:41, 09:08, 09:30 UTC and 2026-10-29 00:44 UTC; CPU/memory/I/O, pooler occupancy, worker/timeout-manager and query traces. Include no cake IDs, customer data, tokens or keys.
2. In DEV, reproduce the exact request as anon with RLS. Capture a non-ANALYZE plan first; use representative DEV catalogue rows only. Compare one embedded relationship at a time and response size/latency.
3. If plan evidence shows policy/embed cost, reduce only demonstrated unnecessary fields/relationships or split public-role reads; compare inclusion, ordering, categories, tags, sizes and photos exactly.
4. Keep in-process dedupe as a bounded optimization, not a root-cause claim; it does not cross Vercel instances or speed up one slow SQL statement.
5. Do not increase timeouts, weaken RLS, add indexes or use privileged clients without evidence.
6. Define release success before implementation: cold/warm timings, failure/recovery, RLS parity, exact product/display equivalence and no 500/57014 over an adequately bounded observation. One HTTP 200 is insufficient.

## Actions not performed

No Production or DEV business data was modified; no customer/order/payment/stock rows were read; no Production DDL, migration, index, RLS, role, config or credential change; no EXPLAIN ANALYZE, load test, checkout, synthetic order, notification, deployment, promotion, alias movement, code fix or cache-duration change; no prior bundle or manifest was overwritten.

## Audit revalidation on a clean restored checkout

The clean detached bundle-restore checkout (source tree 6f9112f4d834687ea0459063fc079a89de02ff2d) reran seven focused scripts on 2026-10-29 using Node 26.5.1 TypeScript stripping. All passed: public cake read coalescing/invalidation/retry; timeout budget; homepage catalogue failure isolation; homepage streaming; storefront query recovery; cart-size validation query boundaries; and catalogue promotions. No source files were changed by these runs.

The exact latest DEV source SHA 910d9f37eac9db330432c13022e969f034fa321b had a READY Vercel optimized build with compilation and TypeScript completion recorded in the pre-existing refinement manifest. Local tsc and scoped ESLint had previously stalled without output; ESLint remains unverified in this audit and is not reported as a pass. The seven focused regressions are actual local executions on the restored source tree.
