-- Issue #7: restrict direct orders table access to active, unarchived staff.
-- Guest checkout remains via existing SECURITY DEFINER RPCs; this migration does not
-- alter checkout function bodies or EXECUTE grants.
-- DEV rehearsal required before applying. Rollback SQL is documented below.
DO $$
BEGIN
  IF to_regclass('public.orders') IS NULL
     OR to_regclass('public.staff_profiles') IS NULL
     OR to_regprocedure('auth.uid()') IS NULL THEN
    RAISE EXCEPTION 'orders RLS prerequisites missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='staff_profiles' AND column_name='auth_user_id')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='staff_profiles' AND column_name='is_active')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='staff_profiles' AND column_name='archived_at') THEN
    RAISE EXCEPTION 'verified active-staff mapping columns missing';
  END IF;
END $$;

BEGIN;
DROP POLICY IF EXISTS "Authenticated staff can select orders" ON public.orders;
DROP POLICY IF EXISTS "Authenticated staff can insert orders" ON public.orders;
DROP POLICY IF EXISTS "Authenticated staff can update orders" ON public.orders;
DROP POLICY IF EXISTS orders_staff_select ON public.orders;
DROP POLICY IF EXISTS orders_staff_insert ON public.orders;
DROP POLICY IF EXISTS orders_staff_update ON public.orders;

REVOKE ALL PRIVILEGES ON TABLE public.orders FROM anon;
REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.orders FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.orders TO authenticated;

CREATE POLICY orders_active_staff_select ON public.orders
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.staff_profiles s
    WHERE s.auth_user_id = auth.uid()
      AND s.is_active IS TRUE
      AND s.archived_at IS NULL
  ));

CREATE POLICY orders_active_staff_insert ON public.orders
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.staff_profiles s
    WHERE s.auth_user_id = auth.uid()
      AND s.is_active IS TRUE
      AND s.archived_at IS NULL
  ));

CREATE POLICY orders_active_staff_update ON public.orders
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.staff_profiles s
    WHERE s.auth_user_id = auth.uid()
      AND s.is_active IS TRUE
      AND s.archived_at IS NULL
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.staff_profiles s
    WHERE s.auth_user_id = auth.uid()
      AND s.is_active IS TRUE
      AND s.archived_at IS NULL
  ));
COMMIT;

-- Rollback (only if this exact migration is the latest DEV change):
-- Restore prior three permissive authenticated policies and broad table grants
-- only through a separately reviewed rollback after confirming no dependent changes.
