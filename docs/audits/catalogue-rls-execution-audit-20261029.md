# Catalogue RLS and execution audit — 2026-10-29

## Scope and safety

Read-only investigation for Project Flour Phase 6. No application code, schema, RLS, role, configuration, business data, deployment, or alias was changed. All Production SQL used an explicit read-only transaction. DEV EXPLAIN ANALYZE statements were read-only and bounded to six anonymous-visible cake IDs, with a 1.5 second statement timeout and 500 ms lock timeout. One DEV diagnostic comparison used SET LOCAL ROLE postgres to bypass RLS for measurement only; it did not write permissions and is not an application configuration.

Production project: cuowwlduhxxifmpvpltt. DEV project: tzwtpxdcggesgjaqxkqr.
Production deployment: dpl_66qLpJLTdJdZZkFKqPQfn5MmHGkG.
Both whitebird.asia and www.whitebird.asia were rechecked and mapped to that deployment.
Telemetry source branch: codex/catalogue-prod-telemetry-20261029, GitHub SHA a050c3eea78e52122eefdd172700c4f4eb0411d8.

## Executive conclusion

The evidence does not establish a single root cause for intermittent multi-second Production catalogue stalls. The Production RLS definitions are the same as DEV (44 policy rows, same fingerprint) and the current table estimates are small. A manually constructed, six-cake nested/LATERAL JSON aggregation query was slower under anonymous RLS than under an owner-role diagnostic in DEV, but its measured SQL execution remained about 7 ms (maximum about 8 ms) across three samples. That modest local difference cannot explain the observed Production multi-second/57014 failures.

No confirmed lock wait, active transaction, or connection saturation was visible in the point-in-time Production activity snapshot. The bounded 05:00–05:43 UTC log window showed no catalogue 500 or PostgreSQL 57014, but did contain 30 PostgREST log messages with the word “timeout”; their exact messages and request correlation were not retrieved. This cannot establish that all timeout activity was harmless or that the incident is resolved.

The most defensible conclusion is: RLS and relationship aggregation add measurable work in the DEV approximation, but they are not demonstrated as the cause of the Production stalls. Production incident-time resource, request-queue, and execution-plan evidence remains insufficient.

## Production aliases and current bounded window

Verified at this audit: both customer domains resolve to deployment dpl_66qLpJLTdJdZZkFKqPQfn5MmHGkG.

Bounded UTC log window: 2026-10-29 05:00:00 through 05:43:00 (13:00–13:43 MYT).
- Edge log records in window: 481.
- GET library_cakes sampled responses: 12 HTTP 200, 0 HTTP 500.
- library_cake_size_price_on responses: 63 HTTP 200.
- Edge response origin time across records: median 39 ms, p95 317 ms, maximum 894 ms. This is the sampled edge-log origin-time distribution, not a SQL execution-time distribution.
- PostgreSQL log records: 6; SQLSTATE 57014 count: 0.
- PostgREST log records: 30; all 30 contained a timeout mention under the query's text predicate. Exact messages were not fetched, so they cannot be classified as failures, timeout-manager housekeeping, or application request cancellations.
- No request ID join was performed between PostgREST and PostgreSQL in this window. Causal correlation is unavailable.

Earlier bounded evidence supplied in the Phase 5 record (not remeasured in this phase): six-hour sample had library_cakes 285 HTTP 200 and 39 HTTP 500, plus 3,244 price RPC 200; the strongest hour 03:00–04:00 UTC had 75 library_cakes 200, 31 500, and 851 price RPC 200. These are bounded log samples, not all-time counts.

## Exact current Production SELECT policy behavior

A read-only pg_policies query retrieved the current definitions. All listed policies are PERMISSIVE. PostgreSQL combines permissive policies for a role/command with OR semantics.

### public.library_cakes

