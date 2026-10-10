REVOKE EXECUTE
ON FUNCTION public.enforce_preorder_size_availability()
FROM PUBLIC, anon, authenticated, service_role;
