# One-request catalogue DEV experiment — 2026-10-29

## Status

**Experiment status: COMPLETED — bounded anonymous DEV HTTP measurements and projection parity passed.** The results were supplied from the owner's Mac Terminal run against DEV `tzwtpxdcggesgjaqxkqr`; no Production traffic or writes were involved. The complete sanitized JSON output was not found in the preserved local checkout, so [`measurement-summary.json`](measurement-summary.json) records only the values actually supplied. Missing maximum-latency and response-byte values remain null.

The experiment is diagnostic only. It does not change application behavior, database/schema/RLS, prices, cache, Production deployments, aliases, or data. Full Production telemetry findings are in [`catalogue-production-telemetry-20261029.md`](../../audits/catalogue-production-telemetry-20261029.md).

## Exact tested designs

Both designs select the same root `library_cakes` projection from the verified architecture report and use the exact DEV URL, public `apikey` header only, anonymous RLS, GET, `cache-control: no-cache`, no-store client behavior, and an 8-second per-request deadline. Effective-price RPCs are excluded.

### A — current two-request flow

1. `GET collection_cakes?select=library_cake_id,homepage_sort_order,available,show_on_homepage&collection_id=eq.<collection>&available=eq.true&show_on_homepage=eq.true&order=homepage_sort_order.asc`
2. Unique sorted membership IDs feed `GET library_cakes?select=<complete projection>&id=in.(...)`.
3. In memory, returned cakes are put back into membership order, then the current homepage eligibility is applied: membership available/show-on-homepage, active or seasonal cake status, at least one visible size, then the existing five-item display limit.

### B — one complete embedded flow

One `GET collection_cakes` with the same membership predicates/order and `library_cakes!collection_cakes_library_cake_id_fkey(<same complete projection>)`.

The cake projection includes IDs, display text, status, direct category and all assigned categories, tags and tag assignments, sizes with base price/preorder/date-availability fields, and photo metadata. Child arrays are normalized by their existing sort fields for comparison. The direct category and assignments are both retained; multiple categories are not collapsed.

## Mandatory parity gate

The script runs three counterbalanced A/B pairs before any performance samples. It computes structural, field-by-field differences across the full canonical projection and emits only paths, types/counts and hashes—not values, names, cake IDs, prices, URLs, API keys or response bodies. Any HTTP error or field difference exits before performance sampling.

It also checks an empty collection using a random UUID, checks the existing eligibility predicate against both live outputs, records the actual excluded-row counts, and exercises a synthetic retired/empty-size row against the same predicate. The synthetic predicate check is not represented as a real DEV cake. The collection itself is discovered from a bounded public anonymous metadata GET, choosing a visible 5–6 membership homepage collection without printing its identifier.

## Bounded measurement limits

- Parity: 3 pairs, sequential and alternating architecture order.
- Performance: 30 sequential A/B pairs, alternating order; 30 flows per architecture.
- Concurrency: 3 simultaneous flows per architecture, one bounded group each.
- Maximum HTTP GETs: 117 total, including discovery, parity, empty/eligibility checks, up to three optional exact PostgREST plan requests, performance and concurrency.
- Maximum individual request time: 8 seconds. No retries.
- The first measured performance sample occurs after the parity requests, so those reads have already touched the query paths. “First sample” versus “repeat” is reported, but no database-cold or cache-warm guarantee is claimed.
- Sequential latency, request count, each subrequest latency, response bytes, status/errors and client timeouts are reported separately. Client elapsed time is not SQL time.
- Optional `Accept: application/vnd.pgrst.plan+json; options=verbose` GETs request PostgREST planner output for the A membership query, A cake query and B embed. If DEV does not expose plans, the script records the HTTP status and continues without changing configuration. Planner estimates are not execution measurements; there is no `EXPLAIN ANALYZE`.

The cap is computed from the sequence: 1 discovery + 9 parity + 2 empty + 3 eligibility + 3 optional plans + 90 sequential + 9 concurrent = 117. Concurrency is limited to three independent flows.

## Source preservation and usage

- Experiment branch: `codex/catalogue-single-request-experiment-20261029`
- Parent: verified architecture-design tree based on the local commit corresponding to the GitHub report tree; exact local/remote SHAs are in the recovery manifest.
- Probe: `scripts/diagnostics/catalogue-single-request-experiment-20261029.mjs`
- No application code changed.
- `node --check` and `git diff --check`: PASS.

From the experiment checkout, run a Bash shell, then enter the hidden read command alone. Paste only the enabled public DEV anon/publishable key when prompted; do not paste it in chat. After the prompt returns, run the script and clear the variables:

```bash
bash
read -r -s -p 'DEV public anon/publishable key: ' SUPABASE_ANON_KEY; printf '\n'
export SUPABASE_ANON_KEY
export SUPABASE_URL='https://tzwtpxdcggesgjaqxkqr.supabase.co'
node --check scripts/diagnostics/catalogue-single-request-experiment-20261029.mjs && node scripts/diagnostics/catalogue-single-request-experiment-20261029.mjs
result=$?
unset SUPABASE_ANON_KEY SUPABASE_URL
exit "$result"
```

Wait for `read` to return to the Bash prompt before pasting the next commands. The probe refuses a different host, a service-role/secret key, any non-`anon` legacy JWT, any redirect, non-200 parity requests or any parity mismatch. It emits sanitized JSON only.

## Measurement record

- Projection parity: PASS; both reported common-projection hashes are `4ccff2e6143ebfac1f13a91a2930ebc4e24097e140d071d9925c2a9ed1c75d38`.
- Paired sequential samples: 30 per design, execution order alternated.
- A: two REST requests/flow; median 137.533 ms; p95 210.867 ms.
- B: one REST request/flow; median 146.351 ms; p95 236.727 ms.
- Three simultaneous flows: A 198.035 ms / six REST calls; B 267.077 ms / three REST calls.
- HTTP results: 114 HTTP 200; zero catalogue failures/timeouts. Three optional query-plan requests returned HTTP 406; no plans obtained.
- Full supplied metrics and limitations: [`measurement-summary.json`](measurement-summary.json).
- Interpretation: B reduced request count but was slower in the reported sequential medians/tails and the one concurrency group. This bounded result does not establish SQL performance, Production behavior, or an improvement in timeout risk. Recommendation: **HOLD** implementation pending a performance or telemetry-supported reason.

## Safety

No Production database access or traffic was used. No DEV or Production writes, DDL, migrations, synthetic database fixtures, checkout, order, payment, stock, cache, price, environment, credential, deployment, or alias changes were made. Existing Production deployment remains `dpl_66qLpJLTdJdZZkFKqPQfn5MmHGkG`; both domains were previously read-only verified on that deployment. This probe’s A/B request count concerns the base catalogue only; the separate homepage effective-price RPC count is unchanged and excluded.