For anon, four SELECT policies apply:
1. library_cakes_public_select_catalogue_history: row is visible when an EXISTS over collection_cakes joined to collections finds the same cake, collection-cake available=true, collection status active or archived, purpose monthly or special, and purpose monthly OR website_override=true OR show_in_past_menu=true.
2. library_cakes_public_select_in_active_collection: EXISTS over collection_cakes joined to collections for same cake, available=true, status active.
3. library_cakes_public_select_live_browse: status is active or seasonal.
4. library_cakes_public_select_popular_cakes: show_in_popular_cakes=true.

The authenticated role additionally has Authenticated staff can select library cakes with USING(true). The policy grants the database role authenticated unrestricted SELECT under that policy; its name does not itself enforce staff membership. The public policies also apply to authenticated, and are OR-combined.

### public.library_cake_sizes

For anon, four PERMISSIVE SELECT policies are applied:
- library_cake_sizes_public_select_catalogue_history: EXISTS over library_cakes cake joined to collection_cakes cc and collections c, matching cake.id to library_cake_sizes.cake_id, cc.available=true, c.status active/archived, purpose monthly/special, and monthly OR website_override OR show_in_past_menu.
- library_cake_sizes_public_select_in_active_collection: the same relationship path and cake match, cc.available=true, c.status active.
- library_cake_sizes_public_select_live_browse: EXISTS matching parent cake whose status is active or seasonal.
- library_cake_sizes_public_select_popular_cakes: EXISTS matching parent cake with show_in_popular_cakes=true.

Authenticated also has Authenticated staff can select library cake sizes with USING(true).

### public.library_cake_photos

For anon, four PERMISSIVE SELECT policies:
- library_cake_photos_public_select_catalogue_history: EXISTS from library_cakes cake joined to collection_cakes cc and collections c, photo.cake_id=cake.id, cc.available=true, active/archived status, monthly/special purpose, and monthly OR website_override OR show_in_past_menu.
- library_cake_photos_public_select_in_active_collection: same joins and photo-parent match, available=true, collection active.
- library_cake_photos_public_select_live_browse: EXISTS matching cake with active/seasonal status.
- library_cake_photos_public_select_popular_cakes: EXISTS matching cake with show_in_popular_cakes=true.
Authenticated additionally has Authenticated staff can select library cake photos USING(true).

### public.collection_cakes and public.collections

collection_cakes_public_select (anon, authenticated): available=true AND EXISTS parent collection with status active.
collection_cakes_public_select_customer_history (anon, authenticated): available=true AND EXISTS parent collection whose status is active/archived, purpose monthly/special, and purpose monthly OR website_override OR show_in_past_menu.
collection_cakes_authenticated_all grants authenticated ALL with USING(true), WITH CHECK(true).

collections_public_select_active (anon, authenticated): status active.
collections_public_select_customer_history (anon, authenticated): status active/archived, purpose monthly/special, and monthly OR website_override OR show_in_past_menu.
collections_authenticated_all grants authenticated ALL with USING(true), WITH CHECK(true).

### Category and tag lookup/assignment tables

library_cake_categories_select, library_cake_category_assignments_select, library_cake_tags_select and library_cake_tag_assignments_select are PERMISSIVE SELECT policies for anon and authenticated with USING(true). Their public SELECT policies have no correlated visibility EXISTS. Authenticated write policies on these tables are separate from public SELECT.

RLS is enabled, not forced, on the nine inspected tables; owner is postgres. Production and DEV policy text/role fingerprint: 44 policy rows; MD5 fingerprint 9856391f81289e0ead52110c91a72cb8 for each. This confirms policy-definition parity, not table-data, role-session, or execution-plan parity.

## RLS and nested-query DEV measurements

The DEV query was a manually constructed root read with LATERAL JSONB aggregation for category, category assignments, tags, sizes, and photos, restricted to six anonymous-visible IDs. It approximates the fields/relationships; it is not the exact SQL generated internally by PostgREST. Three samples per case were collected, counterbalanced, in short read-only transactions; timings are PostgreSQL EXPLAIN ANALYZE planning/execution metrics.

