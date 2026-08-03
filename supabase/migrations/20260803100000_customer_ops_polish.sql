-- V0.2 Preview 2: Customer Operations polish
-- Phone normalization, contact uniqueness, single default address.

alter table public.customers
  add column phone_normalized text;

update public.customers
set phone_normalized = nullif(regexp_replace(coalesce(phone_number, ''), '\D', '', 'g'), '')
where phone_number is not null;

update public.customers
set whatsapp_username = nullif(lower(ltrim(trim(whatsapp_username), '@')), '')
where whatsapp_username is not null;

update public.customers
set email = nullif(lower(trim(email)), '')
where email is not null;

alter table public.customers
  add constraint customers_phone_normalized_digits check (
    phone_normalized is null or phone_normalized ~ '^[0-9]+$'
  );

create unique index customers_phone_normalized_unique
  on public.customers (phone_normalized)
  where phone_normalized is not null;

create unique index customers_whatsapp_username_unique
  on public.customers (lower(whatsapp_username))
  where whatsapp_username is not null;

create unique index customers_email_unique
  on public.customers (lower(email))
  where email is not null;

create index customers_phone_normalized_idx
  on public.customers (phone_normalized)
  where phone_normalized is not null;

-- Enforce at most one default address per customer.
drop index if exists public.customer_addresses_default_idx;

create unique index customer_addresses_one_default_idx
  on public.customer_addresses (customer_id)
  where is_default = true;
