-- Catalogue date model: monthly identity vs special-occasion window.
-- Monthly catalogues keep collections.month (first day of the Singapore month).
-- Special-occasion catalogues use start_date + end_date; they do not invent a
-- fake month merely to satisfy the old NOT NULL column.
-- storefront_current_collection() continues to select ONLY an active monthly
-- catalogue. A special catalogue never becomes the website catalogue because
-- its dates overlap today.

alter table public.collections
  add column if not exists start_date date;

alter table public.collections
  add column if not exists end_date date;

comment on column public.collections.month is
  'First day of the Singapore calendar month for monthly catalogues. Null for special-occasion catalogues.';

comment on column public.collections.start_date is
  'Inclusive merchandising window start for special-occasion catalogues. Null for monthly catalogues.';

comment on column public.collections.end_date is
  'Inclusive merchandising window end for special-occasion catalogues. Null for monthly catalogues.';

-- Convert any leftover special rows that still carry a placeholder month.
-- Monthly catalogues are not rewritten.
update public.collections
set
  start_date = coalesce(start_date, month),
  end_date = coalesce(
    end_date,
    (date_trunc('month', month) + interval '1 month - 1 day')::date
  ),
  month = null
where purpose = 'special'
  and month is not null;

alter table public.collections
  alter column month drop not null;

alter table public.collections
  drop constraint if exists collections_date_model_check;

alter table public.collections
  add constraint collections_date_model_check
  check (
    (
      purpose = 'monthly'
      and month is not null
      and month = date_trunc('month', month)::date
      and start_date is null
      and end_date is null
    )
    or (
      purpose = 'special'
      and month is null
      and start_date is not null
      and end_date is not null
      and end_date >= start_date
    )
  );

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

comment on function public.storefront_current_collection() is
  'Storefront and submit_guest_preorder share this active/current monthly catalogue. '
  'Prefer Asia/Singapore calendar month; otherwise latest active monthly by month. '
  'Special-occasion catalogues (purpose = special) are never selected, even when '
  'their start_date/end_date include today.';

revoke all on function public.storefront_current_collection() from public;
grant execute on function public.storefront_current_collection() to anon, authenticated;
