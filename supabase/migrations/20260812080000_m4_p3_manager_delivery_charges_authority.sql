-- M4-P3 Slice 2B-2 — Manager Delivery Charges exception + resolve authority.
-- Additive RPC hardening only. No schema / backfill.
--
-- Product revision (supersedes 2B-1 "Manager = Counter-like fee authority"):
--   Owner + Manager: direct quote/waive/restore/override + approve/reject/dismiss
--   customer_operations: quote + request + own-cancel only
--   Direct waive/override MUST NOT silently cancel a pending Counter request
--     in the same category — resolve via approve/reject instead.
--
-- Unchanged / not widened:
--   init_guest_order_delivery_finance remains Owner-only
--   Bakery / Collection still cannot quote or resolve
--   Quote RPC already allows owner | customer_operations | manager (2B-1)

-- ---------------------------------------------------------------------------
-- 1) Direct Delivery waive — Owner or Manager; refuse if Delivery request pending
-- ---------------------------------------------------------------------------

create or replace function public.waive_guest_order_delivery_fee(
  p_order_id uuid,
  p_actor_staff_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_details public.order_delivery_details%rowtype;
  v_before numeric(10, 2);
  v_after numeric(10, 2);
begin
  v_role := public._staff_role_code(p_actor_staff_id);
  if v_role not in ('owner', 'manager') then
    raise exception 'Only Owner or Manager can waive Delivery fee directly';
  end if;

  select * into v_details
  from public.order_delivery_details where order_id = p_order_id;
  if not found or not v_details.delivery_finance_enabled then
    raise exception 'Governed Delivery finance required';
  end if;
  if v_details.delivery_fee_status = 'not_set'
     or v_details.delivery_fee_quoted_amount is null
     or v_details.delivery_fee_quoted_amount <= 0 then
    raise exception 'Delivery fee must be quoted before it can be waived';
  end if;
  if v_details.delivery_fee_request_status = 'pending' then
    raise exception
      'Pending Delivery fee waiver request must be approved or rejected';
  end if;

  v_before := public.order_amount_due(p_order_id);

  update public.order_delivery_details
  set
    delivery_fee_status = 'quoted_waived',
    delivery_fee_waived = true,
    fee_request_kind = case
      when fee_request_kind = 'delivery_waiver' then null else fee_request_kind end,
    fee_request_status = case
      when fee_request_kind = 'delivery_waiver' then null else fee_request_status end,
    fee_resolved_by = p_actor_staff_id,
    fee_resolved_at = now(),
    fee_resolution_note = nullif(trim(coalesce(p_reason, '')), ''),
    updated_at = now()
  where order_id = p_order_id;

  perform public._sync_delivery_finance_adjustments(p_order_id, p_actor_staff_id);
  v_after := public.order_amount_due(p_order_id);

  insert into public.order_timeline_events (
    order_id, event_type, actor_staff_id, metadata
  ) values (
    p_order_id,
    'delivery_fee_waived',
    p_actor_staff_id,
    jsonb_build_object(
      'quoted_amount', v_details.delivery_fee_quoted_amount,
      'reason', nullif(trim(coalesce(p_reason, '')), ''),
      'previous_amount_due', v_before,
      'new_amount_due', v_after
    )
  );

  return jsonb_build_object('ok', true, 'amount_due', v_after);
end;
$$;

-- ---------------------------------------------------------------------------
-- 2) Direct Processing override / waive — Owner or Manager; refuse if pending
-- ---------------------------------------------------------------------------

