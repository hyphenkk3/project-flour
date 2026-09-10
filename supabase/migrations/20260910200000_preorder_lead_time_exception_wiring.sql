-- Preorder lead-time exception: uniqueness, Bakery designation on reject/withdraw,
-- and Manager/Owner audited correction of Customer Informed.
-- Reuses existing operations_approval_requests + Phase 2 RPCs.

create or replace function public._staff_holds_bakery_preorder_approver(
  p_staff_id uuid
)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.staff_operational_designations d
    where d.staff_id = p_staff_id
      and d.designation = 'bakery_preorder_approver'
  );
$$;

revoke all on function public._staff_holds_bakery_preorder_approver(uuid)
  from public, anon, authenticated;

-- One active (pending or approved) exception per order + requested pickup date.
create unique index if not exists operations_approval_preorder_exception_active_date_uidx
  on public.operations_approval_requests (
    order_id,
    ((payload ->> 'requested_pickup_date'))
  )
  where request_type = 'preorder_lead_time_exception'
    and status in ('pending', 'approved');

create or replace function public.create_preorder_lead_time_exception_request(
  p_order_id uuid,
  p_actor_staff_id uuid,
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
  v_request_id uuid;
  v_fingerprint jsonb;
  v_pickup_date date;
  v_required_days integer;
begin
  if p_order_id is null or p_actor_staff_id is null then
    raise exception 'Order and staff actor are required';
  end if;

  v_role := public._staff_role_code(p_actor_staff_id);
  if not public._operations_approval_can_request(
    v_role,
    'preorder_lead_time_exception'
  ) then
    raise exception 'Not authorized to request a preorder lead-time exception';
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
      and r.request_type = 'preorder_lead_time_exception'
      and r.status = 'pending'
  ) then
    raise exception 'A pending preorder lead-time exception already exists for this order';
  end if;

  v_payload := coalesce(p_payload, '{}'::jsonb);
  begin
    v_pickup_date := (v_payload ->> 'requested_pickup_date')::date;
  exception when others then
    v_pickup_date := null;
  end;
  if v_pickup_date is null then
    v_pickup_date := order_row.pickup_date;
  end if;

  if exists (
    select 1
    from public.operations_approval_requests r
    where r.order_id = p_order_id
      and r.request_type = 'preorder_lead_time_exception'
      and r.status in ('pending', 'approved')
      and (r.payload ->> 'requested_pickup_date') = v_pickup_date::text
  ) then
    raise exception 'A preorder lead-time exception already exists for this order and pickup date';
  end if;

  begin
    v_required_days := (v_payload ->> 'required_preorder_days')::integer;
  exception when others then
    v_required_days := null;
  end;

  v_payload := jsonb_build_object(
    'kind', 'preorder_lead_time_exception',
    'requested_pickup_date', v_pickup_date,
    'required_preorder_days', v_required_days,
    'order_pickup_date', order_row.pickup_date,
    'details', coalesce(v_payload -> 'details', '{}'::jsonb)
  );

  v_fingerprint := public._operations_approval_fingerprint(p_order_id);

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
    'preorder_lead_time_exception',
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
      'request_type', 'preorder_lead_time_exception'
    )
  );

  return jsonb_build_object(
    'id', v_request_id,
    'status', 'pending',
    'request_type', 'preorder_lead_time_exception'
  );
end;
$$;

create or replace function public.approve_preorder_lead_time_exception(
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
  v_note text;
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
  if req.request_type is distinct from 'preorder_lead_time_exception' then
    raise exception 'This function only approves preorder lead-time exceptions';
  end if;
  if req.status <> 'pending' then
    raise exception 'This approval request has already been decided';
  end if;
  if req.requested_by = p_actor_staff_id then
    raise exception 'Requester cannot approve their own request';
  end if;

  if not public._operations_approval_can_review(v_role, req.request_type) then
    raise exception 'Not authorized to approve this approval request';
  end if;

  if v_role = 'bakery'
    and not public._staff_holds_bakery_preorder_approver(p_actor_staff_id) then
    raise exception 'Bakery staff must hold the bakery_preorder_approver designation';
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
      'request_type', 'preorder_lead_time_exception',
      'reviewer_note', v_note
    )
  );

  return jsonb_build_object('id', req.id, 'status', 'approved');
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
  if v_role = 'bakery'
    and not public._staff_holds_bakery_preorder_approver(p_actor_staff_id) then
    raise exception 'Bakery staff must hold the bakery_preorder_approver designation';
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

