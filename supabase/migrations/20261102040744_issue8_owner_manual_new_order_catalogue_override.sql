-- Issue #8: narrowly scoped Owner exception for manual New Order catalogue
-- choices. Customer checkout, Fresh Pick, and existing order edits keep their
-- existing availability checks. All order snapshots remain database-derived.

create schema if not exists issue8_private;
alter schema issue8_private owner to postgres;
revoke all on schema issue8_private from public, anon, authenticated, service_role;

create table if not exists issue8_private.owner_manual_order_context (
  backend_pid integer not null,
  transaction_id bigint not null,
  owner_auth_user_id uuid not null,
  owner_staff_id uuid not null,
  primary key (backend_pid, transaction_id)
);
alter table issue8_private.owner_manual_order_context owner to postgres;
revoke all on issue8_private.owner_manual_order_context from public, anon, authenticated, service_role;

create or replace function public.issue8_owner_manual_catalog_context(
  p_order_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from issue8_private.owner_manual_order_context c
    join public.orders o on o.id = p_order_id
    join public.staff_profiles sp
      on sp.id = c.owner_staff_id
     and sp.auth_user_id = c.owner_auth_user_id
    join public.roles r on r.id = sp.role_id
    where c.backend_pid = pg_catalog.pg_backend_pid()
      and c.transaction_id = pg_catalog.txid_current()
      and c.owner_auth_user_id = (select auth.uid())
      and o.created_by = c.owner_staff_id
      and sp.is_active = true
      and sp.archived_at is null
      and r.code = 'owner'
  );
$$;
alter function public.issue8_owner_manual_catalog_context(uuid) owner to postgres;
revoke all on function public.issue8_owner_manual_catalog_context(uuid)
  from public, anon, authenticated, service_role;

