-- Issue #8 Phase 2B: managed complimentary items and paid add-ons.
-- Additive only. Do not apply until isolated Production-equivalent rehearsal
-- and the separately authorized DEV migration gate pass.

alter table public.complimentary_item_types
  add column if not exists is_active boolean not null default true;

alter table public.collection_complimentary_items
  add column if not exists available_from date,
  add column if not exists available_until date;

alter table public.collection_complimentary_items
  drop constraint if exists collection_complimentary_items_season_order;
alter table public.collection_complimentary_items
  add constraint collection_complimentary_items_season_order
  check (available_from is null or available_until is null or available_from <= available_until);

create table if not exists public.collection_paid_addon_types (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.collections(id) on delete cascade,
  paid_addon_type_id uuid not null references public.paid_addon_types(id) on delete cascade,
  is_available boolean not null default true,
  customer_selectable boolean not null default true,
  sort_order integer not null default 0,
  available_from date,
  available_until date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint collection_paid_addon_types_unique unique (collection_id, paid_addon_type_id),
  constraint collection_paid_addon_types_season_order
    check (available_from is null or available_until is null or available_from <= available_until)
);

create index if not exists collection_paid_addon_types_collection_sort_idx
  on public.collection_paid_addon_types (collection_id, is_available, sort_order);

drop trigger if exists collection_paid_addon_types_set_updated_at
  on public.collection_paid_addon_types;
create trigger collection_paid_addon_types_set_updated_at
before update on public.collection_paid_addon_types
for each row execute function public.set_updated_at();

-- Before this migration paid cards were globally selectable in every collection.
-- Seed equivalent mappings, without overwriting any mapping already configured.
insert into public.collection_paid_addon_types (
  collection_id, paid_addon_type_id, is_available, customer_selectable, sort_order
)
select c.id, p.id, true, true, p.sort_order
from public.collections c
cross join public.paid_addon_types p
where p.is_active
on conflict (collection_id, paid_addon_type_id) do nothing;

alter table public.collection_paid_addon_types enable row level security;
drop policy if exists collection_paid_addon_types_authenticated_select
  on public.collection_paid_addon_types;
create policy collection_paid_addon_types_authenticated_select
  on public.collection_paid_addon_types for select to authenticated using (true);
grant select on public.collection_paid_addon_types to authenticated;

-- The helper is deliberately database-authoritative. A manager is not an Owner.
create or replace function public.issue8_is_active_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.staff_profiles sp
    join public.roles r on r.id = sp.role_id
    where sp.auth_user_id = (select auth.uid())
      and sp.is_active = true
      and sp.archived_at is null
      and r.code = 'owner'
  );
$$;
revoke all on function public.issue8_is_active_owner() from public, anon;
grant execute on function public.issue8_is_active_owner() to authenticated;

create or replace function public.issue8_is_active_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.staff_profiles sp
    where sp.auth_user_id = (select auth.uid())
      and sp.is_active = true
      and sp.archived_at is null
  );
$$;
revoke all on function public.issue8_is_active_staff() from public, anon, service_role;
grant execute on function public.issue8_is_active_staff() to authenticated;

drop policy if exists complimentary_item_types_authenticated_write
  on public.complimentary_item_types;
create policy complimentary_item_types_owner_insert
  on public.complimentary_item_types for insert to authenticated
  with check (public.issue8_is_active_owner());
create policy complimentary_item_types_owner_update
  on public.complimentary_item_types for update to authenticated
  using (public.issue8_is_active_owner())
  with check (public.issue8_is_active_owner());

drop policy if exists collection_complimentary_items_authenticated_write
  on public.collection_complimentary_items;
create policy collection_complimentary_items_owner_insert
  on public.collection_complimentary_items for insert to authenticated
  with check (public.issue8_is_active_owner());
create policy collection_complimentary_items_owner_update
  on public.collection_complimentary_items for update to authenticated
  using (public.issue8_is_active_owner())
  with check (public.issue8_is_active_owner());

drop policy if exists paid_addon_types_owner_write on public.paid_addon_types;
create policy paid_addon_types_owner_insert
  on public.paid_addon_types for insert to authenticated
  with check (public.issue8_is_active_owner());
