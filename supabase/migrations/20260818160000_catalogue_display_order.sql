-- Presentation order of catalogue cards (Library Catalogues and customer /order).
-- Independent of month, special dates, publication, and cake membership sort_order.

alter table public.collections
  add column if not exists display_order integer;

comment on column public.collections.display_order is
  'Owner-controlled display order of catalogue cards. Independent of month, '
  'special-period dates, publication, and cake membership order.';

-- Seed existing rows to match the current Library Catalogues list:
-- current website catalogue first, then remaining by month desc, start_date desc,
-- created_at desc. This must not reshuffle cards merely because the column was added.
with current_id as (
  select (public.storefront_current_collection()).id as id
),
ranked as (
  select
    c.id,
    row_number() over (
      order by
        case
          when c.id = (select id from current_id) then 0
          else 1
        end,
        c.month desc nulls last,
        c.start_date desc nulls last,
        c.created_at desc,
        c.id
    ) - 1 as display_order
  from public.collections c
)
update public.collections as c
set display_order = ranked.display_order
from ranked
where c.id = ranked.id
  and c.display_order is null;

update public.collections
set display_order = 0
where display_order is null;

alter table public.collections
  alter column display_order set default 0,
  alter column display_order set not null;

create index if not exists collections_display_order_idx
  on public.collections (display_order, created_at);
