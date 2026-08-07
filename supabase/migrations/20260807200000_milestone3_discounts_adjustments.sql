-- Milestone 3 Preview 2: Discounts & adjustments
-- Additive / non-destructive. Preserves M1/M2/M3 Preview 1 financial history.
--
-- Generic adjustments remain the financial mechanism.
-- August Promo and RM10 physical cards are first real rule implementations — not the architecture.

-- ---------------------------------------------------------------------------
-- 1) Order intake source (explicit; do not infer from phone/name)
-- Guest website submit → customer_website. Other channels reserved for later.
-- ---------------------------------------------------------------------------

alter table public.orders
  add column if not exists order_source text;

update public.orders
set order_source = 'customer_website'
where order_source is null
  and customer_id is null;

update public.orders
set order_source = coalesce(order_source, 'other')
where order_source is null;

alter table public.orders
  alter column order_source set default 'customer_website',
  alter column order_source set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'orders_order_source_check'
  ) then
    alter table public.orders
      add constraint orders_order_source_check check (
        order_source in (
          'customer_website',
          'whatsapp',
          'walk_in',
          'last_minute',
          'other'
        )
      );
  end if;
end $$;

comment on column public.orders.order_source is
  'Explicit intake channel. August Promo requires customer_website.';

-- ---------------------------------------------------------------------------
-- 2) RM10 physical card issuance suppression (reason retained)
-- ---------------------------------------------------------------------------

alter table public.orders
  add column if not exists rm10_card_issuance_suppressed boolean not null default false,
  add column if not exists rm10_card_issuance_suppression_code text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'orders_rm10_suppression_code_check'
  ) then
    alter table public.orders
      add constraint orders_rm10_suppression_code_check check (
        rm10_card_issuance_suppression_code is null
        or rm10_card_issuance_suppression_code in (
          'august_promo_applied',
          'rm10_voucher_redeemed'
        )
      );
  end if;
end $$;

comment on column public.orders.rm10_card_issuance_suppressed is
  'When true, do not issue a new RM10 physical discount card for this order.';
comment on column public.orders.rm10_card_issuance_suppression_code is
  'Why issuance is suppressed: august_promo_applied | rm10_voucher_redeemed.';

-- ---------------------------------------------------------------------------
-- 3) Enrich order_adjustments for traceability (still generic)
-- ---------------------------------------------------------------------------

alter table public.order_adjustments
  add column if not exists code text,
  add column if not exists reason text,
  add column if not exists reference_type text,
  add column if not exists reference_id uuid;

create unique index if not exists order_adjustments_order_code_unique
  on public.order_adjustments (order_id, code)
  where code is not null;

comment on column public.order_adjustments.code is
  'Stable rule code e.g. august_promo_2026, rm10_physical_card. Unique per order when set.';
comment on column public.order_adjustments.reference_type is
  'Optional link type e.g. physical_discount_voucher_redemption.';

-- ---------------------------------------------------------------------------
-- 4) Physical discount voucher registry + redemptions
-- Separate from Master Library catalog vouchers.
-- ---------------------------------------------------------------------------

create table if not exists public.physical_discount_vouchers (
  id uuid primary key default gen_random_uuid(),
  voucher_number text not null,
  voucher_number_normalized text not null,
  expiry_date date,
  status text not null default 'unredeemed',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint physical_discount_vouchers_number_not_blank check (
    char_length(trim(voucher_number)) > 0
  ),
  constraint physical_discount_vouchers_normalized_not_blank check (
    char_length(trim(voucher_number_normalized)) > 0
  ),
  constraint physical_discount_vouchers_status_check check (
    status in ('unredeemed', 'redeemed')
  ),
  unique (voucher_number_normalized)
);

create index if not exists physical_discount_vouchers_status_idx
  on public.physical_discount_vouchers (status);