create policy paid_addon_types_owner_update
  on public.paid_addon_types for update to authenticated
  using (public.issue8_is_active_owner())
  with check (public.issue8_is_active_owner());

drop policy if exists collection_paid_addon_types_owner_write
  on public.collection_paid_addon_types;
create policy collection_paid_addon_types_owner_insert
  on public.collection_paid_addon_types for insert to authenticated
  with check (public.issue8_is_active_owner());
create policy collection_paid_addon_types_owner_update
  on public.collection_paid_addon_types for update to authenticated
  using (public.issue8_is_active_owner())
  with check (public.issue8_is_active_owner());

-- One atomic Owner-only save endpoint handles either independently managed
-- catalogue. Unassigned prior mappings are deactivated rather than deleted.
create or replace function public.owner_save_addon_catalogue_item(
  p_kind text,
  p_item jsonb,
  p_collection_assignments jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_collection_id uuid;
  v_assignment jsonb;
  v_code text;
  v_name text;
  v_active boolean;
  v_price numeric(10,2);
  v_shorthand text;
  v_max_quantity integer;
  v_sort_order integer;
  v_from date;
  v_until date;
begin
  if not public.issue8_is_active_owner() then
    raise exception 'Active Owner authorization is required';
  end if;
  if p_kind is null or p_kind not in ('complimentary', 'paid') then
    raise exception 'Unknown add-on catalogue';
  end if;
  if jsonb_typeof(p_item) is distinct from 'object'
     or jsonb_typeof(coalesce(p_collection_assignments, '[]'::jsonb)) is distinct from 'array' then
    raise exception 'Invalid catalogue payload';
  end if;

  v_id := nullif(p_item ->> 'id', '')::uuid;
  v_code := lower(trim(coalesce(p_item ->> 'code', '')));
  v_name := trim(coalesce(p_item ->> 'name', ''));
  v_active := coalesce((p_item ->> 'is_active')::boolean, false);
  v_sort_order := coalesce((p_item ->> 'sort_order')::integer, 0);
  if v_code !~ '^[a-z0-9]+(_[a-z0-9]+)*$' or v_name = '' then
    raise exception 'Enter a valid code and name';
  end if;

  if p_kind = 'complimentary' then
    if v_id is null then
      insert into public.complimentary_item_types(code, name, is_active)
      values (v_code, v_name, v_active) returning id into v_id;
    else
      update public.complimentary_item_types
      set code = v_code, name = v_name, is_active = v_active
      where id = v_id;
      if not found then raise exception 'Complimentary item not found'; end if;
    end if;

    update public.collection_complimentary_items
    set is_available = false
    where complimentary_item_type_id = v_id
      and collection_id not in (
        select (x ->> 'collection_id')::uuid
        from jsonb_array_elements(coalesce(p_collection_assignments, '[]'::jsonb)) x
      );

    for v_assignment in select value from jsonb_array_elements(coalesce(p_collection_assignments, '[]'::jsonb))
    loop
      v_collection_id := (v_assignment ->> 'collection_id')::uuid;
      v_from := nullif(v_assignment ->> 'available_from', '')::date;
      v_until := nullif(v_assignment ->> 'available_until', '')::date;
      if v_from is not null and v_until is not null and v_from > v_until then
        raise exception 'Season end must be on or after the start date';
      end if;
      if not exists (select 1 from public.collections c where c.id = v_collection_id) then
        raise exception 'Collection not found';
      end if;
      insert into public.collection_complimentary_items(
        collection_id, complimentary_item_type_id, is_available, is_default,
        customer_selectable, default_quantity, sort_order, available_from, available_until
      ) values (
        v_collection_id, v_id,
        coalesce((v_assignment ->> 'is_available')::boolean, false),
        coalesce((v_assignment ->> 'is_default')::boolean, false),
        coalesce((v_assignment ->> 'customer_selectable')::boolean, false),
        coalesce((v_assignment ->> 'default_quantity')::integer, 1),
        coalesce((v_assignment ->> 'sort_order')::integer, v_sort_order),
        v_from, v_until
      ) on conflict (collection_id, complimentary_item_type_id) do update set
        is_available = excluded.is_available,
        is_default = excluded.is_default,
        customer_selectable = excluded.customer_selectable,
        default_quantity = excluded.default_quantity,
        sort_order = excluded.sort_order,
        available_from = excluded.available_from,
        available_until = excluded.available_until;
    end loop;
  else
    v_price := (p_item ->> 'unit_price')::numeric;
    v_shorthand := trim(coalesce(p_item ->> 'financial_shorthand', ''));
    v_max_quantity := coalesce((p_item ->> 'max_quantity')::integer, 1);
    if v_price is null or v_price < 0 or v_shorthand = '' or v_max_quantity < 1 then
      raise exception 'Enter a non-negative price, shorthand, and positive quantity limit';
    end if;
    if v_id is null then
      insert into public.paid_addon_types(
        code, name, unit_price, financial_shorthand, is_active, sort_order, max_quantity
      ) values (v_code, v_name, v_price, v_shorthand, v_active, v_sort_order, v_max_quantity)
      returning id into v_id;
    else
      update public.paid_addon_types
      set code = v_code, name = v_name, unit_price = v_price,
          financial_shorthand = v_shorthand, is_active = v_active,
          sort_order = v_sort_order, max_quantity = v_max_quantity, updated_at = now()
      where id = v_id;
      if not found then raise exception 'Paid add-on not found'; end if;
    end if;

    update public.collection_paid_addon_types
    set is_available = false
    where paid_addon_type_id = v_id
      and collection_id not in (
        select (x ->> 'collection_id')::uuid
        from jsonb_array_elements(coalesce(p_collection_assignments, '[]'::jsonb)) x
      );

    for v_assignment in select value from jsonb_array_elements(coalesce(p_collection_assignments, '[]'::jsonb))
    loop
      v_collection_id := (v_assignment ->> 'collection_id')::uuid;
      v_from := nullif(v_assignment ->> 'available_from', '')::date;
      v_until := nullif(v_assignment ->> 'available_until', '')::date;
      if v_from is not null and v_until is not null and v_from > v_until then
        raise exception 'Season end must be on or after the start date';
      end if;
      if not exists (select 1 from public.collections c where c.id = v_collection_id) then
        raise exception 'Collection not found';
      end if;
      insert into public.collection_paid_addon_types(
        collection_id, paid_addon_type_id, is_available, customer_selectable,
        sort_order, available_from, available_until
      ) values (
        v_collection_id, v_id,
        coalesce((v_assignment ->> 'is_available')::boolean, false),
        coalesce((v_assignment ->> 'customer_selectable')::boolean, false),
        coalesce((v_assignment ->> 'sort_order')::integer, v_sort_order),
        v_from, v_until
      ) on conflict (collection_id, paid_addon_type_id) do update set
        is_available = excluded.is_available,
        customer_selectable = excluded.customer_selectable,
        sort_order = excluded.sort_order,
        available_from = excluded.available_from,
        available_until = excluded.available_until;
    end loop;
  end if;
  return v_id;
end;
$$;
revoke all on function public.owner_save_addon_catalogue_item(text, jsonb, jsonb) from public, anon, service_role;
grant execute on function public.owner_save_addon_catalogue_item(text, jsonb, jsonb) to authenticated;

-- Date-aware options are a new overload; the legacy UUID-only contract remains.
create or replace function public.storefront_customer_preorder_options(
  p_collection_id uuid,
  p_fulfilment_date date
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'complimentary', coalesce((
      select jsonb_agg(jsonb_build_object(
        'typeId', cit.id, 'code', cit.code, 'name', cit.name,
        'sortOrder', cci.sort_order, 'defaultQuantity', cci.default_quantity
      ) order by cci.sort_order, cit.name)
      from public.collection_complimentary_items cci
      join public.complimentary_item_types cit on cit.id = cci.complimentary_item_type_id
      where cci.collection_id = p_collection_id
        and p_fulfilment_date is not null
        and cit.is_active
        and cci.is_available
        and cci.customer_selectable
        and (cci.available_from is null or p_fulfilment_date >= cci.available_from)
        and (cci.available_until is null or p_fulfilment_date <= cci.available_until)
    ), '[]'::jsonb),
    'paidAddons', coalesce((
      select jsonb_agg(jsonb_build_object(
        'code', p.code, 'name', p.name, 'unitPrice', p.unit_price,
        'financialShorthand', p.financial_shorthand,
        'maxQuantity', p.max_quantity, 'sortOrder', m.sort_order
      ) order by m.sort_order, p.code)
      from public.collection_paid_addon_types m
      join public.paid_addon_types p on p.id = m.paid_addon_type_id
      where m.collection_id = p_collection_id
        and p_fulfilment_date is not null
        and m.is_available and m.customer_selectable and p.is_active
        and (m.available_from is null or p_fulfilment_date >= m.available_from)
        and (m.available_until is null or p_fulfilment_date <= m.available_until)
    ), '[]'::jsonb)
  );
$$;
revoke all on function public.storefront_customer_preorder_options(uuid, date) from public;
grant execute on function public.storefront_customer_preorder_options(uuid, date) to anon, authenticated;

-- The legacy UUID-only RPC remains callable by older application releases. It
-- deliberately returns only non-seasonal items because it has no date input.
-- This keeps a migration-first release and immediate app rollback safe.
create or replace function public.storefront_customer_preorder_options(
  p_collection_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_complimentary jsonb;
  v_paid jsonb;
begin
  if p_collection_id is null then
    return jsonb_build_object('complimentary', '[]'::jsonb, 'paidAddons', '[]'::jsonb);
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'typeId', cit.id, 'code', cit.code, 'name', cit.name, 'sortOrder', cci.sort_order
  ) order by cci.sort_order, cit.name), '[]'::jsonb)
  into v_complimentary
  from public.collection_complimentary_items cci
  join public.complimentary_item_types cit on cit.id = cci.complimentary_item_type_id
  where cci.collection_id = p_collection_id
    and cit.is_active and cci.is_available and cci.customer_selectable
    and cci.available_from is null and cci.available_until is null;
  select coalesce(jsonb_agg(jsonb_build_object(
    'code', t.code, 'name', t.name, 'unitPrice', t.unit_price,
    'financialShorthand', t.financial_shorthand, 'sortOrder', m.sort_order
  ) order by t.sort_order, t.code), '[]'::jsonb)
  into v_paid
  from public.paid_addon_types t
  join public.collection_paid_addon_types m on m.paid_addon_type_id = t.id
  where m.collection_id = p_collection_id
    and m.is_available and m.customer_selectable
    and m.available_from is null and m.available_until is null
    and t.is_active and t.code in ('birthday_card', 'wishing_card');
  return jsonb_build_object(
    'complimentary', coalesce(v_complimentary, '[]'::jsonb),
    'paidAddons', coalesce(v_paid, '[]'::jsonb)
  );
