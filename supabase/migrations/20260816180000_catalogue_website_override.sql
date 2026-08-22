-- Special-occasion catalogues may temporarily replace the monthly website
-- catalogue when the Owner explicitly publishes a website override.
-- Creating or activating a special catalogue does not make it the storefront.
-- Monthly catalogues keep website_override = false.

alter table public.collections
  add column if not exists website_override boolean not null default false;

comment on column public.collections.website_override is
  'Owner-published website override. Meaningful only for special catalogues. '
  'When true and the catalogue is active, storefront_current_collection may '
  'select it for Singapore calendar dates from start_date through end_date.';

alter table public.collections
  drop constraint if exists collections_website_override_purpose_check;

alter table public.collections
  add constraint collections_website_override_purpose_check
  check (
    purpose = 'special'
    or website_override = false
  );

create index if not exists collections_special_website_override_idx
  on public.collections (start_date, end_date)
  where purpose = 'special' and website_override;

create extension if not exists btree_gist;

alter table public.collections
  drop constraint if exists collections_website_override_no_overlap;

alter table public.collections
  add constraint collections_website_override_no_overlap
  exclude using gist (
    daterange(start_date, end_date, '[]') with &&
  )
  where (purpose = 'special' and website_override);

create or replace function public.storefront_collection_for_date(target_date date)
returns public.collections
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  month_start date;
  selected public.collections;
  override_count integer;
begin
  if target_date is null then
    return selected;
  end if;

  select count(*)
  into override_count
  from public.collections c
  where c.status = 'active'
    and c.purpose = 'special'
    and c.website_override = true
    and c.start_date is not null
    and c.end_date is not null
    and target_date >= c.start_date
    and target_date <= c.end_date;

  if override_count > 1 then
    raise exception
      'Multiple published special website overrides cover %',
      target_date;
  end if;

  if override_count = 1 then
    select c.*
    into selected
    from public.collections c
    where c.status = 'active'
      and c.purpose = 'special'
      and c.website_override = true
      and c.start_date is not null
      and c.end_date is not null
      and target_date >= c.start_date
      and target_date <= c.end_date
    limit 1;
    return selected;
  end if;

  month_start := date_trunc('month', target_date)::date;

  select c.*
  into selected
  from public.collections c
  where c.status = 'active'
    and c.purpose = 'monthly'
    and c.month is not null
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
    and c.month is not null
  order by c.month desc, c.created_at desc
  limit 1;

  return selected;
end;
$$;

comment on function public.storefront_collection_for_date(date) is
  'Storefront catalogue for a specific calendar date. Prefer an active special '
  'catalogue with website_override covering that date; otherwise the active '
  'monthly catalogue for that date''s calendar month (else latest monthly). '
  'Timezone conversion to Asia/Singapore is the caller''s responsibility.';

create or replace function public.storefront_current_collection()
returns public.collections
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return public.storefront_collection_for_date(
    timezone('Asia/Singapore', now())::date
  );
end;
$$;

comment on function public.storefront_current_collection() is
  'Storefront and submit_guest_preorder share this catalogue. '
  'Uses the Asia/Singapore calendar date. An Owner-published active special '
  'website override covering today takes priority over the monthly catalogue. '
  'Special catalogues without website_override are never selected.';

revoke all on function public.storefront_collection_for_date(date) from public;
grant execute on function public.storefront_collection_for_date(date)
  to anon, authenticated;

revoke all on function public.storefront_current_collection() from public;
grant execute on function public.storefront_current_collection()
  to anon, authenticated;
