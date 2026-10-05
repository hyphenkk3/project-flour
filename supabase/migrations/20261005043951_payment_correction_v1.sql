-- Append-only payment correction records; original payments and allocations stay immutable.
-- Effective allocation amount is projected from this ledger for all settlement calculations.

create table public.payment_corrections (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments (id) on delete restrict,
  payment_allocation_id uuid not null references public.payment_allocations (id) on delete restrict,
  order_id uuid not null references public.orders (id) on delete restrict,
  correction_type text not null
    check (correction_type in ('amount', 'method', 'combined')),
  original_amount numeric(10, 2) not null check (original_amount > 0),
  corrected_amount numeric(10, 2) not null check (corrected_amount >= 0),
  original_method text not null
    check (original_method in ('wb_qr', 'online_transfer', 'others')),
  corrected_method text not null
    check (corrected_method in ('wb_qr', 'online_transfer', 'others')),
  original_method_description text,
  corrected_method_description text,
  reason text not null check (char_length(trim(reason)) > 0),
  corrected_by uuid not null references public.staff_profiles (id) on delete restrict,
  corrected_at timestamptz not null default now(),
  created_at timestamptz not null default now(),

  constraint payment_corrections_one_per_payment unique (payment_id),
  constraint payment_corrections_one_per_allocation unique (payment_allocation_id),
  constraint payment_corrections_original_others_description check (
    original_method <> 'others'
    or nullif(trim(original_method_description), '') is not null
  ),
  constraint payment_corrections_corrected_others_description check (
    (corrected_method = 'others'
      and nullif(trim(corrected_method_description), '') is not null)
    or (corrected_method <> 'others' and corrected_method_description is null)
  ),
  constraint payment_corrections_changes_value check (
    original_amount is distinct from corrected_amount
    or original_method is distinct from corrected_method
    or coalesce(original_method_description, '') is distinct from
       coalesce(corrected_method_description, '')
  ),
  constraint payment_corrections_type_matches_values check (
    (
      correction_type = 'amount'
      and original_amount is distinct from corrected_amount
      and original_method is not distinct from corrected_method
      and coalesce(original_method_description, '') =
          coalesce(corrected_method_description, '')
    )
    or (
      correction_type = 'method'
      and original_amount is not distinct from corrected_amount
      and (
        original_method is distinct from corrected_method
        or coalesce(original_method_description, '') is distinct from
           coalesce(corrected_method_description, '')
      )
    )
    or (
      correction_type = 'combined'
      and original_amount is distinct from corrected_amount
      and (
        original_method is distinct from corrected_method
        or coalesce(original_method_description, '') is distinct from
           coalesce(corrected_method_description, '')
      )
    )
  )
);

comment on table public.payment_corrections is
  'Append-only corrections to a single verified payment allocation. Original payment and allocation rows remain unchanged.';

create index payment_corrections_order_created_idx
  on public.payment_corrections (order_id, corrected_at desc);
create index payment_corrections_actor_created_idx
  on public.payment_corrections (corrected_by, corrected_at desc);

alter table public.payment_corrections enable row level security;
revoke all on table public.payment_corrections from public, anon, authenticated;
grant select on table public.payment_corrections to authenticated;

create policy payment_corrections_authenticated_select
  on public.payment_corrections
  for select to authenticated
  using (public._current_staff_role_code() is not null);

create or replace function public.prevent_payment_correction_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Payment correction history is append-only';
end;
$$;

revoke all on function public.prevent_payment_correction_mutation() from public, anon;

create trigger payment_corrections_immutable
before update or delete on public.payment_corrections
for each row execute function public.prevent_payment_correction_mutation();

-- One payment transaction contributes its correction amount in place of the original
-- allocation amount. The original payment and allocation remain queryable unchanged.
create or replace function public.order_verified_allocated(p_order_id uuid)
returns numeric(10, 2)
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(coalesce(pc.corrected_amount, pa.amount)), 0)::numeric(10, 2)
  from public.payment_allocations pa
  inner join public.payments p on p.id = pa.payment_id
  left join public.payment_corrections pc
    on pc.payment_allocation_id = pa.id
  where pa.order_id = p_order_id
    and p.status = 'verified';