| DEV case | Planning median / max | Execution median / max | Buffer result |
|---|---:|---:|---|
| Root cake read + direct category, anon RLS | 5.587 / 5.634 ms | 0.430 / 0.455 ms | 14 shared hits, 0 reads |
| Nested JSON approximation, anon RLS | 75.096 / 77.016 ms | 6.950 / 8.062 ms | 112 shared hits, 0 reads |
| Same nested approximation, postgres owner role (diagnostic RLS bypass only) | 2.329 / 2.372 ms | 1.061 / 1.073 ms | 80 shared hits, 0 reads |

The anonymous nested query used the cake primary key, size/photo foreign-key indexes, lookup primary keys, and a bitmap index path for tag assignments. It sequentially scanned the small category-assignment table for each of six roots (estimated table size about 35 rows). No disk blocks or temp spills were observed. RLS-related subplans were planned, but several had zero loops due to plan pruning/conditions.

This is a small warm DEV sample and a hand-built approximation. The owner-role comparison changes both role security context and plan shape; the observed difference is not a pure isolated “RLS-only” cost. It is diagnostic only and does not prove anon/owner result parity. It did not reproduce a seconds-long stall.

## Indexes and data-size indicators

Production catalog indexes inspected included:
- library_cakes primary key on id, category_id index, status index, and popular-cake partial index.
- collection_cakes indexes on library_cake_id and collection_id, unique (collection_id, library_cake_id), plus homepage-preview partial index.
- library_cake_sizes index on cake_id.
- library_cake_photos indexes on cake_id, cake_size_id, and asset identifiers.
- library_cake_category_assignments primary key (cake_id, category_id), plus (category_id, cake_id).
- library_cake_tag_assignments primary key (cake_id, tag_id), plus (tag_id, cake_id).
- Lookup table primary keys.

Current pg_class estimates were small (library_cakes reltuples about 21; collection_cakes about 53; category assignments about 32; photos about 29; some other estimates unavailable). pg_stat_user_tables showed cumulative, since-reset scan counts including library_cakes about 739k sequential scans and category assignments about 60k, but these are not incident-window counters. Sequential scans of tiny tables may be cheap; counts alone do not prove query cost or missing indexes. Last-autoanalyze dates were Sep 28 for cakes/category assignments, Oct 10 for photos, Oct 14 for collection_cakes; exact freshness impact was not established.

## Current role defaults and query statistics

Read-only pg_db_role_setting results:
- anon: statement_timeout 3s.
- authenticated: statement_timeout 8s.
- authenticator: statement_timeout 8s, lock_timeout 8s.
- prior telemetry report: global statement_timeout 120s, lock_timeout 0.

These are role defaults, not yet proven effective values inside the actual PostgREST transaction after authenticator role switching. Do not infer API timeout from the role defaults alone.

pg_stat_statements was found under schema extensions. Cumulative current counters since its recorded reset:
- library_cakes query id -3231686492694644454: two entries, 1,669 calls mean 20.649 ms max 1,236.564 ms; 57 calls mean 3.548 ms max 19.186 ms. Both report zero shared block reads and zero temp writes.
- pricing RPC query id 2283284560039472283: two entries, 30,677 calls mean 5.305 ms max 720.657 ms; 57,879 calls mean 8.764 ms max 2,803.895 ms. Both report zero shared block reads and zero temp writes.
- These are cumulative successful/recorded query statistics, not incident-aligned latency distributions. PostgreSQL cancellation records may not be represented as completed calls in an equivalent way. They cannot identify the stall intervals by themselves.

A point-in-time activity snapshot at 05:47:59.604 UTC showed 13 other client backends, all idle/ClientRead; no active or lock-wait rows appeared. It cannot rule out earlier bursts, queueing, worker saturation, or resource pressure.

## Hypothesis assessment

