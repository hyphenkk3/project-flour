-- Milestone 2: Customer Confirmation
-- Additive / non-destructive. Preserves existing orders + order_items.
-- Extends unified orders architecture; does not create parallel order systems.

-- ---------------------------------------------------------------------------
-- 1) Order item commercial snapshots (names freeze at submit / save)
-- ---------------------------------------------------------------------------

alter table public.order_items
  add column if not exists cake_name text,
  add column if not exists size_label text;

update public.order_items oi
set
  cake_name = coalesce(oi.cake_name, lc.name, 'Cake'),
  size_label = coalesce(oi.size_label, lcs.label, 'Size')
from public.library_cakes lc,
     public.library_cake_sizes lcs
where oi.cake_id = lc.id
  and oi.cake_size_id = lcs.id
  and (oi.cake_name is null or oi.size_label is null);

update public.order_items
set
  cake_name = coalesce(cake_name, 'Cake'),
  size_label = coalesce(size_label, 'Size')
where cake_name is null or size_label is null;

alter table public.order_items
  alter column cake_name set not null,
  alter column size_label set not null;

-- ---------------------------------------------------------------------------
-- 2) Confirmation tracking on orders
-- ---------------------------------------------------------------------------

alter table public.orders
  add column if not exists confirmation_needs_resend boolean not null default false,
  add column if not exists collection_id uuid references public.collections (id) on delete set null;

create index if not exists orders_collection_id_idx
  on public.orders (collection_id);

-- ---------------------------------------------------------------------------
-- 3) Complimentary item types + collection defaults
-- ---------------------------------------------------------------------------

create table if not exists public.complimentary_item_types (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  created_at timestamptz not null default now(),
  constraint complimentary_item_types_code_not_blank check (
    char_length(trim(code)) > 0
  ),
  constraint complimentary_item_types_name_not_blank check (
    char_length(trim(name)) > 0
  )
);

create table if not exists public.collection_complimentary_items (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.collections (id) on delete cascade,
  complimentary_item_type_id uuid not null
    references public.complimentary_item_types (id) on delete restrict,
  is_available boolean not null default true,
  is_default boolean not null default false,
  default_quantity integer not null default 1,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (collection_id, complimentary_item_type_id),
  constraint collection_complimentary_items_qty_positive check (
    default_quantity >= 0
  )
);

create index if not exists collection_complimentary_items_collection_idx
  on public.collection_complimentary_items (collection_id, sort_order);

-- Snapshot on each order (independent of later collection edits)
create table if not exists public.order_complimentary_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  complimentary_item_type_id uuid
    references public.complimentary_item_types (id) on delete set null,
  name text not null,
  quantity integer not null default 1,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint order_complimentary_items_name_not_blank check (
    char_length(trim(name)) > 0
  ),
  constraint order_complimentary_items_qty_non_negative check (quantity >= 0)
);

create index if not exists order_complimentary_items_order_idx
  on public.order_complimentary_items (order_id, sort_order);

alter table public.complimentary_item_types enable row level security;
alter table public.collection_complimentary_items enable row level security;
alter table public.order_complimentary_items enable row level security;

drop policy if exists complimentary_item_types_authenticated_select
  on public.complimentary_item_types;
create policy complimentary_item_types_authenticated_select
  on public.complimentary_item_types
  for select to authenticated
  using (true);

drop policy if exists complimentary_item_types_authenticated_write
  on public.complimentary_item_types;
create policy complimentary_item_types_authenticated_write
  on public.complimentary_item_types
  for all to authenticated
  using (true)
  with check (true);

drop policy if exists collection_complimentary_items_authenticated_select
  on public.collection_complimentary_items;
create policy collection_complimentary_items_authenticated_select
  on public.collection_complimentary_items
  for select to authenticated
  using (true);

drop policy if exists collection_complimentary_items_authenticated_write
  on public.collection_complimentary_items;
create policy collection_complimentary_items_authenticated_write
  on public.collection_complimentary_items
  for all to authenticated
  using (true)
  with check (true);

drop policy if exists order_complimentary_items_authenticated_select
  on public.order_complimentary_items;
create policy order_complimentary_items_authenticated_select
  on public.order_complimentary_items
  for select to authenticated
  using (true);

drop policy if exists order_complimentary_items_authenticated_write
  on public.order_complimentary_items;
create policy order_complimentary_items_authenticated_write
  on public.order_complimentary_items
  for all to authenticated
  using (true)
  with check (true);

-- Seed standard complimentary types (idempotent)
insert into public.complimentary_item_types (code, name)
values
  ('birthday_topper', 'Birthday Topper'),
  ('mothers_day_topper', 'Mother''s Day Topper'),
  ('fathers_day_topper', 'Father''s Day Topper'),
  ('candle', 'Candle'),
  ('knife', 'Knife')