end;
$$;
revoke all on function public.storefront_customer_preorder_options(uuid) from public;
grant execute on function public.storefront_customer_preorder_options(uuid) to anon, authenticated;

-- Guard complimentary snapshots at the database boundary. Existing order rows
-- remain untouched; a newly selected type is resolved from the order's date.
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
  v_actor_role text := coalesce(auth.jwt() ->> 'role', 'anon');
begin
  if tg_op = 'UPDATE' and new.complimentary_item_type_id is not distinct from old.complimentary_item_type_id then
    return new;
  end if;
  if new.complimentary_item_type_id is null then return new; end if;
  select o.pickup_date,
         (public.storefront_collection_for_pickup_date(o.pickup_date)).id
  into v_date, v_collection_id
  from public.orders o where o.id = new.order_id;
  if not found or v_date is null or v_collection_id is null then
    raise exception 'Complimentary item requires a valid order collection and date';
  end if;
  select t.name, m.sort_order into v_name, v_sort
  from public.complimentary_item_types t
  join public.collection_complimentary_items m on m.complimentary_item_type_id = t.id
  where t.id = new.complimentary_item_type_id
    and t.is_active and m.collection_id = v_collection_id and m.is_available
    and (m.available_from is null or v_date >= m.available_from)
    and (m.available_until is null or v_date <= m.available_until)
    and (v_actor_role = 'service_role' or public.issue8_is_active_staff() or m.customer_selectable);
  if not found then raise exception 'Complimentary item is not available for this collection and date'; end if;
  new.name := v_name;
  new.sort_order := v_sort;
  return new;
