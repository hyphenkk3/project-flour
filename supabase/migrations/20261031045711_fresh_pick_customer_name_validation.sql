-- Reject invalid names at the Fresh Pick order table boundary.
-- Only new customer-website orders linked to physical Fresh Pick stock are checked.
-- Existing rows, historical edits, standard cake orders, and staff order sources are unchanged.

DO $preflight$
BEGIN
  IF to_regprocedure('public._guard_fresh_pick_customer_name()') IS NOT NULL THEN
    RAISE EXCEPTION 'Fresh Pick customer-name guard already exists; refusing to replace it';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'orders'
      AND t.tgname = 'fresh_pick_customer_name_guard'
      AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION 'Fresh Pick customer-name trigger already exists; refusing to replace it';
  END IF;
END
$preflight$;

CREATE FUNCTION public._guard_fresh_pick_customer_name()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_token text;
  v_normalized text;
  v_meaningful_parts integer := 0;
BEGIN
  IF NEW.customer_id IS NOT NULL
     OR NEW.order_source IS DISTINCT FROM 'customer_website'
     OR NEW.extra_stock_id IS NULL THEN
    RETURN NEW;
  END IF;

  FOR v_token IN
    SELECT token
    FROM regexp_split_to_table(
      btrim(coalesce(NEW.guest_name, '')),
      '[[:space:]]+'
    ) AS parts(token)
    WHERE token <> ''
  LOOP
    v_normalized := lower(
      regexp_replace(
        regexp_replace(v_token, '^[.,/''’]+|[.,/''’]+$', '', 'g'),
        '\.',
        '',
        'g'
      )
    );

    IF v_normalized = ANY (ARRAY[
      'mr', 'mrs', 'ms', 'miss', 'mdm', 'madam', 'dr', 'prof',
      'professor', 'sir', 'datuk', 'dato', 'datin'
    ]) THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'Please enter your name without a title.';
    END IF;

    IF v_token ~ '[[:alpha:]]' THEN
      v_meaningful_parts := v_meaningful_parts + 1;
    END IF;
  END LOOP;

  IF v_meaningful_parts < 2 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Please enter your name and surname with a space between them.';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public._guard_fresh_pick_customer_name() FROM PUBLIC;
REVOKE ALL ON FUNCTION public._guard_fresh_pick_customer_name() FROM anon, authenticated;

CREATE TRIGGER fresh_pick_customer_name_guard
BEFORE INSERT ON public.orders
FOR EACH ROW
WHEN (
  NEW.customer_id IS NULL
  AND NEW.order_source = 'customer_website'
  AND NEW.extra_stock_id IS NOT NULL
)
EXECUTE FUNCTION public._guard_fresh_pick_customer_name();
REVOKE ALL ON FUNCTION public._guard_fresh_pick_customer_name() FROM service_role;
