-- Library usability: cake Price (not Base Price); drop Story.
-- Collection price overrides stay out of Cake Library (future).
-- Later superseded for pricing by size-only pricing migration.

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'library_cakes'
      and column_name = 'base_price'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'library_cakes'
      and column_name = 'price'
  ) then
    alter table public.library_cakes
      rename column base_price to price;
  end if;
end $$;

alter table public.library_cakes
  drop constraint if exists library_cakes_base_price_non_negative;

alter table public.library_cakes
  drop constraint if exists library_cakes_price_non_negative;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'library_cakes'
      and column_name = 'price'
  ) then
    alter table public.library_cakes
      add constraint library_cakes_price_non_negative check (price >= 0);
  end if;
exception
  when duplicate_object then
    null;
end $$;

alter table public.library_cakes
  drop column if exists story;
