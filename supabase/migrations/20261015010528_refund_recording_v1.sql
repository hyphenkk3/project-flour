-- Refund Recording V1. Existing public.refunds remains the sole refund ledger.
-- This migration is additive and is intended for DEV review only; do not apply
-- it to the hosted DEV database without explicit approval.

alter table public.refunds
  add column if not exists refund_method text,
  add column if not exists refund_method_description text,
  add column if not exists request_key uuid;

alter table public.refunds
  drop constraint if exists refunds_method_check,
  drop constraint if exists refunds_method_description_check,
  drop constraint if exists refunds_reason_length_check;
alter table public.refunds
  drop constraint if exists refunds_refund_type_check;
alter table public.refunds
  add constraint refunds_refund_type_check
  check (refund_type in (
    'overpayment_correction',
    'fresh_pick_cancellation',
    'order_refund'
  ));

alter table public.refunds
  add constraint refunds_method_check
  check (
    refund_method is null
    or refund_method in ('online_transfer', 'wb_qr', 'cash', 'others')
  ),
  add constraint refunds_method_description_check
  check (coalesce(
    (refund_method is null and refund_method_description is null)
    or (refund_method = 'others' and coalesce(nullif(trim(refund_method_description), '') is not null, false))
    or (refund_method in ('online_transfer', 'wb_qr', 'cash') and refund_method_description is null)
  , false)),
  add constraint refunds_reason_length_check
  check (reason is null or char_length(reason) <= 2000);

create unique index if not exists refunds_request_key_uidx
  on public.refunds (request_key)
  where request_key is not null;

comment on column public.refunds.refund_method is
  'Method used to issue the already-completed refund; NULL is retained for legacy rows.';
comment on column public.refunds.refund_method_description is
  'Required detail for refund_method=others; never inferred for legacy refunds.';
comment on column public.refunds.request_key is
  'Client-generated idempotency key for a general refund submission.';

-- Refund writes must pass through audited, role-checked RPCs. Keep read access
-- for authenticated staff under the existing RLS policy.
drop policy if exists refunds_authenticated_insert on public.refunds;
revoke insert, update, delete, truncate, references, trigger
  on table public.refunds from public, anon, authenticated, service_role;
grant select on table public.refunds to authenticated;

create or replace function public.assert_refund_within_overpayment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_remaining numeric(10, 2);
begin
  if new.amount is null or new.amount <= 0 then
    raise exception 'Refund amount must be greater than zero';
  end if;

  if new.refund_type = 'fresh_pick_cancellation' then
    if not exists (
      select 1
      from public.orders o
      where o.id = new.order_id
        and o.extra_stock_id is not null
        and o.status = 'paid'
        and o.payment_status = 'paid'
    ) then
      raise exception 'Fresh Pick cancellation refund requires a paid Fresh Pick order';
    end if;
    if new.amount <> public.order_net_received(new.order_id) then
      raise exception 'Fresh Pick cancellation refund must equal the remaining net received amount';
    end if;
    return new;
  end if;

  if new.refund_type = 'order_refund' then
    v_remaining := greatest(
      public.order_verified_allocated(new.order_id)
        - public.order_refunds_total(new.order_id),
      0
    )::numeric(10, 2);
    if new.amount > v_remaining then
      raise exception 'Refund exceeds remaining verified receipts';
    end if;
    return new;
  end if;

  if new.refund_type <> 'overpayment_correction' then
    raise exception 'Unsupported refund type';
  end if;
  if public.order_verified_allocated(new.order_id) <= 0 then
    raise exception 'This order has no verified payment to correct';
  end if;

  v_remaining := greatest(
    public.order_verified_allocated(new.order_id)
      - public.order_amount_due(new.order_id)
      - public.order_refunds_total(new.order_id),
    0
  )::numeric(10, 2);
  if new.amount > v_remaining then
    raise exception 'Refund exceeds remaining overpayment';
  end if;
  return new;
end;
$$;

revoke all on function public.assert_refund_within_overpayment()
  from public, anon, authenticated, service_role;

-- Preserve the existing overpayment RPC signature and grants for the currently
-- deployed DEV source. New clients use the metadata-aware wrapper below.

