-- Operations approval requests — typed Customer Operations exception workflow.
-- Additive. Does not modify Collection, Bakery, EXTRA, Calendar, payment,
-- fee-request tables, or RM10 RPC bodies (valid-path RM10 allowlist is a
-- separate unapplied migration).
--
-- Approve executes the specific requested mutation as the reviewing
-- Owner or Manager. It does not grant Customer Operations temporary extra
-- role power. Pending requests do not expire merely because time passes.
-- Delivery fee request/resolve remains the independent existing workflow.

-- ---------------------------------------------------------------------------
-- 1) Schema
-- ---------------------------------------------------------------------------

create table if not exists public.operations_approval_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  request_type text not null,
  status text not null default 'pending',
  reason text not null,
  payload jsonb not null default '{}'::jsonb,
  order_fingerprint jsonb not null default '{}'::jsonb,
  requested_by uuid not null references public.staff_profiles (id),
  reviewed_by uuid references public.staff_profiles (id) on delete set null,
  reviewed_at timestamptz,
  reviewer_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operations_approval_requests_type_check check (
    request_type in (
      'discount_exception',
      'late_order_edit',
      'cross_month_pickup'
    )
  ),
  constraint operations_approval_requests_status_check check (
    status in ('pending', 'approved', 'rejected', 'cancelled')
  ),
  constraint operations_approval_requests_reason_not_blank check (
    char_length(trim(reason)) > 0
  )
);

create index if not exists operations_approval_requests_pending_idx
  on public.operations_approval_requests (status, created_at desc);

create index if not exists operations_approval_requests_order_idx
  on public.operations_approval_requests (order_id, status);

create unique index if not exists operations_approval_requests_one_pending
  on public.operations_approval_requests (order_id, request_type)
  where status = 'pending';

drop trigger if exists operations_approval_requests_set_updated_at
  on public.operations_approval_requests;
create trigger operations_approval_requests_set_updated_at
before update on public.operations_approval_requests
for each row
execute function public.set_updated_at();

alter table public.operations_approval_requests enable row level security;

drop policy if exists operations_approval_requests_authenticated_select
  on public.operations_approval_requests;
create policy operations_approval_requests_authenticated_select
  on public.operations_approval_requests
  for select to authenticated
  using (true);

revoke all on table public.operations_approval_requests from public;
revoke all on table public.operations_approval_requests from anon;
grant select on table public.operations_approval_requests to authenticated;

-- ---------------------------------------------------------------------------
-- 2) Internal helpers
-- ---------------------------------------------------------------------------

create or replace function public._operations_approval_items_signature(
  p_order_id uuid
)
returns text
language sql
stable
set search_path = public
as $$
  select coalesce(
    string_agg(
      oi.cake_id::text || ':' || oi.cake_size_id::text || ':' || oi.quantity::text,
      '|'
      order by oi.cake_id, oi.cake_size_id
    ),
    ''
  )
  from public.order_items oi
  where oi.order_id = p_order_id;
$$;

create or replace function public._operations_approval_fingerprint(
  p_order_id uuid
)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  order_row public.orders;
begin
  select o.* into order_row
  from public.orders o
  where o.id = p_order_id
    and o.customer_id is null;
  if not found then
    raise exception 'Order not found';
  end if;

  return jsonb_build_object(
    'pickup_date', order_row.pickup_date,
    'pickup_time', to_char(order_row.pickup_time, 'HH24:MI'),
    'status', order_row.status,
    'has_rm10', public.guest_order_has_adjustment_code(p_order_id, 'rm10_physical_card'),
    'has_august', public.guest_order_has_adjustment_code(p_order_id, 'august_promo_2026'),
    'items_signature', public._operations_approval_items_signature(p_order_id)
  );
end;
$$;

