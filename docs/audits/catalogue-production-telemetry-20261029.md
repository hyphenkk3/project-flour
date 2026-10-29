# Project Flour — Production catalogue telemetry review

**Review date:** 2026-10-29  
**Production project:** `cuowwlduhxxifmpvpltt`  
**Production deployment observed:** `dpl_66qLpJLTdJdZZkFKqPQfn5MmHGkG`  
**Scope:** bounded, read-only telemetry and source review; no implementation or deployment.

## Executive finding

The intermittent catalogue failure is real in the sampled Production window: the `library_cakes` REST endpoint returned 39 HTTP 500 responses among 324 sampled requests, and the database log stream contained 71 `57014` statement-timeout log records for the known catalogue query fingerprint across 38 Postgres sessions. This establishes repeated timeouts in the same query family, but not a complete causal chain from each browser request to a particular Postgres cancellation.

The strongest burst occurred at 03:12–03:14 UTC (11:12–11:14 MYT). It included all 31 sampled `library_cakes` 500s for the 03:00–04:00 hour, 34 known-fingerprint timeout records, and heavy/occasionally slow effective-price RPC traffic. A counterexample at 04:17 UTC had three catalogue 500s and 36 timeout log records while the price RPC had zero calls; only two timeout records in that minute had the known catalogue fingerprint. Pricing work may add load during some bursts, but is not shown to be necessary or sufficient to cause failures.

Available evidence does not establish whether the underlying trigger is query execution variance, PostgREST/pool contention, or platform resource pressure. The current database snapshot was quiet, but it was taken after the incident window. Historical CPU, memory, I/O and pool-wait time series were unavailable. **No code or configuration correction is justified by this evidence alone.** Keep the application behavior unchanged while asking Supabase to correlate gateway, PostgREST, pool and database execution telemetry for the exact windows below.

## DEV A/B experiment preserved

The measurement record is in [`measurement-summary.json`](../experiments/catalogue-single-request-experiment-20261029/measurement-summary.json). It records the user-provided sanitized Terminal result, not reconstructed raw output.

| Measure | A: two REST requests | B: one embedded request |
|---|---:|---:|
| Paired sequential samples | 30 | 30 |
| Median total HTTP latency | 137.533 ms | 146.351 ms |
| p95 total HTTP latency | 210.867 ms | 236.727 ms |
| REST requests per flow | 2 | 1 |
| Three-flow aggregate elapsed | 198.035 ms | 267.077 ms |
| Underlying REST calls in that group | 6 | 3 |
| HTTP failures / timeouts | 0 / 0 | 0 / 0 |

Full tested projection parity passed; both common-projection hashes were `4ccff2e6143ebfac1f13a91a2930ebc4e24097e140d071d9925c2a9ed1c75d38`. Category assignment/order and empty/excluded fixture checks passed. Total sampled statuses were 114 HTTP 200 and three HTTP 406 from optional query-plan requests. No plan was obtained. The single-request version reduced HTTP round trips but had 6.41% higher median and 12.25% higher p95 sequential latency, plus 34.86% higher elapsed time in the one small concurrency group. This does not justify implementation on performance grounds. It does not test SQL execution or Production.

The full original sanitized JSON was not present in the local preserved checkout or supplied in full. This report therefore preserves all supplied summary fields and explicitly leaves maximum latency and response-byte values unknown. It does not claim a complete raw-output archive.

## Production observation window and methods

- Exact six-hour gateway sample: **2026-10-28 23:00:00 to 2026-10-29 05:00:00 UTC**.
- One database activity/settings/statistics snapshot was collected around **2026-10-29 05:09 UTC**.
- Aggregations used request path, response status, origin time and minute/hour buckets; database logs were grouped by query ID and session ID. Customer rows, request payloads, JWTs, keys and personal data were not queried or included.
- `response.origin_time` is gateway-observed upstream elapsed time. It is not a measurement of SQL execution alone.
- The log sources do not provide a common request ID across gateway, PostgREST and Postgres, so minute-level alignment is correlation, not request-level proof.