end;
$$;
revoke all on function public._issue8_validate_complimentary_order_line() from public, anon, authenticated, service_role;
drop trigger if exists issue8_validate_complimentary_order_line on public.order_complimentary_items;
create trigger issue8_validate_complimentary_order_line
before insert or update of complimentary_item_type_id on public.order_complimentary_items
for each row execute function public._issue8_validate_complimentary_order_line();

-- Surgical, drift-checked patches remove the old hard-coded complimentary
-- allowlist from the supported order submission functions. The legacy 10-arg
-- Fresh Pick overload is present on the Production-derived starting state and
-- absent on current DEV. Support exactly those two states; reject other drift.
DO $issue8_patch$
DECLARE
  v_preorder oid := to_regprocedure('public.submit_guest_preorder(text,text,text,date,time without time zone,text,jsonb,boolean,jsonb,jsonb,boolean,public.fulfilment_method,jsonb,jsonb,jsonb,jsonb)')::oid;
  v_legacy oid := to_regprocedure('public.submit_guest_extra_order(text,text,text,date,time without time zone,text,uuid,boolean,boolean,jsonb)')::oid;
  v_extended oid := to_regprocedure('public.submit_guest_extra_order(text,text,text,date,time without time zone,text,uuid,boolean,boolean,jsonb,jsonb,uuid[],public.fulfilment_method,jsonb,jsonb,jsonb)')::oid;
  v_oid oid;
  v_def text;
  v_old text := 'cit.code in (''birthday_topper'', ''candle'', ''knife'')';
  v_old_paid text := 'v_addon_code not in (''birthday_card'', ''wishing_card'')';
  v_new text := 'cit.is_active = true';
  v_count integer;
  v_proname text;
  v_nargs smallint;
  v_legacy_body_md5 text;
  v_owner name;
  v_secdef boolean;
  v_config text[];
