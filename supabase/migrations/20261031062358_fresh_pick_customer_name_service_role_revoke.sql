DO $preflight$
BEGIN
  IF to_regprocedure('public._guard_fresh_pick_customer_name()') IS NULL THEN
    RAISE EXCEPTION 'Fresh Pick name guard is missing; refusing ACL reconciliation';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid=t.tgrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname='orders'
      AND t.tgname='fresh_pick_customer_name_guard' AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION 'Fresh Pick name guard trigger is missing; refusing ACL reconciliation';
  END IF;
END
$preflight$;
REVOKE ALL ON FUNCTION public._guard_fresh_pick_customer_name() FROM service_role;
DO $verify$
BEGIN
  IF has_function_privilege('service_role','public._guard_fresh_pick_customer_name()','EXECUTE') THEN
    RAISE EXCEPTION 'service_role still has direct EXECUTE on Fresh Pick guard';
  END IF;
  IF has_function_privilege('anon','public._guard_fresh_pick_customer_name()','EXECUTE')
     OR has_function_privilege('authenticated','public._guard_fresh_pick_customer_name()','EXECUTE')
     OR EXISTS (
       SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a
       WHERE p.oid='public._guard_fresh_pick_customer_name()'::regprocedure
         AND a.grantee=0 AND a.privilege_type='EXECUTE'
     ) THEN
    RAISE EXCEPTION 'An unintended API/PUBLIC EXECUTE grant remains';
  END IF;
END
$verify$;
