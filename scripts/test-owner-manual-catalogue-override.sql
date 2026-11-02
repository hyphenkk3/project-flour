-- Disposable PostgreSQL 17 integration test. Run only after the Issue #8
-- migrations and owner-manual override migration. Synthetic records only;
-- the final ROLLBACK removes every fixture and created order.
\set ON_ERROR_STOP on
BEGIN;
SET CONSTRAINTS ALL DEFERRED;

INSERT INTO public.roles(id, code, name) VALUES
 ('a8000000-0000-4000-8000-000000000001','owner','Synthetic Owner'),
 ('a8000000-0000-4000-8000-000000000002','manager','Synthetic Manager'),
 ('a8000000-0000-4000-8000-000000000003','bakery','Synthetic Staff'),
 ('a8000000-0000-4000-8000-000000000004','customer_operations','Synthetic Customer Operations');
INSERT INTO auth.users(id,aud,role,email,created_at,updated_at) VALUES
 ('a8100000-0000-4000-8000-000000000001','authenticated','authenticated','owner-fixture@example.invalid',now(),now()),
 ('a8100000-0000-4000-8000-000000000002','authenticated','authenticated','manager-fixture@example.invalid',now(),now()),
 ('a8100000-0000-4000-8000-000000000003','authenticated','authenticated','staff-fixture@example.invalid',now(),now()),
 ('a8100000-0000-4000-8000-000000000004','authenticated','authenticated','ops-fixture@example.invalid',now(),now()),
 ('a8100000-0000-4000-8000-000000000005','authenticated','authenticated','customer-fixture@example.invalid',now(),now()),
 ('a8100000-0000-4000-8000-000000000006','authenticated','authenticated','inactive-owner-fixture@example.invalid',now(),now());
INSERT INTO public.staff_profiles(id,auth_user_id,username,display_name,role_id,is_active,archived_at) VALUES
 ('a8200000-0000-4000-8000-000000000001','a8100000-0000-4000-8000-000000000001','owner_fixture','Synthetic Owner','a8000000-0000-4000-8000-000000000001',true,null),
 ('a8200000-0000-4000-8000-000000000002','a8100000-0000-4000-8000-000000000002','manager_fixture','Synthetic Manager','a8000000-0000-4000-8000-000000000002',true,null),
 ('a8200000-0000-4000-8000-000000000003','a8100000-0000-4000-8000-000000000003','staff_fixture','Synthetic Staff','a8000000-0000-4000-8000-000000000003',true,null),
 ('a8200000-0000-4000-8000-000000000004','a8100000-0000-4000-8000-000000000004','ops_fixture','Synthetic Customer Operations','a8000000-0000-4000-8000-000000000004',true,null),
 ('a8200000-0000-4000-8000-000000000006','a8100000-0000-4000-8000-000000000006','inactive_owner_fixture','Inactive Synthetic Owner','a8000000-0000-4000-8000-000000000001',false,now());
INSERT INTO public.collections(id,name,month,status,purpose)
VALUES ('a8300000-0000-4000-8000-000000000001','Synthetic fixture collection',date_trunc('month',current_date+20)::date,'active','monthly');
INSERT INTO public.library_cakes(id,name,status)
VALUES ('a8400000-0000-4000-8000-000000000001','Synthetic fixture cake','active');
INSERT INTO public.library_cake_sizes(id,cake_id,label,price)
VALUES ('a8500000-0000-4000-8000-000000000001','a8400000-0000-4000-8000-000000000001','6 inch',35.00);
INSERT INTO public.complimentary_item_types(id,code,name,is_active) VALUES
 ('a8600000-0000-4000-8000-000000000001','fixture_inactive_comp','Canonical inactive complimentary',false),
 ('a8600000-0000-4000-8000-000000000002','fixture_unmapped_comp','Canonical unmapped complimentary',true);
