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

-- Current global timeout/connection settings only (not historical values).
SELECT name, setting, unit, source
FROM pg_settings
WHERE name IN (
  'statement_timeout',
  'lock_timeout',
  'idle_in_transaction_session_timeout',
  'transaction_timeout',
  'max_connections'
);

-- Current role-level timeout settings; setdatabase=0 means global role setting.
SELECT r.rolname, s.setdatabase, setting
FROM pg_db_role_setting AS s
JOIN pg_roles AS r ON r.oid = s.setrole
CROSS JOIN LATERAL unnest(s.setconfig) AS setting
WHERE s.setdatabase IN (
    0,
    (SELECT oid FROM pg_database WHERE datname = current_database())
  )
  AND r.rolname IN ('anon', 'authenticated', 'authenticator')
  AND setting LIKE 'statement_timeout=%'
ORDER BY r.rolname;

-- Index inventory only; no index definitions or user rows.
SELECT tablename, indexname
FROM pg_indexes
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
ORDER BY tablename, indexname;

-- Point-in-time ungranted lock count only; not historical contention evidence.
SELECT count(*) AS waiting_lock_count
FROM pg_locks
WHERE NOT granted;
