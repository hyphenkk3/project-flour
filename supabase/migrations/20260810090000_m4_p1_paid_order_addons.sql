-- M4-P1 Slice 1 — Paid order add-ons persistence + database financial truth
-- Additive. Does not amend frozen migrations.
-- Does not change August Promo eligibility base (still order_items_subtotal / cake-only).
-- Does not change RM10 rules. Does not touch submit_guest_preorder / website path.

-- ---------------------------------------------------------------------------
-- 1) Catalog: paid_addon_types (seed-only in P1; no catalog-management UI)
-- ---------------------------------------------------------------------------

create table if not exists public.paid_addon_types (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  unit_price numeric(10, 2) not null,
  financial_shorthand text not null,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint paid_addon_types_code_unique unique (code),
  constraint paid_addon_types_code_not_blank check (char_length(trim(code)) > 0),
  constraint paid_addon_types_name_not_blank check (char_length(trim(name)) > 0),
  constraint paid_addon_types_shorthand_not_blank check (
    char_length(trim(financial_shorthand)) > 0
  ),
  constraint paid_addon_types_unit_price_non_negative check (unit_price >= 0)
);

create index if not exists paid_addon_types_active_sort_idx
  on public.paid_addon_types (is_active, sort_order);

drop trigger if exists paid_addon_types_set_updated_at on public.paid_addon_types;
create trigger paid_addon_types_set_updated_at
before update on public.paid_addon_types
for each row
execute function public.set_updated_at();

comment on table public.paid_addon_types is
  'Minimal paid non-cake add-on definitions. P1 seed: Birthday Card / Wishing Card. '
  'Live unit_price is catalog truth for NEW order lines only; historical lines use snapshots.';

insert into public.paid_addon_types (
  code,
  name,
  unit_price,
  financial_shorthand,
  is_active,
  sort_order
)
values
  ('birthday_card', 'Birthday Card', 3.00, 'BC', true, 0),
  ('wishing_card', 'Wishing Card', 3.00, 'WC', true, 1)
on conflict (code) do update
set
  name = excluded.name,
  unit_price = excluded.unit_price,
  financial_shorthand = excluded.financial_shorthand,
  is_active = excluded.is_active,
  sort_order = excluded.sort_order,
  updated_at = now();

-- ---------------------------------------------------------------------------
-- 2) Order lines: order_paid_addons (sibling commercial lines; not cakes)
-- ---------------------------------------------------------------------------

create table if not exists public.order_paid_addons (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  paid_addon_type_id uuid references public.paid_addon_types (id) on delete set null,
  code text not null,
  name text not null,
  unit_price numeric(10, 2) not null,
  financial_shorthand text not null,
  quantity integer not null,
  written_message text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint order_paid_addons_order_code_unique unique (order_id, code),
  constraint order_paid_addons_code_not_blank check (char_length(trim(code)) > 0),
  constraint order_paid_addons_name_not_blank check (char_length(trim(name)) > 0),
  constraint order_paid_addons_shorthand_not_blank check (
    char_length(trim(financial_shorthand)) > 0
  ),
  constraint order_paid_addons_quantity_positive check (quantity > 0),
  constraint order_paid_addons_unit_price_non_negative check (unit_price >= 0)
);

create index if not exists order_paid_addons_order_sort_idx
  on public.order_paid_addons (order_id, sort_order);

create index if not exists order_paid_addons_type_idx
  on public.order_paid_addons (paid_addon_type_id);

comment on table public.order_paid_addons is
  'Snapshotted paid add-on commercial lines. Settlement uses these snapshots; '
  'never live paid_addon_types prices. written_message is optional per line.';

comment on column public.order_paid_addons.unit_price is
  'Authoritative unit-price snapshot at add time. Preserved on retain/edit.';

comment on column public.order_paid_addons.written_message is
  'Optional structured card message for this line (shared across quantity). '
  'Not Customer/Internal/Bakery notes.';

-- ---------------------------------------------------------------------------
-- 3) RLS / grants
-- ---------------------------------------------------------------------------

alter table public.paid_addon_types enable row level security;
alter table public.order_paid_addons enable row level security;

-- Catalog: authenticated read only (seed/migration owns writes; no P1 admin UI)
drop policy if exists paid_addon_types_authenticated_select on public.paid_addon_types;
create policy paid_addon_types_authenticated_select
  on public.paid_addon_types
  for select
  to authenticated
  using (true);

-- Order lines: mirror complimentary / order_items authenticated workspace access
drop policy if exists order_paid_addons_authenticated_select on public.order_paid_addons;
create policy order_paid_addons_authenticated_select
  on public.order_paid_addons
  for select
  to authenticated
  using (true);

drop policy if exists order_paid_addons_authenticated_insert on public.order_paid_addons;
create policy order_paid_addons_authenticated_insert
  on public.order_paid_addons
  for insert
  to authenticated
  with check (true);