BEGIN
  IF v_preorder IS NULL OR v_extended IS NULL THEN
    RAISE EXCEPTION 'Required Preorder or extended Fresh Pick submission signature is missing';
  END IF;

  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='submit_guest_extra_order')
     <> (CASE WHEN v_legacy IS NULL THEN 1 ELSE 2 END) THEN
    RAISE EXCEPTION 'Unexpected Fresh Pick overload set; refusing catalogue migration';
  END IF;

  -- Validate the optional legacy overload against the verified Production
  -- definition before changing it. Current DEV intentionally has no such RPC.
  IF v_legacy IS NOT NULL THEN
    SELECT md5(pg_get_functiondef(p.oid)), r.rolname, p.prosecdef, p.proconfig
      INTO v_legacy_body_md5, v_owner, v_secdef, v_config
    FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner WHERE p.oid=v_legacy;
    IF v_legacy_body_md5 IS DISTINCT FROM '3d68aa191b14bd4b5d1459b499f88a5c'
       OR v_owner IS DISTINCT FROM 'postgres'
       OR v_secdef IS DISTINCT FROM true
       OR v_config IS DISTINCT FROM ARRAY['search_path=public']::text[]
       OR NOT has_function_privilege('postgres',v_legacy,'EXECUTE')
       OR NOT has_function_privilege('anon',v_legacy,'EXECUTE')
       OR NOT has_function_privilege('authenticated',v_legacy,'EXECUTE')
       OR NOT has_function_privilege('service_role',v_legacy,'EXECUTE')
       OR EXISTS (
         SELECT 1 FROM aclexplode(coalesce(
           (SELECT proacl FROM pg_proc WHERE oid=v_legacy),
           acldefault('f',(SELECT proowner FROM pg_proc WHERE oid=v_legacy))
         )) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE'
       ) THEN
      RAISE EXCEPTION 'Legacy 10-argument Fresh Pick RPC differs from the reviewed Production identity, body, security, or grants';
    END IF;
  END IF;

  FOREACH v_oid IN ARRAY ARRAY[v_preorder,v_legacy,v_extended] LOOP
    IF v_oid IS NULL THEN
      CONTINUE;
    END IF;
    SELECT r.rolname, p.prosecdef, p.proconfig
      INTO v_owner, v_secdef, v_config
    FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner WHERE p.oid=v_oid;
    IF v_owner IS DISTINCT FROM 'postgres'
       OR v_secdef IS DISTINCT FROM true
       OR v_config IS DISTINCT FROM ARRAY['search_path=public']::text[]
       OR NOT has_function_privilege('postgres',v_oid,'EXECUTE')
       OR NOT has_function_privilege('anon',v_oid,'EXECUTE')
       OR NOT has_function_privilege('authenticated',v_oid,'EXECUTE')
       OR NOT has_function_privilege('service_role',v_oid,'EXECUTE') THEN
      RAISE EXCEPTION 'Submission RPC % ownership, security, search path, or grants differ from the reviewed baseline',v_oid::regprocedure;
    END IF;

    v_def := pg_get_functiondef(v_oid);
    v_count := (length(v_def) - length(replace(v_def,v_old,''))) / length(v_old);
    IF v_count <> 1 THEN
      RAISE EXCEPTION 'Unexpected complimentary allowlist in % (count=%)',v_oid::regprocedure,v_count;
    END IF;
    v_def := replace(v_def,v_old,v_new);
    SELECT p.proname,p.pronargs INTO v_proname,v_nargs FROM pg_proc p WHERE p.oid=v_oid;
    IF v_proname='submit_guest_preorder' OR (v_proname='submit_guest_extra_order' AND v_nargs=16) THEN
      v_count := (length(v_def) - length(replace(v_def,v_old_paid,''))) / length(v_old_paid);
      IF v_count <> 1 THEN
        RAISE EXCEPTION 'Unexpected paid add-on allowlist in % (count=%)',v_oid::regprocedure,v_count;
      END IF;
      v_def := replace(v_def,v_old_paid,'false');
    END IF;
    EXECUTE v_def;

    IF (SELECT p.proowner FROM pg_proc p WHERE p.oid=v_oid) IS DISTINCT FROM (SELECT oid FROM pg_roles WHERE rolname='postgres')
       OR NOT (SELECT prosecdef FROM pg_proc WHERE oid=v_oid)
       OR (SELECT proconfig FROM pg_proc WHERE oid=v_oid) IS DISTINCT FROM ARRAY['search_path=public']::text[]
       OR NOT has_function_privilege('postgres',v_oid,'EXECUTE')
       OR NOT has_function_privilege('anon',v_oid,'EXECUTE')
       OR NOT has_function_privilege('authenticated',v_oid,'EXECUTE')
       OR NOT has_function_privilege('service_role',v_oid,'EXECUTE') THEN
      RAISE EXCEPTION 'Submission RPC % metadata or grants changed while replacing its body',v_oid::regprocedure;
    END IF;
  END LOOP;