| Hypothesis | Evidence for | Evidence against / limitation | Assessment |
|---|---|---|---|
| Expensive RLS | Multiple OR-combined correlated EXISTS policies on cakes/sizes/photos; DEV approximation measured a small RLS/plan-associated cost | DEV execution remained under 9 ms; exact PostgREST plan unavailable; no incident-aligned Production plan | Possible contributor, not root cause established |
| Nested relationship aggregation | DEV nested approximation costs more than root-only; PostgREST embeds JSON relationships | No seconds-long reproduction; small data; direct REST A/B previously had low hundreds of ms; no exact production plan | Possible contributor, not sufficient to explain stalls |
| Abnormal plan/index deficiency | Some tiny assignment relation scans; large cumulative scan counts | Relevant parent and foreign-key indexes exist; estimates tiny; plans used indexes; no reads/spills in DEV; no Production plan | No demonstrated missing-index or abnormal-plan cause |
| Connection/worker contention | Logs show PostgREST timeout-manager messages; historical bursts exist | Current snapshot idle; bounded window zero Postgres 57014; no joined request/session IDs; no historical pool/worker gauge | Unknown |
| Resource saturation | Intermittent stalls with ordinary query averages are compatible with contention | Incident-time CPU/memory/I/O and pool metrics unavailable; no contemporaneous plan or queue evidence | Unknown |
| Application vs database timeout interaction | App aborts around 8s; role defaults show short anon timeout; Production 57014 exists | Effective PostgREST session timeout unknown; different mechanisms and no request-ID correlation | Both mechanisms exist, relationship unknown |

## Query and evidence register

All database statements in this phase were read-only. Production statements were wrapped in BEGIN TRANSACTION READ ONLY/COMMIT. DEV EXPLAIN ANALYZE was read-only and bounded with timeouts. ClickHouse log statements were SELECT-only. Vercel alias/project and GitHub source calls were GET/list operations.

Recorded query categories and executed statements:
1. Production catalogs: pg_class/pg_namespace/pg_policies join restricted to the named catalogue relations; pg_policies query for exact SELECT policy definitions; relevant index definition query; collection/collection policy and table-estimate queries; pg_stat_user_tables query for estimates/scans/autovacuum timestamps.
2. Production RLS parity: read-only transaction, SET LOCAL ROLE anon, count and digest of pg_policies for the nine named relations.
3. Production identity/read-only validation: current database/user/transaction_read_only.
4. Production role defaults: pg_db_role_setting joined to roles for anon/authenticated/authenticator.
5. Production activity: bounded pg_stat_activity aggregate/snapshot excluding observer and no SQL text or customer values.
6. Production pg_stat_statements: first attempted pg_catalog.pg_stat_statements and got relation-does-not-exist (read-only, no effect); discovered extension namespace through pg_extension/pg_namespace; then queried only the two known query IDs and counters (no query text).
7. DEV: anonymous-visible fixture ID discovery (IDs intentionally not retained in evidence); bounded EXPLAIN ANALYZE of root-only and nested-LATERAL JSONB templates under SET LOCAL ROLE anon; same nested template under SET LOCAL ROLE postgres for diagnostic bypass only; all inside read-only transactions with statement_timeout 1.5 s and lock_timeout 500 ms.
8. Supabase logs: bounded 05:00–05:43 UTC aggregates over edge_logs (route status and origin-time distribution), postgres_logs (57014 count and distinct session/query IDs), and postgrest_logs (timeout/cancel text predicate). Queries projected only counts/timings/IDs, not request headers, query parameters, customer data, or SQL text.
9. GitHub branch/commit lookup and Vercel alias lookups were read-only metadata requests.

Limitation: the exact text of several earlier catalog/index/statistics SQL statements and the individual PostgREST timeout messages was not retained in a machine-readable local transcript. The categories and predicates are documented above; this audit does not claim a verbatim transcript for those calls. To preserve safety, no raw customer/request payload or log body was saved.

## Findings and next step

No Production or DEV write occurred. No policy, index, timeout, app code, deployment, or alias was changed. This audit does not authorize release or RLS changes.

