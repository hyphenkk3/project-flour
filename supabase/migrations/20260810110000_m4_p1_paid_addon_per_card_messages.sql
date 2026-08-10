-- M4-P1 Slice 3 Product correction — per-card messages + max quantity
-- Additive. Does NOT amend:
--   20260810090000_m4_p1_paid_order_addons.sql
--   20260810093000_m4_p1_revoke_internal_paid_addon_sync.sql
--
-- Commercial model unchanged: one order_paid_addons row per code with quantity.
-- Physical card messages live in order_paid_addon_messages (child slots).
-- Messages never affect money / August Promo / RM10.

-- ---------------------------------------------------------------------------
-- 1) Catalog: max_quantity (avoids hardcoding BC/WC in app/server)
-- ---------------------------------------------------------------------------

alter table public.paid_addon_types
  add column if not exists max_quantity integer not null default 3;

alter table public.paid_addon_types
  drop constraint if exists paid_addon_types_max_quantity_positive;

alter table public.paid_addon_types
  add constraint paid_addon_types_max_quantity_positive
  check (max_quantity >= 1);

comment on column public.paid_addon_types.max_quantity is
  'Maximum order-line quantity for this add-on type. P1 cards = 3. '
  'Enforced on create/sync; UI reads this rather than hardcoding codes.';

update public.paid_addon_types
set max_quantity = 3, updated_at = now()
where code in ('birthday_card', 'wishing_card');

-- ---------------------------------------------------------------------------
-- 2) Child slots: one row per physical card index (1..quantity), message nullable
-- ---------------------------------------------------------------------------

create table if not exists public.order_paid_addon_messages (
  id uuid primary key default gen_random_uuid(),
  order_paid_addon_id uuid not null
    references public.order_paid_addons (id) on delete cascade,
  card_index integer not null,
  written_message text,
  created_at timestamptz not null default now(),
  constraint order_paid_addon_messages_card_index_positive
    check (card_index >= 1),
  constraint order_paid_addon_messages_unique_slot
    unique (order_paid_addon_id, card_index)
);

create index if not exists order_paid_addon_messages_line_idx
  on public.order_paid_addon_messages (order_paid_addon_id, card_index);

comment on table public.order_paid_addon_messages is
  'Per-physical-card optional written messages for a commercial paid-add-on line. '
  'card_index is 1..quantity. Null/blank messages are allowed. '
  'Does not create additional commercial / financial lines.';

comment on column public.order_paid_addon_messages.card_index is
  '1-based physical card position within the parent commercial quantity.';

comment on column public.order_paid_addons.written_message is
  'DEPRECATED for new writes. Legacy single-message column retained for history. '
  'Authoritative per-card messages live in order_paid_addon_messages. '
  'Sync clears this column after migrating to child slots.';

-- ---------------------------------------------------------------------------
-- 3) RLS / grants (mirror parent order_paid_addons)
-- ---------------------------------------------------------------------------

alter table public.order_paid_addon_messages enable row level security;

drop policy if exists order_paid_addon_messages_authenticated_select
  on public.order_paid_addon_messages;
create policy order_paid_addon_messages_authenticated_select
  on public.order_paid_addon_messages
  for select
  to authenticated
  using (true);

drop policy if exists order_paid_addon_messages_authenticated_insert
  on public.order_paid_addon_messages;
create policy order_paid_addon_messages_authenticated_insert
  on public.order_paid_addon_messages
  for insert
  to authenticated
  with check (true);

drop policy if exists order_paid_addon_messages_authenticated_update
  on public.order_paid_addon_messages;
create policy order_paid_addon_messages_authenticated_update
  on public.order_paid_addon_messages
  for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists order_paid_addon_messages_authenticated_delete
  on public.order_paid_addon_messages;
create policy order_paid_addon_messages_authenticated_delete
  on public.order_paid_addon_messages
  for delete
  to authenticated
  using (true);

grant select, insert, update, delete on public.order_paid_addon_messages
  to authenticated;

-- ---------------------------------------------------------------------------
-- 4) Backfill: legacy written_message → Card 1 slot (exactly quantity slots)
-- ---------------------------------------------------------------------------

-- Ensure every existing commercial line has card_index 1..quantity rows.
insert into public.order_paid_addon_messages (
  order_paid_addon_id,
  card_index,
  written_message
)
select
  opa.id,
  gs.card_index,
  case
    when gs.card_index = 1 then nullif(trim(coalesce(opa.written_message, '')), '')
    else null
  end