create or replace function public._operations_approval_fingerprint_matches(
  p_request_type text,
  p_stored jsonb,
  p_current jsonb
)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
begin
  if coalesce(p_stored ->> 'status', '') is distinct from coalesce(p_current ->> 'status', '') then
    return false;
  end if;
  if coalesce(p_stored ->> 'pickup_date', '') is distinct from coalesce(p_current ->> 'pickup_date', '') then
    return false;
  end if;
  if coalesce(p_stored ->> 'pickup_time', '') is distinct from coalesce(p_current ->> 'pickup_time', '') then
    return false;
  end if;
  if p_request_type = 'discount_exception' then
    return coalesce((p_stored ->> 'has_rm10')::boolean, false)
        is not distinct from coalesce((p_current ->> 'has_rm10')::boolean, false)
      and coalesce((p_stored ->> 'has_august')::boolean, false)
        is not distinct from coalesce((p_current ->> 'has_august')::boolean, false);
  end if;
  if p_request_type = 'late_order_edit' then
    return coalesce(p_stored ->> 'items_signature', '')
      is not distinct from coalesce(p_current ->> 'items_signature', '');
  end if;
  return true;
end;
$$;

create or replace function public._operations_approval_can_review(
  p_role text,
  p_request_type text
)
returns boolean
language sql
immutable
as $$
  select p_role in ('owner', 'manager')
    and p_request_type in (
      'discount_exception',
      'late_order_edit',
      'cross_month_pickup'
    );
$$;