create or replace function public.override_guest_order_processing_fee(
  p_order_id uuid,
  p_actor_staff_id uuid,
  p_amount numeric,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_details public.order_delivery_details%rowtype;
  v_amount numeric(10, 2);
  v_before numeric(10, 2);
  v_after numeric(10, 2);
begin
  v_role := public._staff_role_code(p_actor_staff_id);
  if v_role not in ('owner', 'manager') then
    raise exception 'Only Owner or Manager can override processing fee directly';
  end if;
  if p_amount is null or p_amount < 0 then
    raise exception 'Processing fee override must be non-negative';
  end if;
  v_amount := p_amount::numeric(10, 2);

  select * into v_details
  from public.order_delivery_details where order_id = p_order_id;
  if not found or not v_details.delivery_finance_enabled then
    raise exception 'Governed Delivery finance required';
  end if;
  if v_details.processing_fee_request_status = 'pending' then
    raise exception
      'Pending processing fee request must be approved or rejected';
  end if;

  v_before := public.order_amount_due(p_order_id);

  update public.order_delivery_details
  set
    processing_fee_override_amount = v_amount,
    processing_fee_waived = false,
    fee_request_kind = case
      when fee_request_kind in ('processing_override', 'processing_waiver')
        and fee_request_status = 'pending' then null
      else fee_request_kind end,
    fee_request_status = case
      when fee_request_kind in ('processing_override', 'processing_waiver')
        and fee_request_status = 'pending' then null
      else fee_request_status end,
    updated_at = now()
  where order_id = p_order_id;

  perform public._sync_delivery_finance_adjustments(p_order_id, p_actor_staff_id);
  v_after := public.order_amount_due(p_order_id);

  insert into public.order_timeline_events (
    order_id, event_type, actor_staff_id, metadata
  ) values (
    p_order_id,
    'delivery_processing_fee_overridden',
    p_actor_staff_id,
    jsonb_build_object(
      'applicable_amount', v_details.processing_fee_applicable_amount,
      'override_amount', v_amount,
      'reason', nullif(trim(coalesce(p_reason, '')), ''),
      'previous_amount_due', v_before,
      'new_amount_due', v_after
    )
  );

  return jsonb_build_object('ok', true, 'amount_due', v_after);
end;
$$;

create or replace function public.waive_guest_order_processing_fee(
  p_order_id uuid,
  p_actor_staff_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_details public.order_delivery_details%rowtype;
  v_before numeric(10, 2);
  v_after numeric(10, 2);
begin
  v_role := public._staff_role_code(p_actor_staff_id);
  if v_role not in ('owner', 'manager') then
    raise exception 'Only Owner or Manager can waive processing fee directly';
  end if;

  select * into v_details
  from public.order_delivery_details where order_id = p_order_id;
  if not found or not v_details.delivery_finance_enabled then
    raise exception 'Governed Delivery finance required';
  end if;
  if v_details.processing_fee_request_status = 'pending' then
    raise exception
      'Pending processing fee request must be approved or rejected';
  end if;

  v_before := public.order_amount_due(p_order_id);

  update public.order_delivery_details
  set
    processing_fee_waived = true,
    fee_request_kind = case
      when fee_request_kind in ('processing_override', 'processing_waiver')
        and fee_request_status = 'pending' then null
      else fee_request_kind end,
    fee_request_status = case
      when fee_request_kind in ('processing_override', 'processing_waiver')
        and fee_request_status = 'pending' then null
      else fee_request_status end,
    fee_resolved_by = p_actor_staff_id,
    fee_resolved_at = now(),
    fee_resolution_note = nullif(trim(coalesce(p_reason, '')), ''),
    updated_at = now()
  where order_id = p_order_id;

  perform public._sync_delivery_finance_adjustments(p_order_id, p_actor_staff_id);
  v_after := public.order_amount_due(p_order_id);

  insert into public.order_timeline_events (
    order_id, event_type, actor_staff_id, metadata
  ) values (
    p_order_id,
    'delivery_processing_fee_waived',
    p_actor_staff_id,
    jsonb_build_object(
      'applicable_amount', v_details.processing_fee_applicable_amount,
      'reason', nullif(trim(coalesce(p_reason, '')), ''),
      'previous_amount_due', v_before,
      'new_amount_due', v_after
    )
  );

  return jsonb_build_object('ok', true, 'amount_due', v_after);
end;
$$;

-- ---------------------------------------------------------------------------
-- 3) Restore — Owner or Manager (2A bodies + role widen only)
-- ---------------------------------------------------------------------------

create or replace function public.restore_guest_order_processing_fee(
  p_order_id uuid,
  p_actor_staff_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_method public.fulfilment_method;
  v_details public.order_delivery_details%rowtype;
  v_before numeric(10, 2);
  v_after numeric(10, 2);
  v_restored numeric(10, 2);
begin
  v_role := public._staff_role_code(p_actor_staff_id);
  if v_role not in ('owner', 'manager') then
    raise exception 'Only Owner or Manager can restore Processing fee';
  end if;

  select fulfilment_method into v_method
  from public.orders where id = p_order_id;
  if not found then
    raise exception 'Order not found';
  end if;
  if v_method is distinct from 'delivery' then
    raise exception 'Processing fee restore applies only to Delivery orders';
  end if;

  select * into v_details
  from public.order_delivery_details where order_id = p_order_id;
  if not found or not v_details.delivery_finance_enabled then
    raise exception 'Governed Delivery finance required';
  end if;
  if not v_details.processing_fee_waived then
    raise exception 'Processing fee is not waived';
  end if;

  v_restored := coalesce(
    v_details.processing_fee_override_amount,
    v_details.processing_fee_applicable_amount,
    0
  )::numeric(10, 2);

  v_before := public.order_amount_due(p_order_id);

  update public.order_delivery_details
  set
    processing_fee_waived = false,
    updated_at = now()
  where order_id = p_order_id;

  perform public._sync_delivery_finance_adjustments(p_order_id, p_actor_staff_id);
  v_after := public.order_amount_due(p_order_id);

  insert into public.order_timeline_events (
    order_id, event_type, actor_staff_id, metadata
  ) values (
    p_order_id,
    'delivery_processing_fee_restored',
    p_actor_staff_id,
    jsonb_build_object(
      'applicable_amount', v_details.processing_fee_applicable_amount,
      'override_amount', v_details.processing_fee_override_amount,
      'restored_effective_amount', v_restored,
      'reason', nullif(trim(coalesce(p_reason, '')), ''),
      'previous_amount_due', v_before,
      'new_amount_due', v_after
    )
  );

  return jsonb_build_object(
    'ok', true,
    'amount_due', v_after,
    'restored_effective_amount', v_restored
  );
end;
$$;

create or replace function public.restore_guest_order_delivery_fee(
  p_order_id uuid,
  p_actor_staff_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_method public.fulfilment_method;
  v_details public.order_delivery_details%rowtype;
  v_before numeric(10, 2);
  v_after numeric(10, 2);
  v_restored numeric(10, 2);
begin
  v_role := public._staff_role_code(p_actor_staff_id);
  if v_role not in ('owner', 'manager') then
    raise exception 'Only Owner or Manager can restore Delivery fee';
  end if;

  select fulfilment_method into v_method
  from public.orders where id = p_order_id;
  if not found then
    raise exception 'Order not found';
  end if;
  if v_method is distinct from 'delivery' then
    raise exception 'Delivery fee restore applies only to Delivery orders';
  end if;

  select * into v_details
  from public.order_delivery_details where order_id = p_order_id;
  if not found or not v_details.delivery_finance_enabled then
    raise exception 'Governed Delivery finance required';
  end if;
  if v_details.delivery_fee_status is distinct from 'quoted_waived'
     or not v_details.delivery_fee_waived then
    raise exception 'Delivery fee is not waived';
  end if;
  if v_details.delivery_fee_quoted_amount is null
     or v_details.delivery_fee_quoted_amount <= 0 then
    raise exception 'Quoted Delivery fee is required to restore';
  end if;

  v_restored := v_details.delivery_fee_quoted_amount::numeric(10, 2);
  v_before := public.order_amount_due(p_order_id);

  update public.order_delivery_details
  set
    delivery_fee_status = 'quoted',
    delivery_fee_waived = false,
    updated_at = now()
  where order_id = p_order_id;

  perform public._sync_delivery_finance_adjustments(p_order_id, p_actor_staff_id);
  v_after := public.order_amount_due(p_order_id);

  insert into public.order_timeline_events (
    order_id, event_type, actor_staff_id, metadata
  ) values (
    p_order_id,
    'delivery_fee_restored',
    p_actor_staff_id,
    jsonb_build_object(
      'quoted_amount', v_details.delivery_fee_quoted_amount,
      'restored_effective_amount', v_restored,
      'reason', nullif(trim(coalesce(p_reason, '')), ''),
      'previous_amount_due', v_before,
      'new_amount_due', v_after
    )
  );

  return jsonb_build_object(
    'ok', true,
    'amount_due', v_after,
    'restored_effective_amount', v_restored
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 4) Counter requests — customer_operations only (Manager uses direct actions)
-- ---------------------------------------------------------------------------

create or replace function public.request_guest_order_delivery_fee_waiver(
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
  v_role text;
  v_details public.order_delivery_details%rowtype;
begin
  v_role := public._staff_role_code(p_actor_staff_id);
  if v_role is null then
    raise exception 'Staff profile required';
  end if;
  if v_role = 'owner' then
    raise exception 'Owner should waive Delivery fee directly';
  end if;
  if v_role = 'manager' then
    raise exception 'Manager should waive Delivery fee directly';
  end if;
  if v_role is distinct from 'customer_operations' then
    raise exception 'Not authorized to request Delivery fee waiver';
  end if;
  if nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'Waiver request reason is required';
  end if;

  select * into v_details
  from public.order_delivery_details where order_id = p_order_id;
  if not found or not v_details.delivery_finance_enabled then
    raise exception 'Governed Delivery finance required';
  end if;
  if v_details.delivery_fee_status is distinct from 'quoted'
     or v_details.delivery_fee_quoted_amount is null
     or v_details.delivery_fee_quoted_amount <= 0 then
    raise exception 'Delivery fee must be quoted before requesting a waiver';
  end if;

  update public.order_delivery_details
  set
    delivery_fee_request_status = 'pending',
    delivery_fee_request_reason = trim(p_reason),
    delivery_fee_request_quoted_amount = v_details.delivery_fee_quoted_amount,
    delivery_fee_requested_by = p_actor_staff_id,
    delivery_fee_requested_at = now(),
    delivery_fee_request_resolved_by = null,
    delivery_fee_request_resolved_at = null,
    delivery_fee_request_resolution_note = null,
    updated_at = now()
  where order_id = p_order_id;

  insert into public.order_timeline_events (
    order_id, event_type, actor_staff_id, metadata
  ) values (
    p_order_id,
    'delivery_fee_waiver_requested',
    p_actor_staff_id,
    jsonb_build_object(
      'quoted_amount', v_details.delivery_fee_quoted_amount,
      'reason', trim(p_reason),
      'amount_due_unchanged', public.order_amount_due(p_order_id)
    )
  );

  return jsonb_build_object(
    'ok', true,
    'pending', true,
    'amount_due', public.order_amount_due(p_order_id)
  );
end;
$$;

create or replace function public.request_guest_order_processing_fee_change(
  p_order_id uuid,
  p_actor_staff_id uuid,
  p_kind text,
  p_proposed_amount numeric default null,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_details public.order_delivery_details%rowtype;
begin
  v_role := public._staff_role_code(p_actor_staff_id);
  if v_role is null then
    raise exception 'Staff profile required';
  end if;
  if v_role = 'owner' then
    raise exception 'Owner should override/waive processing fee directly';
  end if;
  if v_role = 'manager' then
    raise exception 'Manager should override/waive processing fee directly';
  end if;
  if v_role is distinct from 'customer_operations' then
    raise exception 'Not authorized to request processing fee change';
  end if;
  if p_kind not in ('processing_override', 'processing_waiver') then
    raise exception 'Invalid processing fee request kind';
  end if;
  if nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'Request reason is required';
  end if;
  if p_kind = 'processing_override' then
    if p_proposed_amount is null or p_proposed_amount <= 0 then
      raise exception 'Processing fee change amount must be greater than RM0 (use waive for RM0)';
    end if;
  end if;

  select * into v_details
  from public.order_delivery_details where order_id = p_order_id;
  if not found or not v_details.delivery_finance_enabled then
    raise exception 'Governed Delivery finance required';
  end if;

  update public.order_delivery_details
  set
    processing_fee_request_kind = p_kind,
    processing_fee_request_status = 'pending',
    processing_fee_request_proposed_amount = case
      when p_kind = 'processing_override' then p_proposed_amount::numeric(10, 2)
      else 0 end,
    processing_fee_request_reason = trim(p_reason),
    processing_fee_requested_by = p_actor_staff_id,
    processing_fee_requested_at = now(),
    processing_fee_request_resolved_by = null,
    processing_fee_request_resolved_at = null,
    processing_fee_request_resolution_note = null,
    updated_at = now()
  where order_id = p_order_id;

  insert into public.order_timeline_events (
    order_id, event_type, actor_staff_id, metadata
  ) values (
    p_order_id,
    'delivery_processing_fee_change_requested',
    p_actor_staff_id,
    jsonb_build_object(
      'kind', p_kind,
      'proposed_amount', case
        when p_kind = 'processing_override' then p_proposed_amount
        else 0 end,
      'reason', trim(p_reason),
      'amount_due_unchanged', public.order_amount_due(p_order_id)
    )
  );

  return jsonb_build_object(
    'ok', true,
    'pending', true,
    'amount_due', public.order_amount_due(p_order_id)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 5) Resolve — Owner or Manager
-- ---------------------------------------------------------------------------

create or replace function public.resolve_guest_order_delivery_fee_request(
  p_order_id uuid,
  p_actor_staff_id uuid,
  p_approve boolean,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_details public.order_delivery_details%rowtype;
  v_before numeric(10, 2);
  v_after numeric(10, 2);
begin
  v_role := public._staff_role_code(p_actor_staff_id);
  if v_role not in ('owner', 'manager') then
    raise exception 'Only Owner or Manager can resolve Delivery fee waiver requests';
  end if;

  select * into v_details
  from public.order_delivery_details where order_id = p_order_id;
  if not found
     or v_details.delivery_fee_request_status is distinct from 'pending' then
    raise exception 'No pending Delivery fee waiver request';
  end if;

  v_before := public.order_amount_due(p_order_id);

  if p_approve then
    update public.order_delivery_details
    set
      delivery_fee_status = 'quoted_waived',
      delivery_fee_waived = true,
      delivery_fee_request_status = 'approved',
      delivery_fee_request_resolved_by = p_actor_staff_id,
      delivery_fee_request_resolved_at = now(),
      delivery_fee_request_resolution_note = nullif(trim(coalesce(p_note, '')), ''),
      updated_at = now()
    where order_id = p_order_id;
    perform public._sync_delivery_finance_adjustments(p_order_id, p_actor_staff_id);
  else
    update public.order_delivery_details
    set
      delivery_fee_request_status = 'rejected',
      delivery_fee_request_resolved_by = p_actor_staff_id,
      delivery_fee_request_resolved_at = now(),
      delivery_fee_request_resolution_note = nullif(trim(coalesce(p_note, '')), ''),
      updated_at = now()
    where order_id = p_order_id;
  end if;

  v_after := public.order_amount_due(p_order_id);

  insert into public.order_timeline_events (
    order_id, event_type, actor_staff_id, metadata
  ) values (
    p_order_id,
    case when p_approve then 'delivery_fee_waiver_approved'
         else 'delivery_fee_waiver_rejected' end,
    p_actor_staff_id,
    jsonb_build_object(
      'quoted_amount', coalesce(
        v_details.delivery_fee_request_quoted_amount,
        v_details.delivery_fee_quoted_amount
      ),
      'note', nullif(trim(coalesce(p_note, '')), ''),
      'previous_amount_due', v_before,
      'new_amount_due', v_after,
      'resolved_by_role', v_role
    )
  );

  return jsonb_build_object('ok', true, 'approved', p_approve, 'amount_due', v_after);
end;
$$;

create or replace function public.resolve_guest_order_processing_fee_request(
  p_order_id uuid,
  p_actor_staff_id uuid,
  p_approve boolean,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_details public.order_delivery_details%rowtype;
  v_before numeric(10, 2);
  v_after numeric(10, 2);
begin
  v_role := public._staff_role_code(p_actor_staff_id);
  if v_role not in ('owner', 'manager') then
    raise exception 'Only Owner or Manager can resolve processing fee requests';
  end if;

  select * into v_details
  from public.order_delivery_details where order_id = p_order_id;
  if not found
     or v_details.processing_fee_request_status is distinct from 'pending'
     or v_details.processing_fee_request_kind not in (
       'processing_override', 'processing_waiver'
     ) then
    raise exception 'No pending processing fee request';
  end if;

  v_before := public.order_amount_due(p_order_id);

  if p_approve then
    if v_details.processing_fee_request_kind = 'processing_waiver' then
      update public.order_delivery_details
      set
        processing_fee_waived = true,
        processing_fee_request_status = 'approved',
        processing_fee_request_resolved_by = p_actor_staff_id,
        processing_fee_request_resolved_at = now(),
        processing_fee_request_resolution_note = nullif(trim(coalesce(p_note, '')), ''),
        updated_at = now()
      where order_id = p_order_id;
    else
      update public.order_delivery_details
      set
        processing_fee_override_amount = v_details.processing_fee_request_proposed_amount,
        processing_fee_waived = false,
        processing_fee_request_status = 'approved',
        processing_fee_request_resolved_by = p_actor_staff_id,
        processing_fee_request_resolved_at = now(),
        processing_fee_request_resolution_note = nullif(trim(coalesce(p_note, '')), ''),
        updated_at = now()
      where order_id = p_order_id;
    end if;
    perform public._sync_delivery_finance_adjustments(p_order_id, p_actor_staff_id);
  else
    update public.order_delivery_details
    set
      processing_fee_request_status = 'rejected',
      processing_fee_request_resolved_by = p_actor_staff_id,
      processing_fee_request_resolved_at = now(),
      processing_fee_request_resolution_note = nullif(trim(coalesce(p_note, '')), ''),
      updated_at = now()
    where order_id = p_order_id;
  end if;

  v_after := public.order_amount_due(p_order_id);

  insert into public.order_timeline_events (
    order_id, event_type, actor_staff_id, metadata
  ) values (
    p_order_id,
    case when p_approve then 'delivery_processing_fee_request_approved'
         else 'delivery_processing_fee_request_rejected' end,
    p_actor_staff_id,
    jsonb_build_object(
      'kind', v_details.processing_fee_request_kind,
      'proposed_amount', v_details.processing_fee_request_proposed_amount,
      'note', nullif(trim(coalesce(p_note, '')), ''),
      'previous_amount_due', v_before,
      'new_amount_due', v_after,
      'resolved_by_role', v_role
    )
  );

  return jsonb_build_object('ok', true, 'approved', p_approve, 'amount_due', v_after);
end;
$$;

-- ---------------------------------------------------------------------------
-- 6) Cancel / dismiss — requester-own OR Owner OR Manager
-- ---------------------------------------------------------------------------

create or replace function public.cancel_guest_order_delivery_fee_request(
  p_order_id uuid,
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
  v_details public.order_delivery_details%rowtype;
  v_note text;
begin
  v_role := public._staff_role_code(p_actor_staff_id);
  if v_role is null then
    raise exception 'Staff profile required';
  end if;

  select * into v_details
  from public.order_delivery_details where order_id = p_order_id;
  if not found
     or v_details.delivery_fee_request_status is distinct from 'pending' then
    raise exception 'No pending Delivery fee waiver request';
  end if;

  if v_role not in ('owner', 'manager')
     and v_details.delivery_fee_requested_by is distinct from p_actor_staff_id then
    raise exception 'Only the requester, Owner, or Manager can cancel this Delivery fee request';
  end if;

  v_note := nullif(trim(coalesce(p_note, '')), '');

  update public.order_delivery_details
  set
    delivery_fee_request_status = 'cancelled',
    delivery_fee_request_resolved_by = p_actor_staff_id,
    delivery_fee_request_resolved_at = now(),
    delivery_fee_request_resolution_note = v_note,
    updated_at = now()
  where order_id = p_order_id;

  insert into public.order_timeline_events (
    order_id, event_type, actor_staff_id, metadata
  ) values (
    p_order_id,
    'delivery_fee_waiver_request_cancelled',
    p_actor_staff_id,
    jsonb_build_object(
      'reason', v_note,
      'superseded_by_delivery_fee_change', false,
      'quoted_amount', v_details.delivery_fee_request_quoted_amount,
      'requested_by', v_details.delivery_fee_requested_by,
      'requested_at', v_details.delivery_fee_requested_at,
      'cancelled_by', p_actor_staff_id,
      'cancelled_by_owner', v_role = 'owner'
        and v_details.delivery_fee_requested_by is distinct from p_actor_staff_id,
      'cancelled_by_manager', v_role = 'manager'
        and v_details.delivery_fee_requested_by is distinct from p_actor_staff_id,
      'amount_due_unchanged', public.order_amount_due(p_order_id)
    )
  );

  return jsonb_build_object(
    'ok', true,
    'cancelled', true,
    'amount_due', public.order_amount_due(p_order_id)
  );
end;
$$;

create or replace function public.cancel_guest_order_processing_fee_request(
  p_order_id uuid,
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
  v_details public.order_delivery_details%rowtype;
  v_note text;
begin
  v_role := public._staff_role_code(p_actor_staff_id);
  if v_role is null then
    raise exception 'Staff profile required';
  end if;

  select * into v_details
  from public.order_delivery_details where order_id = p_order_id;
  if not found
     or v_details.processing_fee_request_status is distinct from 'pending' then
    raise exception 'No pending processing fee request';
  end if;

  if v_role not in ('owner', 'manager')
     and v_details.processing_fee_requested_by is distinct from p_actor_staff_id then
    raise exception 'Only the requester, Owner, or Manager can cancel this processing fee request';
  end if;

  v_note := nullif(trim(coalesce(p_note, '')), '');

  update public.order_delivery_details
  set
    processing_fee_request_status = 'cancelled',
    processing_fee_request_resolved_by = p_actor_staff_id,
    processing_fee_request_resolved_at = now(),
    processing_fee_request_resolution_note = v_note,
    updated_at = now()
  where order_id = p_order_id;

  insert into public.order_timeline_events (
    order_id, event_type, actor_staff_id, metadata
  ) values (
    p_order_id,
    'delivery_processing_fee_request_cancelled',
    p_actor_staff_id,
    jsonb_build_object(
      'reason', v_note,
      'kind', v_details.processing_fee_request_kind,
      'proposed_amount', v_details.processing_fee_request_proposed_amount,
      'requested_by', v_details.processing_fee_requested_by,
      'requested_at', v_details.processing_fee_requested_at,
      'cancelled_by', p_actor_staff_id,
      'cancelled_by_owner', v_role = 'owner'
        and v_details.processing_fee_requested_by is distinct from p_actor_staff_id,
      'cancelled_by_manager', v_role = 'manager'
        and v_details.processing_fee_requested_by is distinct from p_actor_staff_id,
      'amount_due_unchanged', public.order_amount_due(p_order_id)
    )
  );

  return jsonb_build_object(
    'ok', true,
    'cancelled', true,
    'amount_due', public.order_amount_due(p_order_id)
  );
end;
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'waive_guest_order_delivery_fee(uuid,uuid,text)',
    'override_guest_order_processing_fee(uuid,uuid,numeric,text)',
    'waive_guest_order_processing_fee(uuid,uuid,text)',
    'restore_guest_order_processing_fee(uuid,uuid,text)',
    'restore_guest_order_delivery_fee(uuid,uuid,text)',
    'request_guest_order_delivery_fee_waiver(uuid,uuid,text)',
    'request_guest_order_processing_fee_change(uuid,uuid,text,numeric,text)',
    'resolve_guest_order_delivery_fee_request(uuid,uuid,boolean,text)',
    'resolve_guest_order_processing_fee_request(uuid,uuid,boolean,text)',
    'cancel_guest_order_delivery_fee_request(uuid,uuid,text)',
    'cancel_guest_order_processing_fee_request(uuid,uuid,text)'
  ]
  loop
    execute format('revoke all on function public.%s from public', fn);
    execute format('revoke all on function public.%s from anon', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end $$;

comment on function public.waive_guest_order_delivery_fee(uuid, uuid, text) is
  'M4-P3 2B-2: Owner or Manager direct Delivery waive. Refuses if a Delivery waiver request is pending.';
comment on function public.resolve_guest_order_delivery_fee_request(uuid, uuid, boolean, text) is
  'M4-P3 2B-2: Owner or Manager approve/reject pending Delivery fee waiver request.';
comment on function public.resolve_guest_order_processing_fee_request(uuid, uuid, boolean, text) is
  'M4-P3 2B-2: Owner or Manager approve/reject pending Processing fee request.';
