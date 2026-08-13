-- EXTRA Activation v1 — physical-stock domain (separate from guest preorders).
-- Lifecycle: proposed | confirmed | rejected. Availability is DERIVED.
-- No Hold / Sold / Slice / public listing in v1.

-- ---------------------------------------------------------------------------
-- 1) Enum + table
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'extra_stock_lifecycle'
  ) then
    create type public.extra_stock_lifecycle as enum (
      'proposed',
      'confirmed',
      'rejected'
    );
  end if;
end
$$;

create table if not exists public.extra_stock (
  id uuid primary key default gen_random_uuid(),
  lifecycle public.extra_stock_lifecycle not null,
  cake_name text not null,
  size_label text not null,
  library_cake_id uuid references public.library_cakes (id) on delete set null,
  library_cake_size_id uuid references public.library_cake_sizes (id) on delete set null,
  prepared_on date,
  pickup_through_at timestamptz,
  note text,
  proposed_at timestamptz not null default now(),
  proposed_by uuid not null references public.staff_profiles (id),
  confirmed_at timestamptz,
  confirmed_by uuid references public.staff_profiles (id),
  rejected_at timestamptz,
  rejected_by uuid references public.staff_profiles (id),
  reject_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint extra_stock_cake_name_nonempty check (length(trim(cake_name)) > 0),
  constraint extra_stock_size_label_nonempty check (length(trim(size_label)) > 0),
  constraint extra_stock_confirmed_requires_fields check (
    lifecycle <> 'confirmed'
    or (
      prepared_on is not null
      and pickup_through_at is not null
      and confirmed_at is not null
      and confirmed_by is not null
    )
  ),
  constraint extra_stock_rejected_requires_fields check (
    lifecycle <> 'rejected'
    or (
      rejected_at is not null
      and rejected_by is not null
    )
  ),
  constraint extra_stock_terminal_mutex check (
    not (confirmed_at is not null and rejected_at is not null)
  )
);

create index if not exists extra_stock_lifecycle_idx
  on public.extra_stock (lifecycle);

create index if not exists extra_stock_pickup_through_at_idx
  on public.extra_stock (pickup_through_at);

create index if not exists extra_stock_prepared_on_idx
  on public.extra_stock (prepared_on);

create index if not exists extra_stock_proposed_at_idx
  on public.extra_stock (proposed_at desc);

drop trigger if exists extra_stock_set_updated_at on public.extra_stock;
create trigger extra_stock_set_updated_at
before update on public.extra_stock
for each row
execute function public.set_updated_at();

alter table public.extra_stock enable row level security;

drop policy if exists extra_stock_authenticated_select on public.extra_stock;
create policy extra_stock_authenticated_select
on public.extra_stock
for select
to authenticated
using (true);

-- Mutations only via security-definer RPCs (no direct insert/update/delete policies).

-- ---------------------------------------------------------------------------
-- 2) propose_extra_stock
-- ---------------------------------------------------------------------------

create or replace function public.propose_extra_stock(
  p_actor_staff_id uuid,
  p_cake_name text,
  p_size_label text,
  p_prepared_on date default null,
  p_note text default null,
  p_library_cake_id uuid default null,
  p_library_cake_size_id uuid default null
)
returns public.extra_stock
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  stock_row public.extra_stock;
  v_cake text;
  v_size text;
  v_note text;
begin
  if p_actor_staff_id is null then
    raise exception 'Staff actor is required';
  end if;
  if not exists (
    select 1 from public.staff_profiles sp where sp.id = p_actor_staff_id
  ) then
    raise exception 'Staff actor not found';
  end if;

  v_role := public._staff_role_code(p_actor_staff_id);
  if v_role is null or v_role not in ('bakery', 'manager', 'owner') then
    raise exception 'Not authorized to propose EXTRA';
  end if;

  v_cake := nullif(trim(coalesce(p_cake_name, '')), '');
  v_size := nullif(trim(coalesce(p_size_label, '')), '');
  if v_cake is null or v_size is null then
    raise exception 'Cake and size are required';
  end if;
  v_note := nullif(trim(coalesce(p_note, '')), '');

  insert into public.extra_stock (
    lifecycle,
    cake_name,
    size_label,
    library_cake_id,
    library_cake_size_id,
    prepared_on,
    note,
    proposed_at,
    proposed_by
  )
  values (
    'proposed',
    v_cake,
    v_size,
    p_library_cake_id,
    p_library_cake_size_id,
    p_prepared_on,
    v_note,
    now(),
    p_actor_staff_id
  )
  returning * into stock_row;

  return stock_row;
end;
$$;

revoke all on function public.propose_extra_stock(
  uuid, text, text, date, text, uuid, uuid
) from public;
grant execute on function public.propose_extra_stock(
  uuid, text, text, date, text, uuid, uuid
) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3) create_confirmed_extra_stock (Bakery direct-create)
-- ---------------------------------------------------------------------------

create or replace function public.create_confirmed_extra_stock(
  p_actor_staff_id uuid,
  p_cake_name text,
  p_size_label text,
  p_prepared_on date,
  p_pickup_through_at timestamptz,
  p_note text default null,
  p_library_cake_id uuid default null,
  p_library_cake_size_id uuid default null
)
returns public.extra_stock
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  stock_row public.extra_stock;
  v_cake text;
  v_size text;
  v_note text;
