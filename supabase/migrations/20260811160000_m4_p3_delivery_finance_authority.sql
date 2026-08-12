-- M4-P3 Slice 1 — Delivery financial authority (processing + Delivery fee + waiver)
-- Additive. Does NOT retroactively charge existing M4-P2 Delivery orders.
--
-- Authority model:
--   delivery_finance_enabled=false → no processing/Delivery charges (historical default)
--   New Delivery detail INSERT after this migration → finance enabled + processing default
--   Delivery fee NOT SET until quoted; RM0 effective payable requires explicit waiver of a quote
--
-- Settlement: managed positive order_adjustments
--   code delivery_processing_fee / delivery_fee
-- Clients must not edit those rows directly; use RPCs below.

-- ---------------------------------------------------------------------------
-- 1) Schema on order_delivery_details
-- ---------------------------------------------------------------------------

alter table public.order_delivery_details
  add column if not exists delivery_finance_enabled boolean not null default false,
  add column if not exists processing_fee_applicable_amount numeric(10, 2),
  add column if not exists processing_fee_override_amount numeric(10, 2),
  add column if not exists processing_fee_waived boolean not null default false,
  add column if not exists delivery_fee_status text not null default 'not_set',
  add column if not exists delivery_fee_quoted_amount numeric(10, 2),
  add column if not exists delivery_fee_waived boolean not null default false,
  add column if not exists fee_request_kind text,
  add column if not exists fee_request_status text,
  add column if not exists fee_request_proposed_amount numeric(10, 2),
  add column if not exists fee_request_reason text,
  add column if not exists fee_requested_by uuid references public.staff_profiles (id) on delete set null,
  add column if not exists fee_requested_at timestamptz,
  add column if not exists fee_resolved_by uuid references public.staff_profiles (id) on delete set null,
  add column if not exists fee_resolved_at timestamptz,
  add column if not exists fee_resolution_note text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'order_delivery_details_delivery_fee_status_check'
  ) then
    alter table public.order_delivery_details
      add constraint order_delivery_details_delivery_fee_status_check check (
        delivery_fee_status in ('not_set', 'quoted', 'quoted_waived')
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'order_delivery_details_fee_request_kind_check'
  ) then
    alter table public.order_delivery_details
      add constraint order_delivery_details_fee_request_kind_check check (
        fee_request_kind is null
        or fee_request_kind in (
          'processing_override',
          'processing_waiver',
          'delivery_waiver'
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'order_delivery_details_fee_request_status_check'
  ) then
    alter table public.order_delivery_details
      add constraint order_delivery_details_fee_request_status_check check (
        fee_request_status is null
        or fee_request_status in ('pending', 'approved', 'rejected')
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'order_delivery_details_processing_amounts_nonneg_check'
  ) then
    alter table public.order_delivery_details
      add constraint order_delivery_details_processing_amounts_nonneg_check check (
        (processing_fee_applicable_amount is null or processing_fee_applicable_amount >= 0)
        and (processing_fee_override_amount is null or processing_fee_override_amount >= 0)
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'order_delivery_details_delivery_quote_check'
  ) then
    alter table public.order_delivery_details
      add constraint order_delivery_details_delivery_quote_check check (
        (
          delivery_fee_status = 'not_set'
          and delivery_fee_quoted_amount is null
          and delivery_fee_waived = false
        )
        or (
          delivery_fee_status = 'quoted'
          and delivery_fee_quoted_amount is not null
          and delivery_fee_quoted_amount > 0
          and delivery_fee_waived = false
        )
        or (
          delivery_fee_status = 'quoted_waived'
          and delivery_fee_quoted_amount is not null
          and delivery_fee_quoted_amount > 0
          and delivery_fee_waived = true
        )
      );
  end if;
end $$;

comment on column public.order_delivery_details.delivery_finance_enabled is
  'M4-P3 gate. false = historical M4-P2 Delivery (no auto charges). true = governed finance.';
comment on column public.order_delivery_details.processing_fee_applicable_amount is
  'Order-level historical processing fee amount at init (current default RM5).';
comment on column public.order_delivery_details.processing_fee_override_amount is
  'Owner (or approved) override of applicable processing amount; null = use applicable.';
comment on column public.order_delivery_details.processing_fee_waived is
  'When true, effective payable processing = 0; applicable amount preserved.';
comment on column public.order_delivery_details.delivery_fee_status is
  'not_set | quoted | quoted_waived. RM0 payable only via waiver of a prior quote.';
comment on column public.order_delivery_details.delivery_fee_quoted_amount is
  'Original quoted Delivery fee (>0). Preserved after waiver.';
comment on column public.order_delivery_details.delivery_fee_waived is
  'When true with quoted amount, effective payable Delivery fee = 0.';

-- Existing M4-P2 rows keep delivery_finance_enabled = false (column default).

-- ---------------------------------------------------------------------------
-- 2) Current processing-fee default (not Admin UI; changeable later)
-- ---------------------------------------------------------------------------

