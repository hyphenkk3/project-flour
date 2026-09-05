-- Cake category master list.
-- Replaces the hardcoded library_cake_category enum so Owner/Manager can
-- add, rename, reorder, and deactivate categories without a code change.
-- Existing cake assignments are mapped by the previous enum slug; cakes are
-- not deleted or reset.

create table public.library_cake_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint library_cake_categories_name_not_blank
    check (char_length(trim(name)) > 0),
  constraint library_cake_categories_name_length
    check (char_length(trim(name)) <= 80)
);

create unique index library_cake_categories_name_ci_idx
  on public.library_cake_categories (lower(btrim(name)));

create index library_cake_categories_sort_order_idx
  on public.library_cake_categories (sort_order, name);

create trigger library_cake_categories_set_updated_at
before update on public.library_cake_categories
for each row
execute function public.set_updated_at();

insert into public.library_cake_categories (name, is_active, sort_order)
values
  ('Celebration', true, 1),
  ('Classic', true, 2),
  ('Seasonal', true, 3),
  ('Specialty', true, 4),
  ('Other', true, 5);

alter table public.library_cakes
  add column category_id uuid
    references public.library_cake_categories (id) on delete restrict;

update public.library_cakes as cake
set category_id = category.id
from public.library_cake_categories as category
where category.name = case cake.category::text
  when 'celebration' then 'Celebration'
  when 'classic' then 'Classic'
  when 'seasonal' then 'Seasonal'
  when 'specialty' then 'Specialty'
  when 'other' then 'Other'
end;

update public.library_cakes
set category_id = (
  select id
  from public.library_cake_categories
  where name = 'Other'
  limit 1
)
where category_id is null;

alter table public.library_cakes
  alter column category_id set not null;

drop index if exists public.library_cakes_category_idx;

alter table public.library_cakes
  drop column category;

create index library_cakes_category_id_idx
  on public.library_cakes (category_id);

drop type public.library_cake_category;

alter table public.library_cake_categories enable row level security;

create policy library_cake_categories_select
on public.library_cake_categories
for select
to anon, authenticated
using (true);

create policy "Authenticated staff can insert library cake categories"
on public.library_cake_categories
for insert
to authenticated
with check (true);

create policy "Authenticated staff can update library cake categories"
on public.library_cake_categories
for update
to authenticated
using (true)
with check (true);

-- No delete policy: assigned cakes must not be orphaned. Deactivate instead.