INSERT INTO public.paid_addon_types(id,code,name,unit_price,financial_shorthand,is_active,sort_order,max_quantity)
VALUES ('a8700000-0000-4000-8000-000000000001','fixture_inactive_paid','Canonical inactive paid add-on',12.50,'FIXTURE_PAID',false,17,2);

DO $$
BEGIN
 IF has_function_privilege('anon','public.create_owner_manual_guest_preorder_with_catalogue_override(uuid,text,text,text,text,text,boolean,date,time without time zone,text,jsonb,jsonb,boolean,boolean,text,text,text,jsonb,public.fulfilment_method,jsonb,jsonb)','EXECUTE')
    OR has_function_privilege('service_role','public.create_owner_manual_guest_preorder_with_catalogue_override(uuid,text,text,text,text,text,boolean,date,time without time zone,text,jsonb,jsonb,boolean,boolean,text,text,text,jsonb,public.fulfilment_method,jsonb,jsonb)','EXECUTE') THEN
   RAISE EXCEPTION 'anon/service_role unexpectedly has Owner RPC EXECUTE';
 END IF;
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','a8100000-0000-4000-8000-000000000001',true);
SELECT set_config('request.jwt.claims','{"sub":"a8100000-0000-4000-8000-000000000001","role":"authenticated"}',true);
DO $$
DECLARE o public.orders;
BEGIN
 SELECT * INTO o FROM public.create_owner_manual_guest_preorder_with_catalogue_override(
  'a8200000-0000-4000-8000-000000000001','Synthetic Owner Manual Order',null,null,'whatsapp',null,false,current_date+20,time '12:00',null,
  jsonb_build_array(jsonb_build_object('cake_id','a8400000-0000-4000-8000-000000000001','cake_size_id','a8500000-0000-4000-8000-000000000001','quantity',1)),
  jsonb_build_array(
   jsonb_build_object('type_id','a8600000-0000-4000-8000-000000000001','name','forged name','quantity',1,'sort_order',1),
   jsonb_build_object('type_id','a8600000-0000-4000-8000-000000000002','name','also forged','quantity',2,'sort_order',2)),
  false,false,null,null,null,
  jsonb_build_array(jsonb_build_object('code','fixture_inactive_paid','quantity',2,'name','forged','unit_price',0.01,'financial_shorthand','FORGED','messages',jsonb_build_array(null,null))),
  'pickup'::public.fulfilment_method,null,null);
 PERFORM set_config('test.owner_order_id',o.id::text,true);
 IF o.created_by <> 'a8200000-0000-4000-8000-000000000001' OR o.extra_stock_id IS NOT NULL OR o.status <> 'submitted' OR o.payment_status <> 'unpaid' THEN
  RAISE EXCEPTION 'Owner manual order has unexpected identity, stock, status, or payment state';
 END IF;
 IF (SELECT count(*) FROM public.order_complimentary_items WHERE order_id=o.id) <> 2
    OR NOT EXISTS(SELECT 1 FROM public.order_complimentary_items WHERE order_id=o.id AND complimentary_item_type_id='a8600000-0000-4000-8000-000000000001' AND name='Canonical inactive complimentary' AND quantity=1)
    OR NOT EXISTS(SELECT 1 FROM public.order_complimentary_items WHERE order_id=o.id AND complimentary_item_type_id='a8600000-0000-4000-8000-000000000002' AND name='Canonical unmapped complimentary' AND quantity=2) THEN
  RAISE EXCEPTION 'Inactive/unmapped complimentary snapshots were not canonicalized';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.order_paid_addons WHERE order_id=o.id AND code='fixture_inactive_paid' AND name='Canonical inactive paid add-on' AND unit_price=12.50 AND financial_shorthand='FIXTURE_PAID' AND quantity=2) THEN
  RAISE EXCEPTION 'Paid snapshot was not server-authoritative';
 END IF;
 IF (SELECT sum(quantity*unit_price) FROM public.order_items WHERE order_id=o.id)+(SELECT sum(quantity*unit_price) FROM public.order_paid_addons WHERE order_id=o.id) <> 60.00 THEN
  RAISE EXCEPTION 'Synthetic commercial snapshot total differs from 60.00';
 END IF;
