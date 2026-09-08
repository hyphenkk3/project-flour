-- Per-collection homepage preview curation.
-- Explicit Owner/Manager selection. Not catalogue order, alphabet, or popularity.
-- Reversible: drop policies/index, then columns.

alter table public.collection_cakes
  add column if not exists show_on_homepage boolean not null default false;

alter table public.collection_cakes
  add column if not exists homepage_sort_order integer;

comment on column public.collection_cakes.show_on_homepage is
  'Owner/Manager homepage preview for this collection. Independent of catalogue sort_order.';

comment on column public.collection_cakes.homepage_sort_order is
  'Homepage preview display order within this collection. Lower numbers first.';

create index if not exists collection_cakes_homepage_preview_idx
  on public.collection_cakes (collection_id, homepage_sort_order)
  where show_on_homepage = true;

-- Historical customer-facing catalogues (archived monthly / published specials)
-- remain readable so Browse All can show cakes Whitebird has offered before.
-- Does not expose drafts or staff-only specials.

drop policy if exists collections_public_select_customer_history
  on public.collections;
create policy collections_public_select_customer_history
on public.collections
for select
to anon, authenticated
using (
  status in ('active', 'archived')
  and purpose in ('monthly', 'special')
  and (
    purpose = 'monthly'
    or website_override = true
    or show_in_past_menu = true
  )
);

drop policy if exists collection_cakes_public_select_customer_history
  on public.collection_cakes;
create policy collection_cakes_public_select_customer_history
on public.collection_cakes
for select
to anon, authenticated
using (
  available = true
  and exists (
    select 1
    from public.collections c
    where c.id = collection_cakes.collection_id
      and c.status in ('active', 'archived')
      and c.purpose in ('monthly', 'special')
      and (
        c.purpose = 'monthly'
        or c.website_override = true
        or c.show_in_past_menu = true
      )
  )
);

drop policy if exists library_cakes_public_select_catalogue_history
  on public.library_cakes;
create policy library_cakes_public_select_catalogue_history
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
      and c.status in ('active', 'archived')
      and c.purpose in ('monthly', 'special')
      and (
        c.purpose = 'monthly'
        or c.website_override = true
        or c.show_in_past_menu = true
      )
  )
);

drop policy if exists library_cake_sizes_public_select_catalogue_history
  on public.library_cake_sizes;
create policy library_cake_sizes_public_select_catalogue_history
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
      and c.status in ('active', 'archived')
      and c.purpose in ('monthly', 'special')
      and (
        c.purpose = 'monthly'
        or c.website_override = true
        or c.show_in_past_menu = true
      )
  )
);

drop policy if exists library_cake_photos_public_select_catalogue_history
  on public.library_cake_photos;
create policy library_cake_photos_public_select_catalogue_history
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
      and c.status in ('active', 'archived')
      and c.purpose in ('monthly', 'special')
      and (
        c.purpose = 'monthly'
        or c.website_override = true
        or c.show_in_past_menu = true
      )
  )
);
