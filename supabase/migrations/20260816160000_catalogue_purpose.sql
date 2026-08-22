-- Catalogue purpose: monthly (storefront-eligible) vs special-occasion.
-- collections.month remains NOT NULL. Special catalogues still store an
-- occasion / effective month for listing, but must never become the public
-- storefront merely because they are active.
-- storefront_current_collection() previously selected any active row; the
-- latest-active fallback would have picked a later special catalogue.

alter table public.collections
  add column if not exists purpose text not null default 'monthly';

alter table public.collections
  drop constraint if exists collections_purpose_check;

alter table public.collections
  add constraint collections_purpose_check
  check (purpose in ('monthly', 'special'));

comment on column public.collections.purpose is
  'monthly = time-based merchandising catalogue (may be selected by storefront_current_collection). '
  'special = occasion / purpose catalogue; never selected as the public website catalogue.';

create or replace function public.storefront_current_collection()
returns public.collections
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  month_start date;
  selected public.collections;
begin
  month_start := date_trunc(
    'month',
    timezone('Asia/Singapore', now())
  )::date;

  select c.*
  into selected
  from public.collections c
  where c.status = 'active'
    and c.purpose = 'monthly'
    and c.month = month_start
  order by c.created_at desc
  limit 1;

  if selected.id is not null then
    return selected;
  end if;

  select c.*
  into selected
  from public.collections c
  where c.status = 'active'
    and c.purpose = 'monthly'
  order by c.month desc, c.created_at desc
  limit 1;

  return selected;
end;
$$;

comment on function public.storefront_current_collection() is
  'Storefront and submit_guest_preorder share this active/current monthly catalogue. '
  'Prefer Asia/Singapore calendar month; otherwise latest active monthly by month. '
  'Special-occasion catalogues (purpose = special) are never selected.';

revoke all on function public.storefront_current_collection() from public;
grant execute on function public.storefront_current_collection() to anon, authenticated;
