-- Foundation Sprint A: Master Library
-- Reusable business assets for future Whitebird Studio.
-- Planning, Collection Builder, and launch workflows are out of scope.
--
-- Product notes (do not implement here):
-- - Cake Family will be a future permanent relationship on cakes.
-- - Seasonal cake status may move to Collections later; keep enum for now.
-- - Sharing Guide (optional) replaces Serving Guide — no fixed guest counts.
-- - Cake Families may later supply a default Sharing Guide; cakes may override.
-- - Not all assets are collection-controlled; Library must stay independent.
-- - Studio will consume these tables by reference; never invert that dependency.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.library_cake_status as enum (
  'draft',
  'ready_for_release',
  'active',
  'seasonal',
  'retired'
);

create type public.library_cake_category as enum (
  'celebration',
  'classic',
  'seasonal',
  'specialty',
  'other'
);

create type public.library_promotion_status as enum (
  'draft',
  'active',
  'scheduled',
  'expired',
  'retired'
);

create type public.library_voucher_status as enum (
  'draft',
  'active',
  'scheduled',
  'expired',
  'retired'
);

create type public.library_voucher_type as enum (
  'fixed_amount',
  'percentage',
  'complimentary'
);

create type public.library_asset_kind as enum (
  'homepage_hero',
  'collection_cover',
  'promotional_banner',
  'cake_photo',
  'general'
);

create type public.library_asset_status as enum (
  'draft',
  'active',
  'retired'
);

-- ---------------------------------------------------------------------------
-- Assets (reusable images)
-- ---------------------------------------------------------------------------

create table public.library_assets (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  kind public.library_asset_kind not null default 'general',
  image_url text not null,
  alt_text text,
  status public.library_asset_status not null default 'draft',
  created_by uuid references public.staff_profiles (id) on delete set null,
  updated_by uuid references public.staff_profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint library_assets_title_not_blank check (char_length(trim(title)) > 0),
  constraint library_assets_image_url_not_blank check (char_length(trim(image_url)) > 0)
);

create index library_assets_kind_idx on public.library_assets (kind);
create index library_assets_status_idx on public.library_assets (status);
create index library_assets_title_idx on public.library_assets (title);

create trigger library_assets_set_updated_at
before update on public.library_assets
for each row
execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Cakes
-- ---------------------------------------------------------------------------

create table public.library_cakes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category public.library_cake_category not null default 'celebration',
  description text,
  sharing_guide text,
  allergens text[] not null default '{}',
  bakery_notes text,
  status public.library_cake_status not null default 'draft',
  created_by uuid references public.staff_profiles (id) on delete set null,
  updated_by uuid references public.staff_profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint library_cakes_name_not_blank check (char_length(trim(name)) > 0)
);

create index library_cakes_name_idx on public.library_cakes (name);
create index library_cakes_category_idx on public.library_cakes (category);
create index library_cakes_status_idx on public.library_cakes (status);

create trigger library_cakes_set_updated_at
before update on public.library_cakes
for each row
execute function public.set_updated_at();

create table public.library_cake_sizes (
  id uuid primary key default gen_random_uuid(),
  cake_id uuid not null references public.library_cakes (id) on delete cascade,
  label text not null,
  serves text,
  price numeric(10, 2) not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint library_cake_sizes_label_not_blank check (char_length(trim(label)) > 0),
  constraint library_cake_sizes_price_non_negative check (price >= 0)
);

create index library_cake_sizes_cake_id_idx on public.library_cake_sizes (cake_id);

create trigger library_cake_sizes_set_updated_at
before update on public.library_cake_sizes
for each row
execute function public.set_updated_at();

create table public.library_cake_photos (
  id uuid primary key default gen_random_uuid(),
  cake_id uuid not null references public.library_cakes (id) on delete cascade,
  asset_id uuid references public.library_assets (id) on delete set null,
  image_url text not null,
  alt_text text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint library_cake_photos_image_url_not_blank check (char_length(trim(image_url)) > 0)
);

create index library_cake_photos_cake_id_idx on public.library_cake_photos (cake_id);
create index library_cake_photos_asset_id_idx on public.library_cake_photos (asset_id);

create trigger library_cake_photos_set_updated_at
before update on public.library_cake_photos
for each row
execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Promotions
-- ---------------------------------------------------------------------------

