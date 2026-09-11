-- Cake merchandising tags: many-to-many, no assignment cap.
-- Internal names and customer-facing names are the same.
-- Categories remain the Browse filter. Tags are editorial badges only.

create table public.library_cake_tags (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint library_cake_tags_name_not_blank
    check (char_length(trim(name)) > 0),
  constraint library_cake_tags_name_length
    check (char_length(trim(name)) <= 80)
);

create unique index library_cake_tags_name_ci_idx
  on public.library_cake_tags (lower(btrim(name)));

create index library_cake_tags_sort_order_idx
  on public.library_cake_tags (sort_order, name);

create trigger library_cake_tags_set_updated_at
before update on public.library_cake_tags
for each row
execute function public.set_updated_at();

create table public.library_cake_tag_assignments (
  cake_id uuid not null
    references public.library_cakes (id) on delete cascade,
  tag_id uuid not null
    references public.library_cake_tags (id) on delete restrict,
  sort_order integer not null default 1,
  created_at timestamptz not null default now(),
  primary key (cake_id, tag_id),
  constraint library_cake_tag_assignments_sort_order_positive
    check (sort_order >= 1)
);

create index library_cake_tag_assignments_tag_id_idx
  on public.library_cake_tag_assignments (tag_id, cake_id);

alter table public.library_cake_tags enable row level security;
alter table public.library_cake_tag_assignments enable row level security;

create policy library_cake_tags_select
on public.library_cake_tags
for select
to anon, authenticated
using (true);

create policy "Authenticated staff can insert library cake tags"
on public.library_cake_tags
for insert
to authenticated
with check (true);

create policy "Authenticated staff can update library cake tags"
on public.library_cake_tags
for update
to authenticated
using (true)
with check (true);

-- No delete policy: assigned cakes must not be orphaned. Deactivate instead.

create policy library_cake_tag_assignments_select
on public.library_cake_tag_assignments
for select
to anon, authenticated
using (true);

create policy "Authenticated staff can insert cake tag assignments"
on public.library_cake_tag_assignments
for insert
to authenticated
with check (true);

create policy "Authenticated staff can update cake tag assignments"
on public.library_cake_tag_assignments
for update
to authenticated
using (true)
with check (true);

create policy "Authenticated staff can delete cake tag assignments"
on public.library_cake_tag_assignments
for delete
to authenticated
using (true);

grant select on table public.library_cake_tags
  to anon, authenticated;
grant insert, update on table public.library_cake_tags
  to authenticated;

grant select on table public.library_cake_tag_assignments
  to anon, authenticated;
grant insert, update, delete on table public.library_cake_tag_assignments
  to authenticated;

insert into public.library_cake_tags (name, is_active, sort_order)
select incoming.name, true, incoming.sort_order
from (
  values
    ('New!', 1),
    ('Popular', 2),
    ('Back Again', 3),
    ('Seasonal', 4),
    ('Limited', 5)
) as incoming(name, sort_order)
where not exists (
  select 1
  from public.library_cake_tags existing
  where lower(btrim(existing.name)) = lower(incoming.name)
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
      ('Japanese Strawberry')
  ) as expected(cake_name)
  where not exists (
    select 1
    from public.library_cakes cake
    where cake.name = expected.cake_name
  );

  if missing is not null then
    raise exception
      'Cannot assign cake tags; missing exact cake names: %',
      missing;
  end if;

  if exists (
    select 1
    from (
      values
        ('Avocado'),
        ('Japanese Strawberry')
    ) as expected(cake_name)
    join public.library_cakes cake on cake.name = expected.cake_name
    group by expected.cake_name
    having count(*) > 1
  ) then
    raise exception
      'Cannot assign cake tags; duplicate cake names found.';
  end if;
end;
$$;

insert into public.library_cake_tag_assignments (
  cake_id,
  tag_id,
  sort_order
)
select cake.id, tag.id, assignment.sort_order
from (
  values
    ('Avocado', 'Limited', 1),
    ('Japanese Strawberry', 'Limited', 1)
) as assignment(cake_name, tag_name, sort_order)
join public.library_cakes cake
  on cake.name = assignment.cake_name
join public.library_cake_tags tag
  on lower(btrim(tag.name)) = lower(assignment.tag_name)
where not exists (
  select 1
  from public.library_cake_tag_assignments existing
  where existing.cake_id = cake.id
    and existing.tag_id = tag.id
);

notify pgrst, 'reload schema';
