-- Product refinement: Serving Guide → Sharing Guide.
-- Safe if Foundation Sprint A migration already used serving_guide;
-- no-op when library_cakes.sharing_guide already exists.

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'library_cakes'
      and column_name = 'serving_guide'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'library_cakes'
      and column_name = 'sharing_guide'
  ) then
    alter table public.library_cakes
      rename column serving_guide to sharing_guide;
  end if;
end $$;
