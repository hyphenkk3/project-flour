# Phase 6 query register and evidence limits

Branch: codex/catalogue-rls-execution-audit-20261029
Base source SHA intended on GitHub: a050c3eea78e52122eefdd172700c4f4eb0411d8
Environment: Project Flour Production metadata/logs and DEV-only bounded plans.

No statements in this register modify data, schema, permissions, settings, deployments, or aliases.

## Exact SQL retained for this continuation

### Production: exact policy inventory

~~~sql
BEGIN TRANSACTION READ ONLY;
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname='public'
  AND tablename = ANY(ARRAY[
    'library_cakes','library_cake_sizes','library_cake_photos',
    'collection_cakes','collections','library_cake_categories',
    'library_cake_category_assignments','library_cake_tags',
    'library_cake_tag_assignments'
  ])
ORDER BY tablename, cmd, policyname;
COMMIT;
~~~

### Production: pg_stat_statements extension namespace

~~~sql
BEGIN TRANSACTION READ ONLY;
SELECT e.extname, n.nspname AS extension_schema
FROM pg_extension e
JOIN pg_namespace n ON n.oid=e.extnamespace
WHERE e.extname='pg_stat_statements';
COMMIT;
~~~

Result: extension schema is extensions.

### Production: cumulative counters for the two known query IDs

~~~sql
BEGIN TRANSACTION READ ONLY;
SELECT queryid, calls,
       round(mean_exec_time::numeric,3) AS mean_ms,
       round(max_exec_time::numeric,3) AS max_ms,
       shared_blks_hit, shared_blks_read, temp_blks_written
FROM extensions.pg_stat_statements
WHERE queryid IN (-3231686492694644454,2283284560039472283)
ORDER BY queryid;
COMMIT;
~~~

No query text or bound parameters were selected.

### DEV: plan query shape

This is the manual LATERAL/JSONB approximation used for the nested comparison. The six cake UUID literals are replaced by placeholders in this evidence copy; the executed query selected six DEV fixture IDs. It is not internal PostgREST SQL.

~~~sql
EXPLAIN (ANALYZE, BUFFERS, VERBOSE, SETTINGS, SUMMARY, TIMING, FORMAT JSON)
SELECT cake.id,cake.name,cake.description,cake.category_id,cake.status,
       cake.sharing_guide,cake.allergens,
       to_jsonb(primary_cat) AS primary_category,
       COALESCE(assignments.rows,'[]'::jsonb) AS category_assignments,
       COALESCE(tags.rows,'[]'::jsonb) AS tag_assignments,
       COALESCE(sizes.rows,'[]'::jsonb) AS sizes,
       COALESCE(photos.rows,'[]'::jsonb) AS photos
FROM public.library_cakes cake
LEFT JOIN public.library_cake_categories primary_cat ON primary_cat.id=cake.category_id
LEFT JOIN LATERAL (
  SELECT jsonb_agg(jsonb_build_object(
    'category_id',a.category_id,'sort_order',a.sort_order,'category',to_jsonb(cat)
  ) ORDER BY a.sort_order) AS rows
  FROM public.library_cake_category_assignments a
  LEFT JOIN public.library_cake_categories cat ON cat.id=a.category_id
  WHERE a.cake_id=cake.id
) assignments ON true
LEFT JOIN LATERAL (
  SELECT jsonb_agg(jsonb_build_object(
    'tag_id',a.tag_id,'sort_order',a.sort_order,'tag',to_jsonb(t)
  ) ORDER BY a.sort_order) AS rows
  FROM public.library_cake_tag_assignments a
  LEFT JOIN public.library_cake_tags t ON t.id=a.tag_id
  WHERE a.cake_id=cake.id
) tags ON true
LEFT JOIN LATERAL (
  SELECT jsonb_agg(jsonb_build_object(
    'id',s.id,'cake_id',s.cake_id,'label',s.label,'price',s.price,
    'sort_order',s.sort_order,'preorder_days',s.preorder_days,
    'available_from',s.available_from,'available_until',s.available_until
  ) ORDER BY s.sort_order) AS rows
  FROM public.library_cake_sizes s WHERE s.cake_id=cake.id
) sizes ON true
LEFT JOIN LATERAL (
  SELECT jsonb_agg(jsonb_build_object(
    'id',p.id,'image_url',p.image_url,'alt_text',p.alt_text,
    'sort_order',p.sort_order,'cake_size_id',p.cake_size_id,'is_default',p.is_default
  ) ORDER BY p.sort_order) AS rows
  FROM public.library_cake_photos p WHERE p.cake_id=cake.id
) photos ON true
WHERE cake.id IN (
  '<DEV_FIXTURE_ID_1>'::uuid,'<DEV_FIXTURE_ID_2>'::uuid,
  '<DEV_FIXTURE_ID_3>'::uuid,'<DEV_FIXTURE_ID_4>'::uuid,
  '<DEV_FIXTURE_ID_5>'::uuid,'<DEV_FIXTURE_ID_6>'::uuid
);
~~~

