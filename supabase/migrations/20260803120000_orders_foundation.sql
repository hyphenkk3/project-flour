-- V0.3 Preview 1 / Sprint 1.1: Order Foundation
-- Core order entity for Customer Operations (no products yet).

create type public.order_status as enum (
  'submitted',
  'pending_confirmation',
  'confirmed',
  'awaiting_payment',
  'paid',
  'cancelled',
  'completed'
);

create type public.payment_status as enum (
  'unpaid',
  'paid',
  'refunded'
);

create type public.fulfilment_method as enum (
  'pickup',
  'delivery'
);

-- Daily sequence for ORD-YYYYMMDD-#### in Asia/Singapore.
create table public.order_number_sequences (
  business_date date primary key,
  last_value integer not null default 0,
  constraint order_number_sequences_last_value_positive check (last_value >= 0)
);

create or replace function public.allocate_order_number()
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

  insert into public.order_number_sequences as seq (business_date, last_value)
  values (business_day, 1)
  on conflict (business_date)
  do update set last_value = seq.last_value + 1
  returning seq.last_value into next_value;

  return 'ORD-'
    || to_char(business_day, 'YYYYMMDD')
    || '-'
    || lpad(next_value::text, 4, '0');
end;
$$;

revoke all on function public.allocate_order_number() from public;
grant execute on function public.allocate_order_number() to authenticated;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  customer_id uuid not null references public.customers (id) on delete restrict,
  fulfilment_method public.fulfilment_method not null,
  pickup_date date not null,
  pickup_time time not null,
  status public.order_status not null default 'submitted',
  payment_status public.payment_status not null default 'unpaid',
  internal_notes text,
  customer_notes text,
  created_by uuid references public.staff_profiles (id) on delete set null,
  updated_by uuid references public.staff_profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint orders_order_number_format check (
    order_number ~ '^ORD-[0-9]{8}-[0-9]{4}$'
  )
);

create index orders_customer_id_idx on public.orders (customer_id);
create index orders_pickup_date_idx on public.orders (pickup_date);
create index orders_status_idx on public.orders (status);
create index orders_payment_status_idx on public.orders (payment_status);
create index orders_updated_at_idx on public.orders (updated_at desc);
create index orders_order_number_idx on public.orders (order_number);

create trigger orders_set_updated_at
before update on public.orders
for each row
execute function public.set_updated_at();

alter table public.order_number_sequences enable row level security;
alter table public.orders enable row level security;

-- Sequences are allocated via SECURITY DEFINER function only.
revoke all on table public.order_number_sequences from authenticated, anon;

create policy "Authenticated staff can select orders"
on public.orders
for select
to authenticated
using (true);

create policy "Authenticated staff can insert orders"
on public.orders
for insert
to authenticated
with check (true);

create policy "Authenticated staff can update orders"
on public.orders
for update
to authenticated
using (true)
with check (true);

-- Soft operational control: no hard deletes in V0.3 Preview 1.
-- Delete policy omitted intentionally.