create or replace function public.current_delivery_processing_fee_default()
returns numeric
language sql
immutable
as $$
  select 5::numeric(10, 2);
$$;

comment on function public.current_delivery_processing_fee_default() is
  'Current business default for NEW governed Delivery processing fees (RM5). '
  'Historical orders keep persisted applicable amounts.';

revoke all on function public.current_delivery_processing_fee_default() from public;
grant execute on function public.current_delivery_processing_fee_default() to authenticated;

-- ---------------------------------------------------------------------------
-- 3) Effective payable helpers (SQL)
-- ---------------------------------------------------------------------------

create or replace function public.delivery_processing_fee_effective(
  p_details public.order_delivery_details
)
returns numeric
language sql
stable
as $$
  select case
    when not p_details.delivery_finance_enabled then 0::numeric(10, 2)
    when p_details.processing_fee_waived then 0::numeric(10, 2)
    else coalesce(
      p_details.processing_fee_override_amount,
      p_details.processing_fee_applicable_amount,
      0
    )::numeric(10, 2)
  end;
$$;

create or replace function public.delivery_fee_effective(
  p_details public.order_delivery_details
)
returns numeric
language sql
stable
as $$
  select case
    when not p_details.delivery_finance_enabled then 0::numeric(10, 2)
    when p_details.delivery_fee_status = 'quoted'
      then coalesce(p_details.delivery_fee_quoted_amount, 0)::numeric(10, 2)
    else 0::numeric(10, 2)
  end;
$$;

create or replace function public.delivery_finance_is_complete(
  p_details public.order_delivery_details
)
returns boolean
language sql
stable
as $$
  select
    p_details.delivery_finance_enabled
    and p_details.delivery_fee_status in ('quoted', 'quoted_waived');
$$;

-- ---------------------------------------------------------------------------
-- 4) Adjustment sync (single source of truth → settlement)
-- ---------------------------------------------------------------------------