begin
  if p_actor_staff_id is null then
    raise exception 'Staff actor is required';
  end if;
  if not exists (
    select 1 from public.staff_profiles sp where sp.id = p_actor_staff_id
  ) then
    raise exception 'Staff actor not found';
  end if;

  v_role := public._staff_role_code(p_actor_staff_id);
  if v_role is null or v_role not in ('bakery', 'manager', 'owner') then
    raise exception 'Not authorized to create confirmed EXTRA';
  end if;

  v_cake := nullif(trim(coalesce(p_cake_name, '')), '');
  v_size := nullif(trim(coalesce(p_size_label, '')), '');
  if v_cake is null or v_size is null then
    raise exception 'Cake and size are required';
  end if;
  if p_prepared_on is null then
    raise exception 'Prepared date is required';
  end if;
  if p_pickup_through_at is null then
    raise exception 'Pickup-through datetime is required';
  end if;
  v_note := nullif(trim(coalesce(p_note, '')), '');

  insert into public.extra_stock (
    lifecycle,
    cake_name,
    size_label,
    library_cake_id,
    library_cake_size_id,
    prepared_on,
    pickup_through_at,
    note,
    proposed_at,
    proposed_by,
    confirmed_at,
    confirmed_by
  )
  values (
    'confirmed',
    v_cake,
    v_size,
    p_library_cake_id,
    p_library_cake_size_id,
    p_prepared_on,
    p_pickup_through_at,
    v_note,
    now(),
    p_actor_staff_id,
    now(),
    p_actor_staff_id
  )
  returning * into stock_row;

  return stock_row;
end;
$$;

revoke all on function public.create_confirmed_extra_stock(
  uuid, text, text, date, timestamptz, text, uuid, uuid
) from public;
grant execute on function public.create_confirmed_extra_stock(
  uuid, text, text, date, timestamptz, text, uuid, uuid
) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4) confirm_extra_stock
-- ---------------------------------------------------------------------------

create or replace function public.confirm_extra_stock(
  p_extra_stock_id uuid,
  p_actor_staff_id uuid,
  p_prepared_on date,
  p_pickup_through_at timestamptz,
  p_note text default null
)
returns public.extra_stock
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  stock_row public.extra_stock;
  v_note text;
begin
  if p_extra_stock_id is null then
    raise exception 'EXTRA stock is required';
  end if;
  if p_actor_staff_id is null then
    raise exception 'Staff actor is required';
  end if;
  if not exists (
    select 1 from public.staff_profiles sp where sp.id = p_actor_staff_id
  ) then
    raise exception 'Staff actor not found';
  end if;

  v_role := public._staff_role_code(p_actor_staff_id);
  if v_role is null or v_role not in ('bakery', 'manager', 'owner') then
    raise exception 'Not authorized to confirm EXTRA';
  end if;

  if p_prepared_on is null then
    raise exception 'Prepared date is required';
  end if;
  if p_pickup_through_at is null then
    raise exception 'Pickup-through datetime is required';
  end if;

  select e.*
  into stock_row
  from public.extra_stock e
  where e.id = p_extra_stock_id
  for update;

  if not found then
    raise exception 'EXTRA stock not found';
  end if;

  if stock_row.lifecycle <> 'proposed' then
    raise exception 'Only proposed EXTRA can be confirmed';
  end if;

  v_note := coalesce(
    nullif(trim(coalesce(p_note, '')), ''),
    stock_row.note
  );

  update public.extra_stock e
  set
    lifecycle = 'confirmed',
    prepared_on = p_prepared_on,
    pickup_through_at = p_pickup_through_at,
    note = v_note,
    confirmed_at = now(),
    confirmed_by = p_actor_staff_id,
    updated_at = now()
  where e.id = p_extra_stock_id
  returning * into stock_row;

  return stock_row;
end;
$$;

revoke all on function public.confirm_extra_stock(
  uuid, uuid, date, timestamptz, text
) from public;
grant execute on function public.confirm_extra_stock(
  uuid, uuid, date, timestamptz, text
) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5) reject_extra_stock
-- ---------------------------------------------------------------------------

create or replace function public.reject_extra_stock(
  p_extra_stock_id uuid,
  p_actor_staff_id uuid,
  p_reject_reason text default null
)
returns public.extra_stock
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  stock_row public.extra_stock;
  v_reason text;
begin
  if p_extra_stock_id is null then
    raise exception 'EXTRA stock is required';
  end if;
  if p_actor_staff_id is null then
    raise exception 'Staff actor is required';
  end if;
  if not exists (
    select 1 from public.staff_profiles sp where sp.id = p_actor_staff_id
  ) then
    raise exception 'Staff actor not found';
  end if;

  v_role := public._staff_role_code(p_actor_staff_id);
  if v_role is null or v_role not in ('bakery', 'manager', 'owner') then
    raise exception 'Not authorized to reject EXTRA';
  end if;

  select e.*
  into stock_row
  from public.extra_stock e
  where e.id = p_extra_stock_id
  for update;

  if not found then
    raise exception 'EXTRA stock not found';
  end if;

  if stock_row.lifecycle <> 'proposed' then
    raise exception 'Only proposed EXTRA can be rejected';
  end if;

  v_reason := nullif(trim(coalesce(p_reject_reason, '')), '');

  update public.extra_stock e
  set
    lifecycle = 'rejected',
    rejected_at = now(),
    rejected_by = p_actor_staff_id,
    reject_reason = v_reason,
    updated_at = now()
  where e.id = p_extra_stock_id
  returning * into stock_row;

  return stock_row;
end;
$$;

revoke all on function public.reject_extra_stock(uuid, uuid, text) from public;
grant execute on function public.reject_extra_stock(uuid, uuid, text)
  to authenticated, service_role;
