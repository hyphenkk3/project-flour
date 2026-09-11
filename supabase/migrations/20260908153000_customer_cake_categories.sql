-- Customer-facing cake categories: many-to-many, maximum two per cake.
-- Replaces Celebration / Classic / Seasonal / Specialty / Other as the
-- active customer set. Cake records, collections, prices, and photos
-- are preserved. Assignments match cakes by exact name only.

create table public.library_cake_category_assignments (
  cake_id uuid not null
    references public.library_cakes (id) on delete cascade,
  category_id uuid not null
    references public.library_cake_categories (id) on delete restrict,
  sort_order integer not null default 1,
  created_at timestamptz not null default now(),
  primary key (cake_id, category_id),
  constraint library_cake_category_assignments_sort_order_positive
    check (sort_order >= 1)
);

create index library_cake_category_assignments_category_id_idx
  on public.library_cake_category_assignments (category_id, cake_id);

create or replace function public.enforce_library_cake_category_assignment_limit()
returns trigger
language plpgsql
as $$
begin
  if (
    select count(*)::integer
    from public.library_cake_category_assignments
    where cake_id = new.cake_id
  ) > 2 then
    raise exception 'A cake can have at most 2 categories.';
  end if;
  return new;
end;
$$;

create trigger library_cake_category_assignments_limit
after insert on public.library_cake_category_assignments
for each row
execute function public.enforce_library_cake_category_assignment_limit();

alter table public.library_cake_category_assignments enable row level security;

create policy library_cake_category_assignments_select
on public.library_cake_category_assignments
for select
to anon, authenticated
using (true);

create policy "Authenticated staff can insert cake category assignments"
on public.library_cake_category_assignments
for insert
to authenticated
with check (true);

create policy "Authenticated staff can update cake category assignments"
on public.library_cake_category_assignments
for update
to authenticated
using (true)
with check (true);

create policy "Authenticated staff can delete cake category assignments"
on public.library_cake_category_assignments
for delete
to authenticated
using (true);

grant select on table public.library_cake_category_assignments
  to anon, authenticated;
grant insert, update, delete on table public.library_cake_category_assignments
  to authenticated;

alter table public.library_cakes
  alter column category_id drop not null;

insert into public.library_cake_categories (name, is_active, sort_order)
select incoming.name, true, incoming.sort_order
from (
  values
    ('Chocolate', 1),
    ('Fruit', 2),
    ('Tea', 3),
    ('Local Inspired', 4),
    ('Nutty', 5)
) as incoming(name, sort_order)
where not exists (
  select 1
  from public.library_cake_categories existing
  where lower(btrim(existing.name)) = lower(incoming.name)
);

update public.library_cake_categories
set
  is_active = true,
  sort_order = incoming.sort_order
from (
  values
    ('Chocolate', 1),
    ('Fruit', 2),
    ('Tea', 3),
    ('Local Inspired', 4),
    ('Nutty', 5)
) as incoming(name, sort_order)
where lower(btrim(library_cake_categories.name)) = lower(incoming.name);

update public.library_cake_categories
set is_active = false
where lower(btrim(name)) in (
  'celebration',
  'classic',
  'seasonal',
  'specialty',
  'other'
)
and lower(btrim(name)) not in (
  'chocolate',
  'fruit',
  'tea',
  'local inspired',
  'nutty'
);

do $$
declare
  missing text;