## Gateway request and duration results

| Path/status | Count | Median origin time | p95 | Maximum | >=1 s | >=5 s |
|---|---:|---:|---:|---:|---:|---:|
| `/rest/v1/library_cakes` HTTP 200 | 285 | 396 ms | 2,275.8 ms | 36,815 ms | 56 | 9 |
| `/rest/v1/library_cakes` HTTP 500 | 39 | 5,292 ms | 38,180.6 ms | 41,551 ms | 39 | 24 |
| `/rest/v1/rpc/library_cake_size_price_on` HTTP 200 | 3,244 | 40 ms | 1,435.3 ms | 7,851 ms | 199 | 51 |

The catalogue endpoint failure rate in this bounded sample was 39/324, about **12.0%**. These are sampled logs, not all-time counts. An endpoint-level gateway 500 does not, by itself, identify which SQL statement or internal stage failed.

### 03:00–04:00 UTC concentration

| Path/status | Count | Median origin time | p95 | Maximum | >=1 s | >=5 s |
|---|---:|---:|---:|---:|---:|---:|
| `library_cakes` HTTP 200 | 75 | 501 ms | 3,927.3 ms | 7,688 ms | 16 | 3 |
| `library_cakes` HTTP 500 | 31 | 5,292 ms | 8,893.5 ms | 9,386 ms | 31 | 17 |
| effective-price RPC HTTP 200 | 851 | 78 ms | 2,907.5 ms | 7,851 ms | 113 | 29 |

### Incident-minute correlation

| UTC minute | Catalogue 500 / 200 | PG `57014` log records | Known catalogue fingerprint records | Price RPC requests and max origin time |
|---|---:|---:|---:|---:|
| 03:12 | 7 / 10 | 15 | 13 | 163; max 7,851 ms |
| 03:13 | 10 / 5 | 14 | 9 | 132; max 7,727 ms |
| 03:14 | 14 / 4 | 17 | 12 | 63; max 2,786 ms |
| 04:17 | 3 / not reported in the targeted summary | 36 | 2 | 0 |

At 03:12–03:14, 34 of 46 timeout log records carried the known query fingerprint. This is strong temporal alignment, but missing shared request identifiers prevents one-to-one causality claims. The 04:17 observation is a counterexample to the claim that effective-price RPC traffic is required for catalogue failures: there were no price RPC calls in that minute, and most timeout records were for other fingerprints. Some minute aggregates varied between broad and narrow log queries around 03:15; the stable hourly totals are used above, and no exact 03:15 total is asserted.

Across the six-hour database log sample, there were **131 log records containing `57014` text**, not 131 proven unique cancellations. Grouped by parsed query ID:

| Query ID | `57014` log records | Distinct Postgres sessions |
|---|---:|---:|
| `-3231686492694644454` (known catalogue fingerprint) | 71 | 38 |
| `3404083406190130880` | 26 | 10 |
| `2390791806907817211` | 24 | 10 |
| `2553949137091695660` | 5 | 4 |
| Other query IDs | 5 | not summarized |

All 71 records for the known catalogue fingerprint included statement-timeout text. Its first and last sampled records were 2026-10-28 23:43:59.826 UTC and 2026-10-29 04:17:25.122 UTC. A log record is not necessarily a unique user request; sessions and statement logging semantics do not establish a one-to-one mapping.

Other time-aligned observations: at 00:15 UTC, 11 known-fingerprint timeout records coincided with one `library_cakes` HTTP 200 at 7,940 ms and three price RPC calls (maximum 2,376 ms). At 00:44 UTC, nine known-fingerprint timeout records coincided with six catalogue HTTP 200s (maximum 7,458 ms) and 38 price RPC calls (maximum 7,800 ms), without a catalogue 500 in that minute.

## PostgREST, pool and database evidence

