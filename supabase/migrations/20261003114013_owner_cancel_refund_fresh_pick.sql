-- Dedicated Owner-only recording of a manually completed paid Fresh Pick refund.
-- Existing normal overpayment correction semantics remain unchanged.

alter table public.refunds
  add column refund_type text not null default 'overpayment_correction';

alter table public.refunds
  add constraint refunds_refund_type_check
  check (refund_type in ('overpayment_correction', 'fresh_pick_cancellation'));

create or replace function public.assert_refund_within_overpayment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_remaining numeric(10, 2);
begin
  if NEW.amount is null or NEW.amount <= 0 then
    raise exception 'Refund amount must be greater than zero';
  end if;

  if NEW.refund_type = 'fresh_pick_cancellation' then
    if not exists (
      select 1
      from public.orders o
      where o.id = NEW.order_id
        and o.extra_stock_id is not null
        and o.status = 'paid'
        and o.payment_status = 'paid'
    ) then
      raise exception 'Fresh Pick cancellation refund requires a paid Fresh Pick order';
    end if;

    if NEW.amount <> public.order_net_received(NEW.order_id) then
      raise exception 'Fresh Pick cancellation refund must equal the remaining net received amount';
    end if;

    return NEW;
  end if;

  if NEW.refund_type <> 'overpayment_correction' then
    raise exception 'Unsupported refund type';
  end if;

  if public.order_verified_allocated(NEW.order_id) <= 0 then
    raise exception 'This order has no verified payment to correct';
  end if;

  v_remaining := greatest(
    public.order_verified_allocated(NEW.order_id)
      - public.order_amount_due(NEW.order_id)
      - public.order_refunds_total(NEW.order_id),
    0
  )::numeric(10, 2);

  if NEW.amount > v_remaining then
    raise exception 'Refund exceeds remaining overpayment';
  end if;

  return NEW;
end;
$$;

revoke all on function public.assert_refund_within_overpayment()
  from public, anon, authenticated;

-- Keep the old implementation private so every generic cancellation passes
-- through the paid Fresh Pick guard below.
alter function public.cancel_guest_order(uuid, uuid, boolean)
  rename to _cancel_guest_order_before_paid_fresh_pick_refund;

revoke all on function public._cancel_guest_order_before_paid_fresh_pick_refund(
  uuid, uuid, boolean
) from public, anon, authenticated, service_role;

