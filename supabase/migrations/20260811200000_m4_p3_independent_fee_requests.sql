-- M4-P3 Slice 2B-1 — Independent Delivery / Processing fee request slots + cancel.
-- Additive. Narrowly scoped to the two Delivery financial categories.
--
-- Product correction vs Slice 1 single in-row fee_request_* slot:
--   at most one pending Delivery Fee request
--   AND at most one pending Processing Fee request
--   on the same order simultaneously.
--
-- Also:
--   - truthful auto-cancel of pending Delivery waiver when quote changes
--   - requester-own cancel + Owner cancel/dismiss
--   - cancelled status (distinct from rejected)
--   - Counter-like quote/request roles: owner | customer_operations | manager
--   - Processing override request amount must be > RM0 (RM0 = waive only)
--
-- Legacy fee_request_* columns are backfilled into the new slots then left
-- unused by RPCs (no drop — reversible / Slice 1 row compatibility).

-- ---------------------------------------------------------------------------
-- 1) Schema: independent request slots
-- ---------------------------------------------------------------------------

alter table public.order_delivery_details
  add column if not exists delivery_fee_request_status text,
  add column if not exists delivery_fee_request_reason text,
  add column if not exists delivery_fee_request_quoted_amount numeric(10, 2),
  add column if not exists delivery_fee_requested_by uuid references public.staff_profiles (id) on delete set null,
  add column if not exists delivery_fee_requested_at timestamptz,
  add column if not exists delivery_fee_request_resolved_by uuid references public.staff_profiles (id) on delete set null,
  add column if not exists delivery_fee_request_resolved_at timestamptz,
  add column if not exists delivery_fee_request_resolution_note text,
  add column if not exists processing_fee_request_kind text,
  add column if not exists processing_fee_request_status text,
  add column if not exists processing_fee_request_proposed_amount numeric(10, 2),
  add column if not exists processing_fee_request_reason text,
  add column if not exists processing_fee_requested_by uuid references public.staff_profiles (id) on delete set null,
  add column if not exists processing_fee_requested_at timestamptz,
  add column if not exists processing_fee_request_resolved_by uuid references public.staff_profiles (id) on delete set null,
  add column if not exists processing_fee_request_resolved_at timestamptz,
  add column if not exists processing_fee_request_resolution_note text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'order_delivery_details_delivery_fee_request_status_check'
  ) then
    alter table public.order_delivery_details
      add constraint order_delivery_details_delivery_fee_request_status_check check (
        delivery_fee_request_status is null
        or delivery_fee_request_status in (
          'pending', 'approved', 'rejected', 'cancelled'
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'order_delivery_details_processing_fee_request_kind_check'
  ) then
    alter table public.order_delivery_details
      add constraint order_delivery_details_processing_fee_request_kind_check check (
        processing_fee_request_kind is null
        or processing_fee_request_kind in (
          'processing_override',
          'processing_waiver'
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'order_delivery_details_processing_fee_request_status_check'
  ) then
    alter table public.order_delivery_details
      add constraint order_delivery_details_processing_fee_request_status_check check (
        processing_fee_request_status is null
        or processing_fee_request_status in (
          'pending', 'approved', 'rejected', 'cancelled'
        )
      );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2) Backfill from Slice 1 single-slot columns (one-time; idempotent-ish)
-- ---------------------------------------------------------------------------

update public.order_delivery_details
set
  delivery_fee_request_status = fee_request_status,
  delivery_fee_request_reason = fee_request_reason,
  delivery_fee_request_quoted_amount = delivery_fee_quoted_amount,
  delivery_fee_requested_by = fee_requested_by,
  delivery_fee_requested_at = fee_requested_at,
  delivery_fee_request_resolved_by = fee_resolved_by,
  delivery_fee_request_resolved_at = fee_resolved_at,
  delivery_fee_request_resolution_note = fee_resolution_note
where fee_request_kind = 'delivery_waiver'
  and delivery_fee_request_status is null
  and fee_request_status is not null;

update public.order_delivery_details
set
  processing_fee_request_kind = fee_request_kind,
  processing_fee_request_status = fee_request_status,
  processing_fee_request_proposed_amount = fee_request_proposed_amount,
  processing_fee_request_reason = fee_request_reason,
  processing_fee_requested_by = fee_requested_by,
  processing_fee_requested_at = fee_requested_at,
  processing_fee_request_resolved_by = fee_resolved_by,
  processing_fee_request_resolved_at = fee_resolved_at,
  processing_fee_request_resolution_note = fee_resolution_note
where fee_request_kind in ('processing_override', 'processing_waiver')
  and processing_fee_request_status is null
  and fee_request_status is not null;

-- ---------------------------------------------------------------------------
-- 3) Quote — Counter-like roles; auto-cancel Delivery request only (audited)
-- ---------------------------------------------------------------------------

