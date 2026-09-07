-- Owner/Manager homepage Popular Cakes curation.
-- Explicit selection only. Not sales ranking, catalogue order, or inferred popularity.
-- Reversible: drop policies, index, then columns.

alter table public.library_cakes
  add column if not exists show_in_popular_cakes boolean not null default false;

alter table public.library_cakes
  add column if not exists popular_cakes_sort_order integer;

comment on column public.library_cakes.show_in_popular_cakes is
  'Owner/Manager homepage Popular Cakes selection. Independent of catalogues and sales.';

comment on column public.library_cakes.popular_cakes_sort_order is
  'Homepage Popular Cakes display order. Lower numbers first. Meaningful when selected.';

create index if not exists library_cakes_popular_cakes_idx
  on public.library_cakes (popular_cakes_sort_order, name)
  where show_in_popular_cakes = true;

-- Guests may read cakes selected for Popular Cakes even when not in a catalogue.
-- Does not replace or weaken collection-membership public select.

drop policy if exists library_cakes_public_select_popular_cakes
  on public.library_cakes;
create policy library_cakes_public_select_popular_cakes
on public.library_cakes
for select
to anon, authenticated
using (show_in_popular_cakes = true);

drop policy if exists library_cake_sizes_public_select_popular_cakes
  on public.library_cake_sizes;
create policy library_cake_sizes_public_select_popular_cakes
on public.library_cake_sizes
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.library_cakes cake
    where cake.id = library_cake_sizes.cake_id
      and cake.show_in_popular_cakes = true
  )
);

drop policy if exists library_cake_photos_public_select_popular_cakes
  on public.library_cake_photos;
create policy library_cake_photos_public_select_popular_cakes
on public.library_cake_photos
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.library_cakes cake
    where cake.id = library_cake_photos.cake_id
      and cake.show_in_popular_cakes = true
  )
);
