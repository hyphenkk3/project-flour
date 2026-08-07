-- Round 2 correction: cake pricing lives on sizes only.
-- Remove standalone library_cakes.price. Size rows = label + price.

alter table public.library_cakes
  drop column if exists price;

-- Existing null size prices become 0 before requiring a value.
update public.library_cake_sizes
set price = 0
where price is null;

alter table public.library_cake_sizes
  alter column price set default 0;

alter table public.library_cake_sizes
  alter column price set not null;

alter table public.library_cake_sizes
  drop constraint if exists library_cake_sizes_price_non_negative;

alter table public.library_cake_sizes
  add constraint library_cake_sizes_price_non_negative check (price >= 0);