from public.order_paid_addons opa
cross join lateral generate_series(1, opa.quantity) as gs(card_index)
on conflict (order_paid_addon_id, card_index) do nothing;

-- Clear deprecated parent column after backfill (canonical = child slots).
update public.order_paid_addons
set written_message = null
where written_message is not null;

-- ---------------------------------------------------------------------------
-- 5) Replace sync helper: max qty + messages[] + child slot sync
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
  v_max_qty integer;
  v_type public.paid_addon_types;
  v_existing public.order_paid_addons;
  v_line_id uuid;
  v_seen text[] := array[]::text[];
  v_count integer := 0;
  v_messages jsonb;
  v_msg text;
  v_idx integer;
  v_len integer;
begin
  if p_paid_addons is null then
    p_paid_addons := '[]'::jsonb;
  end if;

  if jsonb_typeof(p_paid_addons) <> 'array' then
    raise exception 'Paid add-ons payload must be a JSON array';
  end if;

  -- Remove lines not present in the incoming set (full replace of membership).
  -- Child messages cascade-delete with the commercial line.
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

    -- Resolve max quantity from catalog (active preferred; inactive ok for retain).
    select *
    into v_type
    from public.paid_addon_types t
    where t.code = v_code
    order by case when t.is_active then 0 else 1 end
    limit 1;

    if found then
      v_max_qty := v_type.max_quantity;
    else
      v_max_qty := 3;
    end if;

    if v_qty > v_max_qty then
      raise exception
        'Paid add-on quantity for % may not exceed %',
        v_code,
        v_max_qty;
    end if;

    -- messages: preferred array (index 0 = Card 1). Legacy written_message → Card 1.
    if addon ? 'messages' and jsonb_typeof(addon -> 'messages') = 'array' then
      v_messages := addon -> 'messages';
    elsif addon ? 'written_message' then
      v_messages := jsonb_build_array(addon -> 'written_message');
    else
      v_messages := '[]'::jsonb;
    end if;

    select *
    into v_existing
    from public.order_paid_addons opa
    where opa.order_id = p_order_id
      and opa.code = v_code;

    if found then
      -- EXISTING: preserve snapshots; allow quantity only on commercial line.
      update public.order_paid_addons opa
      set
        quantity = v_qty,
        written_message = null
      where opa.id = v_existing.id
      returning opa.id into v_line_id;
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

      if v_qty > v_type.max_quantity then
        raise exception
          'Paid add-on quantity for % may not exceed %',
          v_code,
          v_type.max_quantity;
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
        null,
        v_type.sort_order
      )
      returning id into v_line_id;
    end if;

    -- Drop slots above new quantity (no resurrection later).
    delete from public.order_paid_addon_messages m
    where m.order_paid_addon_id = v_line_id
      and m.card_index > v_qty;

    -- Upsert exactly quantity slots (including null messages).
    v_len := coalesce(jsonb_array_length(v_messages), 0);
    for v_idx in 1..v_qty
    loop
      if v_idx <= v_len then
        -- Element may be a JSON string or { written_message / message }.
        if jsonb_typeof(v_messages -> (v_idx - 1)) = 'object' then
          v_msg := nullif(
            trim(
              coalesce(
                v_messages -> (v_idx - 1) ->> 'written_message',
                v_messages -> (v_idx - 1) ->> 'message',
                ''
              )
            ),
            ''
          );
        else
          v_msg := nullif(trim(coalesce(v_messages ->> (v_idx - 1), '')), '');
        end if;
      else
        v_msg := null;
      end if;

      insert into public.order_paid_addon_messages (
        order_paid_addon_id,
        card_index,
        written_message
      )
      values (v_line_id, v_idx, v_msg)
      on conflict (order_paid_addon_id, card_index)
      do update set written_message = excluded.written_message;
    end loop;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public._sync_order_paid_addons_from_payload(uuid, jsonb)
  from public;

comment on function public._sync_order_paid_addons_from_payload(uuid, jsonb) is
  'Full-membership sync for order_paid_addons. Server snapshots new lines from '
  'paid_addon_types; retains price/name/shorthand for kept codes. '
  'Enforces catalog max_quantity. Payload messages[] (or legacy written_message) '
  'syncs order_paid_addon_messages slots 1..quantity; higher slots are deleted.';
