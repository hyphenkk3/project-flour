-- Milestone 1 architectural revision (idempotent / safe on existing M1 DB)
-- 1) One order system: orders + order_items (guest => customer_id null)
-- 2) One cake system: collections reference library_cakes via collection_cakes
--
-- Safe to re-run.
-- Migrates existing M1 cakes / guest_orders before dropping parallel tables.
-- Does NOT recreate collection_status or collections.

-- ---------------------------------------------------------------------------
-- Collection availability → Master Cake Library
-- ---------------------------------------------------------------------------

create table if not exists public.collection_cakes (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.collections (id) on delete cascade,
  library_cake_id uuid not null references public.library_cakes (id) on delete restrict,
  available boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint collection_cakes_unique unique (collection_id, library_cake_id)
);

create index if not exists collection_cakes_collection_id_idx
  on public.collection_cakes (collection_id);
create index if not exists collection_cakes_library_cake_id_idx
  on public.collection_cakes (library_cake_id);

drop trigger if exists collection_cakes_set_updated_at on public.collection_cakes;
create trigger collection_cakes_set_updated_at
before update on public.collection_cakes
for each row
execute function public.set_updated_at();

alter table public.collection_cakes enable row level security;

drop policy if exists collection_cakes_public_select on public.collection_cakes;
create policy collection_cakes_public_select
on public.collection_cakes
for select
to anon, authenticated
using (
  available = true
  and exists (
    select 1
    from public.collections c
    where c.id = collection_cakes.collection_id
      and c.status = 'active'
  )
);

drop policy if exists collection_cakes_authenticated_all on public.collection_cakes;
create policy collection_cakes_authenticated_all
on public.collection_cakes
for all
to authenticated
using (true)
with check (true);

drop policy if exists library_cakes_public_select_in_active_collection
  on public.library_cakes;
create policy library_cakes_public_select_in_active_collection
on public.library_cakes
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.collection_cakes cc
    join public.collections c on c.id = cc.collection_id
    where cc.library_cake_id = library_cakes.id
      and cc.available = true
      and c.status = 'active'
  )
);

drop policy if exists library_cake_sizes_public_select_in_active_collection
  on public.library_cake_sizes;
create policy library_cake_sizes_public_select_in_active_collection
on public.library_cake_sizes
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.library_cakes cake
    join public.collection_cakes cc on cc.library_cake_id = cake.id
    join public.collections c on c.id = cc.collection_id
    where cake.id = library_cake_sizes.cake_id
      and cc.available = true
      and c.status = 'active'
  )
);

drop policy if exists library_cake_photos_public_select_in_active_collection
  on public.library_cake_photos;
create policy library_cake_photos_public_select_in_active_collection
on public.library_cake_photos
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.library_cakes cake
    join public.collection_cakes cc on cc.library_cake_id = cake.id
    join public.collections c on c.id = cc.collection_id
    where cake.id = library_cake_photos.cake_id
      and cc.available = true
      and c.status = 'active'
  )
);

-- ---------------------------------------------------------------------------
-- Unify orders schema (guest-capable)
-- ---------------------------------------------------------------------------

alter table public.orders
  alter column customer_id drop not null;

alter table public.orders
  add column if not exists guest_name text,
  add column if not exists guest_phone text,
  add column if not exists guest_email text;

alter table public.orders
  drop constraint if exists orders_guest_or_customer;

alter table public.orders
  add constraint orders_guest_or_customer check (
    (
      customer_id is not null
    )
    or (
      customer_id is null
      and guest_name is not null
      and char_length(trim(guest_name)) > 0
      and guest_phone is not null
      and char_length(trim(guest_phone)) > 0
      and guest_email is not null
      and char_length(trim(guest_email)) > 0
    )
  );

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  cake_id uuid not null references public.library_cakes (id) on delete restrict,
  cake_size_id uuid not null references public.library_cake_sizes (id) on delete restrict,
  quantity integer not null default 1,
  unit_price numeric(10, 2) not null,
  created_at timestamptz not null default now(),
  constraint order_items_quantity_positive check (quantity > 0),
  constraint order_items_unit_price_non_negative check (unit_price >= 0)
);

create index if not exists order_items_order_id_idx on public.order_items (order_id);
create index if not exists order_items_cake_id_idx on public.order_items (cake_id);
create index if not exists order_items_cake_size_id_idx on public.order_items (cake_size_id);

alter table public.order_items enable row level security;