END;
$issue8_patch$;

-- Current DEV restricts direct orders reads to active staff. Its deferred
-- delivery-details invariant runs after guest SECURITY DEFINER checkout returns,
-- so an invoker trigger cannot read the just-created order as anon. Preserve the
-- staff-only RLS policy and make only this trigger-only, read-only validator run
-- with its existing postgres owner privileges on that verified schema shape.
DO $issue8_order_invariant_rls$
DECLARE
  v_function oid := to_regprocedure('public.assert_order_delivery_details_invariant()')::oid;
  v_body_md5 text;
  v_owner name;
  v_secdef boolean;
  v_config text[];
  v_acl text;
BEGIN
  IF v_function IS NULL THEN
    RAISE EXCEPTION 'Required delivery-details invariant trigger function is missing';
  END IF;

  IF has_table_privilege('anon','public.orders','SELECT') THEN
    -- Production-derived baseline already permits its deferred validator read.
    RAISE NOTICE 'Anon orders SELECT exists; preserving the existing invoker trigger function';
    RETURN;
  END IF;

  SELECT md5(pg_get_functiondef(p.oid)),r.rolname,p.prosecdef,p.proconfig,p.proacl::text
    INTO v_body_md5,v_owner,v_secdef,v_config,v_acl
  FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner WHERE p.oid=v_function;

  IF NOT coalesce((SELECT relrowsecurity AND NOT relforcerowsecurity
                   FROM pg_class WHERE oid='public.orders'::regclass),false)
     OR NOT EXISTS (
       SELECT 1 FROM pg_policies
       WHERE schemaname='public' AND tablename='orders'
         AND policyname='orders_active_staff_select'
         AND roles=ARRAY['authenticated']::name[]
     )
     OR v_body_md5 IS DISTINCT FROM '3ddd53a414b040c3a048bd237c449d28'
     OR v_owner IS DISTINCT FROM 'postgres'
     OR v_secdef IS DISTINCT FROM false
     OR v_config IS DISTINCT FROM ARRAY['search_path=public']::text[]
     OR (SELECT count(*) FROM pg_trigger t
         WHERE t.tgfoid=v_function AND t.tgconstraint<>0
           AND t.tgdeferrable AND t.tginitdeferred
           AND t.tgname IN ('orders_delivery_details_invariant_au','order_delivery_details_invariant_aiud')) <> 2 THEN
    RAISE EXCEPTION 'Staff-restricted DEV order policy or deferred delivery-invariant trigger differs from the reviewed baseline';
  END IF;

  EXECUTE 'ALTER FUNCTION public.assert_order_delivery_details_invariant() SECURITY DEFINER';
  EXECUTE 'ALTER FUNCTION public.assert_order_delivery_details_invariant() SET search_path TO pg_catalog, public';

  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid=v_function)
     OR (SELECT proconfig FROM pg_proc WHERE oid=v_function) IS DISTINCT FROM ARRAY['search_path=pg_catalog, public']::text[]
     OR (SELECT proacl::text FROM pg_proc WHERE oid=v_function) IS DISTINCT FROM v_acl THEN
    RAISE EXCEPTION 'Could not safely harden the deferred delivery-invariant trigger for the staff-restricted DEV schema';
  END IF;
