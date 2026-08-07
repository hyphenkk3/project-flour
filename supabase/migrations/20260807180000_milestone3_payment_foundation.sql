-- Milestone 3 Preview 1: Payment & financial settlement foundation
-- Additive / non-destructive. Preserves M1/M2 orders, items, confirmations, timeline.
--
-- Conceptual model:
--   PRODUCT PRICE SNAPSHOTS → ADJUSTMENTS → AMOUNT DUE → PAYMENTS → REFUNDS → SETTLEMENT
--
-- Schema supports future:
--   ONE ORDER → MANY PAYMENTS
--   ONE PAYMENT → MANY ORDERS (via payment_allocations)
-- Preview 1 UI records one allocation per payment (full amount → this order).

-- ---------------------------------------------------------------------------
-- 1) Payment request / deadline tracking on orders
-- ---------------------------------------------------------------------------

alter table public.orders
  add column if not exists payment_deadline_at timestamptz,
  add column if not exists payment_request_sent_at timestamptz;

create index if not exists orders_payment_deadline_at_idx
  on public.orders (payment_deadline_at)
  where payment_deadline_at is not null;

comment on column public.orders.payment_deadline_at is
  'Current payment follow-up deadline. Overdue is derived; never auto-cancels.';
comment on column public.orders.payment_request_sent_at is
  'When a payment request was last marked sent. Not a payment.';

-- ---------------------------------------------------------------------------
-- 2) Order adjustments (foundation — Preview 1 typically zero rows)
-- Amount is signed: negative reduces amount due; positive increases it.
-- Never mutate order_items.unit_price to represent a discount.
-- ---------------------------------------------------------------------------

create table if not exists public.order_adjustments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete restrict,
  kind text not null default 'manual',
  label text not null,
  amount numeric(10, 2) not null,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.staff_profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint order_adjustments_kind_not_blank check (
    char_length(trim(kind)) > 0
  ),
  constraint order_adjustments_label_not_blank check (
    char_length(trim(label)) > 0
  ),
  constraint order_adjustments_amount_nonzero check (amount <> 0)
);

create index if not exists order_adjustments_order_idx
  on public.order_adjustments (order_id, created_at asc);

alter table public.order_adjustments enable row level security;

drop policy if exists order_adjustments_authenticated_select
  on public.order_adjustments;
create policy order_adjustments_authenticated_select
  on public.order_adjustments
  for select to authenticated
  using (true);

drop policy if exists order_adjustments_authenticated_insert
  on public.order_adjustments;
create policy order_adjustments_authenticated_insert
  on public.order_adjustments
  for insert to authenticated
  with check (true);

-- No UPDATE/DELETE: adjustments are auditable facts (future corrections append).

-- ---------------------------------------------------------------------------
-- 3) Payments (verified transactions — immutable in Preview 1)
-- ---------------------------------------------------------------------------

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  amount numeric(10, 2) not null,
  method text not null,
  method_description text,
  paid_at timestamptz not null,
  reference_note text,
  verified_by uuid not null references public.staff_profiles (id) on delete restrict,
  verified_at timestamptz not null default now(),
  status text not null default 'verified',
  created_at timestamptz not null default now(),
  constraint payments_amount_positive check (amount > 0),
  constraint payments_method_check check (
    method in ('wb_qr', 'online_transfer', 'others')
  ),
  constraint payments_status_check check (status in ('verified')),
  constraint payments_others_description_required check (
    method <> 'others'
    or (
      method_description is not null
      and char_length(trim(method_description)) > 0
    )
  )
);

create index if not exists payments_paid_at_idx
  on public.payments (paid_at desc);

create index if not exists payments_verified_by_idx
  on public.payments (verified_by);

alter table public.payments enable row level security;

drop policy if exists payments_authenticated_select on public.payments;
create policy payments_authenticated_select
  on public.payments
  for select to authenticated
  using (true);

drop policy if exists payments_authenticated_insert on public.payments;
create policy payments_authenticated_insert
  on public.payments
  for insert to authenticated
  with check (true);

-- No UPDATE/DELETE: verified payments are immutable financial facts.

-- ---------------------------------------------------------------------------
-- 4) Payment allocations (payment ↔ order; enables multi-order later)
-- ---------------------------------------------------------------------------

