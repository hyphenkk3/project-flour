# Project Flour — Phase 7 Incident Diagnostics

**Scope:** on-demand incident evidence design and replay of retained Production logs. Read-only; no application, database, configuration, deployment, domain, or monitoring changes.

## Result

The collector can summarize a bounded set of Supabase and Vercel log results while distinguishing log rows from deduplicated requests/events. It cannot continuously watch for an incident; no recurring monitoring was started. Collection requires a human-triggered call to the existing supported read-only log interfaces. Incident-time database connection/wait/resource state is available only if a supported metric or snapshot is observed while the issue is active. Historical logs cannot reconstruct a missing resource snapshot.

The exact API-request value of `statement_timeout` inside the PostgREST transaction was not directly observable with the available interfaces. Current Production metadata showed `authenticator` has an 8-second default, `anon` 3 seconds, and relevant catalogue/pricing functions had no function-specific statement-timeout override. Postgres errors recorded the login role as `authenticator`. PostgreSQL applies role defaults at login; `SET ROLE` alone does not reapply role defaults. This supports (but does not directly measure) an effective session default of 8 seconds for the API session. No timeout setting was changed.

## Historical replay

Replayed the retained log window **2026-10-28 04:40:00–04:43:30 UTC** (10:40–10:43:30 MYT) for deployment `dpl_66qLpJLTdJdZZkFKqPQfn5MmHGkG` and Production project `cuowwlduhxxifmpvpltt`.

| Source | Observed evidence | Deduplication / limitation |
|---|---|---|
| Supabase Edge `/rest/v1/library_cakes` | 23 HTTP 200 and 6 HTTP 500 requests. Failed request origin durations: median 12,091 ms, nearest-rank p95 21,568 ms, max 21,568 ms. | 29 unique request IDs from 29 rows. `origin_time` is gateway/upstream elapsed, not SQL-only time. |
| PostgreSQL | 6 `57014` errors, all query fingerprint `-3231686492694644454`; 6 distinct sessions. Error text: `canceling statement due to statement timeout`. | Distinct by hashed session ID plus session line. No shared request/session join key. |
| PostgREST | Six log rows carried the JSON `57014` timeout wording. Another 28 represented rows contained the exact phrase `Warp server error: Thread killed by timeout manager` (including concatenated repeat variants). | These are log rows / represented rows, not 34 unique requests. The timeout-manager records clustered at 04:41:57 and 04:42:57 UTC, later than the DB cancellations, with no request IDs connecting them. Their specific work remains unclassified. |
| Effective-price RPC | 177 HTTP 200 requests: 84 during 04:41, 65 during 04:42, 28 during 04:43. Per-minute p50 origin 130/27/704 ms; p95 609/347/927 ms; maxima 3,310/894/1,647 ms respectively. | HTTP duration is not SQL time. No request-to-page or request-to-catalogue causal link. |
| Vercel runtime | No matching catalogue error/warning entries were returned for the exact incident window and deployment under the bounded search. | Absence under that query/filter is not proof of no application error. |
| Resource context | One later read-only DB snapshot at 2026-10-29 06:28:40 UTC showed 13 backends, mostly idle, and no historical CPU/memory/disk-I/O/pool/worker metric was available. | About 25 hours after incident; not causal evidence. Snapshot is not a historical reconstruction. |

### Correlation finding

The six Edge 500 requests and six Postgres `57014` records overlap closely in time and share the known catalogue query fingerprint. This is evidence that the same catalogue query family was failing in the incident interval, but there is no common identifier to pair each 500 to a specific database session. Do not claim six one-to-one causal pairs. The later PostgREST timeout-manager wording is retained exactly but cannot be tied to those request IDs or to the same cancellation path.

### Safety and costs

Historical replay used retained log records and one later metadata snapshot only. No Production business rows, credentials, schema, settings, or data were read or changed by this phase. No calls were made to DEV. No repeated polling, load test, monitor, new infrastructure, Vercel action, or migration was used. The replay input contains 29 Edge rows, 6 PostgreSQL rows, 7 grouped PostgREST message records, 3 pricing minute buckets, and one explicitly post-incident snapshot; the summary caps the declared window at 10 minutes and total input rows at 2,000. The live runbook limits collection to five bounded log calls plus one optional DB snapshot.

## Capabilities and limitations

The local script:

- verifies expected Production project/deployment identity and a maximum 10-minute window;
- limits input to 2,000 records and Vercel events to 100;
- deduplicates Edge requests by supplied request-ID hash and Postgres error events by session-ID hash plus session line;
- reports counts, origin-time quantiles, fingerprints, session cardinality, exact sanitized PostgREST wording, pricing minute buckets, optional Vercel event summaries, and snapshot timing/context;
- strips query strings from Vercel route paths, hashes request IDs, redacts common URL/email/IP/UUID/key/JWT forms, and performs no network or database calls;
- creates a new summary file with mode 0600 and refuses to overwrite an existing file.

It cannot create missing correlations, recover expired logs, derive SQL duration from edge origin time, or recreate historical CPU, memory, I/O, connection-pool or worker state. The current Vercel observability schema endpoint was unavailable (404), so the runbook uses only bounded runtime logs, not time-series observability metrics. A past Vercel log query returned zero matching rows; this is recorded as unavailable/missing evidence, not a clean bill of health.

## Evidence needed before authorizing a correction

For a fresh incident, the most useful evidence is a same-window mapping from an Edge request/trace ID to its PostgREST worker/request and PostgreSQL session/query ID, plus queue/pool wait versus SQL runtime, effective session timeout and cancellation source, and incident-time connection/wait/resource metrics. If no shared identifier is exposed, request provider-side correlation from Supabase Support case `SU-529894`. A correction should be authorized only after evidence distinguishes execution cost from queueing/platform pressure and identifies the stage or workload that changes during the failure. The historical replay alone does not identify a root cause.

## Provenance

- Baseline audit branch: `codex/catalogue-rls-execution-audit-20261029`, verified remote SHA `0d4731e3e4c2318fca5d90e655c0c0fa729d34ef`.
- Diagnostic branch: `codex/catalogue-incident-diagnostics-20261029`.
- Sanitized historical input: `scripts/diagnostics/fixtures/phase7-historical-20261028T0440Z.json`.
- Summarizer and tests: `scripts/diagnostics/catalogue-incident-summary.mjs`, `scripts/diagnostics/test-catalogue-incident-summary.mjs`.
- Operational instructions: `docs/runbooks/catalogue-incident-evidence-runbook-20261029.md`.
- One isolated local source commit on this branch has a different parent chain from the GitHub branch base, but the base tree was verified identical. The manifest records this and the remote branch is verified independently; no previous branch or recovery record was rewritten.
