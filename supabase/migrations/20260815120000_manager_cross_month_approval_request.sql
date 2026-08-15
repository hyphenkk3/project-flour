-- Manager may request cross_month_pickup approval (not late_order_edit /
-- discount_exception). Does not grant Owner month override or review expansion.
-- Recreates create_operations_approval_request with the same body as
-- 20260814170000 except the requester gate.

create or replace function public._operations_approval_can_request(
  p_role text,
  p_request_type text
)
returns boolean
language sql
immutable
as $$
  select
    (
      p_role = 'customer_operations'
      and p_request_type in (
        'discount_exception',
        'late_order_edit',
        'cross_month_pickup'
      )
    )
    or (
      p_role = 'manager'
      and p_request_type = 'cross_month_pickup'
    );
$$;

revoke all on function public._operations_approval_can_request(text, text)
  from public, anon, authenticated;

create or replace function public.create_operations_approval_request(
  p_order_id uuid,
  p_actor_staff_id uuid,
  p_request_type text,
  p_reason text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  order_row public.orders;
  v_reason text;
  v_payload jsonb;
  v_fingerprint jsonb;
  v_number text;
  v_expiry date;
  v_action text;
  v_order_date date;
  v_valid boolean := true;
  v_invalid_reason text := null;
  v_current_date date;
  v_proposed_date date;
  v_proposed_time text;
  v_request_id uuid;
  v_current_items jsonb;
  v_current_addons jsonb;
  v_proposed_payload jsonb;
  v_days_until_pickup integer;
begin
  if p_order_id is null or p_actor_staff_id is null then
    raise exception 'Order and staff actor are required';
  end if;

  if p_request_type is null or p_request_type not in (
    'discount_exception', 'late_order_edit', 'cross_month_pickup'
  ) then
    raise exception 'Unsupported approval request type';
  end if;

  v_role := public._staff_role_code(p_actor_staff_id);
  if not public._operations_approval_can_request(v_role, p_request_type) then
    raise exception 'Not authorized to request this approval';
  end if;

  v_reason := nullif(trim(coalesce(p_reason, '')), '');
  if v_reason is null then
    raise exception 'A reason is required';
  end if;

  select o.* into order_row
  from public.orders o
  where o.id = p_order_id
    and o.customer_id is null
  for update;
  if not found then
    raise exception 'Order not found';
  end if;

  if order_row.status not in (
    'submitted', 'pending_confirmation', 'awaiting_payment', 'paid'
  ) then
    raise exception 'This order cannot receive an approval request';
  end if;

  if exists (
    select 1
    from public.operations_approval_requests r
    where r.order_id = p_order_id
      and r.request_type = p_request_type
      and r.status = 'pending'
  ) then
    raise exception 'A pending approval of this type already exists for this order';
  end if;

  v_fingerprint := public._operations_approval_fingerprint(p_order_id);
  v_payload := coalesce(p_payload, '{}'::jsonb);

  if p_request_type = 'discount_exception' then
    v_action := v_payload ->> 'action';
    if v_action not in ('redeem_rm10', 'change_august_to_rm10') then
      raise exception 'Discount exception requires redeem_rm10 or change_august_to_rm10';
    end if;
    v_number := nullif(trim(coalesce(v_payload ->> 'voucher_number', '')), '');
    if v_number is null then
      raise exception 'Voucher number is required';
    end if;
    begin
      v_expiry := (v_payload ->> 'expiry_date')::date;
    exception when others then
      raise exception 'Enter a valid expiry date';
    end;
    if v_expiry is null then
      raise exception 'Enter a valid expiry date';
    end if;
    if public.guest_order_has_adjustment_code(p_order_id, 'rm10_physical_card') then
      raise exception 'An RM10 Discount Card is already applied to this order';
    end if;
    if v_action = 'redeem_rm10'
      and public.guest_order_has_adjustment_code(p_order_id, 'august_promo_2026') then
      raise exception 'Use change-from-August for this discount exception';
    end if;
    if v_action = 'change_august_to_rm10'
      and not public.guest_order_has_adjustment_code(p_order_id, 'august_promo_2026') then
      raise exception 'August Promo is not on this order';
    end if;
    if not public.guest_order_has_eligible_rm10_size(p_order_id) then
      raise exception 'RM10 Discount Card requires a 6" or 8" cake on the order';
    end if;
    v_order_date := public.singapore_calendar_date(order_row.created_at);
    if v_order_date > v_expiry then
      v_valid := false;
      v_invalid_reason := 'Order date is after voucher expiry';
    elsif order_row.pickup_date > v_expiry then
      v_valid := false;
      v_invalid_reason := 'Pickup date is after voucher expiry';
    end if;
    if v_valid then
      raise exception 'This voucher meets normal eligibility rules. Apply it directly instead of requesting approval.';
    end if;
    v_payload := jsonb_build_object(
      'kind', 'discount_exception',
      'action', v_action,
      'voucher_number', v_number,
      'expiry_date', v_expiry,
      'eligibility_reason', coalesce(
        nullif(trim(coalesce(v_payload ->> 'eligibility_reason', '')), ''),
        v_invalid_reason
      ),
      'current_amount_due', public.order_amount_due(p_order_id),
      'requested_amount_due', case
        when v_action = 'change_august_to_rm10'
          then public.order_amount_due(p_order_id) + 20 - 10
        else public.order_amount_due(p_order_id) - 10
      end
    );
  elsif p_request_type = 'cross_month_pickup' then
    begin
      v_proposed_date := (v_payload ->> 'proposed_pickup_date')::date;
    exception when others then
      raise exception 'Proposed pickup date is required';
    end;
    v_proposed_time := nullif(trim(coalesce(v_payload ->> 'proposed_pickup_time', '')), '');
    if v_proposed_date is null or v_proposed_time is null then
      raise exception 'Proposed pickup date and time are required';
    end if;
    v_current_date := order_row.pickup_date;
    if date_trunc('month', v_proposed_date::timestamp)
      is not distinct from date_trunc('month', v_current_date::timestamp) then
      raise exception 'This pickup date is in the same month. Save the order directly.';
    end if;
    v_payload := jsonb_build_object(
      'kind', 'cross_month_pickup',
      'current_pickup_date', order_row.pickup_date,
      'current_pickup_time', to_char(order_row.pickup_time, 'HH24:MI'),
      'proposed_pickup_date', v_proposed_date,
      'proposed_pickup_time', v_proposed_time,
      'fulfilment_method', coalesce(order_row.fulfilment_method, 'pickup')
    );
  else
    -- late_order_edit: calendar-date 2-day cutoff (not 48 hours).
    -- Restricted when Singapore today is fewer than 2 days before pickup.
    v_days_until_pickup := (order_row.pickup_date
      - public.singapore_calendar_date(now()));
    if v_days_until_pickup >= 2 then
      raise exception 'This order is outside the 2-day change cutoff. Save the order directly.';
    end if;
    if v_payload -> 'proposed' is null then
      raise exception 'Late order edit requires a proposed change';
    end if;
    if coalesce(v_payload #>> '{proposed,pickup_date}', '') = ''
      and coalesce(jsonb_typeof(v_payload #> '{proposed,items}'), 'null') <> 'array'
      and coalesce(jsonb_typeof(v_payload #> '{proposed,paid_addons}'), 'null') <> 'array' then
      raise exception 'Late order edit requires proposed pickup, items, or paid add-ons';
    end if;
    if coalesce(v_payload #>> '{proposed,pickup_date}', '') <> '' then
      begin
        v_proposed_date := (v_payload #>> '{proposed,pickup_date}')::date;
      exception when others then
        raise exception 'Proposed pickup date is invalid';
      end;
      if date_trunc('month', v_proposed_date::timestamp)
        is distinct from date_trunc('month', order_row.pickup_date::timestamp) then
        raise exception 'Cross-month pickup must use the cross-month approval type';
      end if;
    end if;
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'cake_id', oi.cake_id,
          'cake_size_id', oi.cake_size_id,
          'quantity', oi.quantity,
          'unit_price', oi.unit_price,
          'cake_name', oi.cake_name,
          'size_label', oi.size_label
        )
        order by oi.id
      ),
      '[]'::jsonb
    )
    into v_current_items
    from public.order_items oi
    where oi.order_id = p_order_id;
    v_current_addons := public._operations_approval_paid_addons_snapshot(p_order_id);
    v_proposed_payload := coalesce(v_payload -> 'proposed', '{}'::jsonb);
    if jsonb_typeof(v_proposed_payload -> 'paid_addons') is distinct from 'array' then
      v_proposed_payload := jsonb_set(
        v_proposed_payload,
        '{paid_addons}',
        v_current_addons
      );
    end if;
    v_payload := jsonb_build_object(
      'kind', 'late_order_edit',
      'current', jsonb_build_object(
        'pickup_date', order_row.pickup_date,
        'pickup_time', to_char(order_row.pickup_time, 'HH24:MI'),
        'items', coalesce(v_current_items, '[]'::jsonb),
        'paid_addons', coalesce(v_current_addons, '[]'::jsonb)
      ),
      'proposed', v_proposed_payload
    );
  end if;

  insert into public.operations_approval_requests (
    order_id,
    request_type,
    status,
    reason,
    payload,
    order_fingerprint,
    requested_by
  ) values (
    p_order_id,
    p_request_type,
    'pending',
    v_reason,
    v_payload,
    v_fingerprint,
    p_actor_staff_id
  )
  returning id into v_request_id;

  insert into public.order_timeline_events (
    order_id, event_type, actor_staff_id, metadata
  ) values (
    p_order_id,
    'operations_approval_requested',
    p_actor_staff_id,
    jsonb_build_object(
      'approval_request_id', v_request_id,
      'request_type', p_request_type,
      'reason', v_reason
    )
  );

  return jsonb_build_object(
    'id', v_request_id,
    'status', 'pending',
    'request_type', p_request_type
  );
end;
$$;

revoke all on function public.create_operations_approval_request(uuid, uuid, text, text, jsonb)
  from public, anon;
grant execute on function public.create_operations_approval_request(uuid, uuid, text, text, jsonb)
  to authenticated;
