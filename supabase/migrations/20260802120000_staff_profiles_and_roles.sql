-- Task 002: Foundation staff identity (single role per staff)
-- Reversible: drop policies/tables in down order if rolling back.

create extension if not exists citext;

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  created_at timestamptz not null default now()
);

create table public.staff_profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users (id) on delete cascade,
  username citext not null unique,
  email text,
  display_name text not null,
  role_id uuid not null references public.roles (id),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_profiles_username_format check (
    username ~ '^[a-zA-Z0-9._-]{3,32}$'
  )
);

create index staff_profiles_role_id_idx on public.staff_profiles (role_id);
create index staff_profiles_is_active_idx on public.staff_profiles (is_active);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger staff_profiles_set_updated_at
before update on public.staff_profiles
for each row
execute function public.set_updated_at();

insert into public.roles (code, name) values
  ('owner', 'Owner'),
  ('manager', 'Manager'),
  ('customer_operations', 'Customer Operations'),
  ('bakery', 'Bakery'),
  ('collection', 'Collection');

alter table public.roles enable row level security;
alter table public.staff_profiles enable row level security;

create policy "Authenticated staff can read roles"
on public.roles
for select
to authenticated
using (true);

create policy "Staff can read own profile"
on public.staff_profiles
for select
to authenticated
using (auth.uid() = auth_user_id);
