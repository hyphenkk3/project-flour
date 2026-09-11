-- Assign the two remaining current cakes that were not in the original
-- 18-cake customer category list. Names must match library_cakes exactly.

do $$
declare
  missing text;
begin
  select string_agg(expected.cake_name, ', ' order by expected.cake_name)
  into missing
  from (
    values
      ('Decadent Chocolate  (Dark Chocolate, Slightly Sweeter)'),
      ('Refreshing Lemon')
  ) as expected(cake_name)
  where not exists (
    select 1
    from public.library_cakes cake
    where cake.name = expected.cake_name
  );

  if missing is not null then
    raise exception
      'Cannot assign remaining customer cake categories; missing exact cake names: %',
      missing;
  end if;

  if exists (
    select 1
    from (
      values
        ('Decadent Chocolate  (Dark Chocolate, Slightly Sweeter)'),
        ('Refreshing Lemon')
    ) as expected(cake_name)
    join public.library_cakes cake on cake.name = expected.cake_name
    group by expected.cake_name
    having count(*) > 1
  ) then
    raise exception
      'Cannot assign remaining customer cake categories; duplicate cake names found.';
  end if;
end;
$$;

insert into public.library_cake_category_assignments (
  cake_id,
  category_id,
  sort_order
)
select cake.id, category.id, assignment.sort_order
from (
  values
    ('Decadent Chocolate  (Dark Chocolate, Slightly Sweeter)', 'Chocolate', 1),
    ('Refreshing Lemon', 'Fruit', 1)
) as assignment(cake_name, category_name, sort_order)
join public.library_cakes cake
  on cake.name = assignment.cake_name
join public.library_cake_categories category
  on lower(btrim(category.name)) = lower(assignment.category_name)
where not exists (
  select 1
  from public.library_cake_category_assignments existing
  where existing.cake_id = cake.id
    and existing.category_id = category.id
);

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