drop policy if exists order_paid_addons_authenticated_update on public.order_paid_addons;
create policy order_paid_addons_authenticated_update
  on public.order_paid_addons
  for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists order_paid_addons_authenticated_delete on public.order_paid_addons;
create policy order_paid_addons_authenticated_delete
  on public.order_paid_addons
  for delete
  to authenticated
  using (true);

grant select on public.paid_addon_types to authenticated;
grant select, insert, update, delete on public.order_paid_addons to authenticated;

-- ---------------------------------------------------------------------------
-- 4) Subtotal helpers + amount due
-- ---------------------------------------------------------------------------

-- CAKE-ONLY — do not include paid add-ons. August Promo eligibility base.
-- (Existing function body retained; comment reaffirmed.)
comment on function public.order_items_subtotal(uuid) is
  'Whole-cake subtotal from order_items snapshots only. '
  'Authoritative August Promo minimum-spend eligibility base (> RM100). '
  'Does not include paid add-ons.';

create or replace function public.order_paid_addons_subtotal(p_order_id uuid)
returns numeric(10, 2)
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(opa.unit_price * opa.quantity), 0)::numeric(10, 2)
  from public.order_paid_addons opa
  where opa.order_id = p_order_id;
$$;

comment on function public.order_paid_addons_subtotal(uuid) is
  'Paid-add-on commercial subtotal from order_paid_addons snapshots. '
  'Empty set = 0. Never uses live paid_addon_types.unit_price.';

revoke all on function public.order_paid_addons_subtotal(uuid) from public;
grant execute on function public.order_paid_addons_subtotal(uuid) to authenticated;

create or replace function public.order_amount_due(p_order_id uuid)
returns numeric(10, 2)
language sql
stable
security definer
set search_path = public
as $$
  select greatest(
    public.order_items_subtotal(p_order_id)
      + public.order_paid_addons_subtotal(p_order_id)
      + public.order_adjustments_total(p_order_id),
    0
  )::numeric(10, 2);
$$;

comment on function public.order_amount_due(uuid) is
  'Authoritative amount due: cake subtotal + paid-add-on subtotal + adjustments, floored at 0. '
  'Orders with zero paid add-ons remain unchanged vs pre-M4-P1.';

-- ---------------------------------------------------------------------------
-- 5) August Promo: preserve cake-only eligibility; clarify metadata meaning
-- ---------------------------------------------------------------------------

comment on function public.apply_august_promo_to_guest_order(uuid, uuid) is
  'Applies August Promo (-RM20). Eligibility minimum spend uses '
  'order_items_subtotal (whole-cake only; paid add-ons excluded). '
  'Threshold remains strictly greater than RM100. '
  'metadata.subtotal_at_apply stores that whole-cake subtotal at apply time.';

-- ---------------------------------------------------------------------------
-- 6) Internal helper: insert/update paid add-ons with server-authoritative snapshots
-- ---------------------------------------------------------------------------

create or replace function public._sync_order_paid_addons_from_payload(
  p_order_id uuid,
  p_paid_addons jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  addon jsonb;
  v_code text;
  v_qty integer;
  v_message text;
  v_type public.paid_addon_types;
  v_existing public.order_paid_addons;
  v_seen text[] := array[]::text[];
  v_count integer := 0;
begin
  if p_paid_addons is null then
    p_paid_addons := '[]'::jsonb;
  end if;

  if jsonb_typeof(p_paid_addons) <> 'array' then
    raise exception 'Paid add-ons payload must be a JSON array';
  end if;

  -- Remove lines not present in the incoming set (full replace of membership).
  delete from public.order_paid_addons opa
  where opa.order_id = p_order_id
    and not exists (
      select 1
      from jsonb_array_elements(p_paid_addons) as elem
      where nullif(trim(coalesce(elem ->> 'code', '')), '') = opa.code
    );

  for addon in select * from jsonb_array_elements(p_paid_addons)
  loop
    v_code := nullif(trim(coalesce(addon ->> 'code', '')), '');
    if v_code is null then
      raise exception 'Paid add-on code is required';
    end if;

    if v_code = any (v_seen) then
      raise exception 'Duplicate paid add-on code in payload: %', v_code;
    end if;
    v_seen := array_append(v_seen, v_code);

    v_qty := coalesce((addon ->> 'quantity')::integer, 0);
    if v_qty < 1 then
      raise exception 'Paid add-on quantity must be at least 1';
    end if;

    v_message := nullif(trim(coalesce(addon ->> 'written_message', '')), '');

    select *
    into v_existing
    from public.order_paid_addons opa
    where opa.order_id = p_order_id
      and opa.code = v_code;

    if found then
      -- EXISTING: preserve snapshots; allow quantity + written_message only.
      update public.order_paid_addons opa
      set
        quantity = v_qty,
        written_message = v_message
      where opa.id = v_existing.id;
    else
      -- NEW (including remove-then-re-add): snapshot active catalog truth.
      select *
      into v_type
      from public.paid_addon_types t
      where t.code = v_code
        and t.is_active = true;

      if not found then
        raise exception 'Paid add-on is not available: %', v_code;
      end if;

      insert into public.order_paid_addons (
        order_id,
        paid_addon_type_id,
        code,
        name,
        unit_price,
        financial_shorthand,
        quantity,
        written_message,
        sort_order
      )
      values (
        p_order_id,
        v_type.id,
        v_type.code,
        v_type.name,
        v_type.unit_price,
        v_type.financial_shorthand,
        v_qty,
        v_message,
        v_type.sort_order
      );
    end if;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public._sync_order_paid_addons_from_payload(uuid, jsonb)
  from public;

comment on function public._sync_order_paid_addons_from_payload(uuid, jsonb) is
  'Internal: server-authoritative paid-add-on sync. New lines snapshot active catalog; '
  'retained lines keep code/name/unit_price/financial_shorthand; client may change qty/message only.';

-- ---------------------------------------------------------------------------
-- 7) Focused sync RPC for Owner edit path
-- ---------------------------------------------------------------------------