create table public.library_promotions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  valid_from date,
  valid_until date,
  status public.library_promotion_status not null default 'draft',
  created_by uuid references public.staff_profiles (id) on delete set null,
  updated_by uuid references public.staff_profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint library_promotions_name_not_blank check (char_length(trim(name)) > 0),
  constraint library_promotions_valid_range check (
    valid_from is null
    or valid_until is null
    or valid_until >= valid_from
  )
);

create index library_promotions_name_idx on public.library_promotions (name);
create index library_promotions_status_idx on public.library_promotions (status);

create trigger library_promotions_set_updated_at
before update on public.library_promotions
for each row
execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Vouchers
-- ---------------------------------------------------------------------------

create table public.library_vouchers (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  voucher_type public.library_voucher_type not null default 'fixed_amount',
  value numeric(10, 2) not null default 0,
  valid_from date,
  valid_until date,
  image_url text,
  asset_id uuid references public.library_assets (id) on delete set null,
  status public.library_voucher_status not null default 'draft',
  created_by uuid references public.staff_profiles (id) on delete set null,
  updated_by uuid references public.staff_profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint library_vouchers_code_not_blank check (char_length(trim(code)) > 0),
  constraint library_vouchers_value_non_negative check (value >= 0),
  constraint library_vouchers_valid_range check (
    valid_from is null
    or valid_until is null
    or valid_until >= valid_from
  ),
  constraint library_vouchers_code_unique unique (code)
);

create index library_vouchers_status_idx on public.library_vouchers (status);
create index library_vouchers_asset_id_idx on public.library_vouchers (asset_id);

create trigger library_vouchers_set_updated_at
before update on public.library_vouchers
for each row
execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS — authenticated staff (role gating remains app-layer for now)
-- ---------------------------------------------------------------------------

alter table public.library_assets enable row level security;
alter table public.library_cakes enable row level security;
alter table public.library_cake_sizes enable row level security;
alter table public.library_cake_photos enable row level security;
alter table public.library_promotions enable row level security;
alter table public.library_vouchers enable row level security;

create policy "Authenticated staff can select library assets"
on public.library_assets for select to authenticated using (true);
create policy "Authenticated staff can insert library assets"
on public.library_assets for insert to authenticated with check (true);
create policy "Authenticated staff can update library assets"
on public.library_assets for update to authenticated using (true) with check (true);
create policy "Authenticated staff can delete library assets"
on public.library_assets for delete to authenticated using (true);

create policy "Authenticated staff can select library cakes"
on public.library_cakes for select to authenticated using (true);
create policy "Authenticated staff can insert library cakes"
on public.library_cakes for insert to authenticated with check (true);
create policy "Authenticated staff can update library cakes"
on public.library_cakes for update to authenticated using (true) with check (true);
create policy "Authenticated staff can delete library cakes"
on public.library_cakes for delete to authenticated using (true);

create policy "Authenticated staff can select library cake sizes"
on public.library_cake_sizes for select to authenticated using (true);
create policy "Authenticated staff can insert library cake sizes"
on public.library_cake_sizes for insert to authenticated with check (true);
create policy "Authenticated staff can update library cake sizes"
on public.library_cake_sizes for update to authenticated using (true) with check (true);
create policy "Authenticated staff can delete library cake sizes"
on public.library_cake_sizes for delete to authenticated using (true);

create policy "Authenticated staff can select library cake photos"
on public.library_cake_photos for select to authenticated using (true);
create policy "Authenticated staff can insert library cake photos"
on public.library_cake_photos for insert to authenticated with check (true);
create policy "Authenticated staff can update library cake photos"
on public.library_cake_photos for update to authenticated using (true) with check (true);
create policy "Authenticated staff can delete library cake photos"
on public.library_cake_photos for delete to authenticated using (true);

create policy "Authenticated staff can select library promotions"
on public.library_promotions for select to authenticated using (true);
create policy "Authenticated staff can insert library promotions"
on public.library_promotions for insert to authenticated with check (true);
create policy "Authenticated staff can update library promotions"
on public.library_promotions for update to authenticated using (true) with check (true);
create policy "Authenticated staff can delete library promotions"
on public.library_promotions for delete to authenticated using (true);

create policy "Authenticated staff can select library vouchers"
on public.library_vouchers for select to authenticated using (true);
create policy "Authenticated staff can insert library vouchers"
on public.library_vouchers for insert to authenticated with check (true);
create policy "Authenticated staff can update library vouchers"
on public.library_vouchers for update to authenticated using (true) with check (true);
create policy "Authenticated staff can delete library vouchers"
on public.library_vouchers for delete to authenticated using (true);
