# Project Flour — Catalogue reliability evidence ledger (2026-11-01)

## Immutable starting point
- Production domain aliases: `whitebird.asia`, `www.whitebird.asia`.
- Verified Production Vercel deployment: `dpl_HE7zep8jWR1wkoKZ6w4tC8t4bAaN` (READY).
- Verified deployed Git SHA: `d98afb9733ed8285e71ba7e4a7e7a3e1116980c7`.
- This audit branch began **directly** from that exact SHA: `codex/catalogue-cache-reliability-audit-20261101`.
- Previous Production deployment: `dpl_7WT4WV3gVmybEeEiThAb9SwLpYpF` (do not delete).
- Production Supabase project reference: `cuowwlduhxxifmpvpltt`; DEV: `tzwtpxdcggesgjaqxkqr`.
- Git repository: `hyphenkk3/project-flour`.
- Do not reset, overwrite, merge, or delete production branch/deployments. Any release must explicitly reference a reviewed immutable commit SHA and then verify both aliases.

## Read-only findings
- The newest Production deployment returned no warning/error logs in the queried six-hour window. This is *not* proof that intermittent failures are gone.
- Historical Vercel cache revalidation records show `TimeoutError` (aborted fetch) and PostgreSQL `statement timeout`, particularly for homepage previews, popular cakes and cake-detail display.
- Source at Production SHA: `src/workspaces/storefront/catalog/queries.ts` uses 30-second merchandising revalidation and nested cached lookup of cake details. The server Supabase fetch timeout is eight seconds (`src/lib/supabase/fetch-timeout.ts`).
- One Supabase snapshot: project ACTIVE_HEALTHY, 36/60 Postgres connections, 3 active, 0 idle-in-transaction. Snapshot only.
- Historical `pg_stat_statements` sample: library-cakes PostgREST query 2704 calls, mean 18.8ms, max 1236.6ms; cumulative statistics cannot establish incident-level causality.

## Hypotheses (not findings)
1. Cache miss/revalidation concurrency repeatedly exercises catalogue queries.
2. Query/network latency under sporadic load causes the eight-second fetch abort.
3. Image loading, staff login or checkout problems may share upstream network symptoms; not yet established.

## Experiment safety gates
1. Record baseline query/call count and latency using DEV fixtures; do not test by creating customer Production orders.
2. Trace cache miss, cache hit, stale revalidation, and concurrent requests.
3. Observe SQL execution separately from PostgREST/network time.
4. Test image response/loading as an independent path.
5. Test authentication and checkout with safe isolated DEV accounts/fixtures only.
6. Change **DEV-only** code only after a measurable candidate fix is identified; retain a no-change baseline.
7. Run prior release regression suite, TypeScript, scoped lint and build, then verify functionality and observe errors.
8. No Production SQL/configuration/code/storage mutation without explicit review and a documented rollback plan.

## Change ledger
- 2026-11-01: Created this independent branch from deployed Production SHA. Added this document only. No application behavior modified.

## Source recovery
If local source becomes unavailable, retrieve repository `hyphenkk3/project-flour` at `d98afb9733ed8285e71ba7e4a7e7a3e1116980c7` to reconstruct the exact Production source. Continue the experiment from `codex/catalogue-cache-reliability-audit-20261101`, not a guessed branch or an unverified filesystem copy. Production migration state must be checked separately from Git history.

## DEV baseline probe (read-only, 2026-11-01)
- DEV Supabase `tzwtpxdcggesgjaqxkqr`: 25 `library_cakes` rows, 58 `collection_cakes` membership rows.
- `pg_stat_statements` entries containing `library_cakes` include a direct `library_cakes` query at 2075 cumulative calls, mean 2.9ms, max 511.4ms, plus a broader join at 1669 calls, mean 10.4ms, max 711.6ms.
- **Interpretation:** DEV has a small catalogue and is not an incident-equivalent Production load replay. It is suitable for deterministic correctness and cache-behavior experiments, **not sufficient** to claim Production performance improvement.
- Neither the sample query counters nor production snapshot was reset. No mutating query or synthetic order was made.
- Next evidence gap: a DEV request-level timing harness observing hit/miss/stale refresh and concurrency. Do not ship cache interval or timeout adjustments without that comparison.