create or replace function public._reverse_active_adjustment_by_code(
  p_order_id uuid,
  p_actor_staff_id uuid,
  p_code text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_adj public.order_adjustments%rowtype;
begin
  select * into v_adj
  from public.order_adjustments oa
  where oa.order_id = p_order_id
    and oa.code = p_code
    and oa.status = 'active'
    and oa.reverses_adjustment_id is null
  limit 1;

  if not found then
    return;
  end if;

  insert into public.order_adjustments (
    order_id,
    kind,
    code,
    label,
    amount,
    reason,
    metadata,
    status,
    reverses_adjustment_id,
    created_by
  )
  values (
    p_order_id,
    'reversal',
    v_adj.code,
    'Reversal: ' || v_adj.label,
    -v_adj.amount,
    'delivery_finance_sync',
    coalesce(v_adj.metadata, '{}'::jsonb) || jsonb_build_object('reversed_adjustment_id', v_adj.id),
    'active',
    v_adj.id,
    p_actor_staff_id
  );

  update public.order_adjustments
  set status = 'reversed'
  where id = v_adj.id;
end;
$$;

revoke all on function public._reverse_active_adjustment_by_code(uuid, uuid, text) from public;
revoke all on function public._reverse_active_adjustment_by_code(uuid, uuid, text) from anon;
revoke all on function public._reverse_active_adjustment_by_code(uuid, uuid, text) from authenticated;

create or replace function public._ensure_active_fee_adjustment(
  p_order_id uuid,
  p_actor_staff_id uuid,
  p_code text,
  p_label text,
  p_amount numeric,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_adj public.order_adjustments%rowtype;
  v_amount numeric(10, 2) := coalesce(p_amount, 0)::numeric(10, 2);
begin
  if v_amount < 0 then
    raise exception 'Fee adjustment amount must be non-negative';
  end if;

  if v_amount = 0 then
    perform public._reverse_active_adjustment_by_code(
      p_order_id,
      p_actor_staff_id,
      p_code
    );
    return;
  end if;

  select * into v_adj
  from public.order_adjustments oa
  where oa.order_id = p_order_id
    and oa.code = p_code
    and oa.status = 'active'
    and oa.reverses_adjustment_id is null
  limit 1;

  if found and v_adj.amount = v_amount then
    -- Idempotent: same payable amount already active
    update public.order_adjustments
    set
      label = p_label,
      metadata = coalesce(p_metadata, '{}'::jsonb)
    where id = v_adj.id
      and (
        label is distinct from p_label
        or metadata is distinct from coalesce(p_metadata, '{}'::jsonb)
      );
    return;
  end if;

  if found then
    perform public._reverse_active_adjustment_by_code(
      p_order_id,
      p_actor_staff_id,
      p_code
    );
  end if;

  insert into public.order_adjustments (
    order_id,
    kind,
    code,
    label,
    amount,
    reason,
    metadata,
    status,
    created_by
  )
  values (
    p_order_id,
    'fee',
    p_code,
    p_label,
    v_amount,
    null,
    coalesce(p_metadata, '{}'::jsonb),
    'active',
    p_actor_staff_id
  );
end;
$$;

revoke all on function public._ensure_active_fee_adjustment(
  uuid, uuid, text, text, numeric, jsonb
) from public;
revoke all on function public._ensure_active_fee_adjustment(
  uuid, uuid, text, text, numeric, jsonb
) from anon;
revoke all on function public._ensure_active_fee_adjustment(
  uuid, uuid, text, text, numeric, jsonb
) from authenticated;

create or replace function public._sync_delivery_finance_adjustments(
  p_order_id uuid,
  p_actor_staff_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_details public.order_delivery_details%rowtype;
  v_proc numeric(10, 2);
  v_del numeric(10, 2);
begin
  select * into v_details
  from public.order_delivery_details d
  where d.order_id = p_order_id;

  if not found or not v_details.delivery_finance_enabled then
    perform public._reverse_active_adjustment_by_code(
      p_order_id, p_actor_staff_id, 'delivery_processing_fee'
    );
    perform public._reverse_active_adjustment_by_code(
      p_order_id, p_actor_staff_id, 'delivery_fee'
    );
    return;
  end if;

  v_proc := public.delivery_processing_fee_effective(v_details);
  v_del := public.delivery_fee_effective(v_details);

  perform public._ensure_active_fee_adjustment(
    p_order_id,
    p_actor_staff_id,
    'delivery_processing_fee',
    'Delivery Processing Fee',
    v_proc,
    jsonb_build_object(
      'applicable_amount', v_details.processing_fee_applicable_amount,
      'override_amount', v_details.processing_fee_override_amount,
      'waived', v_details.processing_fee_waived
    )
  );

  perform public._ensure_active_fee_adjustment(
    p_order_id,
    p_actor_staff_id,
    'delivery_fee',
    'Delivery Fee',
    v_del,
    jsonb_build_object(
      'quoted_amount', v_details.delivery_fee_quoted_amount,
      'status', v_details.delivery_fee_status,
      'waived', v_details.delivery_fee_waived
    )
  );
end;
$$;

revoke all on function public._sync_delivery_finance_adjustments(uuid, uuid) from public;
revoke all on function public._sync_delivery_finance_adjustments(uuid, uuid) from anon;
revoke all on function public._sync_delivery_finance_adjustments(uuid, uuid) from authenticated;

create or replace function public._clear_delivery_finance_for_order(
  p_order_id uuid,
  p_actor_staff_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._reverse_active_adjustment_by_code(
    p_order_id, p_actor_staff_id, 'delivery_processing_fee'
  );
  perform public._reverse_active_adjustment_by_code(
    p_order_id, p_actor_staff_id, 'delivery_fee'
  );
end;
$$;

revoke all on function public._clear_delivery_finance_for_order(uuid, uuid) from public;
revoke all on function public._clear_delivery_finance_for_order(uuid, uuid) from anon;
revoke all on function public._clear_delivery_finance_for_order(uuid, uuid) from authenticated;

-- ---------------------------------------------------------------------------
-- 5) Staff role helper
-- ---------------------------------------------------------------------------

create or replace function public._staff_role_code(p_staff_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select r.code
  from public.staff_profiles sp
  join public.roles r on r.id = sp.role_id
  where sp.id = p_staff_id
  limit 1;
$$;

revoke all on function public._staff_role_code(uuid) from public;
revoke all on function public._staff_role_code(uuid) from anon;
revoke all on function public._staff_role_code(uuid) from authenticated;

-- ---------------------------------------------------------------------------
-- 6) Extend fulfilment sync — init finance on NEW Delivery; clear on Pickup
-- ---------------------------------------------------------------------------

create or replace function public._sync_order_fulfilment_from_payload(
  p_order_id uuid,
  p_fulfilment_method public.fulfilment_method,
  p_delivery jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_method public.fulfilment_method;
  v_delivery jsonb;
  v_name text;
  v_phone text;
  v_line1 text;
  v_line2 text;
  v_postcode text;
  v_city text;
  v_state text;
  v_notify text;
  v_notify_pref public.recipient_notify_preference;
  v_has_payload boolean;
  v_existing boolean;
  v_default_proc numeric(10, 2);
begin
  if p_order_id is null then
    raise exception 'Order id is required';
  end if;

  if p_fulfilment_method is null then
    raise exception 'Fulfilment method is required';
  end if;

  v_method := p_fulfilment_method;
  v_delivery := p_delivery;
  v_has_payload := (
    v_delivery is not null
    and jsonb_typeof(v_delivery) = 'object'
    and v_delivery <> '{}'::jsonb
  );

  if v_method = 'delivery' then
    if not v_has_payload then
      raise exception 'Delivery details payload is required for delivery orders';
    end if;

    v_name := nullif(trim(coalesce(v_delivery ->> 'recipient_name', '')), '');
    v_phone := nullif(trim(coalesce(v_delivery ->> 'recipient_phone', '')), '');
    v_line1 := nullif(trim(coalesce(v_delivery ->> 'address_line_1', '')), '');
    v_line2 := nullif(trim(coalesce(v_delivery ->> 'address_line_2', '')), '');
    v_postcode := nullif(trim(coalesce(v_delivery ->> 'postcode', '')), '');
    v_city := nullif(trim(coalesce(v_delivery ->> 'city', '')), '');
    v_state := nullif(trim(coalesce(v_delivery ->> 'state', '')), '');
    v_notify := nullif(
      trim(coalesce(v_delivery ->> 'recipient_notify_preference', '')),
      ''
    );

    if v_name is null then
      raise exception 'Recipient name is required';
    end if;
    if v_phone is null then
      raise exception 'Recipient phone is required';
    end if;
    if v_line1 is null then
      raise exception 'Address line 1 is required';
    end if;
    if v_postcode is null then
      raise exception 'Postcode is required';
    end if;
    if v_city is null then
      raise exception 'City is required';
    end if;
    if v_state is null then
      raise exception 'State is required';
    end if;
    if v_notify is null then
      raise exception 'Recipient notification preference is required';
    end if;
    if v_notify not in ('inform_recipient', 'do_not_inform_recipient') then
      raise exception 'Invalid recipient notification preference';
    end if;

    v_notify_pref := v_notify::public.recipient_notify_preference;

    update public.orders
    set
      fulfilment_method = 'delivery',
      updated_at = now()
    where id = p_order_id;

    if not found then
      raise exception 'Order not found';
    end if;

    select exists (
      select 1 from public.order_delivery_details d where d.order_id = p_order_id
    ) into v_existing;

    v_default_proc := public.current_delivery_processing_fee_default();

    if v_existing then
      -- Address-only update. Never auto-enable finance on historical rows.
      -- Never resurrect waived/quoted state from payload (payload has no fee fields).
      update public.order_delivery_details
      set
        recipient_name = v_name,
        recipient_phone = v_phone,
        address_line_1 = v_line1,
        address_line_2 = v_line2,
        postcode = v_postcode,
        city = v_city,
        state = v_state,
        recipient_notify_preference = v_notify_pref,
        updated_at = now()
      where order_id = p_order_id;
    else
      -- Fresh Delivery details (new create OR Pickup→Delivery OR Delivery→Pickup→Delivery).
      -- Governed finance: processing default + Delivery fee NOT SET.
      insert into public.order_delivery_details (
        order_id,
        recipient_name,
        recipient_phone,
        address_line_1,
        address_line_2,
        postcode,
        city,
        state,
        recipient_notify_preference,
        delivery_finance_enabled,
        processing_fee_applicable_amount,
        processing_fee_override_amount,
        processing_fee_waived,
        delivery_fee_status,
        delivery_fee_quoted_amount,
        delivery_fee_waived
      )
      values (
        p_order_id,
        v_name,
        v_phone,
        v_line1,
        v_line2,
        v_postcode,
        v_city,
        v_state,
        v_notify_pref,
        true,
        v_default_proc,
        null,
        false,
        'not_set',
        null,
        false
      );

      -- Actor unknown inside internal sync; adjustments use null created_by.
      perform public._sync_delivery_finance_adjustments(p_order_id, null);
    end if;
  else
    if v_has_payload then
      raise exception
        'Delivery details payload is not allowed when fulfilment is %',
        v_method;
    end if;

    update public.orders
    set
      fulfilment_method = v_method,
      updated_at = now()
    where id = p_order_id;

    if not found then
      raise exception 'Order not found';
    end if;

    -- Clear fee adjustments before deleting details (no quote/waiver resurrection).
    perform public._clear_delivery_finance_for_order(p_order_id, null);

    delete from public.order_delivery_details d
    where d.order_id = p_order_id;
  end if;
end;
$$;

comment on function public._sync_order_fulfilment_from_payload(
  uuid, public.fulfilment_method, jsonb
) is
  'INTERNAL ONLY — fulfilment + delivery-details sync. '
  'New Delivery detail rows enable M4-P3 finance (processing default, fee NOT SET). '
  'Existing historical rows (finance_enabled=false) are address-updated only. '
  'Pickup clears details and reverses fee adjustments.';

-- ---------------------------------------------------------------------------
-- 7) Owner / staff RPCs
-- ---------------------------------------------------------------------------

create or replace function public.init_guest_order_delivery_finance(
  p_order_id uuid,
  p_actor_staff_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_details public.order_delivery_details%rowtype;
  v_method public.fulfilment_method;
  v_default numeric(10, 2);
  v_before numeric(10, 2);
  v_after numeric(10, 2);
begin
  v_role := public._staff_role_code(p_actor_staff_id);
  if v_role is distinct from 'owner' then
    raise exception 'Only Owner can initialize Delivery finance';
  end if;

  select fulfilment_method into v_method
  from public.orders where id = p_order_id;
  if not found then
    raise exception 'Order not found';
  end if;
  if v_method is distinct from 'delivery' then
    raise exception 'Delivery finance can only be initialized on Delivery orders';
  end if;

  select * into v_details
  from public.order_delivery_details where order_id = p_order_id;
  if not found then
    raise exception 'Delivery details are required';
  end if;
  if v_details.delivery_finance_enabled then
    return jsonb_build_object(
      'ok', true,
      'already_enabled', true,
      'amount_due', public.order_amount_due(p_order_id)
    );
  end if;

  v_before := public.order_amount_due(p_order_id);
  v_default := public.current_delivery_processing_fee_default();

  update public.order_delivery_details
  set
    delivery_finance_enabled = true,
    processing_fee_applicable_amount = v_default,
    processing_fee_override_amount = null,
    processing_fee_waived = false,
    delivery_fee_status = 'not_set',
    delivery_fee_quoted_amount = null,
    delivery_fee_waived = false,
    updated_at = now()
  where order_id = p_order_id;

  perform public._sync_delivery_finance_adjustments(p_order_id, p_actor_staff_id);
  v_after := public.order_amount_due(p_order_id);

  insert into public.order_timeline_events (
    order_id, event_type, actor_staff_id, metadata
  ) values (
    p_order_id,
    'delivery_finance_initialized',
    p_actor_staff_id,
    jsonb_build_object(
      'processing_fee_applicable_amount', v_default,
      'previous_amount_due', v_before,
      'new_amount_due', v_after
    )
  );

  return jsonb_build_object(
    'ok', true,
    'already_enabled', false,
    'amount_due', v_after
  );
end;
$$;

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
begin
  v_role := public._staff_role_code(p_actor_staff_id);
  if v_role is null then
    raise exception 'Staff profile required';
  end if;
  -- Quote may be set by Owner now; Counter quote UI arrives in Slice 2.
  -- Still require authenticated staff with a role.
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

  update public.order_delivery_details
  set
    delivery_fee_status = 'quoted',
    delivery_fee_quoted_amount = v_amount,
    delivery_fee_waived = false,
    -- Clearing a pending delivery-waiver request when re-quoting
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

  insert into public.order_timeline_events (
    order_id, event_type, actor_staff_id, metadata
  ) values (
    p_order_id,
    'delivery_fee_quoted',
    p_actor_staff_id,
    jsonb_build_object(
      'quoted_amount', v_amount,
      'previous_amount_due', v_before,
      'new_amount_due', v_after
    )
  );

  return jsonb_build_object('ok', true, 'amount_due', v_after, 'quoted_amount', v_amount);
end;
$$;

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
    fee_request_kind = null,
    fee_request_status = null,
    fee_request_proposed_amount = null,
    fee_request_reason = null,
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

-- Counter request seams (any authenticated staff with profile; Owner still can call)
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
  update public.order_delivery_details
  set
    fee_request_kind = 'delivery_waiver',
    fee_request_status = 'pending',
    fee_request_proposed_amount = 0,
    fee_request_reason = trim(p_reason),
    fee_requested_by = p_actor_staff_id,
    fee_requested_at = now(),
    fee_resolved_by = null,
    fee_resolved_at = null,
    fee_resolution_note = null,
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
  if p_kind not in ('processing_override', 'processing_waiver') then
    raise exception 'Invalid processing fee request kind';
  end if;
  if nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'Request reason is required';
  end if;
  if p_kind = 'processing_override' then
    if p_proposed_amount is null or p_proposed_amount < 0 then
      raise exception 'Proposed processing override must be non-negative';
    end if;
  end if;

  select * into v_details
  from public.order_delivery_details where order_id = p_order_id;
  if not found or not v_details.delivery_finance_enabled then
    raise exception 'Governed Delivery finance required';
  end if;

  update public.order_delivery_details
  set
    fee_request_kind = p_kind,
    fee_request_status = 'pending',
    fee_request_proposed_amount = case
      when p_kind = 'processing_override' then p_proposed_amount::numeric(10, 2)
      else 0 end,
    fee_request_reason = trim(p_reason),
    fee_requested_by = p_actor_staff_id,
    fee_requested_at = now(),
    fee_resolved_by = null,
    fee_resolved_at = null,
    fee_resolution_note = null,
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
      'proposed_amount', p_proposed_amount,
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
     or v_details.fee_request_kind is distinct from 'delivery_waiver'
     or v_details.fee_request_status is distinct from 'pending' then
    raise exception 'No pending Delivery fee waiver request';
  end if;

  v_before := public.order_amount_due(p_order_id);

  if p_approve then
    update public.order_delivery_details
    set
      delivery_fee_status = 'quoted_waived',
      delivery_fee_waived = true,
      fee_request_status = 'approved',
      fee_resolved_by = p_actor_staff_id,
      fee_resolved_at = now(),
      fee_resolution_note = nullif(trim(coalesce(p_note, '')), ''),
      updated_at = now()
    where order_id = p_order_id;
    perform public._sync_delivery_finance_adjustments(p_order_id, p_actor_staff_id);
  else
    update public.order_delivery_details
    set
      fee_request_status = 'rejected',
      fee_resolved_by = p_actor_staff_id,
      fee_resolved_at = now(),
      fee_resolution_note = nullif(trim(coalesce(p_note, '')), ''),
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
      'quoted_amount', v_details.delivery_fee_quoted_amount,
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
     or v_details.fee_request_kind not in ('processing_override', 'processing_waiver')
     or v_details.fee_request_status is distinct from 'pending' then
    raise exception 'No pending processing fee request';
  end if;

  v_before := public.order_amount_due(p_order_id);

  if p_approve then
    if v_details.fee_request_kind = 'processing_waiver' then
      update public.order_delivery_details
      set
        processing_fee_waived = true,
        fee_request_status = 'approved',
        fee_resolved_by = p_actor_staff_id,
        fee_resolved_at = now(),
        fee_resolution_note = nullif(trim(coalesce(p_note, '')), ''),
        updated_at = now()
      where order_id = p_order_id;
    else
      update public.order_delivery_details
      set
        processing_fee_override_amount = v_details.fee_request_proposed_amount,
        processing_fee_waived = false,
        fee_request_status = 'approved',
        fee_resolved_by = p_actor_staff_id,
        fee_resolved_at = now(),
        fee_resolution_note = nullif(trim(coalesce(p_note, '')), ''),
        updated_at = now()
      where order_id = p_order_id;
    end if;
    perform public._sync_delivery_finance_adjustments(p_order_id, p_actor_staff_id);
  else
    update public.order_delivery_details
    set
      fee_request_status = 'rejected',
      fee_resolved_by = p_actor_staff_id,
      fee_resolved_at = now(),
      fee_resolution_note = nullif(trim(coalesce(p_note, '')), ''),
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
      'kind', v_details.fee_request_kind,
      'proposed_amount', v_details.fee_request_proposed_amount,
      'note', nullif(trim(coalesce(p_note, '')), ''),
      'previous_amount_due', v_before,
      'new_amount_due', v_after
    )
  );

  return jsonb_build_object('ok', true, 'approved', p_approve, 'amount_due', v_after);
end;
$$;

-- Grants (authenticated only; anon denied)
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'init_guest_order_delivery_finance(uuid,uuid)',
    'set_guest_order_delivery_fee_quote(uuid,uuid,numeric)',
    'waive_guest_order_delivery_fee(uuid,uuid,text)',
    'override_guest_order_processing_fee(uuid,uuid,numeric,text)',
    'waive_guest_order_processing_fee(uuid,uuid,text)',
    'request_guest_order_delivery_fee_waiver(uuid,uuid,text)',
    'request_guest_order_processing_fee_change(uuid,uuid,text,numeric,text)',
    'resolve_guest_order_delivery_fee_request(uuid,uuid,boolean,text)',
    'resolve_guest_order_processing_fee_request(uuid,uuid,boolean,text)'
  ]
  loop
    execute format('revoke all on function public.%s from public', fn);
    execute format('revoke all on function public.%s from anon', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end $$;
