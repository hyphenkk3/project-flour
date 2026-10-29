-- Sanitized SELECT-only queries used for this audit. Target: Production project
-- cuowwlduhxxifmpvpltt. Never run against business rows or use as a mutation script.

-- Fingerprint cumulative completed calls by database role.
SELECT r.rolname, s.queryid, s.calls, s.rows,
       round(s.total_exec_time::numeric, 1) AS total_exec_ms,
       round(s.mean_exec_time::numeric, 2) AS mean_exec_ms,
       round(s.max_exec_time::numeric, 1) AS max_exec_ms,
       s.shared_blks_hit, s.shared_blks_read, s.temp_blks_written
FROM pg_stat_statements AS s
LEFT JOIN pg_roles AS r ON r.oid = s.userid
WHERE s.queryid = -3231686492694644454
ORDER BY s.calls DESC
LIMIT 5;

-- RLS policy inventory only; no policy expressions or user data returned.
SELECT schemaname, tablename, policyname, roles, cmd,
       qual IS NOT NULL AS has_using,
       with_check IS NOT NULL AS has_check,
       coalesce(qual, '') ILIKE '%exists%' AS using_has_exists,
       coalesce(with_check, '') ILIKE '%exists%' AS check_has_exists
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'library_cakes',
    'library_cake_categories',
    'library_cake_category_assignments',
    'library_cake_tag_assignments',
    'library_cake_tags',
    'library_cake_sizes',
    'library_cake_photos'
  )
ORDER BY tablename, policyname;

-- Aggregate row counts only; no row contents or personal data.
SELECT 'library_cakes' AS relation, count(*) AS rows FROM public.library_cakes
UNION ALL SELECT 'categories', count(*) FROM public.library_cake_categories
UNION ALL SELECT 'category_assignments', count(*) FROM public.library_cake_category_assignments
UNION ALL SELECT 'tag_assignments', count(*) FROM public.library_cake_tag_assignments
UNION ALL SELECT 'sizes', count(*) FROM public.library_cake_sizes
UNION ALL SELECT 'photos', count(*) FROM public.library_cake_photos;