drop policy if exists order_items_authenticated_select on public.order_items;
create policy order_items_authenticated_select
on public.order_items
for select
to authenticated
using (true);

drop policy if exists order_items_authenticated_insert on public.order_items;
create policy order_items_authenticated_insert
on public.order_items
for insert
to authenticated
with check (true);

drop policy if exists order_items_authenticated_update on public.order_items;
create policy order_items_authenticated_update
on public.order_items
for update
to authenticated
using (true)
with check (true);

-- ---------------------------------------------------------------------------
-- Migrate legacy M1 cakes + guest_orders (only if legacy tables still exist)
-- ---------------------------------------------------------------------------

do $$
declare
  cake_rec record;
  size_rec record;
  order_rec record;
  item_rec record;
  library_cake_id uuid;
  library_size_id uuid;
  new_order_id uuid;
  mapped_cake_id uuid;
  mapped_size_id uuid;
  new_status public.order_status;
  sort_counter integer;
  collection_id_val uuid;
begin
  create temporary table _m1_cake_map (
    old_cake_id uuid primary key,
    library_cake_id uuid not null
  ) on commit drop;

  create temporary table _m1_size_map (
    old_size_id uuid primary key,
    library_size_id uuid not null
  ) on commit drop;

  ------------------------------------------------------------------
  -- Cakes → library_cakes + collection_cakes
  ------------------------------------------------------------------
  if to_regclass('public.cakes') is not null then
    for cake_rec in
      select * from public.cakes order by created_at asc
    loop
      select lc.id
        into library_cake_id
      from public.library_cakes lc
      where lc.name = cake_rec.name
      order by lc.created_at asc
      limit 1;

      if library_cake_id is null then
        insert into public.library_cakes (
          name,
          description,
          category,
          status,
          allergens
        )
        values (
          cake_rec.name,
          cake_rec.description,
          'celebration',
          case
            when cake_rec.available then 'active'::public.library_cake_status
            else 'draft'::public.library_cake_status
          end,
          '{}'
        )
        returning id into library_cake_id;
      end if;

      insert into _m1_cake_map (old_cake_id, library_cake_id)
      values (cake_rec.id, library_cake_id)
      on conflict (old_cake_id) do update
        set library_cake_id = excluded.library_cake_id;

      if cake_rec.image is not null
         and char_length(trim(cake_rec.image)) > 0
         and not exists (
           select 1
           from public.library_cake_photos p
           where p.cake_id = library_cake_id
             and p.image_url = cake_rec.image
         )
      then
        insert into public.library_cake_photos (
          cake_id,
          image_url,
          alt_text,
          sort_order
        )
        values (
          library_cake_id,
          cake_rec.image,
          cake_rec.name,
          0
        );
      end if;

      if to_regclass('public.cake_sizes') is not null then
        for size_rec in
          select *
          from public.cake_sizes
          where cake_id = cake_rec.id
          order by sort_order asc, created_at asc
        loop
          select s.id
            into library_size_id
          from public.library_cake_sizes s
          where s.cake_id = library_cake_id
            and s.label = size_rec.size
          order by s.sort_order asc
          limit 1;

          if library_size_id is null then
            insert into public.library_cake_sizes (
              cake_id,
              label,
              price,
              sort_order,
              serves
            )
            values (
              library_cake_id,
              size_rec.size,
              size_rec.price,
              size_rec.sort_order,
              null
            )
            returning id into library_size_id;
          end if;

          insert into _m1_size_map (old_size_id, library_size_id)
          values (size_rec.id, library_size_id)
          on conflict (old_size_id) do update
            set library_size_id = excluded.library_size_id;
        end loop;
      end if;

      insert into public.collection_cakes (
        collection_id,
        library_cake_id,
        available,
        sort_order
      )
      values (
        cake_rec.collection_id,
        library_cake_id,
        coalesce(cake_rec.available, true),
        0
      )
      on conflict (collection_id, library_cake_id) do update
        set available = excluded.available;
    end loop;

    for collection_id_val in
      select distinct c.collection_id from public.cakes c
    loop
      sort_counter := 0;
      for size_rec in
        select cc.id
        from public.collection_cakes cc
        join _m1_cake_map m on m.library_cake_id = cc.library_cake_id
        join public.cakes c on c.id = m.old_cake_id
        where cc.collection_id = collection_id_val
          and c.collection_id = collection_id_val
        order by c.created_at asc
      loop
        update public.collection_cakes
        set sort_order = sort_counter
        where id = size_rec.id;
        sort_counter := sort_counter + 1;
      end loop;
    end loop;
  end if;

  ------------------------------------------------------------------
  -- guest_orders → orders + order_items
  ------------------------------------------------------------------
  if to_regclass('public.guest_orders') is not null then
    for order_rec in
      select * from public.guest_orders order by created_at asc
    loop
      if exists (
        select 1
        from public.orders o
        where o.customer_id is null
          and o.guest_name = order_rec.customer_name
          and o.guest_phone = order_rec.phone
          and o.guest_email = order_rec.email
          and o.pickup_date = order_rec.pickup_date
          and o.pickup_time = order_rec.pickup_time
          and o.created_at = order_rec.created_at
      ) then
        continue;
      end if;

      new_status := case order_rec.status::text
        when 'waiting_customer_confirmation'
          then 'pending_confirmation'::public.order_status
        else 'submitted'::public.order_status
      end;

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
        created_at,
        updated_at
      )
      values (
        public.allocate_order_number(),
        null,
        order_rec.customer_name,
        order_rec.phone,
        order_rec.email,
        'pickup',
        order_rec.pickup_date,
        order_rec.pickup_time,
        new_status,
        'unpaid',
        order_rec.notes,
        order_rec.created_at,
        order_rec.updated_at
      )
      returning id into new_order_id;

      if to_regclass('public.guest_order_items') is not null then
        for item_rec in
          select *
          from public.guest_order_items
          where order_id = order_rec.id
        loop
          select library_cake_id into mapped_cake_id
          from _m1_cake_map
          where old_cake_id = item_rec.cake_id;

          select library_size_id into mapped_size_id
          from _m1_size_map
          where old_size_id = item_rec.cake_size_id;

          if mapped_cake_id is null and to_regclass('public.cakes') is not null then
            select lc.id
              into mapped_cake_id
            from public.cakes c
            join public.library_cakes lc on lc.name = c.name
            where c.id = item_rec.cake_id
            limit 1;
          end if;

          if mapped_size_id is null
             and mapped_cake_id is not null
             and to_regclass('public.cake_sizes') is not null
          then
            select ls.id
              into mapped_size_id
            from public.cake_sizes cs
            join public.library_cake_sizes ls
              on ls.cake_id = mapped_cake_id
             and ls.label = cs.size
            where cs.id = item_rec.cake_size_id
            limit 1;
          end if;

          if mapped_cake_id is null or mapped_size_id is null then
            raise exception
              'Cannot migrate guest_order_item %: missing library cake/size mapping. Ensure cakes still exist or re-seed Library cakes first.',
              item_rec.id;
          end if;

          insert into public.order_items (
            order_id,
            cake_id,
            cake_size_id,
            quantity,
            unit_price,
            created_at
          )
          values (
            new_order_id,
            mapped_cake_id,
            mapped_size_id,
            item_rec.quantity,
            item_rec.unit_price,
            item_rec.created_at
          );
        end loop;
      end if;
    end loop;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Tear down parallel guest/cake tables (after migration)