END $$;
\echo PASS: active Owner may select inactive/unmapped items; snapshots, totals, stock and payment state are authoritative

RESET ROLE;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM issue8_private.owner_manual_order_context) THEN RAISE EXCEPTION 'Private Owner context remained after success'; END IF;
END $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','a8100000-0000-4000-8000-000000000001',true);
SELECT set_config('request.jwt.claims','{"sub":"a8100000-0000-4000-8000-000000000001","role":"authenticated"}',true);
UPDATE public.complimentary_item_types SET name='Edited catalogue name',is_active=true WHERE id='a8600000-0000-4000-8000-000000000001';
UPDATE public.paid_addon_types SET name='Edited paid name',unit_price=99.00,financial_shorthand='EDITED',is_active=true WHERE id='a8700000-0000-4000-8000-000000000001';
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.order_complimentary_items WHERE order_id=current_setting('test.owner_order_id')::uuid AND name='Canonical inactive complimentary')
    OR NOT EXISTS(SELECT 1 FROM public.order_paid_addons WHERE order_id=current_setting('test.owner_order_id')::uuid AND name='Canonical inactive paid add-on' AND unit_price=12.50 AND financial_shorthand='FIXTURE_PAID') THEN
  RAISE EXCEPTION 'Catalogue edits changed historical order snapshots';
 END IF;
END $$;
\echo PASS: catalogue edits preserve historical order snapshots

SELECT set_config('request.jwt.claim.sub','a8100000-0000-4000-8000-000000000002',true);
SELECT set_config('request.jwt.claims','{"sub":"a8100000-0000-4000-8000-000000000002","role":"authenticated"}',true);
DO $$
DECLARE o public.orders; v_before bigint; v_after bigint; v_denied boolean; v_message text;
BEGIN
 SELECT count(*) INTO v_before FROM public.orders;
 v_denied:=false;
 BEGIN
  PERFORM public.create_owner_manual_guest_preorder_with_catalogue_override('a8200000-0000-4000-8000-000000000002',null,null,null,null,null,false,null,null,null,'[]','[]',false,false,null,null,null);
 EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
 IF NOT v_denied THEN RAISE EXCEPTION 'Manager was not denied Owner override'; END IF;
 SELECT count(*) INTO v_after FROM public.orders;
 IF v_after<>v_before THEN RAISE EXCEPTION 'Denied Manager request created partial order'; END IF;
 SELECT * INTO o FROM public.create_staff_guest_preorder_with_source_detail(
  'a8200000-0000-4000-8000-000000000002','Synthetic Manager Standard Order',null,null,'whatsapp',null,false,current_date+20,time '13:00',null,
  jsonb_build_array(jsonb_build_object('cake_id','a8400000-0000-4000-8000-000000000001','cake_size_id','a8500000-0000-4000-8000-000000000001','quantity',1)),
  '[]',false,false,null,null,null,'[]'::jsonb,'pickup'::public.fulfilment_method,null,null);
 PERFORM set_config('test.manager_order_id',o.id::text,true);
 v_denied:=false;
 BEGIN
  PERFORM public.create_staff_guest_preorder_with_source_detail(
   'a8200000-0000-4000-8000-000000000002','Synthetic Manager Ineligible Add-on',null,null,'whatsapp',null,false,current_date+20,time '14:00',null,
   jsonb_build_array(jsonb_build_object('cake_id','a8400000-0000-4000-8000-000000000001','cake_size_id','a8500000-0000-4000-8000-000000000001','quantity',1)),
   '[]',false,false,null,null,null,jsonb_build_array(jsonb_build_object('code','fixture_inactive_paid','quantity',1)),'pickup'::public.fulfilment_method,null,null);
 EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_message=MESSAGE_TEXT; IF position('Paid add-on is not available' in v_message)=0 THEN RAISE; END IF; v_denied:=true; END;
 IF NOT v_denied THEN RAISE EXCEPTION 'Standard Manager RPC accepted ineligible catalogue item'; END IF;
 SELECT count(*) INTO v_after FROM public.orders;
 IF v_after<>v_before+1 THEN RAISE EXCEPTION 'Rejected standard RPC left a partial order'; END IF;