create or replace function public.set_guest_order_delivery_fee_quote(
  p_order_id uuid,
  p_actor_staff_id uuid,
  p_amount numeric
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
  v_cancelled_delivery_request boolean := false;
  v_prev_req_quote numeric(10, 2);
  v_prev_req_by uuid;
  v_prev_req_at timestamptz;
  v_prev_req_reason text;
begin
  v_role := public._staff_role_code(p_actor_staff_id);
  if v_role is null then
    raise exception 'Staff profile required';
  end if;
  if v_role not in ('owner', 'customer_operations', 'manager') then
    raise exception 'Not authorized to set Delivery fee quote';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Delivery fee quote must be greater than RM0 (use waiver for RM0 payable)';
  end if;
  v_amount := p_amount::numeric(10, 2);

  select * into v_details
  from public.order_delivery_details where order_id = p_order_id;
  if not found then
    raise exception 'Delivery details are required';
  end if;
  if not v_details.delivery_finance_enabled then
    raise exception 'Delivery finance is not enabled for this order';
  end if;

  v_before := public.order_amount_due(p_order_id);

  if v_details.delivery_fee_request_status = 'pending' then
    v_cancelled_delivery_request := true;
    v_prev_req_quote := v_details.delivery_fee_request_quoted_amount;
    v_prev_req_by := v_details.delivery_fee_requested_by;
    v_prev_req_at := v_details.delivery_fee_requested_at;
    v_prev_req_reason := v_details.delivery_fee_request_reason;
  end if;

  update public.order_delivery_details
  set
    delivery_fee_status = 'quoted',
    delivery_fee_quoted_amount = v_amount,
    delivery_fee_waived = false,
    delivery_fee_request_status = case
      when delivery_fee_request_status = 'pending' then 'cancelled'
      else delivery_fee_request_status end,
    delivery_fee_request_resolved_by = case
      when delivery_fee_request_status = 'pending' then p_actor_staff_id
      else delivery_fee_request_resolved_by end,
    delivery_fee_request_resolved_at = case
      when delivery_fee_request_status = 'pending' then now()
      else delivery_fee_request_resolved_at end,
    delivery_fee_request_resolution_note = case
      when delivery_fee_request_status = 'pending'
        then 'Superseded by Delivery Fee change'
      else delivery_fee_request_resolution_note end,
    -- Legacy single-slot: clear only when it held a pending Delivery waiver
    fee_request_kind = case
      when fee_request_kind = 'delivery_waiver' and fee_request_status = 'pending'
        then null else fee_request_kind end,
    fee_request_status = case
      when fee_request_kind = 'delivery_waiver' and fee_request_status = 'pending'
        then null else fee_request_status end,
    updated_at = now()
  where order_id = p_order_id;

  perform public._sync_delivery_finance_adjustments(p_order_id, p_actor_staff_id);
  v_after := public.order_amount_due(p_order_id);

  if v_cancelled_delivery_request then
    insert into public.order_timeline_events (
      order_id, event_type, actor_staff_id, metadata
    ) values (
      p_order_id,
      'delivery_fee_waiver_request_cancelled',
      p_actor_staff_id,
      jsonb_build_object(
        'reason', 'Superseded by Delivery Fee change',
        'superseded_by_delivery_fee_change', true,
        'previous_request_quoted_amount', v_prev_req_quote,
        'previous_delivery_fee_quoted_amount', v_details.delivery_fee_quoted_amount,
        'new_delivery_fee_quoted_amount', v_amount,
        'requested_by', v_prev_req_by,
        'requested_at', v_prev_req_at,
        'request_reason', v_prev_req_reason,
        'cancelled_by', p_actor_staff_id,
        'amount_due_unchanged_by_cancel', v_before
      )
    );
  end if;

  insert into public.order_timeline_events (
    order_id, event_type, actor_staff_id, metadata
  ) values (
    p_order_id,
    'delivery_fee_quoted',
    p_actor_staff_id,
    jsonb_build_object(
      'quoted_amount', v_amount,
      'previous_amount_due', v_before,
      'new_amount_due', v_after,
      'superseded_pending_delivery_waiver_request', v_cancelled_delivery_request
    )
  );

  return jsonb_build_object(
    'ok', true,
    'amount_due', v_after,
    'quoted_amount', v_amount,
    'cancelled_pending_delivery_waiver_request', v_cancelled_delivery_request
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 4) Owner direct waive Delivery — clear Delivery request slot only
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
  if v_role is distinct from 'owner' then
    raise exception 'Only Owner can waive Delivery fee directly';
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

  v_before := public.order_amount_due(p_order_id);

  update public.order_delivery_details
  set
    delivery_fee_status = 'quoted_waived',
    delivery_fee_waived = true,
    delivery_fee_request_status = case
      when delivery_fee_request_status = 'pending' then 'cancelled'
      else delivery_fee_request_status end,
    delivery_fee_request_resolved_by = case
      when delivery_fee_request_status = 'pending' then p_actor_staff_id
      else delivery_fee_request_resolved_by end,
    delivery_fee_request_resolved_at = case
      when delivery_fee_request_status = 'pending' then now()
      else delivery_fee_request_resolved_at end,
    delivery_fee_request_resolution_note = case
      when delivery_fee_request_status = 'pending'
        then coalesce(
          nullif(trim(coalesce(p_reason, '')), ''),
          'Superseded by Owner direct Delivery fee waiver'
        )
      else delivery_fee_request_resolution_note end,
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
-- 5) Owner processing override / waive — clear Processing request slot only
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
  if v_role is distinct from 'owner' then
    raise exception 'Only Owner can override processing fee directly';
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

  v_before := public.order_amount_due(p_order_id);

  update public.order_delivery_details
  set
    processing_fee_override_amount = v_amount,
    processing_fee_waived = false,
    processing_fee_request_status = case
      when processing_fee_request_status = 'pending' then 'cancelled'
      else processing_fee_request_status end,
    processing_fee_request_resolved_by = case
      when processing_fee_request_status = 'pending' then p_actor_staff_id
      else processing_fee_request_resolved_by end,
    processing_fee_request_resolved_at = case
      when processing_fee_request_status = 'pending' then now()
      else processing_fee_request_resolved_at end,
    processing_fee_request_resolution_note = case
      when processing_fee_request_status = 'pending'
        then coalesce(
          nullif(trim(coalesce(p_reason, '')), ''),
          'Superseded by Owner processing fee override'
        )
      else processing_fee_request_resolution_note end,
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
  if v_role is distinct from 'owner' then
    raise exception 'Only Owner can waive processing fee directly';
  end if;

  select * into v_details
  from public.order_delivery_details where order_id = p_order_id;
  if not found or not v_details.delivery_finance_enabled then
    raise exception 'Governed Delivery finance required';
  end if;

  v_before := public.order_amount_due(p_order_id);

  update public.order_delivery_details
  set
    processing_fee_waived = true,
    processing_fee_request_status = case
      when processing_fee_request_status = 'pending' then 'cancelled'
      else processing_fee_request_status end,
    processing_fee_request_resolved_by = case
      when processing_fee_request_status = 'pending' then p_actor_staff_id
      else processing_fee_request_resolved_by end,
    processing_fee_request_resolved_at = case
      when processing_fee_request_status = 'pending' then now()
      else processing_fee_request_resolved_at end,
    processing_fee_request_resolution_note = case
      when processing_fee_request_status = 'pending'
        then coalesce(
          nullif(trim(coalesce(p_reason, '')), ''),
          'Superseded by Owner processing fee waiver'
        )
      else processing_fee_request_resolution_note end,
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
-- 6) Counter request seams — independent slots
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
  if v_role not in ('customer_operations', 'manager') then
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

  -- Pending request does NOT change payable amount.
  -- Writes Delivery slot only — Processing pending is untouched.
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
  if v_role not in ('customer_operations', 'manager') then
    raise exception 'Not authorized to request processing fee change';
  end if;
  if p_kind not in ('processing_override', 'processing_waiver') then
    raise exception 'Invalid processing fee request kind';
  end if;
  if nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'Request reason is required';
  end if;
  if p_kind = 'processing_override' then
    -- RM0 is exclusively the Waive option.
    if p_proposed_amount is null or p_proposed_amount <= 0 then
      raise exception 'Processing fee change amount must be greater than RM0 (use waive for RM0)';
    end if;
  end if;

  select * into v_details
  from public.order_delivery_details where order_id = p_order_id;
  if not found or not v_details.delivery_finance_enabled then
    raise exception 'Governed Delivery finance required';
  end if;

  -- Writes Processing slot only — Delivery pending is untouched.
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
-- 7) Owner resolve — independent slots (approve / reject; cancel is separate)
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
  if v_role is distinct from 'owner' then
    raise exception 'Only Owner can resolve Delivery fee waiver requests';
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
      'new_amount_due', v_after
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
  if v_role is distinct from 'owner' then
    raise exception 'Only Owner can resolve processing fee requests';
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
      'new_amount_due', v_after
    )
  );

  return jsonb_build_object('ok', true, 'approved', p_approve, 'amount_due', v_after);