- In the broader 23:07–05:07 PGRST log slice, 953 records were sampled; 628 matched the text `timeout manager` and 746 matched `timeout`. These are message-text matches, not counts of unique timed-out requests. The raw messages do not establish whether every match means a request was canceled, nor provide common IDs linking the gateway to a database session.
- The phrase `timeout-manager` with a hyphen returned zero matches; logs use the spaced phrase in the inspected search. No direct request-level correlation was available.
- About 174 PgBouncer log records were available. Search-word matches included 13 `timeout`, 18 `connection`, and zero `wait`, `pool`, or `error`. Keyword counts do not prove or rule out saturation; historical pool wait/worker metrics were unavailable.
- The approximately 05:09 UTC `pg_stat_activity` snapshot showed 23 backends, one active client backend (likely the read-only observer), zero lock waits, zero idle-in-transaction sessions and no other active query. This was after the incident burst and is not evidence about historical pressure.
- Current settings: global `statement_timeout=120000 ms` from configuration; `lock_timeout=0`; idle session/transaction timeouts were zero. Current role settings: `anon=3 s`, `authenticated=8 s`, `authenticator=8 s`. These are current observations, not proof that settings were identical at incident timestamps.
- Current cumulative `pg_stat_statements` data reset on 2026-09-27 19:59:34 UTC and is not incident-window-specific. For the known catalogue query ID, one entry showed 1,660 calls, mean 20.72 ms, max 1,236.56 ms, 158,640 shared-buffer hits, zero shared reads and zero temp blocks; another entry for the same ID showed 57 calls, mean 3.55 ms, max 19.19 ms. Role/database attribution was not returned. These cumulative fast averages do not refute rare stalls.
- The normalized pricing RPC statement had two cumulative entries: 57,792 calls, mean 8.77 ms, max 2,803.90 ms and 30,674 calls, mean 5.30 ms, max 720.66 ms (88,466 combined calls, weighted average about 7.57 ms since reset). These entries do not identify the sampled six-hour requests or their callers. The gateway timing tail demonstrates that some HTTP RPC requests are slow end-to-end; SQL time cannot be separated with these data.
- No historical CPU, memory, I/O, database saturation, pool wait, worker utilization, or incident-window query-plan telemetry was available. No Production `EXPLAIN ANALYZE` was run.

The sampled catalogue gateway maximum of 41.551 s is much longer than the current `anon` 3 s setting. This suggests that gateway elapsed time includes waiting or other stages beyond one timed-out SQL execution, or that multiple operations/attempts are involved, but the logs do not establish which. Do not infer retries or queueing from this duration alone.

## Effective-price RPC source analysis

Source inspection of the Production-baseline-equivalent code identifies a per-size RPC pricing path:

- `src/workspaces/storefront/catalog/queries.ts:771-804` implements `withEffectiveStorefrontPrices`: one `library_cake_size_price_on` RPC per cake size, issued in batches with up to six concurrent calls.
- `src/workspaces/storefront/catalog/queries.ts:1025-1030` calls that wrapper after `readCachedHomepageCollectionPreviewCakes`. Therefore a warm cached homepage display-catalogue read does not, by itself, eliminate per-size price RPCs on a new render.
- `src/workspaces/storefront/home/StorefrontHomePage.tsx:351` loads featured collection previews concurrently. The earlier source trace estimated roughly 7–8 price RPCs for the observed warm-homepage shape; this is a code-path estimate, not a route-correlated HTTP measurement.
- Browse calls `listBrowsePublishedCakes` (`queries.ts:1470-1474`), cake detail calls the same wrapper for the selected cake (`queries.ts:1799-1830`), and collection pages request current effective prices (`queries.ts:1042` and `src/workspaces/storefront/home/StorefrontCollectionCakesPage.tsx:109`).
- Checkout/date-specific resolution is separate in `src/workspaces/storefront/checkout/actions.ts:825-852`, with one RPC per unique size ID for the selected pickup date. This report does not claim that the display helper is the final authoritative order-submission validation; order submission logic was not changed or exercised.

The 851 price RPC calls/hour in the high-error hour and 3,244 in six hours show volume. The long-tail gateway timings show some RPC HTTP requests take seconds. Logs do not expose page-route attribution, request-to-caller mapping, unique visitor counts, or SQL cost per route. Thus it is not possible to calculate “RPCs per homepage visit” from Production telemetry here. The source code supports the mechanism of repeated per-size calls; it does not establish that the RPCs caused the catalogue errors.

