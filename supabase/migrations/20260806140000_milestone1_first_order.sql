-- Milestone 1 — First Order
-- Customer guest preorder → Owner review/confirm.
--
-- If this migration is ALREADY applied on your project, do NOT re-run it.
-- Apply only: 20260806150000_milestone1_architecture_unify.sql
--
-- Enum/type creation below is idempotent to avoid ERROR 42710 on accidental re-run.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

do $$ begin
  create type public.collection_status as enum (
    'draft',
    'active',
    'archived'
  );
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.guest_order_status as enum (
    'submitted',
    'waiting_customer_confirmation'
  );
exception
  when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- Catalog
-- ---------------------------------------------------------------------------

create table if not exists public.collections (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  month date not null,
  status public.collection_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint collections_name_not_blank check (char_length(trim(name)) > 0)
);

create index collections_status_idx on public.collections (status);
create index collections_month_idx on public.collections (month);

create trigger collections_set_updated_at
before update on public.collections
for each row
execute function public.set_updated_at();

create table public.cakes (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.collections (id) on delete cascade,
  name text not null,
  description text,
  image text,
  available boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cakes_name_not_blank check (char_length(trim(name)) > 0)
);

create index cakes_collection_id_idx on public.cakes (collection_id);
create index cakes_available_idx on public.cakes (available);

create trigger cakes_set_updated_at
before update on public.cakes
for each row
execute function public.set_updated_at();

create table public.cake_sizes (
  id uuid primary key default gen_random_uuid(),
  cake_id uuid not null references public.cakes (id) on delete cascade,
  size text not null,
  price numeric(10, 2) not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cake_sizes_size_not_blank check (char_length(trim(size)) > 0),
  constraint cake_sizes_price_non_negative check (price >= 0)
);

create index cake_sizes_cake_id_idx on public.cake_sizes (cake_id);

create trigger cake_sizes_set_updated_at
before update on public.cake_sizes
for each row
execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Guest orders (Milestone 1 “orders”)
-- ---------------------------------------------------------------------------

create table public.guest_orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  customer_name text not null,
  phone text not null,
  email text not null,
  pickup_date date not null,
  pickup_time time not null,
  notes text,
  status public.guest_order_status not null default 'submitted',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint guest_orders_customer_name_not_blank check (
    char_length(trim(customer_name)) > 0
  ),
  constraint guest_orders_phone_not_blank check (char_length(trim(phone)) > 0),
  constraint guest_orders_email_not_blank check (char_length(trim(email)) > 0),
  constraint guest_orders_order_number_format check (
    order_number ~ '^GO-[0-9]{8}-[0-9]{4}$'
  )
);

create index guest_orders_status_idx on public.guest_orders (status);
create index guest_orders_created_at_idx on public.guest_orders (created_at desc);

create trigger guest_orders_set_updated_at
before update on public.guest_orders
for each row
execute function public.set_updated_at();

create table public.guest_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.guest_orders (id) on delete cascade,
  cake_id uuid not null references public.cakes (id) on delete restrict,
  cake_size_id uuid not null references public.cake_sizes (id) on delete restrict,
  quantity integer not null default 1,
  unit_price numeric(10, 2) not null,
  created_at timestamptz not null default now(),
  constraint guest_order_items_quantity_positive check (quantity > 0),
  constraint guest_order_items_unit_price_non_negative check (unit_price >= 0)
);

create index guest_order_items_order_id_idx on public.guest_order_items (order_id);
create index guest_order_items_cake_id_idx on public.guest_order_items (cake_id);

-- Daily sequence for GO-YYYYMMDD-#### in Asia/Singapore.
create table public.guest_order_number_sequences (
  business_date date primary key,
  last_value integer not null default 0,
  constraint guest_order_number_sequences_last_value_positive check (last_value >= 0)
);

create or replace function public.allocate_guest_order_number()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  business_day date;
  next_value integer;
begin
  business_day := (timezone('Asia/Singapore', now()))::date;

  insert into public.guest_order_number_sequences as seq (business_date, last_value)
  values (business_day, 1)
  on conflict (business_date)
  do update set last_value = seq.last_value + 1
  returning seq.last_value into next_value;

  return 'GO-'
    || to_char(business_day, 'YYYYMMDD')
    || '-'
    || lpad(next_value::text, 4, '0');
end;
$$;