create or replace function public._operations_approval_outdate_confirmation(
  p_order_id uuid,
  p_actor_staff_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.order_confirmation_snapshots s
  set
    lifecycle_status = 'outdated',
    outdated_at = now()
  where s.order_id = p_order_id
    and s.lifecycle_status = 'sent';

  get diagnostics v_count = row_count;
  if v_count > 0 then
    insert into public.order_timeline_events (
      order_id, event_type, actor_staff_id, metadata
    ) values (
      p_order_id,
      'confirmation_outdated',
      p_actor_staff_id,
      jsonb_build_object('source', 'operations_approval')
    );

    update public.orders o
    set confirmation_needs_resend = true
    where o.id = p_order_id;
  end if;
end;
$$;

revoke all on function public._operations_approval_items_signature(uuid) from public, anon, authenticated;
revoke all on function public._operations_approval_fingerprint(uuid) from public, anon, authenticated;
revoke all on function public._operations_approval_fingerprint_matches(text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public._operations_approval_can_review(text, text) from public, anon, authenticated;
revoke all on function public._operations_approval_outdate_confirmation(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) create_operations_approval_request
-- ---------------------------------------------------------------------------

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
  v_days_until_pickup integer;
begin
  if p_order_id is null or p_actor_staff_id is null then
    raise exception 'Order and staff actor are required';
  end if;

  v_role := public._staff_role_code(p_actor_staff_id);
  if v_role is distinct from 'customer_operations' then
    raise exception 'Only Customer Operations can request Operations approval';
  end if;

  if p_request_type is null or p_request_type not in (
    'discount_exception', 'late_order_edit', 'cross_month_pickup'
  ) then
    raise exception 'Unsupported approval request type';
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
      and coalesce(jsonb_typeof(v_payload #> '{proposed,items}'), 'null') <> 'array' then
      raise exception 'Late order edit requires proposed pickup or items';
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
    v_payload := jsonb_build_object(
      'kind', 'late_order_edit',
      'current', jsonb_build_object(
        'pickup_date', order_row.pickup_date,
        'pickup_time', to_char(order_row.pickup_time, 'HH24:MI'),
        'items', coalesce(v_current_items, '[]'::jsonb)
      ),
      'proposed', coalesce(v_payload -> 'proposed', '{}'::jsonb)
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

revoke all on function public.create_operations_approval_request(uuid, uuid, text, text, jsonb) from public, anon;
grant execute on function public.create_operations_approval_request(uuid, uuid, text, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 4) cancel / reject
-- ---------------------------------------------------------------------------

create or replace function public.cancel_operations_approval_request(
  p_request_id uuid,
  p_actor_staff_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  req public.operations_approval_requests%rowtype;
begin
  if p_request_id is null or p_actor_staff_id is null then
    raise exception 'Request and staff actor are required';
  end if;
  v_role := public._staff_role_code(p_actor_staff_id);
  if v_role is null then
    raise exception 'Staff profile required';
  end if;

  select r.* into req
  from public.operations_approval_requests r
  where r.id = p_request_id
  for update;
  if not found then
    raise exception 'Approval request not found';
  end if;
  if req.status <> 'pending' then
    raise exception 'This approval request has already been decided';
  end if;
  if v_role is distinct from 'owner' and req.requested_by is distinct from p_actor_staff_id then
    raise exception 'Not authorized to cancel this approval request';
  end if;

  update public.operations_approval_requests r
  set
    status = 'cancelled',
    reviewed_by = p_actor_staff_id,
    reviewed_at = now(),
    reviewer_note = 'Cancelled'
  where r.id = p_request_id;

  insert into public.order_timeline_events (
    order_id, event_type, actor_staff_id, metadata
  ) values (
    req.order_id,
    'operations_approval_cancelled',
    p_actor_staff_id,
    jsonb_build_object(
      'approval_request_id', req.id,
      'request_type', req.request_type
    )
  );

  return jsonb_build_object('id', req.id, 'status', 'cancelled');
end;
$$;

create or replace function public.reject_operations_approval_request(
  p_request_id uuid,
  p_actor_staff_id uuid,
  p_reviewer_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  req public.operations_approval_requests%rowtype;
  v_note text;
begin
  if p_request_id is null or p_actor_staff_id is null then
    raise exception 'Request and staff actor are required';
  end if;
  v_role := public._staff_role_code(p_actor_staff_id);
  v_note := nullif(trim(coalesce(p_reviewer_note, '')), '');
  if v_note is null then
    raise exception 'A rejection note is required';
  end if;

  select r.* into req
  from public.operations_approval_requests r
  where r.id = p_request_id
  for update;
  if not found then
    raise exception 'Approval request not found';
  end if;
  if req.status <> 'pending' then
    raise exception 'This approval request has already been decided';
  end if;
  if req.requested_by = p_actor_staff_id then
    raise exception 'Requester cannot approve or reject their own request';
  end if;
  if not public._operations_approval_can_review(v_role, req.request_type) then
    raise exception 'Not authorized to reject this approval request';
  end if;

  update public.operations_approval_requests r
  set
    status = 'rejected',
    reviewed_by = p_actor_staff_id,
    reviewed_at = now(),
    reviewer_note = v_note
  where r.id = p_request_id;

  insert into public.order_timeline_events (
    order_id, event_type, actor_staff_id, metadata
  ) values (
    req.order_id,
    'operations_approval_rejected',
    p_actor_staff_id,
    jsonb_build_object(
      'approval_request_id', req.id,
      'request_type', req.request_type,
      'reviewer_note', v_note
    )
  );

  return jsonb_build_object('id', req.id, 'status', 'rejected');
end;
$$;

revoke all on function public.cancel_operations_approval_request(uuid, uuid) from public, anon;
grant execute on function public.cancel_operations_approval_request(uuid, uuid) to authenticated;
revoke all on function public.reject_operations_approval_request(uuid, uuid, text) from public, anon;
grant execute on function public.reject_operations_approval_request(uuid, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5) approve — validates, then executes the specific requested mutation
-- ---------------------------------------------------------------------------

create or replace function public.approve_operations_approval_request(
  p_request_id uuid,
  p_actor_staff_id uuid,
  p_reviewer_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  req public.operations_approval_requests%rowtype;
  v_current jsonb;
  v_note text;
  v_action text;
  v_result jsonb;
  v_proposed_date date;
  v_proposed_time text;
  v_before_date date;
  v_before_time text;
  order_row public.orders;
begin
  if p_request_id is null or p_actor_staff_id is null then
    raise exception 'Request and staff actor are required';
  end if;
  v_role := public._staff_role_code(p_actor_staff_id);
  v_note := nullif(trim(coalesce(p_reviewer_note, '')), '');

  select r.* into req
  from public.operations_approval_requests r
  where r.id = p_request_id
  for update;
  if not found then
    raise exception 'Approval request not found';
  end if;
  if req.status <> 'pending' then
    raise exception 'This approval request has already been decided';
  end if;
  if req.requested_by = p_actor_staff_id then
    raise exception 'Requester cannot approve or reject their own request';
  end if;
  if not public._operations_approval_can_review(v_role, req.request_type) then
    raise exception 'Not authorized to approve this approval request';
  end if;

  select o.* into order_row
  from public.orders o
  where o.id = req.order_id
    and o.customer_id is null
  for update;
  if not found then
    raise exception 'Order not found';
  end if;

  v_current := public._operations_approval_fingerprint(req.order_id);
  if not public._operations_approval_fingerprint_matches(
    req.request_type,
    req.order_fingerprint,
    v_current
  ) then
    raise exception 'This approval request is stale. The order has changed since it was created. Review the order and create a new request if the exception is still needed.';
  end if;

  if req.request_type = 'discount_exception' then
    v_action := req.payload ->> 'action';
    if v_action = 'change_august_to_rm10' then
      v_result := public.change_august_promo_to_rm10_physical_voucher(
        req.order_id,
        p_actor_staff_id,
        req.payload ->> 'voucher_number',
        (req.payload ->> 'expiry_date')::date,
        true,
        req.reason
      );
    else
      v_result := public.redeem_rm10_physical_voucher_for_guest_order(
        req.order_id,
        p_actor_staff_id,
        req.payload ->> 'voucher_number',
        (req.payload ->> 'expiry_date')::date,
        true,
        req.reason
      );
    end if;
  elsif req.request_type = 'cross_month_pickup' then
    v_before_date := order_row.pickup_date;
    v_before_time := to_char(order_row.pickup_time, 'HH24:MI');
    v_proposed_date := (req.payload ->> 'proposed_pickup_date')::date;
    v_proposed_time := req.payload ->> 'proposed_pickup_time';
    update public.orders o
    set
      pickup_date = v_proposed_date,
      pickup_time = v_proposed_time::time,
      updated_by = p_actor_staff_id,
      updated_at = now()
    where o.id = req.order_id;
    perform public._operations_approval_outdate_confirmation(
      req.order_id,
      p_actor_staff_id
    );
    insert into public.order_timeline_events (
      order_id, event_type, actor_staff_id, metadata
    ) values (
      req.order_id,
      'order_updated',
      p_actor_staff_id,
      jsonb_build_object(
        'source', 'operations_approval',
        'request_type', 'cross_month_pickup',
        'pickup_before', v_before_date,
        'pickup_time_before', v_before_time,
        'pickup_after', v_proposed_date,
        'pickup_time_after', v_proposed_time
      )
    );
    v_result := jsonb_build_object(
      'pickup_date', v_proposed_date,
      'pickup_time', v_proposed_time
    );
  else
    if coalesce(req.payload #>> '{proposed,pickup_date}', '') <> '' then
      v_proposed_date := (req.payload #>> '{proposed,pickup_date}')::date;
      v_proposed_time := coalesce(
        nullif(req.payload #>> '{proposed,pickup_time}', ''),
        to_char(order_row.pickup_time, 'HH24:MI')
      );
      if date_trunc('month', v_proposed_date::timestamp)
        is distinct from date_trunc('month', order_row.pickup_date::timestamp) then
        raise exception 'Cross-month pickup must use the cross-month approval type';
      end if;
      update public.orders o
      set
        pickup_date = v_proposed_date,
        pickup_time = v_proposed_time::time,
        updated_by = p_actor_staff_id,
        updated_at = now()
      where o.id = req.order_id;
    end if;
    if jsonb_typeof(req.payload #> '{proposed,items}') = 'array'
      and jsonb_array_length(req.payload #> '{proposed,items}') > 0 then
      perform public.sync_guest_order_items(
        req.order_id,
        req.payload #> '{proposed,items}'
      );
    end if;
    perform public._operations_approval_outdate_confirmation(
      req.order_id,
      p_actor_staff_id
    );
    insert into public.order_timeline_events (
      order_id, event_type, actor_staff_id, metadata
    ) values (
      req.order_id,
      'order_updated',
      p_actor_staff_id,
      jsonb_build_object(
        'source', 'operations_approval',
        'request_type', 'late_order_edit'
      )
    );
    v_result := jsonb_build_object('applied', true);
  end if;

  update public.operations_approval_requests r
  set
    status = 'approved',
    reviewed_by = p_actor_staff_id,
    reviewed_at = now(),
    reviewer_note = v_note
  where r.id = p_request_id;

  insert into public.order_timeline_events (
    order_id, event_type, actor_staff_id, metadata
  ) values (
    req.order_id,
    'operations_approval_approved',
    p_actor_staff_id,
    jsonb_build_object(
      'approval_request_id', req.id,
      'request_type', req.request_type,
      'reviewer_note', v_note
    )
  );

  return jsonb_build_object(
    'id', req.id,
    'status', 'approved',
    'result', v_result
  );
end;
$$;

revoke all on function public.approve_operations_approval_request(uuid, uuid, text) from public, anon;
grant execute on function public.approve_operations_approval_request(uuid, uuid, text) to authenticated;