create table if not exists public.payment_allocations (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments (id) on delete restrict,
  order_id uuid not null references public.orders (id) on delete restrict,
  amount numeric(10, 2) not null,
  created_at timestamptz not null default now(),
  constraint payment_allocations_amount_positive check (amount > 0)
);

create index if not exists payment_allocations_order_idx
  on public.payment_allocations (order_id);

create index if not exists payment_allocations_payment_idx
  on public.payment_allocations (payment_id);

alter table public.payment_allocations enable row level security;

drop policy if exists payment_allocations_authenticated_select
  on public.payment_allocations;
create policy payment_allocations_authenticated_select
  on public.payment_allocations
  for select to authenticated
  using (true);

drop policy if exists payment_allocations_authenticated_insert
  on public.payment_allocations;
create policy payment_allocations_authenticated_insert
  on public.payment_allocations
  for insert to authenticated
  with check (true);

-- No UPDATE/DELETE.

-- ---------------------------------------------------------------------------
-- 5) Refunds (foundation only — no Preview 1 UI)
-- ---------------------------------------------------------------------------

create table if not exists public.refunds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete restrict,
  payment_id uuid references public.payments (id) on delete restrict,
  amount numeric(10, 2) not null,
  reason text,
  refunded_at timestamptz not null default now(),
  created_by uuid references public.staff_profiles (id) on delete set null,
  status text not null default 'recorded',
  created_at timestamptz not null default now(),
  constraint refunds_amount_positive check (amount > 0),
  constraint refunds_status_check check (status in ('recorded'))
);

create index if not exists refunds_order_idx
  on public.refunds (order_id);

alter table public.refunds enable row level security;

drop policy if exists refunds_authenticated_select on public.refunds;
create policy refunds_authenticated_select
  on public.refunds
  for select to authenticated
  using (true);

drop policy if exists refunds_authenticated_insert on public.refunds;
create policy refunds_authenticated_insert
  on public.refunds
  for insert to authenticated
  with check (true);

-- No UPDATE/DELETE.

-- ---------------------------------------------------------------------------
-- 6) Settlement helpers (numeric(10,2) — no floating point)
-- ---------------------------------------------------------------------------

create or replace function public.order_items_subtotal(p_order_id uuid)
returns numeric(10, 2)
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(oi.unit_price * oi.quantity), 0)::numeric(10, 2)
  from public.order_items oi
  where oi.order_id = p_order_id;
$$;

create or replace function public.order_adjustments_total(p_order_id uuid)
returns numeric(10, 2)
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(oa.amount), 0)::numeric(10, 2)
  from public.order_adjustments oa
  where oa.order_id = p_order_id;
$$;

create or replace function public.order_amount_due(p_order_id uuid)
returns numeric(10, 2)
language sql
stable
security definer
set search_path = public
as $$
  select greatest(
    public.order_items_subtotal(p_order_id)
      + public.order_adjustments_total(p_order_id),
    0
  )::numeric(10, 2);
$$;

create or replace function public.order_verified_allocated(p_order_id uuid)
returns numeric(10, 2)
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(pa.amount), 0)::numeric(10, 2)
  from public.payment_allocations pa
  inner join public.payments p on p.id = pa.payment_id
  where pa.order_id = p_order_id
    and p.status = 'verified';
$$;

create or replace function public.order_refunds_total(p_order_id uuid)
returns numeric(10, 2)
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(r.amount), 0)::numeric(10, 2)
  from public.refunds r
  where r.order_id = p_order_id
    and r.status = 'recorded';
$$;

create or replace function public.order_net_received(p_order_id uuid)
returns numeric(10, 2)
language sql
stable
security definer
set search_path = public
as $$
  select (
    public.order_verified_allocated(p_order_id)
    - public.order_refunds_total(p_order_id)
  )::numeric(10, 2);
$$;

revoke all on function public.order_items_subtotal(uuid) from public;
revoke all on function public.order_adjustments_total(uuid) from public;
revoke all on function public.order_amount_due(uuid) from public;
revoke all on function public.order_verified_allocated(uuid) from public;
revoke all on function public.order_refunds_total(uuid) from public;
revoke all on function public.order_net_received(uuid) from public;