revoke all on function public.allocate_guest_order_number() from public;
grant execute on function public.allocate_guest_order_number() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Submit guest preorder (anon-safe)
-- ---------------------------------------------------------------------------

create or replace function public.submit_guest_preorder(
  p_customer_name text,
  p_phone text,
  p_email text,
  p_pickup_date date,
  p_pickup_time time,
  p_notes text,
  p_cake_id uuid,
  p_cake_size_id uuid,
  p_quantity integer
)
returns public.guest_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  cake_row public.cakes;
  size_row public.cake_sizes;
  collection_row public.collections;
  new_order public.guest_orders;
  qty integer;
begin
  qty := coalesce(p_quantity, 1);
  if qty < 1 then
    raise exception 'Quantity must be at least 1';
  end if;

  if char_length(trim(coalesce(p_customer_name, ''))) = 0 then
    raise exception 'Full name is required';
  end if;
  if char_length(trim(coalesce(p_phone, ''))) = 0 then
    raise exception 'Phone number is required';
  end if;
  if char_length(trim(coalesce(p_email, ''))) = 0 then
    raise exception 'Email is required';
  end if;

  select * into cake_row from public.cakes where id = p_cake_id;
  if not found or cake_row.available is not true then
    raise exception 'Cake is not available';
  end if;

  select * into collection_row
  from public.collections
  where id = cake_row.collection_id;
  if not found or collection_row.status <> 'active' then
    raise exception 'Collection is not available';
  end if;

  select * into size_row
  from public.cake_sizes
  where id = p_cake_size_id and cake_id = p_cake_id;
  if not found then
    raise exception 'Cake size is not available';
  end if;

  insert into public.guest_orders (
    order_number,
    customer_name,
    phone,
    email,
    pickup_date,
    pickup_time,
    notes,
    status
  )
  values (
    public.allocate_guest_order_number(),
    trim(p_customer_name),
    trim(p_phone),
    trim(p_email),
    p_pickup_date,
    p_pickup_time,
    nullif(trim(coalesce(p_notes, '')), ''),
    'submitted'
  )
  returning * into new_order;

  insert into public.guest_order_items (
    order_id,
    cake_id,
    cake_size_id,
    quantity,
    unit_price
  )
  values (
    new_order.id,
    cake_row.id,
    size_row.id,
    qty,
    size_row.price
  );

  return new_order;
end;
$$;

revoke all on function public.submit_guest_preorder(
  text, text, text, date, time, text, uuid, uuid, integer
) from public;
grant execute on function public.submit_guest_preorder(
  text, text, text, date, time, text, uuid, uuid, integer
) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.collections enable row level security;
alter table public.cakes enable row level security;
alter table public.cake_sizes enable row level security;
alter table public.guest_orders enable row level security;
alter table public.guest_order_items enable row level security;
alter table public.guest_order_number_sequences enable row level security;

-- Public catalog read (active / available only)
create policy collections_public_select_active
on public.collections
for select
to anon, authenticated
using (status = 'active');

create policy cakes_public_select_available
on public.cakes
for select
to anon, authenticated
using (
  available = true
  and exists (
    select 1
    from public.collections c
    where c.id = cakes.collection_id
      and c.status = 'active'
  )
);

create policy cake_sizes_public_select
on public.cake_sizes
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.cakes cake
    join public.collections c on c.id = cake.collection_id
    where cake.id = cake_sizes.cake_id
      and cake.available = true
      and c.status = 'active'
  )
);

-- Authenticated staff: full catalog management (seed / future admin)
create policy collections_authenticated_all
on public.collections
for all
to authenticated
using (true)
with check (true);

create policy cakes_authenticated_all
on public.cakes
for all
to authenticated
using (true)
with check (true);

create policy cake_sizes_authenticated_all
on public.cake_sizes
for all
to authenticated
using (true)
with check (true);

-- Guest orders: staff read/update; inserts via security definer RPC only
create policy guest_orders_authenticated_select
on public.guest_orders
for select
to authenticated
using (true);

create policy guest_orders_authenticated_update
on public.guest_orders
for update
to authenticated
using (true)
with check (true);

create policy guest_order_items_authenticated_select
on public.guest_order_items
for select
to authenticated
using (true);

-- Sequence table: only via security definer
create policy guest_order_number_sequences_deny_all
on public.guest_order_number_sequences
for all
to anon, authenticated
using (false)
with check (false);
