# Project Flour — Catalogue Incident Evidence Runbook

**Status:** On-demand only. This runbook does not enable a monitor or recurring task.
**Production project:** `cuowwlduhxxifmpvpltt`
**Production deployment:** `dpl_66qLpJLTdJdZZkFKqPQfn5MmHGkG`
**Support case:** `SU-529894`

## Trigger and stopping rules

Start only when a person observes a storefront catalogue failure/slow load or an existing alert reports a `/rest/v1/library_cakes` 500. Record the observed time with timezone and, if possible, the affected public route. Convert the incident time to UTC. Collect a single window from 90 seconds before to 120 seconds after the observation (3.5 minutes total); the collector refuses windows longer than 10 minutes. Do not generate traffic to reproduce it.

Before any database snapshot, look at the already available service/log health. If the incident is ongoing and there are repeated 500/57014 errors, visible database unavailability, or any available connection-use metric at or above 80% of its limit, stop database-side diagnostics. Preserve the bounded logs and escalate to Supabase Support. Do not poll or retry a failed diagnostic call. Do not make a second snapshot to “see if it changed.”

## Supported calls and bounded work

Use the connected Supabase `query_logs` read-only unified-log interface and Vercel `get_runtime_logs` interface. Explicitly supply Production project/deployment identity and UTC start/end on every call; never rely on default “last 24 hours” windows. Run at most six calls for one incident:

1. One Supabase `edge_logs` query for the exact endpoint `/rest/v1/library_cakes`, 200/500 counts, request/trace identifiers when present, and `response.origin_time`. Return at most 500 matching records or an aggregate plus bounded request rows; select no request headers, URL query strings, payloads, JWTs, or customer fields.
2. One Supabase `postgres_logs` query for `parsed.sql_state_code='57014'`, query IDs, session IDs and timestamps. Return only the fields needed to count log records, distinct sessions, fingerprints and time buckets. Hash session IDs before preserving results.
3. One Supabase `postgrest_logs` query for messages containing `timeout`, `cancel`, or `57014`. Preserve the exact message wording after removing any credential, personal-data or URL fragments. Keep repeated-log-row counts separate from distinct event/request counts.
4. One Supabase `edge_logs` query for `/rest/v1/rpc/library_cake_size_price_on`, grouped by minute and status, with count and available origin-duration quantiles. This is workload context; do not attribute it to a page visit or SQL runtime without a shared trace.
5. One Vercel runtime-log query constrained to the exact Production deployment, incident window, error/warning level, and a narrow catalogue/abort search. Keep only timestamp, level/source, route path without query, message after sanitization, and a hashed request ID if available. The current Vercel connector supports up to 100 rows; use `limit=100` and do not page through larger windows.
6. At most one small database snapshot, and only if the stop rule permits it. Use a server-enforced read-only transaction, short statement/lock timeouts, aggregate `pg_stat_activity` by backend type/state/wait event, `pg_stat_database` counters, `max_connections`, role defaults and relevant function `proconfig`. Do not select SQL text, application parameters, row data, order/customer tables, or per-customer identifiers. Exclude the snapshot’s own backend from counts where possible. If read-only mode cannot be enforced, skip the snapshot.

The five log calls are read-only and limited to one incident window. The sixth call is optional. No loop, repeated polling, load test, database write, persistent DB object, or new monitoring service is part of this runbook. The local summarizer accepts no credentials and makes no network calls; it caps the window at 600 seconds, input at 2,000 records, Vercel events at 100, and writes new output with owner-only permissions without overwriting an existing file.

## Correlation and retention

Keep raw request/session IDs only transiently inside the authorized log interface. Before saving evidence, SHA-256 hash identifiers locally; do not publish raw IDs. Count unique edge requests by request ID and unique Postgres error events by session ID plus session line number. Preserve the raw timeout wording after sanitization and separately count represented repeated log lines. If no common request/trace/session key exists, report temporal overlap only. Never infer a one-to-one request/session mapping from matching minute, SQL fingerprint, status, or similar durations.

`response.origin_time` is gateway-observed upstream time, not SQL execution time. HTTP RPC volume and time do not prove RPC SQL cost. A later `pg_stat_activity` snapshot cannot establish incident-time CPU, memory, I/O, pool wait, worker saturation, lock state, or the cause of an earlier timeout.

## Timeout settings and what can be established

The database catalog can show current `pg_db_role_setting` defaults and function `proconfig`; these are not a direct observation of the GUC inside the exact PostgREST request transaction. Historical timeout behavior also requires historical settings evidence. In the retained evidence, PostgreSQL records identify the login role as `authenticator`; current role metadata shows an 8-second `authenticator` statement timeout, 8-second lock timeout, and a separate 3-second `anon` statement timeout. PostgreSQL role defaults are applied when the session starts; `SET ROLE` alone does not re-apply the target role’s defaults. This makes the `authenticator` default the likely session default for PostgREST, but the effective runtime value within the API transaction was not directly sampled. Function-specific `statement_timeout` overrides were not found for the relevant catalogue path. Do not alter settings based on this inference.

## Summarizer use

The input must be a sanitized JSON object matching the schema in `scripts/diagnostics/catalogue-incident-summary.mjs`, and must identify exactly the Production project and deployment above. Run locally:

```sh
node scripts/diagnostics/catalogue-incident-summary.mjs sanitized-incident.json summary.json
node --test scripts/diagnostics/test-catalogue-incident-summary.mjs
```

Do not put an API key or database credential in the JSON, command line, shell history, or evidence directory. The script is a local formatter/deduplicator, not an unattended log collector. The connected read-only tools are the collection interface.

## Incident escalation package

Send Supabase Support the UTC window, endpoint, counts, query fingerprints, sanitized SQLSTATE/message, available hashed/correlation IDs only if Support can resolve them, origin-duration distribution, and this exact request: correlate gateway request IDs to PostgREST worker/timeout-manager events and PostgreSQL sessions; report queue/pool wait separately from SQL execution, effective transaction timeout and cancellation source, and incident-time CPU/memory/I/O/connection/worker saturation. Exclude keys, JWTs, request query strings, customer data and order details. Keep the Production promotion hold or release decision independent of this incident package.