on conflict (code) do update
set name = excluded.name;

-- Attach default birthday set to every active collection that has none yet
insert into public.collection_complimentary_items (
  collection_id,
  complimentary_item_type_id,
  is_available,
  is_default,
  default_quantity,
  sort_order
)
select
  c.id,
  t.id,
  true,
  true,
  1,
  case t.code
    when 'birthday_topper' then 0
    when 'candle' then 1
    when 'knife' then 2
    else 10
  end
from public.collections c
cross join public.complimentary_item_types t
where c.status = 'active'
  and t.code in ('birthday_topper', 'candle', 'knife')
  and not exists (
    select 1
    from public.collection_complimentary_items existing
    where existing.collection_id = c.id
  );

-- ---------------------------------------------------------------------------
-- 4) Order timeline / audit foundation
-- ---------------------------------------------------------------------------

create table if not exists public.order_timeline_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  event_type text not null,
  actor_staff_id uuid references public.staff_profiles (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint order_timeline_events_type_not_blank check (
    char_length(trim(event_type)) > 0
  )
);

create index if not exists order_timeline_events_order_created_idx
  on public.order_timeline_events (order_id, created_at asc);

alter table public.order_timeline_events enable row level security;

drop policy if exists order_timeline_events_authenticated_select
  on public.order_timeline_events;
create policy order_timeline_events_authenticated_select
  on public.order_timeline_events
  for select to authenticated
  using (true);

drop policy if exists order_timeline_events_authenticated_insert
  on public.order_timeline_events;
create policy order_timeline_events_authenticated_insert
  on public.order_timeline_events
  for insert to authenticated
  with check (true);

-- ---------------------------------------------------------------------------
-- 5) Immutable confirmation snapshots
-- ---------------------------------------------------------------------------

create table if not exists public.order_confirmation_snapshots (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  version integer not null,
  lifecycle_status text not null default 'sent',
  message_body text not null,
  snapshot_payload jsonb not null,
  prepared_by uuid references public.staff_profiles (id) on delete set null,
  prepared_at timestamptz,
  sent_by uuid references public.staff_profiles (id) on delete set null,
  sent_at timestamptz,
  outdated_at timestamptz,
  created_at timestamptz not null default now(),
  unique (order_id, version),
  constraint order_confirmation_snapshots_version_positive check (version >= 1),
  constraint order_confirmation_snapshots_lifecycle_check check (
    lifecycle_status in ('sent', 'outdated')
  )
);

create index if not exists order_confirmation_snapshots_order_idx
  on public.order_confirmation_snapshots (order_id, version desc);

alter table public.order_confirmation_snapshots enable row level security;

drop policy if exists order_confirmation_snapshots_authenticated_select
  on public.order_confirmation_snapshots;
create policy order_confirmation_snapshots_authenticated_select
  on public.order_confirmation_snapshots
  for select to authenticated
  using (true);

drop policy if exists order_confirmation_snapshots_authenticated_insert
  on public.order_confirmation_snapshots;
create policy order_confirmation_snapshots_authenticated_insert
  on public.order_confirmation_snapshots
  for insert to authenticated
  with check (true);

drop policy if exists order_confirmation_snapshots_authenticated_update
  on public.order_confirmation_snapshots;
create policy order_confirmation_snapshots_authenticated_update
  on public.order_confirmation_snapshots
  for update to authenticated
  using (true)
  with check (true);

-- ---------------------------------------------------------------------------
-- 6) Multi-item guest preorder RPC (replaces single-item signature)
-- ---------------------------------------------------------------------------

drop function if exists public.submit_guest_preorder(
  text, text, text, date, time, text, uuid, uuid, integer
);

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
    confirmation_needs_resend
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
    false
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

  -- Snapshot collection default complimentary items onto the order
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

-- Backfill timeline for existing guest orders that have none
insert into public.order_timeline_events (order_id, event_type, actor_staff_id, metadata, created_at)
select
  o.id,
  'preorder_submitted',
  null,
  jsonb_build_object('backfilled', true, 'source', 'milestone2_migration'),
  o.created_at
from public.orders o
where o.customer_id is null
  and not exists (
    select 1
    from public.order_timeline_events e
    where e.order_id = o.id
      and e.event_type = 'preorder_submitted'
  );

-- If an existing order was already pending_confirmation, record a sent event
insert into public.order_timeline_events (order_id, event_type, actor_staff_id, metadata, created_at)
select
  o.id,
  'confirmation_marked_sent',
  o.updated_by,
  jsonb_build_object('backfilled', true),
  o.updated_at
from public.orders o
where o.customer_id is null
  and o.status = 'pending_confirmation'
  and not exists (
    select 1
    from public.order_timeline_events e
    where e.order_id = o.id
      and e.event_type = 'confirmation_marked_sent'
  );