END $$;
\echo PASS: Manager override denied, standard staff RPC preserved, ineligible ordinary submission fully rolled back

DO $$
DECLARE v_user uuid; v_staff uuid; v_denied boolean;
BEGIN
 FOR v_user,v_staff IN SELECT * FROM (VALUES
  ('a8100000-0000-4000-8000-000000000003'::uuid,'a8200000-0000-4000-8000-000000000003'::uuid),
  ('a8100000-0000-4000-8000-000000000004'::uuid,'a8200000-0000-4000-8000-000000000004'::uuid),
  ('a8100000-0000-4000-8000-000000000005'::uuid,NULL::uuid),
  ('a8100000-0000-4000-8000-000000000006'::uuid,'a8200000-0000-4000-8000-000000000006'::uuid)
 ) AS s(auth_id,staff_id) LOOP
  PERFORM set_config('request.jwt.claim.sub',v_user::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_user,'role','authenticated')::text,true);
  v_denied:=false;
  BEGIN PERFORM public.create_owner_manual_guest_preorder_with_catalogue_override(v_staff,null,null,null,null,null,false,null,null,null,'[]','[]',false,false,null,null,null);
  EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'Non-Owner identity % used Owner override',v_user; END IF;
 END LOOP;
END $$;
\echo PASS: ordinary staff, Customer Operations, non-staff customer and inactive/archived Owner denied

RESET ROLE;
DO $$
DECLARE v_denied boolean:=false;
BEGIN
 BEGIN
  INSERT INTO public.order_paid_addons(order_id,paid_addon_type_id,code,name,unit_price,financial_shorthand,quantity)
  VALUES(current_setting('test.manager_order_id')::uuid,'a8700000-0000-4000-8000-000000000001','fixture_inactive_paid','forged',0.01,'FORGED',1);
 EXCEPTION WHEN OTHERS THEN v_denied:=true; END;
 IF NOT v_denied THEN RAISE EXCEPTION 'Out-of-context trigger accepted inactive/unmapped paid add-on'; END IF;
END $$;
\echo PASS: shared trigger remains restrictive without the private transaction context

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','a8100000-0000-4000-8000-000000000001',true);
SELECT set_config('request.jwt.claims','{"sub":"a8100000-0000-4000-8000-000000000001","role":"authenticated"}',true);
DO $$
DECLARE v_denied boolean:=false; v_message text;
BEGIN
 BEGIN
  PERFORM public.create_owner_manual_guest_preorder_with_catalogue_override(
   'a8200000-0000-4000-8000-000000000001','Synthetic Over-limit Order',null,null,'whatsapp',null,false,current_date+20,time '15:00',null,
   jsonb_build_array(jsonb_build_object('cake_id','a8400000-0000-4000-8000-000000000001','cake_size_id','a8500000-0000-4000-8000-000000000001','quantity',1)),
   '[]',false,false,null,null,null,jsonb_build_array(jsonb_build_object('code','fixture_inactive_paid','quantity',3)),'pickup'::public.fulfilment_method,null,null);
 EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_message=MESSAGE_TEXT; IF position('may not exceed 2' in v_message)=0 THEN RAISE; END IF; v_denied:=true; END;
 IF NOT v_denied OR EXISTS(SELECT 1 FROM public.orders WHERE guest_name='Synthetic Over-limit Order') THEN RAISE EXCEPTION 'Quantity cap or atomic rollback failed'; END IF;
END $$;
\echo PASS: paid quantity maximum and failed-transaction rollback enforced

SET CONSTRAINTS ALL IMMEDIATE;
ROLLBACK;
\echo PASS: synthetic fixture data and orders rolled back
