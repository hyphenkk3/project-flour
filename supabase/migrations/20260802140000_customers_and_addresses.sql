-- V0.2 Preview 1: Customer Foundation
-- Customers and addresses for Customer Operations.

create type public.preferred_contact as enum ('phone', 'whatsapp', 'email');

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone_number text,
  whatsapp_username text,
  email text,
  preferred_contact public.preferred_contact not null default 'phone',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customers_full_name_not_blank check (char_length(trim(full_name)) > 0)
);

create index customers_full_name_idx on public.customers (full_name);
create index customers_phone_number_idx on public.customers (phone_number);
create index customers_whatsapp_username_idx on public.customers (whatsapp_username);
create index customers_email_idx on public.customers (email);

create trigger customers_set_updated_at
before update on public.customers
for each row
execute function public.set_updated_at();

create table public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  label text not null,
  recipient_name text not null,
  phone_number text,
  address_line_1 text not null,
  address_line_2 text,
  postcode text not null,
  city text not null,
  state text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_addresses_label_not_blank check (char_length(trim(label)) > 0),
  constraint customer_addresses_recipient_not_blank check (char_length(trim(recipient_name)) > 0),
  constraint customer_addresses_line1_not_blank check (char_length(trim(address_line_1)) > 0)
);

create index customer_addresses_customer_id_idx
  on public.customer_addresses (customer_id);

create index customer_addresses_default_idx
  on public.customer_addresses (customer_id, is_default)
  where is_default = true;

create trigger customer_addresses_set_updated_at
before update on public.customer_addresses
for each row
execute function public.set_updated_at();

alter table public.customers enable row level security;
alter table public.customer_addresses enable row level security;

create policy "Authenticated staff can select customers"
on public.customers
for select
to authenticated
using (true);

create policy "Authenticated staff can insert customers"
on public.customers
for insert
to authenticated
with check (true);

create policy "Authenticated staff can update customers"
on public.customers
for update
to authenticated
using (true)
with check (true);

create policy "Authenticated staff can delete customers"
on public.customers
for delete
to authenticated
using (true);

create policy "Authenticated staff can select customer addresses"
on public.customer_addresses
for select
to authenticated
using (true);

create policy "Authenticated staff can insert customer addresses"
on public.customer_addresses
for insert
to authenticated
with check (true);

create policy "Authenticated staff can update customer addresses"
on public.customer_addresses
for update
to authenticated
using (true)
with check (true);

create policy "Authenticated staff can delete customer addresses"
on public.customer_addresses
for delete
to authenticated
using (true);
