-- Flexible catalogue-driven complimentary items
-- - Every new/active catalogue can have the standard set
-- - Each catalogue can add/remove/customise items independently
-- - Customer selection is controlled separately from default inclusion

alter table public.collection_complimentary_items
  add column if not exists customer_selectable boolean not null default true;

create index if not exists collection_complimentary_items_customer_selectable_idx
  on public.collection_complimentary_items (collection_id, customer_selectable, sort_order);

-- ---------------------------------------------------------------------------
-- Standard complimentary item library
-- Keep this list extensible. New items can be added without code changes.
-- ---------------------------------------------------------------------------

insert into public.complimentary_item_types (code, name)
values
  ('birthday_topper', 'Birthday Topper'),
  ('mothers_day_topper', 'Mother''s Day Topper'),
  ('fathers_day_topper', 'Father''s Day Topper'),
  ('candle', 'Candle'),
  ('knife', 'Knife')
on conflict (code) do update
set name = excluded.name;

-- ---------------------------------------------------------------------------
-- Ensure every existing collection has the standard complimentary set.
--
-- IMPORTANT:
-- Do NOT overwrite or modify any existing catalogue configuration.
-- Only missing items are inserted.
-- ---------------------------------------------------------------------------

insert into public.collection_complimentary_items (
  collection_id,
  complimentary_item_type_id,
  is_available,
  is_default,
  customer_selectable,
  default_quantity,
  sort_order
)
select
  c.id,
  t.id,
  true,
  true,
  true,
  1,
  case t.code
    when 'birthday_topper' then 0
    when 'candle' then 1
    when 'knife' then 2
    else 10
  end
from public.collections c
cross join public.complimentary_item_types t
where t.code in (
  'birthday_topper',
  'candle',
  'knife'
)
and not exists (
  select 1
  from public.collection_complimentary_items existing
  where existing.collection_id = c.id
    and existing.complimentary_item_type_id = t.id
);

-- ---------------------------------------------------------------------------
-- Make sure the new standard set is also automatically attached to
-- newly-created collections.
--
-- This trigger only inserts missing standard items and never overwrites
-- catalogue-specific customisation.
-- ---------------------------------------------------------------------------

create or replace function public.seed_collection_complimentary_items()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.collection_complimentary_items (
    collection_id,
    complimentary_item_type_id,
    is_available,
    is_default,
    customer_selectable,
    default_quantity,
    sort_order
  )
  select
    new.id,
    t.id,
    true,
    true,
    true,
    1,
    case t.code
      when 'birthday_topper' then 0
      when 'candle' then 1
      when 'knife' then 2
      else 10
    end
  from public.complimentary_item_types t
  where t.code in (
    'birthday_topper',
    'candle',
    'knife'
  )
  on conflict (collection_id, complimentary_item_type_id) do nothing;

  return new;
end;
$$;

drop trigger if exists collections_seed_complimentary_items
  on public.collections;

create trigger collections_seed_complimentary_items
after insert on public.collections
for each row
execute function public.seed_collection_complimentary_items();

-- ---------------------------------------------------------------------------
-- Customer selection must be based on catalogue configuration, not on
-- hard-coded complimentary item codes.
-- ---------------------------------------------------------------------------

comment on column public.collection_complimentary_items.customer_selectable is
  'Whether customers may actively select this complimentary item when the catalogue exposes it.';

comment on column public.collection_complimentary_items.is_default is
  'Whether this item is included by default when complimentary options are generated for the catalogue.';