create or replace function public.record_order_refund(
  p_order_id uuid,
  p_amount numeric,
  p_method text,
  p_method_description text,
  p_refunded_on date,
  p_reason text,
  p_request_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_order public.orders;
  v_amount numeric(10, 2);
  v_method text;
  v_description text;
  v_reason text;
  v_refunded_at timestamptz;
  v_received numeric(10, 2);
  v_refunded numeric(10, 2);
  v_refundable numeric(10, 2);
  v_refund_id uuid;
  v_existing public.refunds;
begin
  if p_order_id is null then
    raise exception 'Order is required';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount <> trunc(p_amount, 2) then
    raise exception 'Enter a positive refund amount with no more than two decimal places';
  end if;
  if p_method is null or p_method not in ('online_transfer', 'wb_qr', 'cash', 'others') then
    raise exception 'Invalid refund method';
  end if;
  v_description := nullif(trim(coalesce(p_method_description, '')), '');
  if p_method = 'others' and v_description is null then
    raise exception 'Describe the other refund method';
  end if;
  if v_description is not null and char_length(v_description) > 200 then
    raise exception 'Refund method description is too long';
  end if;
  if p_method <> 'others' and v_description is not null then
    raise exception 'Method description is only allowed for Other';
  end if;
  v_reason := nullif(trim(coalesce(p_reason, '')), '');
  if v_reason is null or char_length(v_reason) > 2000 then
    raise exception 'A refund reason is required (maximum 2,000 characters)';
  end if;
  if p_refunded_on is null
     or p_refunded_on > (now() at time zone 'Asia/Kuching')::date then
    raise exception 'Refund date must be today or in the past';
  end if;
  if p_request_key is null then
    raise exception 'Refund request key is required';
  end if;
  v_amount := p_amount::numeric(10, 2);
  v_method := p_method;
  v_refunded_at := p_refunded_on::timestamp at time zone 'Asia/Kuching';

  v_actor := public._bind_rpc_actor(null);
  perform public._require_rpc_roles(
    v_actor,
    array['owner', 'manager']::text[],
    'Only Owner or Manager may record a refund.'
  );

  select o.* into v_order
  from public.orders o
  where o.id = p_order_id
  for update;
  if not found then
    raise exception 'Order not found';
  end if;
  if v_order.extra_stock_id is not null then
    raise exception 'Fresh Pick refunds must use the Owner cancellation and refund workflow';
  end if;

  select r.* into v_existing
  from public.refunds r
  where r.request_key = p_request_key
  for update;
  if found then
    if v_existing.order_id <> p_order_id
       or v_existing.amount <> v_amount
       or v_existing.refund_method is distinct from v_method
       or v_existing.refund_method_description is distinct from v_description
       or v_existing.refunded_at is distinct from v_refunded_at
       or v_existing.reason is distinct from v_reason then
      raise exception 'Refund request key was already used for different details';
    end if;
    return v_existing.id;
  end if;

  v_received := public.order_verified_allocated(p_order_id);
  v_refunded := public.order_refunds_total(p_order_id);
  v_refundable := greatest(v_received - v_refunded, 0)::numeric(10, 2);
  if v_amount > v_refundable then
    raise exception 'Refund exceeds remaining refundable verified payments';
  end if;

  insert into public.refunds (
    order_id, payment_id, amount, reason, refunded_at, created_by, status,
    refund_type, refund_method, refund_method_description, request_key
  ) values (
    p_order_id, null, v_amount, v_reason, v_refunded_at, v_actor, 'recorded',
    'order_refund', v_method, v_description, p_request_key
  ) returning id into v_refund_id;

  insert into public.order_timeline_events (
    order_id, event_type, actor_staff_id, metadata
  ) values (
    p_order_id,
    'refund_recorded',
    v_actor,
    jsonb_build_object(
      'refund_id', v_refund_id,
      'amount', v_amount,
      'method', v_method,
      'method_description', v_description,
      'refunded_at', v_refunded_at,
      'reason', v_reason,
      'actor_staff_id', v_actor,
      'recorded_at', now()
    )
  );

  return v_refund_id;
end;
$$;

comment on function public.record_order_refund(uuid, numeric, text, text, date, text, uuid) is
  'Records an already-issued full or partial refund. Does not change order, payment, item, discount or stock state.';
revoke all on function public.record_order_refund(
  uuid, numeric, text, text, date, text, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.record_order_refund(
  uuid, numeric, text, text, date, text, uuid
) to authenticated;

-- Metadata-aware overpayment wrapper. The legacy RPC remains callable and
-- retains its original cap, type, authorization, and audit event for old code.
create or replace function public.record_overpayment_refund_with_details(
  p_order_id uuid,
  p_amount numeric,
  p_reason text,
  p_actor_staff_id uuid,
  p_payment_snapshot jsonb,
  p_method text,
  p_method_description text,
  p_refunded_on date,
  p_request_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_refund_id uuid;
  v_amount numeric(10, 2);
  v_reason text;
  v_description text;
  v_refunded_at timestamptz;
  v_existing public.refunds;
  v_event_rows integer;
  v_tx_started_at timestamptz := transaction_timestamp();
begin
  v_actor := public._bind_rpc_actor(p_actor_staff_id);
  perform public._require_rpc_roles(
    v_actor,
    array['owner', 'manager']::text[],
    'Only Owner or Manager may refund an overpayment.'
  );
  if p_amount is null or p_amount <= 0 or p_amount <> trunc(p_amount, 2) then
    raise exception 'Enter a positive overpayment refund with no more than two decimal places';
  end if;
  if p_method is null or p_method not in ('online_transfer', 'wb_qr', 'cash', 'others') then
    raise exception 'Invalid refund method';
  end if;
  v_description := nullif(trim(coalesce(p_method_description, '')), '');
  if p_method = 'others' and v_description is null then
    raise exception 'Describe the other refund method';
  end if;
  if v_description is not null and char_length(v_description) > 200 then
    raise exception 'Refund method description is too long';
  end if;
  if p_method <> 'others' and v_description is not null then
    raise exception 'Method description is only allowed for Other';
  end if;
  v_reason := nullif(trim(coalesce(p_reason, '')), '');
  if v_reason is null or char_length(v_reason) > 2000 then
    raise exception 'A refund reason is required (maximum 2,000 characters)';
  end if;
  if p_refunded_on is null
     or p_refunded_on > (now() at time zone 'Asia/Kuching')::date then
    raise exception 'Refund date must be today or in the past';
  end if;
  if p_request_key is null then
    raise exception 'Refund request key is required';
  end if;
  v_amount := p_amount::numeric(10, 2);
  v_refunded_at := p_refunded_on::timestamp at time zone 'Asia/Kuching';

  perform 1 from public.orders o where o.id = p_order_id for update;
  if not found then
    raise exception 'Order not found';
  end if;
  select r.* into v_existing
  from public.refunds r where r.request_key = p_request_key for update;
  if found then
    if v_existing.order_id <> p_order_id
       or v_existing.refund_type <> 'overpayment_correction'
       or v_existing.amount <> v_amount
       or v_existing.reason is distinct from v_reason
       or v_existing.refund_method is distinct from p_method
       or v_existing.refund_method_description is distinct from v_description
       or v_existing.refunded_at is distinct from v_refunded_at then
      raise exception 'Refund request key was already used for different details';
    end if;
    return v_existing.id;
  end if;

  v_refund_id := public.record_overpayment_refund(
    p_order_id, v_amount, v_reason, v_actor, coalesce(p_payment_snapshot, '[]'::jsonb)
  );
  update public.refunds
  set refund_method = p_method,
      refund_method_description = v_description,
      refunded_at = v_refunded_at,
      request_key = p_request_key
  where id = v_refund_id
    and order_id = p_order_id
    and refund_type = 'overpayment_correction';
  if not found then
    raise exception 'Overpayment refund metadata could not be recorded; all changes were rolled back';
  end if;

  update public.order_timeline_events e
  set metadata = e.metadata || jsonb_build_object(
    'refund_id', v_refund_id,
    'refund_method', p_method,
    'refund_method_description', v_description,
    'refunded_at', v_refunded_at,
    'recorded_at', now(),
    'actor_staff_id', v_actor
  )
  where e.id = (
    select candidate.id
    from public.order_timeline_events candidate
    where candidate.order_id = p_order_id
      and candidate.event_type = 'payment_correction_recorded'
      and candidate.actor_staff_id = v_actor
      and candidate.created_at = v_tx_started_at
      and candidate.metadata ->> 'correction_type' = 'overpayment_refund'
      and candidate.metadata ->> 'reason' is not distinct from v_reason
      and (candidate.metadata ->> 'amount')::numeric = v_amount
    order by candidate.id desc
    limit 1
  );
  get diagnostics v_event_rows = row_count;
  if v_event_rows <> 1 then
    raise exception 'Overpayment refund audit metadata could not be completed; all changes were rolled back';
  end if;
  return v_refund_id;
end;
$$;

comment on function public.record_overpayment_refund_with_details(
  uuid, numeric, text, uuid, jsonb, text, text, date, uuid
) is 'Metadata-aware wrapper preserving the legacy overpayment refund cap and audit event.';
revoke all on function public.record_overpayment_refund_with_details(
  uuid, numeric, text, uuid, jsonb, text, text, date, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.record_overpayment_refund_with_details(
  uuid, numeric, text, uuid, jsonb, text, text, date, uuid
) to authenticated, service_role;

-- Preserve the existing Fresh Pick entry point and grants. The new source uses
-- a separate wrapper; old deployed source remains compatible during rollout.

create or replace function public.cancel_and_refund_paid_fresh_pick_with_details(
  p_order_id uuid,
  p_actor_staff_id uuid,
  p_reason text,
  p_method text,
  p_method_description text,
  p_refunded_on date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_result jsonb;
  v_refund_id uuid;
  v_method_description text;
  v_refunded_at timestamptz;
  v_rows integer;
begin
  v_actor := public._bind_rpc_actor(p_actor_staff_id);
  perform public._require_rpc_roles(
    v_actor,
    array['owner']::text[],
    'Only Owner may cancel and record a paid Fresh Pick refund.'
  );
  if p_method is null or p_method not in ('online_transfer', 'wb_qr', 'cash', 'others') then
    raise exception 'Invalid refund method';
  end if;
  v_method_description := nullif(trim(coalesce(p_method_description, '')), '');
  if p_method = 'others' and v_method_description is null then
    raise exception 'Describe the other refund method';
  end if;
  if v_method_description is not null and char_length(v_method_description) > 200 then
    raise exception 'Refund method description is too long';
  end if;
  if p_method <> 'others' and v_method_description is not null then
    raise exception 'Method description is only allowed for Other';
  end if;
  if p_refunded_on is null
     or p_refunded_on > (now() at time zone 'Asia/Kuching')::date then
    raise exception 'Refund date must be today or in the past';
  end if;
  v_refunded_at := p_refunded_on::timestamp at time zone 'Asia/Kuching';

  v_result := public.cancel_and_refund_paid_fresh_pick(
    p_order_id, v_actor, p_reason
  );
  v_refund_id := (v_result ->> 'refund_id')::uuid;

  update public.refunds
  set refund_method = p_method,
      refund_method_description = v_method_description,
      refunded_at = v_refunded_at
  where id = v_refund_id
    and order_id = p_order_id
    and refund_type = 'fresh_pick_cancellation';
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'Fresh Pick refund metadata could not be recorded; all changes were rolled back';
  end if;

  update public.order_timeline_events
  set metadata = metadata || jsonb_build_object(
    'refund_method', p_method,
    'refund_method_description', v_method_description,
    'refunded_at', v_refunded_at,
    'recorded_at', now(),
    'actor_staff_id', v_actor
  )
  where order_id = p_order_id
    and event_type = 'fresh_pick_cancelled_refunded'
    and metadata ->> 'refund_id' = v_refund_id::text;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'Fresh Pick refund audit metadata could not be completed; all changes were rolled back';
  end if;

  return v_result || jsonb_build_object(
    'refund_method', p_method,
    'refund_method_description', v_method_description,
    'refunded_at', v_refunded_at
  );
end;
$$;

comment on function public.cancel_and_refund_paid_fresh_pick_with_details(
  uuid, uuid, text, text, text, date
) is
  'Owner-only wrapper for the existing atomic Fresh Pick cancellation/refund; records method and date in the same transaction.';
revoke all on function public.cancel_and_refund_paid_fresh_pick_with_details(
  uuid, uuid, text, text, text, date
) from public, anon, authenticated, service_role;
grant execute on function public.cancel_and_refund_paid_fresh_pick_with_details(
  uuid, uuid, text, text, text, date
) to authenticated;
