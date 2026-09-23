-- Bind dine-in venue cards to Library Assets by asset id.
-- Does not change venue selection, party rules, or reservation submit.
-- Does not modify existing library_assets rows.

create table if not exists public.dine_in_venue_assets (
  venue public.dine_in_venue primary key,
  asset_id uuid references public.library_assets (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.dine_in_venue_assets is
  'Maps Hyphen / Whitebird dine-in venue cards to Library Asset ids.';
comment on column public.dine_in_venue_assets.asset_id is
  'Library asset shown on the customer dine-in venue card.';

create unique index if not exists dine_in_venue_assets_asset_id_uidx
  on public.dine_in_venue_assets (asset_id)
  where asset_id is not null;

insert into public.dine_in_venue_assets (venue, asset_id)
select 'hyphen'::public.dine_in_venue, a.id
from public.library_assets a
where a.title = 'Hyphen Venue'
order by a.updated_at desc
limit 1
on conflict (venue) do nothing;

insert into public.dine_in_venue_assets (venue, asset_id)
select 'whitebird'::public.dine_in_venue, a.id
from public.library_assets a
where a.title = 'Whitebird Venue'
order by a.updated_at desc
limit 1
on conflict (venue) do nothing;

alter table public.dine_in_venue_assets enable row level security;

drop policy if exists dine_in_venue_assets_public_select
  on public.dine_in_venue_assets;

create policy dine_in_venue_assets_public_select
on public.dine_in_venue_assets
for select
to anon, authenticated
using (true);

grant select on table public.dine_in_venue_assets
  to anon, authenticated;

drop policy if exists library_assets_public_select_dine_in_venues
  on public.library_assets;

create policy library_assets_public_select_dine_in_venues
on public.library_assets
for select
to anon, authenticated
using (
  status = 'active'
  and exists (
    select 1
    from public.dine_in_venue_assets v
    where v.asset_id = library_assets.id
  )
);