Variants executed within separate DEV read-only transactions:
1. Same six-ID root projection plus direct category only, role anon.
2. Full nested shape above, role anon.
3. Full nested shape above, role postgres, diagnostic RLS bypass only.
Each was bounded with SET LOCAL statement_timeout='1500ms' and lock_timeout='500ms'. SET LOCAL ROLE was used; no persistent role or policy change. Three samples per condition. Exact six UUIDs are intentionally not retained.

## Exact bounded log aggregates for 2026-10-29 05:00:00–05:43:00 UTC

The queries below operate on the Supabase unified logs stream. Only counts, timings and query/session ID cardinalities were selected; no request headers, search parameters, SQL text, or customer payloads were selected.

~~~sql
SELECT source,
       count() AS rows,
       countIf(toString(log_attributes['request.path']) LIKE '%/rest/v1/library_cakes%'
         AND toString(log_attributes['response.status_code'])='500') AS cake_500,
       countIf(toString(log_attributes['request.path']) LIKE '%/rest/v1/library_cakes%'
         AND toString(log_attributes['response.status_code'])='200') AS cake_200,
       countIf(toString(log_attributes['request.path']) LIKE '%library_cake_size_price_on%'
         AND toString(log_attributes['response.status_code'])='200') AS price_200,
       round(quantileExact(0.5)(toFloat64OrZero(toString(log_attributes['response.origin_time']))),2) AS p50_origin,
       round(quantileExact(0.95)(toFloat64OrZero(toString(log_attributes['response.origin_time']))),2) AS p95_origin,
       round(max(toFloat64OrZero(toString(log_attributes['response.origin_time']))),2) AS max_origin
FROM logs
WHERE source='edge_logs'
  AND timestamp >= '2026-10-29 05:00:00'
  AND timestamp < '2026-10-29 05:43:00'
GROUP BY source;
~~~

~~~sql
SELECT count() AS postgres_rows,
       countIf(toString(log_attributes['parsed.sql_state_code'])='57014') AS sqlstate_57014,
       uniqExactIf(toString(log_attributes['parsed.session_id']),
                   toString(log_attributes['parsed.sql_state_code'])='57014') AS distinct_sessions,
       uniqExactIf(toString(log_attributes['parsed.query_id']),
                   toString(log_attributes['parsed.sql_state_code'])='57014') AS distinct_query_ids,
       groupUniqArrayIf(toString(log_attributes['parsed.query_id']),
                        toString(log_attributes['parsed.sql_state_code'])='57014') AS query_ids
FROM logs
WHERE source='postgres_logs'
  AND timestamp >= '2026-10-29 05:00:00'
  AND timestamp < '2026-10-29 05:43:00';
~~~

~~~sql
SELECT count() AS postgrest_rows,
       countIf(positionCaseInsensitive(toString(event_message),'timeout')>0) AS timeout_mentions,
       countIf(positionCaseInsensitive(toString(event_message),'timeout')>0
            OR positionCaseInsensitive(toString(event_message),'cancel')>0) AS timeout_or_cancel_mentions
FROM logs
WHERE source='postgrest_logs'
  AND timestamp >= '2026-10-29 05:00:00'
  AND timestamp < '2026-10-29 05:43:00';
~~~

## Earlier Phase 6 statements

Earlier in this same phase, the execution history available to the current continuation records that Production catalog/policy/index/table-statistics/role-setting/activity statements were read-only and that DEV fixture discovery and plan queries ran inside read-only transactions. It does not retain the verbatim SQL text for every earlier catalog scan or the exact generated root-only query. This is a provenance limitation; no query text has been reconstructed as if it were verbatim. The aggregate findings and exact policy definitions are captured in the companion audit report; the full 44-row exact policy inventory (including write checks) is docs/audits/catalogue-rls-policy-inventory-20261029.json. The one intentionally failed pg_catalog.pg_stat_statements relation lookup was read-only; the extension was then located in schema extensions and queried successfully.

## Tool calls outside SQL

- Vercel GET alias metadata for whitebird.asia and www.whitebird.asia; both returned dpl_66qLpJLTdJdZZkFKqPQfn5MmHGkG.
- GitHub read operations to verify telemetry source SHA and commit metadata.
- Supabase project identity reads for Production and DEV.