create or replace function public.sync_guest_order_paid_addons(
  p_order_id uuid,
  p_paid_addons jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  order_row public.orders;
begin
  if p_order_id is null then
    raise exception 'Order is required';
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

  if order_row.status not in (
    'submitted',
    'pending_confirmation',
    'awaiting_payment',
    'paid'
  ) then
    raise exception 'This order can no longer be edited';
  end if;

  perform public._sync_order_paid_addons_from_payload(
    p_order_id,
    coalesce(p_paid_addons, '[]'::jsonb)
  );

  -- Touch orders so Realtime listeners refresh (parity with item sync).
  update public.orders o
  set updated_at = now()
  where o.id = p_order_id;
end;
$$;

revoke all on function public.sync_guest_order_paid_addons(uuid, jsonb) from public;
grant execute on function public.sync_guest_order_paid_addons(uuid, jsonb)
  to authenticated;

comment on function public.sync_guest_order_paid_addons(uuid, jsonb) is
  'Owner Order Workspace paid-add-on sync. Empty array clears add-ons. '
  'Server snapshots new lines from paid_addon_types; preserves snapshots on retain. '
  'Does not mutate cakes, complimentary, payments, or adjustments.';

-- ---------------------------------------------------------------------------
-- 8) Staff guest create — atomic paid add-ons (website submit unchanged)
-- ---------------------------------------------------------------------------

drop function if exists public.create_staff_guest_preorder(
  uuid, text, text, text, text, boolean, date, time, text, jsonb, jsonb,
  boolean, boolean, text, text, text
);

