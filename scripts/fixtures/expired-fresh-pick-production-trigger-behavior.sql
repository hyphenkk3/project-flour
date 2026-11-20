-- Behavioral smoke fixture for the sanitized Production-catalog reconstruction.
-- Uses the captured Production functions and all 42 captured triggers; synthetic rows only.
SET TIME ZONE 'Asia/Kuala_Lumpur';

INSERT INTO public.roles(id, code, name)
VALUES ('20000000-0000-0000-0000-000000000001', 'bakery', 'Synthetic Bakery');
INSERT INTO auth.users(id) VALUES ('30000000-0000-0000-0000-000000000001');
INSERT INTO public.staff_profiles(id, auth_user_id, username, display_name, role_id)
VALUES ('40000000-0000-0000-0000-000000000001',
        '30000000-0000-0000-0000-000000000001',
        'release-gate-bakery', 'Synthetic Bakery Actor',
        '20000000-0000-0000-0000-000000000001');

INSERT INTO public.library_cakes(id, name, status)
VALUES
 ('60000000-0000-0000-0000-000000000001', 'Synthetic Yam', 'active'),
 ('60000000-0000-0000-0000-000000000002', 'Synthetic Chocolate', 'active');
INSERT INTO public.library_cake_sizes(id, cake_id, label, price)
VALUES
 ('70000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', '6 inch', 0),
 ('70000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000002', '6 inch', 0);

INSERT INTO public.orders(id, order_number, fulfilment_method, pickup_date, pickup_time,
                          status, payment_status, guest_name, order_source)
VALUES ('50000000-0000-0000-0000-000000000001', 'ORD-20261031-9901',
        'pickup', '2026-10-31', '12:00', 'paid', 'paid',
        'Synthetic Release Test', 'walk_in');
INSERT INTO public.order_items(id, order_id, cake_id, cake_size_id, quantity, unit_price, cake_name, size_label)
VALUES
 ('51000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001',
  '60000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001',
  1, 0, 'Synthetic Yam', '6 inch'),
 ('51000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000001',
  '60000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000002',
  1, 0, 'Synthetic Chocolate', '6 inch');

INSERT INTO public.extra_stock(
  id, lifecycle, cake_name, size_label, library_cake_id, library_cake_size_id,
  prepared_on, pickup_through_at, proposed_by, confirmed_at, confirmed_by,
  pickup_available_from_at, ready_for_collection
)
VALUES
 ('83000000-0000-0000-0000-000000000001', 'confirmed', 'Synthetic Yam', '6 inch',
  '60000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001',
  '2026-10-31', '2026-10-31 23:59:59+08',
  '40000000-0000-0000-0000-000000000001', now() - interval '1 day',
  '40000000-0000-0000-0000-000000000001', '2026-10-31 00:00:00+08', true),
 ('83000000-0000-0000-0000-000000000002', 'confirmed', 'Synthetic Slice Cake', '6 inch',
  null, null, '2026-10-31', '2026-10-31 23:59:59+08',
  '40000000-0000-0000-0000-000000000001', now() - interval '1 day',
  '40000000-0000-0000-0000-000000000001', '2026-10-31 00:00:00+08', false);

SELECT set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', false);
SELECT set_config('request.jwt.claim.role', 'authenticated', false);
SELECT public.assign_extra_stock_to_order(
  '83000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001'
);
SELECT public.cut_extra_stock_into_slices(
  '83000000-0000-0000-0000-000000000002',
  '40000000-0000-0000-0000-000000000001'
);
DO $behavior$
DECLARE v_primary uuid; v_ready_at timestamptz; v_production_started_at timestamptz;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.extra_stock
    WHERE id='83000000-0000-0000-0000-000000000001'
      AND order_id='50000000-0000-0000-0000-000000000001'
      AND sold_at IS NOT NULL AND ready_for_collection
  ) THEN RAISE EXCEPTION 'actual-trigger assignment did not preserve sold/ready state'; END IF;
  SELECT extra_stock_id, ready_at, production_started_at
    INTO v_primary, v_ready_at, v_production_started_at
  FROM public.orders WHERE id='50000000-0000-0000-0000-000000000001';
  IF v_primary IS NOT NULL THEN
    RAISE EXCEPTION 'mixed Fresh Pick allocation must not prematurely set the legacy primary pointer, got %',v_primary;
  END IF;
  IF v_ready_at IS NOT NULL THEN
    RAISE EXCEPTION 'mixed order was unexpectedly marked ready at %',v_ready_at;
  END IF;
  IF v_production_started_at IS NOT NULL THEN
    RAISE EXCEPTION 'mixed order received fabricated production start %',v_production_started_at;
  END IF;
  IF (SELECT count(*) FROM public.order_timeline_events
      WHERE order_id='50000000-0000-0000-0000-000000000001' AND event_type='extra_assigned') <> 1
  THEN RAISE EXCEPTION 'assignment timeline audit was not exactly once'; END IF;
  IF (SELECT count(*) FROM public.extra_stock_events
      WHERE extra_stock_id='83000000-0000-0000-0000-000000000001' AND event_type='assigned') <> 1
  THEN RAISE EXCEPTION 'assignment stock audit was not exactly once'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.extra_stock
    WHERE id='83000000-0000-0000-0000-000000000002'
      AND cut_into_slices_at IS NOT NULL
      AND cut_into_slices_by='40000000-0000-0000-0000-000000000001'
  ) THEN RAISE EXCEPTION 'actual-trigger slice RPC did not complete'; END IF;
  IF (SELECT count(*) FROM public.extra_stock_events
      WHERE extra_stock_id='83000000-0000-0000-0000-000000000002' AND event_type='cut_into_slices') <> 1
  THEN RAISE EXCEPTION 'slice stock audit was not exactly once'; END IF;
END
$behavior$;