create function public.cancel_guest_order(
  p_order_id uuid,
  p_actor_staff_id uuid,
  p_override boolean default false
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  order_row public.orders;
begin
  select o.*
  into order_row
  from public.orders o
  where o.id = p_order_id
    and o.customer_id is null
  for update;

  if not found then
    raise exception 'Order not found';
  end if;

  if order_row.status = 'paid'
     and order_row.extra_stock_id is not null then
    raise exception 'Paid Fresh Picks must use the Owner-only Cancel & Record Refund operation';
  end if;

  return public._cancel_guest_order_before_paid_fresh_pick_refund(
    p_order_id,
    p_actor_staff_id,
    p_override
  );
end;
$$;

revoke all on function public.cancel_guest_order(uuid, uuid, boolean)
  from public, anon;
grant execute on function public.cancel_guest_order(uuid, uuid, boolean)
  to authenticated, service_role;

create or replace function public.cancel_and_refund_paid_fresh_pick(
  p_order_id uuid,
  p_actor_staff_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_order public.orders;
  v_stock public.extra_stock;
  v_reason text;
  v_refund_amount numeric(10, 2);
  v_refund_id uuid;
  v_payment_snapshot jsonb;
  v_physical_snapshot jsonb;
  v_ready_after jsonb;
  v_submission jsonb;
  v_expected_ids uuid[] := array[]::uuid[];
  v_expected_sorted uuid[] := array[]::uuid[];
  v_linked_ids uuid[] := array[]::uuid[];
  v_released_ids uuid[] := array[]::uuid[];
  v_rows integer;
begin
  v_actor := public._bind_rpc_actor(p_actor_staff_id);
  perform public._require_rpc_roles(
    v_actor,
    array['owner']::text[],
    'Only Owner may cancel and record a paid Fresh Pick refund.'
  );

  if p_order_id is null then
    raise exception 'Order is required';
  end if;

  v_reason := nullif(trim(coalesce(p_reason, '')), '');
  if v_reason is null then
    raise exception 'A reason is required for this exceptional cancellation';
  end if;

  select o.*
  into v_order
  from public.orders o
  where o.id = p_order_id
    and o.customer_id is null
  for update;

  if not found then
    raise exception 'Order not found';
  end if;
  if v_order.status = 'cancelled' then
    raise exception 'Order is already cancelled; no second refund was recorded';
  end if;
  if v_order.status <> 'paid' or v_order.payment_status <> 'paid' then
    raise exception 'Only a paid Fresh Pick can use this operation';
  end if;
  if v_order.extra_stock_id is null then
    raise exception 'This order is not linked to a Fresh Pick';
  end if;
  if v_order.out_for_delivery_at is not null
     or v_order.picked_up_at is not null
     or v_order.delivered_at is not null then
    raise exception 'Cancellation is blocked because customer or courier handoff has started or completed';
  end if;
  -- orders.ready_at is deliberately allowed and preserved. It is not a handoff.

  -- Use the exact physical IDs recorded at checkout. Legacy single-item orders
  -- may lack that array; they are safe to infer only when the snapshot says one.
  select e.metadata
  into v_submission
  from public.order_timeline_events e
  where e.order_id = v_order.id
    and e.event_type = 'preorder_submitted'
  order by e.created_at desc, e.id desc
  limit 1;

  if v_submission is null then
    raise exception 'The checkout physical-item audit is missing; stock was not released';
  end if;

  if jsonb_typeof(v_submission -> 'extra_stock_ids') = 'array' then
    select coalesce(array_agg(ids.id order by ids.id), array[]::uuid[])
    into v_expected_ids
    from (
      select value::uuid as id
      from jsonb_array_elements_text(v_submission -> 'extra_stock_ids') as submitted(value)
    ) ids;
  elsif nullif(v_submission ->> 'item_count', '')::integer = 1 then
    v_expected_ids := array[v_order.extra_stock_id];
  else
    raise exception 'The complete checkout physical-item set is unavailable; stock was not released';
  end if;

  if cardinality(v_expected_ids) = 0 then
    raise exception 'The checkout physical-item set is empty; stock was not released';
  end if;
  if cardinality(v_expected_ids) <> (
    select count(distinct ids.id)
    from unnest(v_expected_ids) as ids(id)
  ) then
    raise exception 'The checkout physical-item set contains duplicate IDs';
  end if;
  if nullif(v_submission ->> 'item_count', '') is not null
     and (v_submission ->> 'item_count')::integer <> cardinality(v_expected_ids) then
    raise exception 'The checkout physical-item count does not match its exact IDs';
  end if;
  if not (v_order.extra_stock_id = any(v_expected_ids)) then
    raise exception 'The primary Fresh Pick ID is not in the checkout physical-item set';
  end if;

  select array_agg(ids.id order by ids.id)
  into v_expected_sorted
  from unnest(v_expected_ids) as ids(id);

  -- Lock both submitted IDs and every row currently linked to this order in a
  -- stable order. This detects missing, extra, or cross-linked physical items.
  for v_stock in
    select e.*
    from public.extra_stock e
    where e.id = any(v_expected_sorted)
       or e.order_id = v_order.id
    order by e.id
    for update of e
  loop
    if v_stock.order_id = v_order.id then
      v_linked_ids := array_append(v_linked_ids, v_stock.id);
      if not (v_stock.id = any(v_expected_sorted)) then
        raise exception 'An unexpected Fresh Pick is linked to this order; no stock was released';
      end if;
    end if;

    if v_stock.id = any(v_expected_sorted) then
      if v_stock.order_id is distinct from v_order.id
         or v_stock.lifecycle is distinct from 'confirmed'
         or v_stock.sold_at is null
         or v_stock.cut_into_slices_at is not null then
        raise exception 'A linked Fresh Pick is not in the expected sold state; no stock was released';
      end if;
    end if;
  end loop;

  if v_linked_ids is distinct from v_expected_sorted then
    raise exception 'The order physical-stock links do not match the complete checkout set; no stock was released';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', e.id,
        'ready_for_collection', e.ready_for_collection,
        'sold_at', e.sold_at,
        'walk_in_held_until', e.walk_in_held_until,
        'walk_in_held_by', e.walk_in_held_by
      ) order by e.id
    ),
    '[]'::jsonb
  )
  into v_physical_snapshot
  from public.extra_stock e
  where e.id = any(v_expected_sorted);

  if public.order_verified_allocated(v_order.id) <= 0 then
    raise exception 'This Fresh Pick has no verified payment to refund';
  end if;

  -- Canonical net cash received includes paid add-ons, delivery, and prior
  -- recorded refunds; voucher value never becomes a cash refund.
  v_refund_amount := public.order_net_received(v_order.id)::numeric(10, 2);
  if v_refund_amount <= 0 then
    raise exception 'There is no remaining cash amount to record as a refund';
  end if;

  select jsonb_build_object(
    'allocations', coalesce(
      jsonb_agg(
        jsonb_build_object(
          'payment_id', p.id,
          'allocated_amount', pa.amount,
          'method', p.method,
          'paid_at', p.paid_at,
          'reference_note', p.reference_note
        ) order by p.paid_at, p.id
      ),
      '[]'::jsonb
    ),
    'verified_allocated', public.order_verified_allocated(v_order.id),
    'previous_recorded_refunds', public.order_refunds_total(v_order.id),
    'net_received_before_refund', v_refund_amount
  )
  into v_payment_snapshot
  from public.payment_allocations pa
  join public.payments p on p.id = pa.payment_id
  where pa.order_id = v_order.id
    and p.status = 'verified';

  insert into public.refunds (
    order_id,
    payment_id,
    amount,
    reason,
    created_by,
    status,
    refund_type
  ) values (
    v_order.id,
    null,
    v_refund_amount,
    v_reason,
    v_actor,
    'recorded',
    'fresh_pick_cancellation'
  )
  returning id into v_refund_id;

  -- Release only the exact submitted IDs. Preserve Ready and Ready history;
  -- clear stale customer-specific walk-in hold ownership on every item.
  for v_stock in
    select e.*
    from public.extra_stock e
    where e.id = any(v_expected_sorted)
    order by e.id
  loop
    update public.extra_stock e
    set order_id = null,
        sold_at = null,
        walk_in_held_until = null,
        walk_in_held_by = null,
        updated_at = now()
    where e.id = v_stock.id
      and e.order_id = v_order.id
      and e.lifecycle = 'confirmed'
      and e.sold_at is not null
      and e.cut_into_slices_at is null;
    get diagnostics v_rows = row_count;
    if v_rows <> 1 then
      raise exception 'A Fresh Pick could not be safely released; all changes were rolled back';
    end if;

    v_released_ids := array_append(v_released_ids, v_stock.id);
    perform public._record_extra_stock_event(
      v_stock.id,
      'released',
      v_actor,
      jsonb_build_object(
        'order_id', v_order.id,
        'order_number', v_order.order_number,
        'reason', 'owner_paid_fresh_pick_cancelled_refund_recorded',
        'refund_id', v_refund_id,
        'refund_amount', v_refund_amount,
        'previous_sold_at', v_stock.sold_at,
        'ready_for_collection_preserved', v_stock.ready_for_collection
      )
    );
  end loop;

  if v_released_ids is distinct from v_expected_sorted then
    raise exception 'The complete Fresh Pick set was not released; all changes were rolled back';
  end if;

  update public.orders o
  set status = 'cancelled',
      updated_by = v_actor,
      updated_at = now()
  where o.id = v_order.id
    and o.status = 'paid'
    and o.payment_status = 'paid'
    and o.extra_stock_id = any(v_expected_sorted)
    and o.out_for_delivery_at is null
    and o.picked_up_at is null
    and o.delivered_at is null;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'The paid Fresh Pick order could not be cancelled; all changes were rolled back';
  end if;

  if public.order_net_received(v_order.id) <> 0 then
    raise exception 'The recorded refund did not settle net received to RM0; all changes were rolled back';
  end if;

  if exists (
    select 1
    from public.catalogue_voucher_redemptions r
    where r.order_id = v_order.id
      and r.status = 'redeemed'
  ) then
    raise exception 'The catalogue voucher redemption was not released; all changes were rolled back';
  end if;

  if exists (
    select 1
    from public.extra_stock e
    where e.id = any(v_expected_sorted)
      and (e.order_id is not null or e.sold_at is not null
        or e.walk_in_held_until is not null or e.walk_in_held_by is not null)
  ) then
    raise exception 'A released Fresh Pick still has order or hold ownership; all changes were rolled back';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object('id', e.id, 'ready_for_collection', e.ready_for_collection)
      order by e.id
    ),
    '[]'::jsonb
  )
  into v_ready_after
  from public.extra_stock e
  where e.id = any(v_expected_sorted);

  if v_ready_after is distinct from (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', (item ->> 'id')::uuid,
          'ready_for_collection', item -> 'ready_for_collection'
        ) order by (item ->> 'id')::uuid
      ),
      '[]'::jsonb
    )
    from jsonb_array_elements(v_physical_snapshot) as snapshots(item)
  ) then
    raise exception 'Physical Ready state changed during release; all changes were rolled back';
  end if;

  insert into public.order_timeline_events (
    order_id,
    event_type,
    actor_staff_id,
    metadata
  ) values (
    v_order.id,
    'fresh_pick_cancelled_refunded',
    v_actor,
    jsonb_build_object(
      'order_number', v_order.order_number,
      'extra_stock_id', v_order.extra_stock_id,
      'released_extra_stock_ids', to_jsonb(v_released_ids),
      'refund_id', v_refund_id,
      'refund_amount', v_refund_amount,
      'reason', v_reason,
      'payment_snapshot', v_payment_snapshot,
      'physical_stock_snapshot', v_physical_snapshot,
      'ready_at_preserved', v_order.ready_at,
      'handoff_state', jsonb_build_object(
        'out_for_delivery_at', v_order.out_for_delivery_at,
        'picked_up_at', v_order.picked_up_at,
        'delivered_at', v_order.delivered_at
      )
    )
  );

  return jsonb_build_object(
    'order_id', v_order.id,
    'order_number', v_order.order_number,
    'extra_stock_ids', to_jsonb(v_released_ids),
    'refund_id', v_refund_id,
    'refund_amount', v_refund_amount,
    'net_received', public.order_net_received(v_order.id)
  );
end;
$$;

comment on function public.cancel_and_refund_paid_fresh_pick(uuid, uuid, text) is
  'Atomic Owner-only recording of a manually completed refund, order cancellation, and exact Fresh Pick release. Original verified payments remain immutable.';

revoke all on function public.cancel_and_refund_paid_fresh_pick(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.cancel_and_refund_paid_fresh_pick(uuid, uuid, text)
  to authenticated, service_role;
