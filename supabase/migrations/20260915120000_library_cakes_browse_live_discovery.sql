-- Browse discovery for live Library cakes (active / seasonal) that have no
-- collection_cakes membership. Complements existing public SELECT policies:
-- active collection, historical customer-facing catalogues, Popular Cakes.
-- Does not grant draft, ready_for_release, or retired through this path.
-- Does not make a cake currently orderable. Reversible: drop the three policies.

drop policy if exists library_cakes_public_select_live_browse
  on public.library_cakes;
create policy library_cakes_public_select_live_browse
on public.library_cakes
for select
to anon, authenticated
using (status in ('active', 'seasonal'));

drop policy if exists library_cake_sizes_public_select_live_browse
  on public.library_cake_sizes;
create policy library_cake_sizes_public_select_live_browse
on public.library_cake_sizes
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.library_cakes cake
    where cake.id = library_cake_sizes.cake_id
      and cake.status in ('active', 'seasonal')
  )
);

drop policy if exists library_cake_photos_public_select_live_browse
  on public.library_cake_photos;
create policy library_cake_photos_public_select_live_browse
on public.library_cake_photos
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.library_cakes cake
    where cake.id = library_cake_photos.cake_id
      and cake.status in ('active', 'seasonal')
  )
);