create table if not exists public.physical_discount_voucher_redemptions (
  id uuid primary key default gen_random_uuid(),
  voucher_id uuid not null
    references public.physical_discount_vouchers (id) on delete restrict,
  order_id uuid not null
    references public.orders (id) on delete restrict,
  adjustment_id uuid not null
    references public.order_adjustments (id) on delete restrict,
  voucher_number text not null,
  expiry_date date not null,
  verified_by uuid not null
    references public.staff_profiles (id) on delete restrict,
  redeemed_at timestamptz not null default now(),
  is_owner_override boolean not null default false,
  override_reason text,
  created_at timestamptz not null default now(),
  constraint physical_discount_voucher_redemptions_number_not_blank check (
    char_length(trim(voucher_number)) > 0
  ),
  constraint physical_discount_voucher_redemptions_override_reason_check check (
    is_owner_override = false
    or (
      override_reason is not null
      and char_length(trim(override_reason)) > 0
    )
  ),
  unique (voucher_id),
  unique (order_id, voucher_id)
);

create index if not exists physical_discount_voucher_redemptions_order_idx
  on public.physical_discount_voucher_redemptions (order_id);

create index if not exists physical_discount_voucher_redemptions_voucher_idx
  on public.physical_discount_voucher_redemptions (voucher_id);

alter table public.physical_discount_vouchers enable row level security;
alter table public.physical_discount_voucher_redemptions enable row level security;

drop policy if exists physical_discount_vouchers_authenticated_select
  on public.physical_discount_vouchers;
create policy physical_discount_vouchers_authenticated_select
  on public.physical_discount_vouchers
  for select to authenticated
  using (true);

drop policy if exists physical_discount_vouchers_authenticated_insert
  on public.physical_discount_vouchers;
create policy physical_discount_vouchers_authenticated_insert
  on public.physical_discount_vouchers
  for insert to authenticated
  with check (true);

drop policy if exists physical_discount_vouchers_authenticated_update
  on public.physical_discount_vouchers;
create policy physical_discount_vouchers_authenticated_update
  on public.physical_discount_vouchers
  for update to authenticated
  using (true)
  with check (true);

-- No DELETE on voucher registry (audit / traceability).

drop policy if exists physical_discount_voucher_redemptions_authenticated_select
  on public.physical_discount_voucher_redemptions;
create policy physical_discount_voucher_redemptions_authenticated_select
  on public.physical_discount_voucher_redemptions
  for select to authenticated
  using (true);

drop policy if exists physical_discount_voucher_redemptions_authenticated_insert
  on public.physical_discount_voucher_redemptions;
create policy physical_discount_voucher_redemptions_authenticated_insert
  on public.physical_discount_voucher_redemptions
  for insert to authenticated
  with check (true);

-- No UPDATE/DELETE on redemptions (immutable financial facts).

-- ---------------------------------------------------------------------------
-- 5) Helpers
-- ---------------------------------------------------------------------------

create or replace function public.normalize_physical_voucher_number(p_number text)
returns text
language sql
immutable
as $$
  select upper(regexp_replace(trim(coalesce(p_number, '')), '\s+', '', 'g'));
$$;

create or replace function public.singapore_calendar_date(p_ts timestamptz)
returns date
language sql
stable
as $$
  select (p_ts at time zone 'Asia/Singapore')::date;
$$;