grant execute on function public.order_items_subtotal(uuid) to authenticated;
grant execute on function public.order_adjustments_total(uuid) to authenticated;
grant execute on function public.order_amount_due(uuid) to authenticated;
grant execute on function public.order_verified_allocated(uuid) to authenticated;
grant execute on function public.order_refunds_total(uuid) to authenticated;
grant execute on function public.order_net_received(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7) Mark payment request sent (deadline + audit; NOT payment)
-- ---------------------------------------------------------------------------

create or replace function public.mark_guest_payment_request_sent(
  p_order_id uuid,
  p_actor_staff_id uuid,
  p_method text,
  p_message_body text,
  p_deadline_at timestamptz
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  order_row public.orders;
  v_method text;
begin
  if p_order_id is null then
    raise exception 'Order is required';
  end if;
  if p_actor_staff_id is null then
    raise exception 'Staff actor is required';
  end if;
  if p_deadline_at is null then
    raise exception 'Payment deadline is required';
  end if;

  v_method := nullif(trim(coalesce(p_method, '')), '');
  if v_method is null or v_method not in ('wb_qr', 'online_transfer') then
    raise exception 'Payment request method must be WB QR or Online Transfer';
  end if;

  select o.*
  into order_row
  from public.orders o
  where o.id = p_order_id
    and o.customer_id is null
  for update;

  if not found then
    raise exception 'Order not found';
  end if;

  if order_row.status <> 'awaiting_payment' then
    raise exception 'Payment request can only be sent for orders awaiting payment';
  end if;

  update public.orders o
  set
    payment_request_sent_at = now(),
    payment_deadline_at = p_deadline_at,
    updated_by = p_actor_staff_id,
    updated_at = now()
  where o.id = p_order_id
  returning * into order_row;

  insert into public.order_timeline_events (
    order_id,
    event_type,
    actor_staff_id,
    metadata
  ) values (
    p_order_id,
    'payment_request_marked_sent',
    p_actor_staff_id,
    jsonb_build_object(
      'method', v_method,
      'deadline_at', p_deadline_at,
      'message_body', coalesce(p_message_body, '')
    )
  );

  return order_row;
end;
$$;

revoke all on function public.mark_guest_payment_request_sent(uuid, uuid, text, text, timestamptz)
  from public;
grant execute on function public.mark_guest_payment_request_sent(uuid, uuid, text, text, timestamptz)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 8) Extend / set payment follow-up deadline (no cancel, no status change)
-- ---------------------------------------------------------------------------

create or replace function public.extend_guest_payment_deadline(
  p_order_id uuid,
  p_actor_staff_id uuid,
  p_deadline_at timestamptz
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  order_row public.orders;
  previous_deadline timestamptz;
begin
  if p_order_id is null then
    raise exception 'Order is required';
  end if;
  if p_actor_staff_id is null then
    raise exception 'Staff actor is required';
  end if;
  if p_deadline_at is null then
    raise exception 'Follow-up deadline is required';
  end if;

  select o.*
  into order_row
  from public.orders o
  where o.id = p_order_id
    and o.customer_id is null
  for update;

  if not found then
    raise exception 'Order not found';
  end if;

  if order_row.status <> 'awaiting_payment' then
    raise exception 'Deadline can only be updated while awaiting payment';
  end if;

  previous_deadline := order_row.payment_deadline_at;

  update public.orders o
  set
    payment_deadline_at = p_deadline_at,
    updated_by = p_actor_staff_id,
    updated_at = now()
  where o.id = p_order_id
  returning * into order_row;

  insert into public.order_timeline_events (
    order_id,
    event_type,
    actor_staff_id,
    metadata
  ) values (
    p_order_id,
    'payment_deadline_extended',
    p_actor_staff_id,
    jsonb_build_object(
      'previous_deadline_at', previous_deadline,
      'deadline_at', p_deadline_at
    )
  );

  return order_row;
end;
$$;

revoke all on function public.extend_guest_payment_deadline(uuid, uuid, timestamptz)
  from public;
grant execute on function public.extend_guest_payment_deadline(uuid, uuid, timestamptz)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 9) Record & verify payment (transactional: payment + allocation + status)
-- ---------------------------------------------------------------------------