end;
$$;

-- ---------------------------------------------------------------------------
-- 8) Cancel / dismiss — requester-own or Owner (not reject)
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

  if v_role is distinct from 'owner'
     and v_details.delivery_fee_requested_by is distinct from p_actor_staff_id then
    raise exception 'Only the requester or Owner can cancel this Delivery fee request';
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

  if v_role is distinct from 'owner'
     and v_details.processing_fee_requested_by is distinct from p_actor_staff_id then
    raise exception 'Only the requester or Owner can cancel this processing fee request';
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

-- ---------------------------------------------------------------------------
-- 9) Grants
-- ---------------------------------------------------------------------------

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'set_guest_order_delivery_fee_quote(uuid,uuid,numeric)',
    'waive_guest_order_delivery_fee(uuid,uuid,text)',
    'override_guest_order_processing_fee(uuid,uuid,numeric,text)',
    'waive_guest_order_processing_fee(uuid,uuid,text)',
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

comment on function public.cancel_guest_order_delivery_fee_request(uuid, uuid, text) is
  'M4-P3 2B-1: cancel/dismiss pending Delivery fee waiver request (requester-own or Owner). Distinct from Owner reject.';
comment on function public.cancel_guest_order_processing_fee_request(uuid, uuid, text) is
  'M4-P3 2B-1: cancel/dismiss pending Processing fee request (requester-own or Owner). Distinct from Owner reject.';