-- ---------------------------------------------------------------------------

drop function if exists public.submit_guest_preorder(
  text, text, text, date, time, text, uuid, uuid, integer
);

drop function if exists public.allocate_guest_order_number();

drop table if exists public.guest_order_items;
drop table if exists public.guest_orders;
drop table if exists public.guest_order_number_sequences;

drop type if exists public.guest_order_status;

drop table if exists public.cake_sizes;
drop table if exists public.cakes;

-- Keep public.collections and public.collection_status.

-- ---------------------------------------------------------------------------
-- Guest preorder submit → unified orders + order_items
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
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  cake_row public.library_cakes;
  size_row public.library_cake_sizes;
  new_order public.orders;
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

  select * into cake_row from public.library_cakes where id = p_cake_id;
  if not found then
    raise exception 'Cake is not available';
  end if;

  if not exists (
    select 1
    from public.collection_cakes cc
    join public.collections c on c.id = cc.collection_id
    where cc.library_cake_id = cake_row.id
      and cc.available = true
      and c.status = 'active'
  ) then
    raise exception 'Cake is not available in the current collection';
  end if;

  select * into size_row
  from public.library_cake_sizes
  where id = p_cake_size_id and cake_id = p_cake_id;
  if not found then
    raise exception 'Cake size is not available';
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
    customer_notes
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
    nullif(trim(coalesce(p_notes, '')), '')
  )
  returning * into new_order;

  insert into public.order_items (
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