create or replace function public.record_and_verify_guest_order_payment(
  p_order_id uuid,
  p_amount numeric,
  p_method text,
  p_method_description text,
  p_paid_at timestamptz,
  p_reference_note text,
  p_verifier_staff_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  order_row public.orders;
  v_method text;
  v_method_description text;
  v_amount numeric(10, 2);
  v_payment_id uuid;
  v_amount_due numeric(10, 2);
  v_net_received numeric(10, 2);
  v_remaining numeric(10, 2);
  v_new_status public.order_status;
begin
  if p_order_id is null then
    raise exception 'Order is required';
  end if;
  if p_verifier_staff_id is null then
    raise exception 'Verifier is required';
  end if;
  if p_paid_at is null then
    raise exception 'Payment date/time is required';
  end if;

  v_amount := round(coalesce(p_amount, 0)::numeric, 2);
  if v_amount <= 0 then
    raise exception 'Amount received must be greater than zero';
  end if;

  v_method := nullif(trim(coalesce(p_method, '')), '');
  if v_method is null or v_method not in ('wb_qr', 'online_transfer', 'others') then
    raise exception 'Invalid payment method';
  end if;

  v_method_description := nullif(trim(coalesce(p_method_description, '')), '');
  if v_method = 'others' and v_method_description is null then
    raise exception 'Description is required when payment method is Others';
  end if;
  if v_method <> 'others' then
    v_method_description := null;
  end if;

  select o.*
  into order_row
  from public.orders o
  where o.id = p_order_id
    and o.customer_id is null
  for update;

  if not found then
    raise exception 'Order not found';
  end if;

  if order_row.status <> 'awaiting_payment' then
    raise exception 'Payments can only be recorded while awaiting payment';
  end if;

  insert into public.payments (
    amount,
    method,
    method_description,
    paid_at,
    reference_note,
    verified_by,
    verified_at,
    status
  ) values (
    v_amount,
    v_method,
    v_method_description,
    p_paid_at,
    nullif(trim(coalesce(p_reference_note, '')), ''),
    p_verifier_staff_id,
    now(),
    'verified'
  )
  returning id into v_payment_id;

  -- Preview 1: allocate full payment amount to this single order.
  -- Future multi-order payments will split across allocation rows.
  insert into public.payment_allocations (
    payment_id,
    order_id,
    amount
  ) values (
    v_payment_id,
    p_order_id,
    v_amount
  );

  v_amount_due := public.order_amount_due(p_order_id);
  v_net_received := public.order_net_received(p_order_id);
  v_remaining := greatest(v_amount_due - v_net_received, 0)::numeric(10, 2);

  if v_net_received >= v_amount_due then
    v_new_status := 'paid'::public.order_status;
    update public.orders o
    set
      status = 'paid',
      payment_status = 'paid',
      updated_by = p_verifier_staff_id,
      updated_at = now()
    where o.id = p_order_id
    returning * into order_row;
  else
    v_new_status := 'awaiting_payment'::public.order_status;
    update public.orders o
    set
      updated_by = p_verifier_staff_id,
      updated_at = now()
    where o.id = p_order_id
    returning * into order_row;
  end if;

  insert into public.order_timeline_events (
    order_id,
    event_type,
    actor_staff_id,
    metadata
  ) values (
    p_order_id,
    case
      when v_new_status = 'paid' then 'payment_secured'
      else 'payment_recorded'
    end,
    p_verifier_staff_id,
    jsonb_build_object(
      'payment_id', v_payment_id,
      'amount', v_amount,
      'method', v_method,
      'method_description', v_method_description,
      'paid_at', p_paid_at,
      'amount_due', v_amount_due,
      'net_received', v_net_received,
      'remaining_balance', v_remaining,
      'order_status', v_new_status::text
    )
  );

  return jsonb_build_object(
    'payment_id', v_payment_id,
    'order_id', p_order_id,
    'order_status', v_new_status::text,
    'amount_due', v_amount_due,
    'net_received', v_net_received,
    'remaining_balance', v_remaining
  );
end;
$$;

revoke all on function public.record_and_verify_guest_order_payment(
  uuid, numeric, text, text, timestamptz, text, uuid
) from public;
grant execute on function public.record_and_verify_guest_order_payment(
  uuid, numeric, text, text, timestamptz, text, uuid
) to authenticated;