create or replace function public.guest_order_has_verified_payments(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.order_net_received(p_order_id) > 0;
$$;

create or replace function public.guest_order_has_adjustment_code(
  p_order_id uuid,
  p_code text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.order_adjustments oa
    where oa.order_id = p_order_id
      and oa.code = p_code
  );
$$;

create or replace function public.guest_order_has_eligible_rm10_size(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.order_items oi
    where oi.order_id = p_order_id
      and (
        oi.size_label = '6"'
        or oi.size_label = '8"'
        or oi.size_label like '6"%'
        or oi.size_label like '8"%'
      )
  );
$$;

revoke all on function public.normalize_physical_voucher_number(text) from public;
revoke all on function public.singapore_calendar_date(timestamptz) from public;
revoke all on function public.guest_order_has_verified_payments(uuid) from public;
revoke all on function public.guest_order_has_adjustment_code(uuid, text) from public;
revoke all on function public.guest_order_has_eligible_rm10_size(uuid) from public;

grant execute on function public.normalize_physical_voucher_number(text) to authenticated;
grant execute on function public.singapore_calendar_date(timestamptz) to authenticated;
grant execute on function public.guest_order_has_verified_payments(uuid) to authenticated;
grant execute on function public.guest_order_has_adjustment_code(uuid, text) to authenticated;
grant execute on function public.guest_order_has_eligible_rm10_size(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6) Apply August Promo (idempotent via unique code index)
-- Temporary promotion rules encoded here / mirrored in app engine.
-- ---------------------------------------------------------------------------

create or replace function public.apply_august_promo_to_guest_order(
  p_order_id uuid,
  p_actor_staff_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  order_row public.orders;
  v_subtotal numeric(10, 2);
  v_order_date date;
  v_pickup date;
  v_adjustment_id uuid;
  v_amount_due numeric(10, 2);
  c_code constant text := 'august_promo_2026';
  c_label constant text := 'August Promo';
  c_amount constant numeric(10, 2) := -20.00;
begin
  if p_order_id is null or p_actor_staff_id is null then
    raise exception 'Order and staff actor are required';
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

  if order_row.status = 'paid' then
    raise exception 'Adjustments cannot be applied after the order is paid';
  end if;

  if order_row.status not in ('submitted', 'pending_confirmation', 'awaiting_payment') then
    raise exception 'This order cannot receive adjustments';
  end if;

  if public.guest_order_has_verified_payments(p_order_id) then
    raise exception 'Adjustments cannot be applied after verified payments exist. Financial correction is not available in this Preview.';
  end if;

  if public.guest_order_has_adjustment_code(p_order_id, c_code) then
    raise exception 'August Promo is already applied to this order';
  end if;

  if public.guest_order_has_adjustment_code(p_order_id, 'rm10_physical_card') then
    raise exception 'August Promo cannot be stacked with an RM10 Discount Card on the same order';
  end if;

  if order_row.order_source <> 'customer_website' then
    raise exception 'August Promo is only eligible for online preorder (customer website)';
  end if;

  v_order_date := public.singapore_calendar_date(order_row.created_at);
  v_pickup := order_row.pickup_date;

  if v_order_date < date '2026-07-27' or v_order_date > date '2026-08-08' then
    raise exception 'Order date is outside the August Promo order period (27/07/2026–08/08/2026)';
  end if;

  if v_pickup < date '2026-08-01' or v_pickup > date '2026-08-31' then
    raise exception 'Pickup date must be within August 2026 for August Promo';
  end if;

  v_subtotal := public.order_items_subtotal(p_order_id);
  if v_subtotal <= 100 then
    raise exception 'August Promo requires whole-cake subtotal above RM100';
  end if;

  insert into public.order_adjustments (
    order_id,
    kind,
    code,
    label,
    amount,
    reason,
    metadata,
    created_by
  ) values (
    p_order_id,
    'promotion',
    c_code,
    c_label,
    c_amount,
    'August Promo applied',
    jsonb_build_object(
      'promotion', 'august_promo_2026',
      'discount_rm', 20,
      'order_date', v_order_date,
      'pickup_date', v_pickup,
      'subtotal_at_apply', v_subtotal
    ),
    p_actor_staff_id
  )
  returning id into v_adjustment_id;

  update public.orders o
  set
    rm10_card_issuance_suppressed = true,
    rm10_card_issuance_suppression_code = 'august_promo_applied',
    updated_by = p_actor_staff_id,
    updated_at = now()
  where o.id = p_order_id;

  insert into public.order_timeline_events (
    order_id,
    event_type,
    actor_staff_id,
    metadata
  ) values (
    p_order_id,
    'august_promo_applied',
    p_actor_staff_id,
    jsonb_build_object(
      'adjustment_id', v_adjustment_id,
      'amount', c_amount,
      'code', c_code
    )
  );

  v_amount_due := public.order_amount_due(p_order_id);

  return jsonb_build_object(
    'adjustment_id', v_adjustment_id,
    'amount_due', v_amount_due,
    'code', c_code
  );
exception
  when unique_violation then
    raise exception 'August Promo is already applied to this order';
end;
$$;

revoke all on function public.apply_august_promo_to_guest_order(uuid, uuid) from public;
grant execute on function public.apply_august_promo_to_guest_order(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7) Redeem RM10 physical discount card
-- ---------------------------------------------------------------------------

create or replace function public.redeem_rm10_physical_voucher_for_guest_order(
  p_order_id uuid,
  p_actor_staff_id uuid,
  p_voucher_number text,
  p_expiry_date date,
  p_owner_override boolean default false,
  p_override_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  order_row public.orders;
  voucher_row public.physical_discount_vouchers;
  v_number text;
  v_normalized text;
  v_order_date date;
  v_pickup date;
  v_valid boolean := true;
  v_invalid_reason text := null;
  v_role_code text;
  v_adjustment_id uuid;
  v_redemption_id uuid;
  v_amount_due numeric(10, 2);
  c_code constant text := 'rm10_physical_card';
  c_label constant text := 'RM10 Discount Card';
  c_amount constant numeric(10, 2) := -10.00;
begin
  if p_order_id is null or p_actor_staff_id is null then
    raise exception 'Order and staff actor are required';
  end if;

  v_number := nullif(trim(coalesce(p_voucher_number, '')), '');
  if v_number is null then
    raise exception 'Voucher number is required';
  end if;
  if p_expiry_date is null then
    raise exception 'Voucher expiry date is required';
  end if;

  v_normalized := public.normalize_physical_voucher_number(v_number);
  if v_normalized is null or v_normalized = '' then
    raise exception 'Voucher number is required';
  end if;

  select r.code
  into v_role_code
  from public.staff_profiles sp
  inner join public.roles r on r.id = sp.role_id
  where sp.id = p_actor_staff_id;

  if v_role_code is distinct from 'owner' then
    raise exception 'Only Owner can redeem physical discount vouchers in this workspace';
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

  if order_row.status = 'paid' then
    raise exception 'Adjustments cannot be applied after the order is paid';
  end if;

  if order_row.status not in ('submitted', 'pending_confirmation', 'awaiting_payment') then
    raise exception 'This order cannot receive adjustments';
  end if;

  if public.guest_order_has_verified_payments(p_order_id) then
    raise exception 'Adjustments cannot be applied after verified payments exist. Financial correction is not available in this Preview.';
  end if;

  if public.guest_order_has_adjustment_code(p_order_id, c_code) then
    raise exception 'An RM10 Discount Card is already applied to this order';
  end if;

  if public.guest_order_has_adjustment_code(p_order_id, 'august_promo_2026') then
    raise exception 'RM10 Discount Card cannot be stacked with August Promo on the same order';
  end if;

  if not public.guest_order_has_eligible_rm10_size(p_order_id) then
    raise exception 'RM10 Discount Card requires a 6" or 8" cake on the order';
  end if;

  v_order_date := public.singapore_calendar_date(order_row.created_at);
  v_pickup := order_row.pickup_date;

  if v_order_date > p_expiry_date then
    v_valid := false;
    v_invalid_reason := 'Order date is after voucher expiry';
  elsif v_pickup > p_expiry_date then
    v_valid := false;
    v_invalid_reason := 'Pickup date is after voucher expiry';
  end if;

  if not v_valid then
    if coalesce(p_owner_override, false) = false then
      raise exception '%', v_invalid_reason;
    end if;
    if nullif(trim(coalesce(p_override_reason, '')), '') is null then
      raise exception 'Owner override requires a reason';
    end if;
  elsif coalesce(p_owner_override, false) then
    raise exception 'Owner override is only allowed when the voucher is otherwise invalid';
  end if;

  select v.*
  into voucher_row
  from public.physical_discount_vouchers v
  where v.voucher_number_normalized = v_normalized
  for update;

  if found then
    if voucher_row.status = 'redeemed' then
      raise exception 'This voucher number has already been redeemed';
    end if;
    update public.physical_discount_vouchers v
    set
      expiry_date = p_expiry_date,
      voucher_number = v_number,
      updated_at = now()
    where v.id = voucher_row.id
    returning * into voucher_row;
  else
    insert into public.physical_discount_vouchers (
      voucher_number,
      voucher_number_normalized,
      expiry_date,
      status
    ) values (
      v_number,
      v_normalized,
      p_expiry_date,
      'unredeemed'
    )
    returning * into voucher_row;
  end if;

  insert into public.order_adjustments (
    order_id,
    kind,
    code,
    label,
    amount,
    reason,
    metadata,
    created_by
  ) values (
    p_order_id,
    'voucher',
    c_code,
    c_label,
    c_amount,
    case
      when coalesce(p_owner_override, false) then trim(p_override_reason)
      else 'RM10 physical discount card redeemed'
    end,
    jsonb_build_object(
      'voucher_number', v_number,
      'expiry_date', p_expiry_date,
      'owner_override', coalesce(p_owner_override, false)
    ),
    p_actor_staff_id
  )
  returning id into v_adjustment_id;

  insert into public.physical_discount_voucher_redemptions (
    voucher_id,
    order_id,
    adjustment_id,
    voucher_number,
    expiry_date,
    verified_by,
    is_owner_override,
    override_reason
  ) values (
    voucher_row.id,
    p_order_id,
    v_adjustment_id,
    v_number,
    p_expiry_date,
    p_actor_staff_id,
    coalesce(p_owner_override, false),
    case
      when coalesce(p_owner_override, false) then trim(p_override_reason)
      else null
    end
  )
  returning id into v_redemption_id;

  update public.order_adjustments oa
  set
    reference_type = 'physical_discount_voucher_redemption',
    reference_id = v_redemption_id
  where oa.id = v_adjustment_id;

  update public.physical_discount_vouchers v
  set
    status = 'redeemed',
    updated_at = now()
  where v.id = voucher_row.id;

  update public.orders o
  set
    rm10_card_issuance_suppressed = true,
    rm10_card_issuance_suppression_code = 'rm10_voucher_redeemed',
    updated_by = p_actor_staff_id,
    updated_at = now()
  where o.id = p_order_id;

  insert into public.order_timeline_events (
    order_id,
    event_type,
    actor_staff_id,
    metadata
  ) values (
    p_order_id,
    case
      when coalesce(p_owner_override, false) then 'rm10_voucher_owner_override'
      else 'rm10_voucher_redeemed'
    end,
    p_actor_staff_id,
    jsonb_build_object(
      'adjustment_id', v_adjustment_id,
      'redemption_id', v_redemption_id,
      'voucher_number', v_number,
      'expiry_date', p_expiry_date,
      'owner_override', coalesce(p_owner_override, false),
      'override_reason', nullif(trim(coalesce(p_override_reason, '')), ''),
      'invalid_reason', v_invalid_reason
    )
  );

  v_amount_due := public.order_amount_due(p_order_id);

  return jsonb_build_object(
    'adjustment_id', v_adjustment_id,
    'redemption_id', v_redemption_id,
    'amount_due', v_amount_due,
    'owner_override', coalesce(p_owner_override, false)
  );
exception
  when unique_violation then
    raise exception 'This voucher cannot be redeemed again (duplicate protection)';
end;
$$;

revoke all on function public.redeem_rm10_physical_voucher_for_guest_order(
  uuid, uuid, text, date, boolean, text
) from public;
grant execute on function public.redeem_rm10_physical_voucher_for_guest_order(
  uuid, uuid, text, date, boolean, text
) to authenticated;

-- ---------------------------------------------------------------------------
-- 8) Ensure guest submit stamps order_source = customer_website
-- Same function body as M2 ambiguity fix, plus order_source on insert.
-- ---------------------------------------------------------------------------

create or replace function public.submit_guest_preorder(
  p_customer_name text,
  p_phone text,
  p_email text,
  p_pickup_date date,
  p_pickup_time time,
  p_notes text,
  p_items jsonb
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  cake_row public.library_cakes;
  size_row public.library_cake_sizes;
  new_order public.orders;
  active_collection public.collections;
  item jsonb;
  v_qty integer;
  v_cake_id uuid;
  v_size_id uuid;
  item_count integer := 0;
  complimentary_row record;
begin
  if char_length(trim(coalesce(p_customer_name, ''))) = 0 then
    raise exception 'Full name is required';
  end if;
  if char_length(trim(coalesce(p_phone, ''))) = 0 then
    raise exception 'Phone number is required';
  end if;
  if char_length(trim(coalesce(p_email, ''))) = 0 then
    raise exception 'Email is required';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one cake is required';
  end if;

  select c.*
  into active_collection
  from public.collections c
  where c.status = 'active'
  order by c.month desc
  limit 1;

  if active_collection.id is null then
    raise exception 'No active collection is available';
  end if;

  insert into public.orders (
    order_number,
    customer_id,
    guest_name,
    guest_phone,
    guest_email,
    fulfilment_method,
    pickup_date,
    pickup_time,
    status,
    payment_status,
    customer_notes,
    collection_id,
    confirmation_needs_resend,
    order_source
  )
  values (
    public.allocate_order_number(),
    null,
    trim(p_customer_name),
    trim(p_phone),
    trim(p_email),
    'pickup',
    p_pickup_date,
    p_pickup_time,
    'submitted',
    'unpaid',
    nullif(trim(coalesce(p_notes, '')), ''),
    active_collection.id,
    false,
    'customer_website'
  )
  returning * into new_order;

  for item in select * from jsonb_array_elements(p_items)
  loop
    v_cake_id := (item ->> 'cake_id')::uuid;
    v_size_id := (item ->> 'cake_size_id')::uuid;
    v_qty := coalesce((item ->> 'quantity')::integer, 1);

    if v_qty < 1 then
      raise exception 'Quantity must be at least 1';
    end if;

    select lc.*
    into cake_row
    from public.library_cakes lc
    where lc.id = v_cake_id;
    if not found then
      raise exception 'Cake is not available';
    end if;

    if not exists (
      select 1
      from public.collection_cakes cc
      where cc.collection_id = active_collection.id
        and cc.library_cake_id = cake_row.id
        and cc.available = true
    ) then
      raise exception 'Cake is not available in the current collection';
    end if;

    select lcs.*
    into size_row
    from public.library_cake_sizes lcs
    where lcs.id = v_size_id
      and lcs.cake_id = v_cake_id;
    if not found then
      raise exception 'Cake size is not available';
    end if;

    insert into public.order_items (
      order_id,
      cake_id,
      cake_size_id,
      quantity,
      unit_price,
      cake_name,
      size_label
    )
    values (
      new_order.id,
      cake_row.id,
      size_row.id,
      v_qty,
      size_row.price,
      cake_row.name,
      size_row.label
    );

    item_count := item_count + 1;
  end loop;

  if item_count = 0 then
    raise exception 'At least one cake is required';
  end if;

  for complimentary_row in
    select
      cci.complimentary_item_type_id,
      cit.name,
      cci.default_quantity,
      cci.sort_order
    from public.collection_complimentary_items cci
    join public.complimentary_item_types cit
      on cit.id = cci.complimentary_item_type_id
    where cci.collection_id = active_collection.id
      and cci.is_available = true
      and cci.is_default = true
      and cci.default_quantity > 0
    order by cci.sort_order asc, cit.name asc
  loop
    insert into public.order_complimentary_items (
      order_id,
      complimentary_item_type_id,
      name,
      quantity,
      sort_order
    )
    values (
      new_order.id,
      complimentary_row.complimentary_item_type_id,
      complimentary_row.name,
      complimentary_row.default_quantity,
      complimentary_row.sort_order
    );
  end loop;

  insert into public.order_timeline_events (
    order_id,
    event_type,
    actor_staff_id,
    metadata
  )
  values (
    new_order.id,
    'preorder_submitted',
    null,
    jsonb_build_object(
      'item_count', item_count,
      'source', 'customer_website'
    )
  );

  return new_order;
end;
$$;

revoke all on function public.submit_guest_preorder(
  text, text, text, date, time, text, jsonb
) from public;
grant execute on function public.submit_guest_preorder(
  text, text, text, date, time, text, jsonb
) to anon, authenticated;
