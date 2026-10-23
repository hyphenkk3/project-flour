-- Batch the Browse display price reads into one PostgREST request while
-- reusing the existing authoritative per-size resolver unchanged.
create or replace function public.library_cake_size_prices_on(
  p_cake_size_ids uuid[],
  p_pickup_date date
)
returns table (cake_size_id uuid, price numeric(10, 2))
language sql
stable
security invoker
set search_path = public
as $$
  select requested.cake_size_id,
         public.library_cake_size_price_on(
           requested.cake_size_id,
           p_pickup_date
         )
  from unnest(coalesce(p_cake_size_ids, '{}'::uuid[])) with ordinality
       as requested(cake_size_id, request_order)
  order by requested.request_order
$$;

revoke all on function public.library_cake_size_prices_on(uuid[], date)
  from public;
grant execute on function public.library_cake_size_prices_on(uuid[], date)
  to anon, authenticated;

comment on function public.library_cake_size_prices_on(uuid[], date) is
  'Batch display read that delegates every size/date result to the authoritative '
  'library_cake_size_price_on function. Checkout remains the final price authority.';