## Ranked hypotheses

| Hypothesis | Assessment | Evidence for | Evidence against / missing |
|---|---|---|---|
| Intermittent execution timeout in the `library_cakes` query family | **CONFIRMED event; cause UNKNOWN** | 71 `57014` log records / 38 sessions with the known fingerprint; aligned 03:12–03:14 burst; 39 catalogue 500s in six hours | No exact edge request-to-session join; no incident execution trace or plan |
| Shared PostgREST/DB contention during the 03:12–03:14 burst | **POSSIBLE** | Catalogue 500s, fingerprint cancellations and slow/high-volume price RPCs overlap by minute; other REST traffic also existed | No historical CPU, pool wait, worker saturation, locks or resource time series; timing alone cannot prove contention |
| Effective-price RPCs contribute to load in some windows | **POSSIBLE** | 3,244 successful requests; 851 in the high-error hour; 51 over 5 s in six hours; source invokes one per size and can fan out | HTTP 200 and latency do not reveal DB cost; 04:17 failures occurred with zero price RPCs; no route/request attribution |
| Intrinsically heavy catalogue SQL / missing index | **UNKNOWN; no evidence to support a change** | Nested PostgREST relationship query is complex; rare statement timeouts occurred | Cumulative known-query stats are usually fast, zero shared reads in one entry, key indexes had previously appeared present; no incident plan; no current evidence showing missing indexes |
| Deployment/cold-cache concurrency as the sole cause | **POSSIBLE but insufficient** | Cache misses can cause multiple readers; application cache revalidation failures were observed | Errors recur hours after deployment and at 04:17; no deployment-time request concurrency metrics; no evidence tying all incidents to cold start |
| Lock contention / connection pool exhaustion | **UNKNOWN, not demonstrated** | Timeout-manager and PgBouncer log text exists | No historical lock/pool state; one post-window snapshot was quiet; sampled keyword matches are not saturation metrics |
| One-request embed necessarily improves reliability | **NOT SUPPORTED by DEV sample** | It halves REST calls per flow and preserved parity in the bounded DEV probe | Median/p95 and small concurrency group were slower; does not measure SQL cost or intermittent stalls |

## Next corrective action

Escalate the exact telemetry request to Supabase Support before changing query architecture or price caching. Ask Supabase to correlate the incident windows with provider-side request-to-session traces and provide: (a) request-level PostgREST queue/worker wait versus SQL runtime, (b) connection-pool acquisition/wait and pooler saturation, (c) database CPU/memory/I/O and resource pressure, (d) the cancellation source and effective role/session timeout at the time, and (e) matching request IDs for gateway 500s, PGRST timeout-manager events and the query ID. Include UTC windows 2026-10-29 03:12–03:15 and 04:17, endpoint `/rest/v1/library_cakes`, fingerprint `-3231686492694644454`, and the bounded count/duration results above. Do not include tokens, keys, customer data, payloads, or personal information.

A source-level experiment should be selected only after the missing telemetry identifies a mechanism. The current DEV A/B supports lower HTTP request count but not lower latency or lower SQL work. Avoid price caching, timeout increases, retries, query replacement, RLS changes, or index changes on this evidence alone.

## Safety and release state

- No Production or DEV writes, migrations, DDL, RLS/settings changes, deployments, promotions, aliases, order, payment, stock or customer modifications were performed in this phase.
- Production domains remain read-only verified on deployment `dpl_66qLpJLTdJdZZkFKqPQfn5MmHGkG`.
- The A/B test used anonymous read-only DEV requests only; it did not create test data.
- The Production incident review used bounded logs, catalog/settings/statistics reads and one activity snapshot. The SQL endpoint reported `transaction_read_only=off`; no write statements were issued. This limits the claim to read-only actions by content, not server-enforced read-only mode.
- No application change or Production release is recommended from this telemetry alone.