END;
$issue8_order_invariant_rls$;

-- Extend the authoritative paid-add-on synchronizer so only new lines require
-- an active collection/date assignment. Existing snapshots remain immutable.
do $$
declare
  v_sig regprocedure := 'public._sync_order_paid_addons_from_payload(uuid,jsonb)'::regprocedure;
  v_def text;
  v_old text := E'      select *\n      into v_type\n      from public.paid_addon_types t\n      where t.code = v_code\n        and t.is_active = true;';
  v_new text := E'      select t.*\n      into v_type\n      from public.paid_addon_types t\n      where t.code = v_code\n        and t.is_active = true\n        and exists (\n          select 1 from public.orders o\n          join public.collection_paid_addon_types m\n            on m.collection_id = (public.storefront_collection_for_pickup_date(o.pickup_date)).id\n           and m.paid_addon_type_id = t.id\n          where o.id = p_order_id\n            and m.is_available\n            and (coalesce(auth.jwt() ->> ''role'', ''anon'') = ''service_role'' or public.issue8_is_active_staff() or m.customer_selectable)\n            and (m.available_from is null or o.pickup_date >= m.available_from)\n            and (m.available_until is null or o.pickup_date <= m.available_until)\n        );';
  v_count integer;
begin
  v_def := pg_get_functiondef(v_sig);
  v_count := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
  if v_count <> 1 then raise exception 'Unexpected paid-add-on sync body; refusing to replace'; end if;
  execute replace(v_def, v_old, v_new);
end;
$$;

-- Direct inserts receive server-owned catalogue snapshots. Updates may change
-- quantity/message but cannot rewrite historical commercial snapshots.
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
  v_actor_role text := coalesce(auth.jwt() ->> 'role', 'anon');
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
  if not found or v_date is null or v_collection_id is null then
    raise exception 'Paid add-on requires a valid order collection and date';
  end if;
  select p.* into v_type
  from public.paid_addon_types p
  join public.collection_paid_addon_types m on m.paid_addon_type_id = p.id
  where p.code = new.code and p.is_active
    and m.collection_id = v_collection_id and m.is_available
    and (m.available_from is null or v_date >= m.available_from)
    and (m.available_until is null or v_date <= m.available_until)
    and (v_actor_role = 'service_role' or public.issue8_is_active_staff() or m.customer_selectable);
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
revoke all on function public._issue8_validate_paid_addon_order_line() from public, anon, authenticated, service_role;
drop trigger if exists issue8_validate_paid_addon_order_line on public.order_paid_addons;
create trigger issue8_validate_paid_addon_order_line
before insert or update on public.order_paid_addons
for each row execute function public._issue8_validate_paid_addon_order_line();

comment on table public.collection_paid_addon_types is
  'Collection/date-specific paid add-on availability. Order line commercial fields remain immutable snapshots.';
