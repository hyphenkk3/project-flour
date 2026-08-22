-- Owner-controlled customer Browse Past Menu visibility.
-- Independent of publication, card order, website override, and cake membership order.
-- Default false so existing catalogues stay hidden from historical Browse.

alter table public.collections
  add column if not exists show_in_past_menu boolean not null default false;

comment on column public.collections.show_in_past_menu is
  'Owner-controlled: when true, an expired or archived catalogue may appear '
  'in the customer Browse Menu as a view-only Past Menu. Does not affect ordering.';
