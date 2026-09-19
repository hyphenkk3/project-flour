-- Customer storefront may see confirmed Extra that is on an active walk-in hold.
-- Visibility is not orderability: existing Extra RPCs still reject held units.
-- Reversible: restore the walk_in_held_until exclusion on this policy.

drop policy if exists extra_stock_public_confirmed_select on public.extra_stock;
create policy extra_stock_public_confirmed_select
on public.extra_stock
for select
to anon
using (
  lifecycle = 'confirmed'
  and sold_at is null
  and confirmed_at is not null
  and pickup_through_at is not null
  and now() >= confirmed_at
  and now() <= pickup_through_at
);
