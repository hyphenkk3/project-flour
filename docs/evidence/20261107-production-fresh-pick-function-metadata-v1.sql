-- Project Flour: final missing Issue #8 function metadata capture.
-- Derived verbatim from section 4 of the approved baseline SQL at commit e3a5fe435c743fccfff3eefcaea5460ca37a6e04.
-- Read-only metadata only; contains no business-table row query.
\set ON_ERROR_STOP on

BEGIN READ ONLY;
SET LOCAL statement_timeout = '10s';
SET LOCAL lock_timeout = '2s';

SELECT p.oid::regprocedure AS signature,
       md5(pg_get_functiondef(p.oid)) AS definition_md5,
       pg_get_functiondef(p.oid) AS exact_definition,
       pg_get_userbyid(p.proowner) AS owner,
       p.prosecdef AS security_definer,
       p.proconfig AS function_settings,
       p.proacl AS raw_acl,
       (SELECT jsonb_agg(jsonb_build_object(
          'grantee', CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE gr.rolname END,
          'privilege', a.privilege_type, 'grantable', a.is_grantable
        ) ORDER BY a.grantee,a.privilege_type)
        FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
        LEFT JOIN pg_roles gr ON gr.oid=a.grantee) AS effective_acl_entries
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND (p.proname ILIKE '%complimentary%'
       OR p.proname ILIKE '%paid_addon%'
       OR p.proname ILIKE '%guest_extra_order%')
ORDER BY p.proname, p.pronargs, p.oid;

ROLLBACK;