$$;

comment on function public.order_verified_allocated(uuid) is
  'Effective verified allocations: corrected amount when a correction exists, otherwise the immutable allocation amount.';

create or replace function public.record_payment_correction(
  p_order_id uuid,
  p_payment_allocation_id uuid,
  p_corrected_amount numeric,
  p_corrected_method text,
  p_corrected_method_description text,
  p_reason text,
  p_actor_staff_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_payment_id uuid;
  v_order public.orders;
  v_payment public.payments;
  v_allocation public.payment_allocations;
  v_allocation_count integer;
  v_corrected_amount numeric(10, 2);
  v_corrected_method text;
  v_corrected_description text;
  v_reason text;
  v_type text;
  v_amount_changed boolean;
  v_method_changed boolean;
  v_correction_id uuid;
  v_amount_due numeric(10, 2);
  v_net_received numeric(10, 2);
  v_new_status public.order_status;
  v_resulting_status public.order_status;
  v_resulting_payment_status public.payment_status;
begin
  if p_order_id is null or p_payment_allocation_id is null then
    raise exception 'Order and payment allocation are required';
  end if;

  v_actor := public._bind_rpc_actor(p_actor_staff_id);
  perform public._require_rpc_roles(
    v_actor,
    array['owner', 'manager']::text[],
    'Only Owner or Manager may correct a payment.'
  );

  select pa.payment_id
  into v_payment_id
  from public.payment_allocations pa
  where pa.id = p_payment_allocation_id
    and pa.order_id = p_order_id;

  if not found then
    raise exception 'Payment allocation not found for this order';
  end if;

  -- Order first matches payment recording/refund lock order, preventing races
  -- with settlement changes on this order.
  select o.*
  into v_order
  from public.orders o
  where o.id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found';
  end if;
  if v_order.status = 'cancelled' then
    raise exception 'Cannot correct payment on a cancelled order';
  end if;

  select p.*
  into v_payment
  from public.payments p
  where p.id = v_payment_id
  for update;

  if not found or v_payment.status <> 'verified' then
    raise exception 'Only verified payments can be corrected';
  end if;

  select pa.*
  into v_allocation
  from public.payment_allocations pa
  where pa.id = p_payment_allocation_id
    and pa.payment_id = v_payment_id
    and pa.order_id = p_order_id
  for update;

  if not found then
    raise exception 'Payment allocation changed; reload and try again';
  end if;

  select count(*)::integer
  into v_allocation_count
  from public.payment_allocations pa
  where pa.payment_id = v_payment_id;

  if v_allocation_count <> 1 then
    raise exception 'Shared payments cannot be corrected in this workflow';
  end if;

  if v_payment.amount is distinct from v_allocation.amount then
    raise exception 'Payment amount and allocation differ; manual review is required';
  end if;

  if exists (
    select 1
    from public.payment_corrections pc
    where pc.payment_id = v_payment_id
  ) then
    raise exception 'This payment has already been corrected';
  end if;

  -- Existing overpayment refunds are order-level records (often payment_id NULL),
  -- so any recorded refund on the order makes a payment correction ambiguous.
  if exists (
    select 1
    from public.refunds r
    where r.order_id = p_order_id
      and r.status = 'recorded'
  ) or exists (
    select 1
    from public.refunds r
    where r.payment_id = v_payment_id
      and r.status = 'recorded'
  ) then
    raise exception 'Payments on orders with recorded refunds cannot be corrected';
  end if;

  if p_corrected_amount is null or p_corrected_amount < 0 then
    raise exception 'Corrected amount must be zero or greater';
  end if;
  v_corrected_amount := round(p_corrected_amount, 2);

  v_corrected_method := nullif(trim(coalesce(p_corrected_method, '')), '');
  if v_corrected_method is null
     or v_corrected_method not in ('wb_qr', 'online_transfer', 'others') then
    raise exception 'Invalid corrected payment method';
  end if;

  v_corrected_description :=
    nullif(trim(coalesce(p_corrected_method_description, '')), '');
  if v_corrected_method = 'others' and v_corrected_description is null then
    raise exception 'Description is required when payment method is Others';
  end if;
  if v_corrected_method <> 'others' then
    v_corrected_description := null;
  end if;

  v_reason := nullif(trim(coalesce(p_reason, '')), '');
  if v_reason is null then
    raise exception 'A correction reason is required';
  end if;

  v_amount_changed := v_corrected_amount is distinct from v_allocation.amount;
  v_method_changed :=
    v_corrected_method is distinct from v_payment.method
    or coalesce(v_corrected_description, '') is distinct from
       coalesce(v_payment.method_description, '');

  if not v_amount_changed and not v_method_changed then
    raise exception 'At least one payment value must change';
  end if;

  v_type := case
    when v_amount_changed and v_method_changed then 'combined'
    when v_amount_changed then 'amount'
    else 'method'
  end;

  insert into public.payment_corrections (
    payment_id,
    payment_allocation_id,
    order_id,
    correction_type,
    original_amount,
    corrected_amount,
    original_method,
    corrected_method,
    original_method_description,
    corrected_method_description,
    reason,
    corrected_by
  ) values (
    v_payment_id,
    v_allocation.id,
    p_order_id,
    v_type,
    v_payment.amount,
    v_corrected_amount,
    v_payment.method,
    v_corrected_method,
    v_payment.method_description,
    v_corrected_description,
    v_reason,
    v_actor
  )
  returning id into v_correction_id;

  v_amount_due := public.order_amount_due(p_order_id);
  v_net_received := public.order_net_received(p_order_id);
  v_new_status := case
    when v_net_received >= v_amount_due
      then 'paid'::public.order_status
    else 'awaiting_payment'::public.order_status
  end;

  update public.orders o
  set status = case
        -- Reconcile payment lifecycle state only. Preserve confirmed/completed
        -- fulfilment states when a historical payment is corrected.
        when o.status in ('awaiting_payment', 'paid') then v_new_status
        else o.status
      end,
      payment_status = case when v_new_status = 'paid' then 'paid' else 'unpaid' end,
      updated_by = v_actor,
      updated_at = now()
  where o.id = p_order_id
  returning o.status, o.payment_status
  into v_resulting_status, v_resulting_payment_status;

  insert into public.order_timeline_events (
    order_id,
    event_type,
    actor_staff_id,
    metadata
  ) values (
    p_order_id,
    'payment_corrected',
    v_actor,
    jsonb_build_object(
      'payment_correction_id', v_correction_id,
      'payment_id', v_payment_id,
      'payment_allocation_id', v_allocation.id,
      'correction_type', v_type,
      'original_amount', v_payment.amount,
      'corrected_amount', v_corrected_amount,
      'original_method', v_payment.method,
      'corrected_method', v_corrected_method,
      'original_method_description', v_payment.method_description,
      'corrected_method_description', v_corrected_description,
      'reason', v_reason,
      'amount_due', v_amount_due,
      'net_received', v_net_received,
      'order_status', v_resulting_status::text,
      'payment_status', v_resulting_payment_status::text
    )
  );

  return v_correction_id;
end;
$$;

comment on function public.record_payment_correction(
  uuid, uuid, numeric, text, text, text, uuid
) is
  'Atomically append a one-time Owner/Manager payment correction, recalculate effective settlement, and write its timeline event.';

revoke all on function public.record_payment_correction(
  uuid, uuid, numeric, text, text, text, uuid
) from public, anon, authenticated;
grant execute on function public.record_payment_correction(
  uuid, uuid, numeric, text, text, text, uuid
) to authenticated, service_role;
