-- DEV-only, rollback-only acceptance test for automatic Fresh Pick readiness.
-- Run only against project tzwtpxdcggesgjaqxkqr. This fixture uses existing
-- active staff/catalogue identities but creates no persistent business data.
-- All inserts, trigger effects, payment rows and audit rows are rolled back by
-- the explicit outer ROLLBACK after all assertions succeed.

begin;
set constraints all deferred;

do $test$
declare
  actor_id uuid;
  owner_actor_id uuid;
  v_cake_id uuid;
  v_size_id uuid;
  cake_name text;
  size_label text;
  unit_price numeric;
  v_order_id uuid;
  v_stock_id uuid;
  v_payment_id uuid;
  v_order_due numeric;
  method text;
  ready_before_purchase boolean;
  scenario text;
  pickup_date_value date := timezone('Asia/Kuala_Lumpur', clock_timestamp())::date + 1;
  order_no text;
  sequence_no integer := 6100;
  ready_event_count integer;
  stock_ready_event_count integer;
  undo_event_count_before integer;
begin
    perform set_config('request.jwt.claim.role', 'service_role', true);

    select sp.id into actor_id
    from public.staff_profiles sp
    where sp.is_active is true
      and sp.archived_at is null
      and public._staff_role_code(sp.id) in ('bakery', 'manager', 'owner')
    order by sp.created_at
    limit 1;

    if actor_id is null then
      raise exception 'TEST_SETUP: no active Bakery/Manager/Owner profile';
    end if;

    select sp.id into owner_actor_id
    from public.staff_profiles sp
    where sp.is_active is true
      and sp.archived_at is null
      and public._staff_role_code(sp.id) = 'owner'
    order by sp.created_at
    limit 1;

    select c.id, s.id, c.name, s.label, s.price
    into v_cake_id, v_size_id, cake_name, size_label, unit_price
    from public.library_cakes c
    join public.library_cake_sizes s on s.cake_id = c.id
    where s.price > 1
    order by c.created_at, s.sort_order
    limit 1;

    if v_cake_id is null then
      raise exception 'TEST_SETUP: no catalogue cake size available';
    end if;

    -- Exercise both causal orders for each fulfilment: stock already ready
    -- before checkout/allocation, and stock becoming ready after payment.
    foreach method in array array['pickup', 'delivery', 'dine_in'] loop
      foreach ready_before_purchase in array array[true, false] loop
        set constraints all deferred;
        v_order_id := gen_random_uuid();
        v_stock_id := gen_random_uuid();
        v_payment_id := gen_random_uuid();
        sequence_no := sequence_no + 1;
        order_no := 'ORD-20991231-' || lpad(sequence_no::text, 4, '0');

        insert into public.extra_stock (
          id, lifecycle, cake_name, size_label, library_cake_id,
          library_cake_size_id, prepared_on, pickup_available_from_at,
          pickup_through_at, proposed_by, confirmed_at, confirmed_by,
          ready_for_collection
        ) values (
          v_stock_id, 'confirmed', cake_name, size_label, v_cake_id,
          v_size_id, pickup_date_value,
          (pickup_date_value::timestamp + time '09:00') at time zone 'Asia/Kuala_Lumpur',
          ((pickup_date_value + 1)::timestamp at time zone 'Asia/Kuala_Lumpur'),
          actor_id, clock_timestamp(), actor_id, false
        );

        if ready_before_purchase then
          perform public.mark_extra_stock_ready_for_collection(v_stock_id, actor_id, 'rollback-only readiness acceptance');
          if not (select e.ready_for_collection from public.extra_stock e where e.id = v_stock_id) then
            raise exception 'ASSERT: unassigned stock readiness was not preserved';
          end if;
        end if;

        insert into public.orders (
          id, order_number, guest_name, fulfilment_method, pickup_date,
          pickup_time, status, payment_status, order_source
        ) values (
          v_order_id, order_no, 'Synthetic readiness fixture', method::public.fulfilment_method,
          pickup_date_value, time '15:00', 'submitted', 'unpaid', 'customer_website'
        );

        if method = 'delivery' then
          insert into public.order_delivery_details (
            order_id, recipient_name, recipient_phone, address_line_1,
            postcode, city, state, recipient_notify_preference
          ) values (
            v_order_id, 'Synthetic readiness fixture', '0000000000',
            'DEV test address', '00000', 'DEV test city', 'Selangor',
            'do_not_inform_recipient'
          );
        elsif method = 'dine_in' then
          insert into public.order_dine_in_reservations (
            order_id, reservation_date, reservation_time, guest_count,
            venue, adult_count, kid_count, toddler_count
          ) values (
            v_order_id, pickup_date_value, time '15:00', 1,
            'hyphen', 1, 0, 0
          );
        end if;

        insert into public.order_items (
          order_id, cake_id, cake_size_id, quantity, unit_price,
          cake_name, size_label
        ) values (
          v_order_id, v_cake_id, v_size_id, 1, unit_price, cake_name, size_label
        );

        perform public.assign_extra_stock_to_order(v_stock_id, v_order_id, actor_id);

        if ready_before_purchase then
          perform public._sync_fresh_pick_order_readiness(v_order_id);
          if exists (select 1 from public.orders o where o.id=v_order_id and o.ready_at is not null) then
            raise exception 'ASSERT: unpaid % order became ready despite prepared stock', method;
          end if;
        end if;

        select public.order_amount_due(v_order_id) into v_order_due;
        insert into public.payments (
          id, amount, method, paid_at, verified_by, verified_at, status
        ) values (
          v_payment_id, v_order_due, 'wb_qr', clock_timestamp(), actor_id, clock_timestamp(), 'verified'
        );
        insert into public.payment_allocations (payment_id, order_id, amount)
        values (v_payment_id, v_order_id, v_order_due);
        update public.orders
        set status = 'paid', payment_status = 'paid'
        where id = v_order_id;

        set constraints all immediate;

        if ready_before_purchase then
          if not (select e.ready_for_collection from public.extra_stock e where e.id = v_stock_id) then
            raise exception 'ASSERT: stock ready before purchase became unready for %', method;
          end if;
          if not exists (select 1 from public.orders o where o.id=v_order_id and o.ready_at is not null) then
            raise exception 'ASSERT: pre-ready stock did not automatically ready % order', method;
          end if;
        else
          if exists (select 1 from public.orders o where o.id=v_order_id and o.ready_at is not null) then
            raise exception 'ASSERT: unready stock prematurely readied % order', method;
          end if;
          perform public.mark_extra_stock_ready_for_collection(v_stock_id, actor_id, 'rollback-only readiness acceptance');
          if not exists (select 1 from public.orders o where o.id=v_order_id and o.ready_at is not null) then
            raise exception 'ASSERT: post-purchase Ready action did not automatically ready % order', method;
          end if;
        end if;

        select count(*) into ready_event_count
        from public.order_timeline_events e
        where e.order_id = v_order_id
          and e.event_type = 'order_marked_ready'
          and e.metadata ->> 'source' = 'fully_paid_prepared_fresh_pick_stock';
        if ready_event_count <> 1 then
          raise exception 'ASSERT: expected one automatic ready event for %, got %', method, ready_event_count;
        end if;

        perform public._sync_fresh_pick_order_readiness(v_order_id);
        select count(*) into ready_event_count
        from public.order_timeline_events e
        where e.order_id = v_order_id
          and e.event_type = 'order_marked_ready'
          and e.metadata ->> 'source' = 'fully_paid_prepared_fresh_pick_stock';
        if ready_event_count <> 1 then
          raise exception 'ASSERT: repeated sync duplicated readiness event for %', method;
        end if;

        if method = 'delivery' and not ready_before_purchase then
          update public.payment_allocations
          set amount = greatest(v_order_due / 2, 0.01)
          where payment_id = v_payment_id and order_id = v_order_id;
          if exists (select 1 from public.orders o where o.id=v_order_id and o.ready_at is not null) then
            raise exception 'ASSERT: payment correction did not revoke Delivery readiness';
          end if;
          update public.payment_allocations
          set amount = v_order_due
          where payment_id = v_payment_id and order_id = v_order_id;
          if not exists (select 1 from public.orders o where o.id=v_order_id and o.ready_at is not null) then
            raise exception 'ASSERT: restored settlement did not re-enable Delivery readiness';
          end if;
        end if;

        -- Temporarily make the item quantity exceed its exact stock coverage.
        -- The supported database invariant rejects committing this partial
        -- state; the synchronizer must also refuse it while the transaction is
        -- being reconciled. Restore the exact quantity before constraints run.
        set constraints all deferred;
        update public.order_items set quantity = 2 where order_id = v_order_id;
        if public._fresh_pick_order_items_are_ready(v_order_id) then
          raise exception 'ASSERT: partial physical allocation passed exact-coverage helper for %', method;
        end if;
        perform public._sync_fresh_pick_order_readiness(v_order_id);
        if exists (select 1 from public.orders o where o.id=v_order_id and o.ready_at is not null) then
          raise exception 'ASSERT: partial allocation remained order-ready for %', method;
        end if;
        update public.order_items set quantity = 1 where order_id = v_order_id;
        perform public._sync_fresh_pick_order_readiness(v_order_id);
        if not exists (select 1 from public.orders o where o.id=v_order_id and o.ready_at is not null) then
          raise exception 'ASSERT: order did not recover after exact allocation was restored for %', method;
        end if;
        set constraints all immediate;

        -- The physical Ready reversal must revoke unhanded order readiness;
        -- repeated Undo is a no-op and leaves the stock-event count unchanged.
        select count(*) into undo_event_count_before
        from public.order_timeline_events e
        where e.order_id = v_order_id and e.event_type = 'order_ready_undone';
        perform public.undo_extra_stock_ready_for_collection(v_stock_id, actor_id, 'rollback-only readiness acceptance');
        if exists (select 1 from public.orders o where o.id=v_order_id and o.ready_at is not null) then
          raise exception 'ASSERT: physical readiness reversal did not revoke % readiness', method;
        end if;
        select count(*) into ready_event_count
        from public.order_timeline_events e
        where e.order_id = v_order_id and e.event_type = 'order_ready_undone';
        if ready_event_count <> undo_event_count_before + 1 then
          raise exception 'ASSERT: readiness reversal audit event missing or duplicated for %', method;
        end if;
        select count(*) into stock_ready_event_count
        from public.extra_stock_events e
        where e.extra_stock_id = v_stock_id and e.event_type = 'ready_for_collection_undone';
        perform public.undo_extra_stock_ready_for_collection(v_stock_id, actor_id, 'rollback-only repeat');
        if (select count(*) from public.extra_stock_events e where e.extra_stock_id=v_stock_id and e.event_type='ready_for_collection_undone') <> stock_ready_event_count then
          raise exception 'ASSERT: repeated physical Undo created a duplicate event for %', method;
        end if;

        if method = 'delivery' and ready_before_purchase then
          perform public.mark_extra_stock_ready_for_collection(v_stock_id, actor_id, 'rollback-only readiness acceptance');
          if not exists (select 1 from public.orders o where o.id=v_order_id and o.ready_at is not null) then
            raise exception 'ASSERT: Delivery did not regain automatic readiness after physical readiness returned';
          end if;
          if owner_actor_id is null then
            raise exception 'TEST_SETUP: no active Owner profile for cancellation/refund regression';
          end if;
          insert into public.order_timeline_events (order_id, event_type, metadata)
          values (v_order_id, 'preorder_submitted', jsonb_build_object(
            'extra_stock_ids', jsonb_build_array(v_stock_id),
            'item_count', 1
          ));
          perform public.cancel_and_refund_paid_fresh_pick(v_order_id, owner_actor_id, 'rollback-only automatic readiness regression');
          if not exists (select 1 from public.orders o where o.id=v_order_id and o.status='cancelled' and o.ready_at is null) then
            raise exception 'ASSERT: authorized cancellation/refund did not revoke Delivery readiness';
          end if;
        end if;
      end loop;
    end loop;

    -- Negative controls across all fulfilments: unpaid and partial allocation
    -- remain blocked even when the physical stock is Ready. A started Bakery
    -- lifecycle also cannot be auto-completed by Fresh Pick synchronization.
    foreach method in array array['pickup', 'delivery', 'dine_in'] loop
      foreach scenario in array array['unpaid', 'production_started'] loop
        set constraints all deferred;
        v_order_id := gen_random_uuid();
        v_stock_id := gen_random_uuid();
        v_payment_id := gen_random_uuid();
        sequence_no := sequence_no + 1;
        order_no := 'ORD-20991231-' || lpad(sequence_no::text, 4, '0');

        insert into public.extra_stock (
          id, lifecycle, cake_name, size_label, library_cake_id,
          library_cake_size_id, prepared_on, pickup_available_from_at,
          pickup_through_at, proposed_by, confirmed_at, confirmed_by,
          ready_for_collection
        ) values (
          v_stock_id, 'confirmed', cake_name, size_label, v_cake_id,
          v_size_id, pickup_date_value,
          (pickup_date_value::timestamp + time '09:00') at time zone 'Asia/Kuala_Lumpur',
          ((pickup_date_value + 1)::timestamp at time zone 'Asia/Kuala_Lumpur'),
          actor_id, clock_timestamp(), actor_id, false
        );
        perform public.mark_extra_stock_ready_for_collection(v_stock_id, actor_id, 'rollback-only negative readiness regression');

        insert into public.orders (
          id, order_number, guest_name, fulfilment_method, pickup_date,
          pickup_time, status, payment_status, order_source,
          production_started_at, production_started_by
        ) values (
          v_order_id, order_no, 'Synthetic readiness fixture', method::public.fulfilment_method,
          pickup_date_value, time '15:00', 'submitted', 'unpaid', 'customer_website',
          case when scenario = 'production_started' then clock_timestamp() else null end,
          case when scenario = 'production_started' then actor_id else null end
        );

        if method = 'delivery' then
          insert into public.order_delivery_details (
            order_id, recipient_name, recipient_phone, address_line_1,
            postcode, city, state, recipient_notify_preference
          ) values (v_order_id, 'Synthetic readiness fixture', '0000000000', 'DEV test address', '00000', 'DEV test city', 'Selangor', 'do_not_inform_recipient');
        elsif method = 'dine_in' then
          insert into public.order_dine_in_reservations (
            order_id, reservation_date, reservation_time, guest_count,
            venue, adult_count, kid_count, toddler_count
          ) values (v_order_id, pickup_date_value, time '15:00', 1, 'hyphen', 1, 0, 0);
        end if;

        insert into public.order_items (
          order_id, cake_id, cake_size_id, quantity, unit_price,
          cake_name, size_label
        ) values (v_order_id, v_cake_id, v_size_id, 1, unit_price, cake_name, size_label);

        if scenario = 'production_started' then
          begin
            perform public.assign_extra_stock_to_order(v_stock_id, v_order_id, actor_id);
            raise exception 'ASSERT: Fresh Pick assignment unexpectedly succeeded after production started';
          exception when sqlstate 'P0001' then
            if sqlerrm <> 'Fresh Pick stock cannot be assigned after production has started' then
              raise;
            end if;
          end;
        else
          perform public.assign_extra_stock_to_order(v_stock_id, v_order_id, actor_id);
        end if;

        if scenario not in ('unpaid', 'production_started') then
          select public.order_amount_due(v_order_id) into v_order_due;
          insert into public.payments (
            id, amount, method, paid_at, verified_by, verified_at, status
          ) values (v_payment_id, v_order_due, 'wb_qr', clock_timestamp(), actor_id, clock_timestamp(), 'verified');
          insert into public.payment_allocations (payment_id, order_id, amount)
          values (v_payment_id, v_order_id, v_order_due);
          update public.orders set status='paid', payment_status='paid' where id=v_order_id;
        end if;

        set constraints all immediate;
        if exists (select 1 from public.orders o where o.id=v_order_id and o.ready_at is not null) then
          raise exception 'ASSERT: % case incorrectly auto-readied % order', scenario, method;
        end if;
      end loop;
    end loop;

end;
$test$;

rollback;
select 'PASS: six authorized before/after-purchase flows (all fulfilments), payment correction, partial-coverage blocking/recovery, undo/idempotency, unpaid and started-production guards; all fixtures rolled back' as result;