-- The context is a private, transaction-local database row, not a caller-set
-- GUC. The public wrapper is the only path that creates it, and independently
-- verifies both auth.uid() and the active, unarchived Owner profile.
create or replace function public.create_owner_manual_guest_preorder_with_catalogue_override(
  p_actor_staff_id uuid,
  p_customer_name text,
  p_phone text,
  p_email text,
  p_order_source text,
  p_order_source_other text,
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
  p_paid_addons jsonb default '[]'::jsonb,
  p_fulfilment_method public.fulfilment_method default 'pickup',
  p_delivery jsonb default null,
  p_dine_in jsonb default null
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth_user_id uuid := (select auth.uid());
  v_order public.orders;
begin
  if v_auth_user_id is null or p_actor_staff_id is null or not exists (
    select 1
    from public.staff_profiles sp
    join public.roles r on r.id = sp.role_id
    where sp.auth_user_id = v_auth_user_id
      and sp.id = p_actor_staff_id
      and sp.is_active = true
      and sp.archived_at is null
      and r.code = 'owner'
  ) then
    raise exception using errcode = '42501', message = 'Active Owner authorization is required for manual catalogue overrides';
  end if;

  insert into issue8_private.owner_manual_order_context (
    backend_pid, transaction_id, owner_auth_user_id, owner_staff_id
  ) values (
    pg_catalog.pg_backend_pid(), pg_catalog.txid_current(), v_auth_user_id, p_actor_staff_id
  );

  v_order := public.create_staff_guest_preorder_with_source_detail(
    p_actor_staff_id, p_customer_name, p_phone, p_email, p_order_source,
    p_order_source_other, p_crew_order, p_pickup_date, p_pickup_time,
    p_pickup_instruction, p_items, p_complimentary, p_include_receipt,
    p_needs_bakery_attention, p_bakery_attention_note, p_customer_notes,
    p_internal_notes, p_paid_addons, p_fulfilment_method, p_delivery, p_dine_in
  );

  delete from issue8_private.owner_manual_order_context
  where backend_pid = pg_catalog.pg_backend_pid()
    and transaction_id = pg_catalog.txid_current()
    and owner_auth_user_id = v_auth_user_id
    and owner_staff_id = p_actor_staff_id;

  return v_order;
end;
$$;
alter function public.create_owner_manual_guest_preorder_with_catalogue_override(
  uuid, text, text, text, text, text, boolean, date, time, text,
  jsonb, jsonb, boolean, boolean, text, text, text, jsonb,
  public.fulfilment_method, jsonb, jsonb
) owner to postgres;
revoke all on function public.create_owner_manual_guest_preorder_with_catalogue_override(
  uuid, text, text, text, text, text, boolean, date, time, text,
  jsonb, jsonb, boolean, boolean, text, text, text, jsonb,
  public.fulfilment_method, jsonb, jsonb
) from public, anon, service_role;
grant execute on function public.create_owner_manual_guest_preorder_with_catalogue_override(
  uuid, text, text, text, text, text, boolean, date, time, text,
  jsonb, jsonb, boolean, boolean, text, text, text, jsonb,
  public.fulfilment_method, jsonb, jsonb
) to authenticated;

-- Reconcile the paid sync body surgically. Only the new-order transaction
-- context may bypass collection/date/selectability/active filters; canonical
-- item values and maximum quantities still come from the database.
do $owner_manual_paid_sync$
declare
  v_sig regprocedure := 'public._sync_order_paid_addons_from_payload(uuid,jsonb)'::regprocedure;
  v_def text;
  v_old text := E'      select t.*\n      into v_type\n      from public.paid_addon_types t\n      where t.code = v_code\n        and t.is_active = true\n        and exists (\n          select 1 from public.orders o\n          join public.collection_paid_addon_types m\n            on m.collection_id = (public.storefront_collection_for_pickup_date(o.pickup_date)).id\n           and m.paid_addon_type_id = t.id\n          where o.id = p_order_id\n            and m.is_available\n            and (coalesce(auth.jwt() ->> ''role'', ''anon'') = ''service_role'' or public.issue8_is_active_staff() or m.customer_selectable)\n            and (m.available_from is null or o.pickup_date >= m.available_from)\n            and (m.available_until is null or o.pickup_date <= m.available_until)\n        );';
  v_new text := E'      select t.*\n      into v_type\n      from public.paid_addon_types t\n      where t.code = v_code\n        and (\n          public.issue8_owner_manual_catalog_context(p_order_id)\n          or (\n            t.is_active = true\n            and exists (\n              select 1 from public.orders o\n              join public.collection_paid_addon_types m\n                on m.collection_id = (public.storefront_collection_for_pickup_date(o.pickup_date)).id\n               and m.paid_addon_type_id = t.id\n              where o.id = p_order_id\n                and m.is_available\n                and (coalesce(auth.jwt() ->> ''role'', ''anon'') = ''service_role'' or public.issue8_is_active_staff() or m.customer_selectable)\n                and (m.available_from is null or o.pickup_date >= m.available_from)\n                and (m.available_until is null or o.pickup_date <= m.available_until)\n            )\n          )\n        );';
  v_count integer;
  v_owner name;
  v_secdef boolean;
  v_config text[];
  v_acl text;
begin
  select r.rolname, p.prosecdef, p.proconfig, p.proacl::text
    into v_owner, v_secdef, v_config, v_acl
  from pg_catalog.pg_proc p
  join pg_catalog.pg_roles r on r.oid = p.proowner
  where p.oid = v_sig;
  if v_owner is distinct from 'postgres'
     or v_secdef is distinct from true
     or v_config is distinct from array['search_path=public']::text[] then
    raise exception 'Paid add-on sync identity differs from the reviewed Issue #8 implementation';
  end if;
  v_def := pg_catalog.pg_get_functiondef(v_sig);
  v_count := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
  if v_count <> 1 then
    raise exception 'Paid add-on sync eligibility anchor differs from the reviewed Issue #8 implementation';
  end if;
  execute replace(v_def, v_old, v_new);
  if (select p.proowner from pg_catalog.pg_proc p where p.oid = v_sig)
       is distinct from (select oid from pg_catalog.pg_roles where rolname = 'postgres')
     or not (select prosecdef from pg_catalog.pg_proc where oid = v_sig)
     or (select proconfig from pg_catalog.pg_proc where oid = v_sig) is distinct from array['search_path=public']::text[]
     or (select proacl::text from pg_catalog.pg_proc where oid = v_sig) is distinct from v_acl then
    raise exception 'Paid add-on sync ownership, security mode, search path, or grants changed';
  end if;
end;
$owner_manual_paid_sync$;

-- Complimentary order lines retain the existing restriction everywhere except
-- the verified Owner manual New Order transaction. Names are always canonical.
create or replace function public._issue8_validate_complimentary_order_line()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_date date;
  v_collection_id uuid;
  v_name text;
  v_sort integer;
  v_owner_override boolean;
begin
  if tg_op = 'UPDATE' and new.complimentary_item_type_id is not distinct from old.complimentary_item_type_id then
    return new;
  end if;
  if new.complimentary_item_type_id is null then return new; end if;
  select o.pickup_date,
         (public.storefront_collection_for_pickup_date(o.pickup_date)).id
    into v_date, v_collection_id
  from public.orders o where o.id = new.order_id;
  if not found then raise exception 'Complimentary item requires a valid order'; end if;

  v_owner_override := public.issue8_owner_manual_catalog_context(new.order_id);
  if v_owner_override then
    select t.name, coalesce(m.sort_order, new.sort_order)
      into v_name, v_sort
    from public.complimentary_item_types t
    left join public.collection_complimentary_items m
      on m.complimentary_item_type_id = t.id
     and m.collection_id = v_collection_id
    where t.id = new.complimentary_item_type_id;
  else
    if v_date is null or v_collection_id is null then
      raise exception 'Complimentary item requires a valid order collection and date';
    end if;
    select t.name, m.sort_order into v_name, v_sort
    from public.complimentary_item_types t
    join public.collection_complimentary_items m on m.complimentary_item_type_id = t.id
    where t.id = new.complimentary_item_type_id
      and t.is_active and m.collection_id = v_collection_id and m.is_available
      and (m.available_from is null or v_date >= m.available_from)
      and (m.available_until is null or v_date <= m.available_until)
      and (coalesce(auth.jwt() ->> 'role', 'anon') = 'service_role'
           or public.issue8_is_active_staff() or m.customer_selectable);
  end if;
  if not found then raise exception 'Complimentary item is not available for this collection and date'; end if;
  new.name := v_name;
  new.sort_order := v_sort;
  return new;
end;
$$;
alter function public._issue8_validate_complimentary_order_line() owner to postgres;
revoke all on function public._issue8_validate_complimentary_order_line() from public, anon, authenticated, service_role;

-- Paid order lines remain immutable on update. On insert, the scoped Owner
-- path may select inactive/unmapped items, while price/name/shorthand and max
-- quantity continue to be authoritative in the database.
create or replace function public._issue8_validate_paid_addon_order_line()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_date date;
  v_collection_id uuid;
  v_type public.paid_addon_types;
  v_max_quantity integer;
  v_owner_override boolean;
begin
  if tg_op = 'UPDATE' then
    if new.paid_addon_type_id is distinct from old.paid_addon_type_id
       or new.code is distinct from old.code or new.name is distinct from old.name
       or new.unit_price is distinct from old.unit_price
       or new.financial_shorthand is distinct from old.financial_shorthand then
      raise exception 'Paid add-on order snapshots cannot be rewritten';
    end if;
    select p.max_quantity into v_max_quantity from public.paid_addon_types p where p.id = old.paid_addon_type_id;
    if found and new.quantity > v_max_quantity then raise exception 'Paid add-on quantity exceeds the catalogue limit'; end if;
    return new;
  end if;
  if new.quantity < 1 then raise exception 'Paid add-on quantity must be positive'; end if;
  select o.pickup_date,
         (public.storefront_collection_for_pickup_date(o.pickup_date)).id
    into v_date, v_collection_id
  from public.orders o where o.id = new.order_id;
  if not found then raise exception 'Paid add-on requires a valid order'; end if;
  v_owner_override := public.issue8_owner_manual_catalog_context(new.order_id);
  if v_owner_override then
    select p.* into v_type from public.paid_addon_types p where p.code = new.code;
  else
    if v_date is null or v_collection_id is null then
      raise exception 'Paid add-on requires a valid order collection and date';
    end if;
    select p.* into v_type
    from public.paid_addon_types p
    join public.collection_paid_addon_types m on m.paid_addon_type_id = p.id
    where p.code = new.code and p.is_active
      and m.collection_id = v_collection_id and m.is_available
      and (m.available_from is null or v_date >= m.available_from)
      and (m.available_until is null or v_date <= m.available_until)
      and (coalesce(auth.jwt() ->> 'role', 'anon') = 'service_role'
           or public.issue8_is_active_staff() or m.customer_selectable);
  end if;
  if not found then raise exception 'Paid add-on is not available for this collection and date'; end if;
  if new.quantity > v_type.max_quantity then raise exception 'Paid add-on quantity exceeds the catalogue limit'; end if;
  new.paid_addon_type_id := v_type.id;
  new.code := v_type.code;
  new.name := v_type.name;
  new.unit_price := v_type.unit_price;
  new.financial_shorthand := v_type.financial_shorthand;
  new.sort_order := v_type.sort_order;
  return new;
end;
$$;
alter function public._issue8_validate_paid_addon_order_line() owner to postgres;
revoke all on function public._issue8_validate_paid_addon_order_line() from public, anon, authenticated, service_role;
