-- Targeted Production release candidate based on accepted DEV migration 20261017142007.
-- Requires the already-present Production _bind_rpc_actor helper; keep this after the assignment candidate in the documented release sequence.
-- Data-preserving: replaces one RPC and changes only its EXECUTE ACL.
DO $preflight$
DECLARE
  v_proc oid := to_regprocedure('public.cut_extra_stock_into_slices(uuid,uuid)');
BEGIN
  IF v_proc IS NULL THEN
    RAISE EXCEPTION 'Slicing precondition failed: expected public.cut_extra_stock_into_slices(uuid,uuid)';
  END IF;
  IF to_regprocedure('public._bind_rpc_actor(uuid)') IS NULL
     OR to_regprocedure('public._staff_role_code(uuid)') IS NULL
     OR to_regprocedure('public._record_extra_stock_event(uuid,text,uuid,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'Slicing precondition failed: required actor, role, or audit helper missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid = v_proc
      AND p.proargnames = ARRAY['p_extra_stock_id','p_actor_staff_id']::text[]
  ) THEN
    RAISE EXCEPTION 'Slicing precondition failed: function argument names differ';
  END IF;
  IF (
    SELECT count(*) FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'extra_stock'
      AND column_name IN ('id','lifecycle','sold_at','cut_into_slices_at','cut_into_slices_by','updated_at')
  ) <> 6 THEN
    RAISE EXCEPTION 'Slicing precondition failed: expected Fresh Pick stock columns missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated')
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role')
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    RAISE EXCEPTION 'Slicing precondition failed: expected Supabase roles missing';
  END IF;
END
$preflight$;

CREATE OR REPLACE FUNCTION public.cut_extra_stock_into_slices(
  p_extra_stock_id uuid,
  p_actor_staff_id uuid
)
RETURNS public.extra_stock
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor_staff_id uuid;
  v_role text;
  stock_row public.extra_stock;
BEGIN
  IF p_extra_stock_id IS NULL THEN
    RAISE EXCEPTION 'EXTRA stock is required';
  END IF;
  IF p_actor_staff_id IS NULL THEN
    RAISE EXCEPTION 'Staff actor is required';
  END IF;

  v_actor_staff_id := public._bind_rpc_actor(p_actor_staff_id);
  v_role := public._staff_role_code(v_actor_staff_id);
  IF v_role IS NULL OR v_role NOT IN ('bakery', 'manager', 'owner') THEN
    RAISE EXCEPTION 'Not authorized to cut EXTRA into slices';
  END IF;

  SELECT e.*
  INTO stock_row
  FROM public.extra_stock e
  WHERE e.id = p_extra_stock_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'EXTRA stock not found';
  END IF;

  IF stock_row.lifecycle <> 'confirmed' THEN
    RAISE EXCEPTION 'Only a confirmed Fresh Pick can be cut into slices';
  END IF;
  IF stock_row.sold_at IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot cut a sold Extra into slices';
  END IF;
  IF stock_row.cut_into_slices_at IS NOT NULL THEN
    RAISE EXCEPTION 'This Extra was already cut into slices';
  END IF;

  UPDATE public.extra_stock e
  SET
    cut_into_slices_at = now(),
    cut_into_slices_by = v_actor_staff_id,
    updated_at = now()
  WHERE e.id = p_extra_stock_id
    AND e.sold_at IS NULL
    AND e.cut_into_slices_at IS NULL
    AND e.lifecycle = 'confirmed'
  RETURNING * INTO stock_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cannot cut this Fresh Pick into slices';
  END IF;

  PERFORM public._record_extra_stock_event(
    p_extra_stock_id,
    'cut_into_slices',
    v_actor_staff_id,
    '{}'::jsonb
  );

  RETURN stock_row;
END;
$function$;

REVOKE ALL PRIVILEGES ON FUNCTION public.cut_extra_stock_into_slices(uuid, uuid) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION public.cut_extra_stock_into_slices(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.cut_extra_stock_into_slices(uuid, uuid) TO authenticated, service_role;