begin
  select string_agg(expected.cake_name, ', ' order by expected.cake_name)
  into missing
  from (
    values
      ('Avocado'),
      ('Dubai Chocolate Kunafa (Slightly Sweeter)'),
      ('Pistachio Chocolate (Less Sweet)'),
      ('Salted Peanut'),
      ('Pistachio Raspberry Kiss'),
      ('Signature Yam'),
      ('Chocolate Strawberry'),
      ('Nutty Macadamia'),
      ('Japanese Strawberry'),
      ('Mangolicious Symphony'),
      ('Nenek''s Slice (Salted Pandan)'),
      ('Pandan Mango'),
      ('Matcha Passionfruit'),
      ('Red Dates Serenade Delight'),
      ('Pistachio Mango Crescendo'),
      ('Oolong Rose Lychee'),
      ('Earl Grey Pistachio'),
      ('Chocolate D''Amour')
  ) as expected(cake_name)
  where not exists (
    select 1
    from public.library_cakes cake
    where cake.name = expected.cake_name
  );

  if missing is not null then
    raise exception
      'Cannot assign customer cake categories; missing exact cake names: %',
      missing;
  end if;

  if exists (
    select 1
    from (
      values
        ('Avocado'),
        ('Dubai Chocolate Kunafa (Slightly Sweeter)'),
        ('Pistachio Chocolate (Less Sweet)'),
        ('Salted Peanut'),
        ('Pistachio Raspberry Kiss'),
        ('Signature Yam'),
        ('Chocolate Strawberry'),
        ('Nutty Macadamia'),
        ('Japanese Strawberry'),
        ('Mangolicious Symphony'),
        ('Nenek''s Slice (Salted Pandan)'),
        ('Pandan Mango'),
        ('Matcha Passionfruit'),
        ('Red Dates Serenade Delight'),
        ('Pistachio Mango Crescendo'),
        ('Oolong Rose Lychee'),
        ('Earl Grey Pistachio'),
        ('Chocolate D''Amour')
    ) as expected(cake_name)
    join public.library_cakes cake on cake.name = expected.cake_name
    group by expected.cake_name
    having count(*) > 1
  ) then
    raise exception
      'Cannot assign customer cake categories; duplicate cake names found.';
  end if;
end;
$$;

delete from public.library_cake_category_assignments;

insert into public.library_cake_category_assignments (
  cake_id,
  category_id,
  sort_order
)
select cake.id, category.id, assignment.sort_order
from (
  values
    ('Avocado', 'Fruit', 1),
    ('Dubai Chocolate Kunafa (Slightly Sweeter)', 'Chocolate', 1),
    ('Dubai Chocolate Kunafa (Slightly Sweeter)', 'Nutty', 2),
    ('Pistachio Chocolate (Less Sweet)', 'Chocolate', 1),
    ('Pistachio Chocolate (Less Sweet)', 'Nutty', 2),
    ('Salted Peanut', 'Nutty', 1),
    ('Pistachio Raspberry Kiss', 'Fruit', 1),
    ('Pistachio Raspberry Kiss', 'Nutty', 2),
    ('Signature Yam', 'Local Inspired', 1),
    ('Chocolate Strawberry', 'Chocolate', 1),
    ('Chocolate Strawberry', 'Fruit', 2),
    ('Nutty Macadamia', 'Nutty', 1),
    ('Japanese Strawberry', 'Fruit', 1),
    ('Mangolicious Symphony', 'Fruit', 1),
    ('Nenek''s Slice (Salted Pandan)', 'Local Inspired', 1),
    ('Pandan Mango', 'Local Inspired', 1),
    ('Pandan Mango', 'Fruit', 2),
    ('Matcha Passionfruit', 'Tea', 1),
    ('Matcha Passionfruit', 'Fruit', 2),
    ('Red Dates Serenade Delight', 'Local Inspired', 1),
    ('Red Dates Serenade Delight', 'Fruit', 2),
    ('Pistachio Mango Crescendo', 'Fruit', 1),
    ('Pistachio Mango Crescendo', 'Nutty', 2),
    ('Oolong Rose Lychee', 'Tea', 1),
    ('Oolong Rose Lychee', 'Fruit', 2),
    ('Earl Grey Pistachio', 'Tea', 1),
    ('Earl Grey Pistachio', 'Nutty', 2),
    ('Chocolate D''Amour', 'Chocolate', 1)
) as assignment(cake_name, category_name, sort_order)
join public.library_cakes cake
  on cake.name = assignment.cake_name
join public.library_cake_categories category
  on lower(btrim(category.name)) = lower(assignment.category_name);

update public.library_cakes as cake
set category_id = assigned.category_id
from (
  select distinct on (cake_id)
    cake_id,
    category_id
  from public.library_cake_category_assignments
  order by cake_id, sort_order
) as assigned
where cake.id = assigned.cake_id;

update public.library_cakes
set category_id = null
where id not in (
  select cake_id from public.library_cake_category_assignments
);

notify pgrst, 'reload schema';
