do $$
declare role_name text;
begin
  foreach role_name in array array['postgres','anon','authenticated','service_role'] loop
    if not exists (select 1 from pg_catalog.pg_roles where rolname = role_name) then
      if role_name = 'postgres' then
        execute 'create role postgres superuser nologin';
      else
        execute format('create role %I nologin', role_name);
      end if;
    end if;
  end loop;
end $$;

create table public.production_capacity (
  id uuid primary key,
  pickup_date date not null,
  library_cake_id uuid not null,
  library_cake_size_id uuid,
  collection_id uuid,
  capacity_quantity integer not null check (capacity_quantity >= 0),
  waiting_list_enabled boolean not null default false,
  note text
);

create table public.orders (
  id uuid primary key,
  pickup_date date not null,
  collection_id uuid,
  status text not null,
  extra_stock_id uuid
);

create table public.order_items (
  id uuid primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  cake_id uuid not null,
  cake_size_id uuid not null,
  quantity integer not null check (quantity > 0)
);

create table public.production_capacity_holds (
  id uuid primary key,
  capacity_id uuid not null references public.production_capacity(id),
  quantity integer not null check (quantity > 0),
  status text not null,
  held_until timestamptz not null
);

create function public._guest_preorder_item_fully_booked(
  date, uuid, uuid, uuid, integer
) returns boolean language sql stable as $$ select false $$;

create function public._waiting_list_matching_capacity(date, uuid, uuid, uuid)
returns public.production_capacity language sql stable as $$
  select c from public.production_capacity c limit 1
$$;

create function public.set_production_capacity(
  uuid, date, uuid, uuid, uuid, integer, text
) returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(
    abs(hashtext('production_capacity:' || $2::text || ':' || $3::text))
  );
  return '{}'::jsonb;
end $$;
alter function public.set_production_capacity(uuid, date, uuid, uuid, uuid, integer, text)
  owner to postgres;
grant execute on function public.set_production_capacity(uuid, date, uuid, uuid, uuid, integer, text)
  to authenticated, service_role;
revoke all on function public.set_production_capacity(uuid, date, uuid, uuid, uuid, integer, text)
  from public, anon;
