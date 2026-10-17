-- Restrict direct API access to privileged order financial aggregates.
-- Application source contains no direct RPC callers for these helpers. Their
-- database callers are existing postgres-owned SECURITY DEFINER routines.
DO $preflight$
DECLARE
  function_signature text;
BEGIN
  FOREACH function_signature IN ARRAY ARRAY[
    'public.order_items_subtotal(uuid)',
    'public.order_adjustments_total(uuid)',
    'public.order_amount_due(uuid)',
    'public.order_verified_allocated(uuid)',
    'public.order_refunds_total(uuid)',
    'public.order_net_received(uuid)'
  ] LOOP
    IF to_regprocedure(function_signature) IS NULL THEN
      RAISE EXCEPTION 'Expected function % to exist', function_signature;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_proc AS p
      WHERE p.oid = to_regprocedure(function_signature)
        AND p.prosecdef
    ) THEN
      RAISE EXCEPTION 'Expected function % to remain SECURITY DEFINER', function_signature;
    END IF;
  END LOOP;
END
$preflight$;

REVOKE EXECUTE ON FUNCTION public.order_items_subtotal(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.order_adjustments_total(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.order_amount_due(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.order_verified_allocated(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.order_refunds_total(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.order_net_received(uuid)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.order_items_subtotal(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.order_adjustments_total(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.order_amount_due(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.order_verified_allocated(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.order_refunds_total(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.order_net_received(uuid) TO service_role;