create or replace function public.withdraw_preorder_lead_time_exception(
  p_request_id uuid,
  p_actor_staff_id uuid,
  p_note text default null
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
  if v_role not in ('owner', 'manager', 'bakery', 'customer_operations') then
    raise exception 'Not authorized to withdraw this approval';
  end if;
  if v_role = 'bakery'
    and not public._staff_holds_bakery_preorder_approver(p_actor_staff_id) then
    raise exception 'Bakery staff must hold the bakery_preorder_approver designation';
  end if;

  v_note := nullif(trim(coalesce(p_note, '')), '');

  select r.* into req
  from public.operations_approval_requests r
  where r.id = p_request_id
  for update;
  if not found then
    raise exception 'Approval request not found';
  end if;
  if req.request_type is distinct from 'preorder_lead_time_exception' then
    raise exception 'Only preorder lead-time exceptions can be withdrawn this way';
  end if;
  if req.status is distinct from 'approved' then
    raise exception 'Only approved exceptions can be withdrawn';
  end if;
  if req.customer_informed_at is not null then
    raise exception
      'Cannot withdraw after the customer has been informed. Resolve with the customer instead.';
  end if;

  update public.operations_approval_requests r
  set
    status = 'withdrawn',
    withdrawn_at = now(),
    withdrawn_by = p_actor_staff_id,
    reviewer_note = coalesce(v_note, r.reviewer_note)
  where r.id = p_request_id;

  insert into public.order_timeline_events (
    order_id, event_type, actor_staff_id, metadata
  ) values (
    req.order_id,
    'operations_approval_withdrawn',
    p_actor_staff_id,
    jsonb_build_object(
      'approval_request_id', req.id,
      'request_type', 'preorder_lead_time_exception',
      'note', v_note
    )
  );

  return jsonb_build_object('id', req.id, 'status', 'withdrawn');
end;
$$;

-- Manager/Owner-only reversal of Customer Informed. Does not withdraw.
create or replace function public.correct_preorder_exception_customer_informed(
  p_request_id uuid,
  p_actor_staff_id uuid,
  p_note text
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
  if v_role not in ('owner', 'manager') then
    raise exception 'Only Manager or Owner can correct Customer Informed';
  end if;

  v_note := nullif(trim(coalesce(p_note, '')), '');
  if v_note is null then
    raise exception 'A correction note is required';
  end if;

  select r.* into req
  from public.operations_approval_requests r
  where r.id = p_request_id
  for update;
  if not found then
    raise exception 'Approval request not found';
  end if;
  if req.request_type is distinct from 'preorder_lead_time_exception' then
    raise exception 'Only preorder lead-time exceptions support this correction';
  end if;
  if req.status is distinct from 'approved' then
    raise exception 'Only an approved exception can be corrected';
  end if;
  if req.customer_informed_at is null then
    raise exception 'Customer Informed is not recorded on this exception';
  end if;

  update public.operations_approval_requests r
  set
    customer_informed_at = null,
    customer_informed_by = null
  where r.id = p_request_id;

  insert into public.order_timeline_events (
    order_id, event_type, actor_staff_id, metadata
  ) values (
    req.order_id,
    'preorder_exception_customer_informed_corrected',
    p_actor_staff_id,
    jsonb_build_object(
      'approval_request_id', req.id,
      'note', v_note,
      'previous_customer_informed_at', req.customer_informed_at,
      'previous_customer_informed_by', req.customer_informed_by
    )
  );

  return jsonb_build_object(
    'id', req.id,
    'status', req.status,
    'customer_informed_at', null
  );
end;
$$;

revoke all on function public.correct_preorder_exception_customer_informed(uuid, uuid, text)
  from public, anon;
grant execute on function public.correct_preorder_exception_customer_informed(uuid, uuid, text)
  to authenticated;

comment on function public.correct_preorder_exception_customer_informed(uuid, uuid, text) is
  'Manager/Owner audited correction that clears Customer Informed. Does not withdraw.';