create or replace function public.create_staff_guest_preorder(
  p_actor_staff_id uuid,
  p_customer_name text,
  p_phone text,
  p_email text,
  p_order_source text,
  p_crew_order boolean,
  p_pickup_date date,
  p_pickup_time time,
  p_pickup_instruction text,
  p_items jsonb,
  p_complimentary jsonb,
  p_include_receipt boolean,
  p_needs_bakery_attention boolean,
  p_bakery_attention_note text,
  p_customer_notes text,
  p_internal_notes text,
  p_paid_addons jsonb default '[]'::jsonb
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
  complimentary jsonb;
  v_qty integer;
  v_cake_id uuid;
  v_size_id uuid;
  item_count integer := 0;
  addon_count integer := 0;
  v_email text;
  v_phone text;
  v_source text;
  v_attention_note text;
  v_pickup_instruction text;
  v_type_id uuid;
  v_comp_name text;
  v_comp_qty integer;
  v_comp_sort integer;
begin
  if p_actor_staff_id is null then
    raise exception 'Staff actor is required';
  end if;

  if not exists (
    select 1 from public.staff_profiles sp where sp.id = p_actor_staff_id
  ) then
    raise exception 'Staff actor not found';
  end if;

  if char_length(trim(coalesce(p_customer_name, ''))) = 0 then
    raise exception 'Customer name is required';
  end if;

  v_source := nullif(trim(coalesce(p_order_source, '')), '');
  if v_source is null then
    raise exception 'Order source is required';
  end if;
  if v_source = 'customer_website' then
    raise exception 'Staff-created orders cannot use customer_website source';
  end if;
  if v_source not in (
    'jotform',
    'whatsapp',
    'whitebird_instagram',
    'wee',
    'lex',
    'other',
    'walk_in',
    'last_minute'
  ) then
    raise exception 'Invalid order source';
  end if;

  if p_pickup_date is null or p_pickup_time is null then
    raise exception 'Pickup date and time are required';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one cake is required';
  end if;

  v_phone := nullif(trim(coalesce(p_phone, '')), '');
  v_email := nullif(trim(coalesce(p_email, '')), '');
  v_attention_note := nullif(trim(coalesce(p_bakery_attention_note, '')), '');
  v_pickup_instruction := nullif(trim(coalesce(p_pickup_instruction, '')), '');

  if coalesce(p_needs_bakery_attention, false) = false then
    v_attention_note := null;
  end if;

  -- collection_id is informational only for staff-created orders.
  -- Cake selection is Master Library (active/seasonal), not Collection membership.
  select c.*
  into active_collection
  from public.collections c
  where c.status = 'active'
  order by c.month desc
  limit 1;

  insert into public.orders (
    order_number,
    customer_id,
    guest_name,
    guest_phone,
    guest_email,
    fulfilment_method,
    pickup_date,
    pickup_time,
    pickup_instruction,
    status,
    payment_status,
    customer_notes,
    internal_notes,
    collection_id,
    confirmation_needs_resend,
    order_source,
    crew_order,
    include_receipt,
    needs_bakery_attention,
    bakery_attention_note,
    email_submission_receipt_requested,
    created_by,
    updated_by
  )
  values (
    public.allocate_order_number(),
    null,
    trim(p_customer_name),
    v_phone,
    v_email,
    'pickup',
    p_pickup_date,
    p_pickup_time,
    v_pickup_instruction,
    'submitted',
    'unpaid',
    nullif(trim(coalesce(p_customer_notes, '')), ''),
    nullif(trim(coalesce(p_internal_notes, '')), ''),
    active_collection.id,
    false,
    v_source,
    coalesce(p_crew_order, false),
    coalesce(p_include_receipt, false),
    coalesce(p_needs_bakery_attention, false),
    v_attention_note,
    false,
    p_actor_staff_id,
    p_actor_staff_id
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
    where lc.id = v_cake_id
      and lc.status in ('active', 'seasonal');
    if not found then
      raise exception 'Cake is not available in the Library';
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

  if p_complimentary is not null
     and jsonb_typeof(p_complimentary) = 'array' then
    for complimentary in select * from jsonb_array_elements(p_complimentary)
    loop
      v_comp_qty := coalesce((complimentary ->> 'quantity')::integer, 0);
      if v_comp_qty <= 0 then
        continue;
      end if;

      v_comp_name := nullif(trim(coalesce(complimentary ->> 'name', '')), '');
      if v_comp_name is null then
        raise exception 'Complimentary item name is required';
      end if;

      begin
        v_type_id := nullif(trim(coalesce(complimentary ->> 'type_id', '')), '')::uuid;
      exception
        when others then
          v_type_id := null;
      end;

      v_comp_sort := coalesce((complimentary ->> 'sort_order')::integer, 0);

      insert into public.order_complimentary_items (
        order_id,
        complimentary_item_type_id,
        name,
        quantity,
        sort_order
      )
      values (
        new_order.id,
        v_type_id,
        v_comp_name,
        v_comp_qty,
        v_comp_sort
      );
    end loop;
  end if;

  -- Paid add-ons: server-authoritative snapshots (atomic with order create).
  addon_count := public._sync_order_paid_addons_from_payload(
    new_order.id,
    coalesce(p_paid_addons, '[]'::jsonb)
  );

  insert into public.order_timeline_events (
    order_id,
    event_type,
    actor_staff_id,
    metadata
  )
  values (
    new_order.id,
    'staff_preorder_created',
    p_actor_staff_id,
    jsonb_build_object(
      'item_count', item_count,
      'paid_addon_count', addon_count,
      'order_source', v_source,
      'crew_order', coalesce(p_crew_order, false),
      'include_receipt', coalesce(p_include_receipt, false),
      'needs_bakery_attention', coalesce(p_needs_bakery_attention, false),
      'created_via', 'owner_staff'
    )
  );

  return new_order;
end;
$$;

revoke all on function public.create_staff_guest_preorder(
  uuid, text, text, text, text, boolean, date, time, text, jsonb, jsonb,
  boolean, boolean, text, text, text, jsonb
) from public;

grant execute on function public.create_staff_guest_preorder(
  uuid, text, text, text, text, boolean, date, time, text, jsonb, jsonb,
  boolean, boolean, text, text, text, jsonb
) to authenticated;

comment on function public.create_staff_guest_preorder(
  uuid, text, text, text, text, boolean, date, time, text, jsonb, jsonb,
  boolean, boolean, text, text, text, jsonb
) is
  'Owner staff-created guest preorder. Optional p_paid_addons (default []). '
  'Paid add-on lines are snapshotted server-side from active paid_addon_types. '
  'Website submit_guest_preorder is intentionally unchanged.';