Most useful next step: for the next observed library_cakes 500/57014, obtain one request-correlated evidence bundle from Supabase containing PostgREST request ID, query ID/session ID, effective statement/lock timeouts after role switch, per-request queue/worker wait, and incident-time CPU/I/O/connections/locks. Current aggregate logs and cumulative query statistics cannot distinguish a rare execution stall from queuing or platform resource pressure.

Status: cause remains unresolved. No correction is recommended from this evidence alone.

## Verbatim predicate appendix from Production pg_policies

The following are the normalized pg_policies qualification expressions observed. Whitespace is normalized for readability; predicate operators, joins, constants, and correlated columns are retained.

library_cakes:
- history: EXISTS (SELECT 1 FROM collection_cakes cc JOIN collections c ON c.id=cc.collection_id WHERE cc.library_cake_id=library_cakes.id AND cc.available=true AND c.status=ANY(ARRAY['active'::collection_status,'archived'::collection_status]) AND c.purpose=ANY(ARRAY['monthly'::text,'special'::text]) AND (c.purpose='monthly'::text OR c.website_override=true OR c.show_in_past_menu=true)).
- active collection: EXISTS (SELECT 1 FROM collection_cakes cc JOIN collections c ON c.id=cc.collection_id WHERE cc.library_cake_id=library_cakes.id AND cc.available=true AND c.status='active'::collection_status).
- live browse: status=ANY(ARRAY['active'::library_cake_status,'seasonal'::library_cake_status]).
- popular: show_in_popular_cakes=true.
- authenticated SELECT: true.

library_cake_sizes:
- history: EXISTS (SELECT 1 FROM library_cakes cake JOIN collection_cakes cc ON cc.library_cake_id=cake.id JOIN collections c ON c.id=cc.collection_id WHERE cake.id=library_cake_sizes.cake_id AND cc.available=true AND c.status=ANY(ARRAY['active'::collection_status,'archived'::collection_status]) AND c.purpose=ANY(ARRAY['monthly'::text,'special'::text]) AND (c.purpose='monthly'::text OR c.website_override=true OR c.show_in_past_menu=true)).
- active collection: EXISTS (same joins and cake-to-size match, with cc.available=true AND c.status='active'::collection_status).
- live browse: EXISTS (SELECT 1 FROM library_cakes cake WHERE cake.id=library_cake_sizes.cake_id AND cake.status=ANY(ARRAY['active'::library_cake_status,'seasonal'::library_cake_status])).
- popular: EXISTS (SELECT 1 FROM library_cakes cake WHERE cake.id=library_cake_sizes.cake_id AND cake.show_in_popular_cakes=true).
- authenticated SELECT: true.

library_cake_photos uses the same four predicates as library_cake_sizes, replacing the correlated child field with library_cake_photos.cake_id; authenticated SELECT is true.

collection_cakes:
- public active: available=true AND EXISTS (SELECT 1 FROM collections c WHERE c.id=collection_cakes.collection_id AND c.status='active'::collection_status).
- public history: available=true AND EXISTS (SELECT 1 FROM collections c WHERE c.id=collection_cakes.collection_id AND c.status=ANY(ARRAY['active'::collection_status,'archived'::collection_status]) AND c.purpose=ANY(ARRAY['monthly'::text,'special'::text]) AND (c.purpose='monthly'::text OR c.website_override=true OR c.show_in_past_menu=true)).
- authenticated ALL: USING(true), WITH CHECK(true).

collections:
- public active: status='active'::collection_status.
- public history: status=ANY(ARRAY['active'::collection_status,'archived'::collection_status]) AND purpose=ANY(ARRAY['monthly'::text,'special'::text]) AND (purpose='monthly'::text OR website_override=true OR show_in_past_menu=true).
- authenticated ALL: USING(true), WITH CHECK(true).

library_cake_categories, library_cake_category_assignments, library_cake_tags, library_cake_tag_assignments each have a public SELECT predicate of true. This appendix lists SELECT and ALL policy predicates relevant to read planning; it does not reproduce unrelated authenticated INSERT/UPDATE/DELETE checks.
