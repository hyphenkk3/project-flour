-- Generic size pickup-date availability. No catalogue data, prices or historical orders are rewritten.
alter table public.library_cake_sizes
  add column available_from date,
  add column available_until date,
  add constraint library_cake_sizes_availability_range_check
    check (available_from is null or available_until is null or available_until >= available_from);

comment on column public.library_cake_sizes.available_from is 'Earliest eligible pickup date, inclusive. NULL means no lower limit.';
comment on column public.library_cake_sizes.available_until is 'Last eligible pickup date, inclusive. NULL means no upper limit.';

-- Enforce at the common write boundary instead of replacing order RPC bodies.
-- Guest submit (including voucher wrapper), staff preorder and waiting-list
-- conversion all insert order_items. Raising here rolls back their transaction.
-- Fresh Picks physical stock retains its own fulfilment window.
create function public.enforce_preorder_size_availability()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_pickup_date date;
  v_extra_stock_id uuid;
  v_from date;
  v_until date;
  v_label text;
  v_name text;
begin
  select o.pickup_date, o.extra_stock_id into v_pickup_date, v_extra_stock_id
  from public.orders o where o.id = new.order_id;
  if not found then raise exception 'Order is not available'; end if;
  if v_extra_stock_id is not null then return new; end if;

  -- Lock the size until commit so a concurrent admin edit cannot invalidate
  -- the dates between this check and order creation.
  select s.available_from, s.available_until, s.label, c.name
  into v_from, v_until, v_label, v_name
  from public.library_cake_sizes s
  join public.library_cakes c on c.id = s.cake_id
  where s.id = new.cake_size_id and s.cake_id = new.cake_id
  for share of s;
  if not found then raise exception 'Cake size is not available'; end if;
  if v_pickup_date is null then raise exception 'Select a valid pickup date'; end if;
  if v_from is not null and v_pickup_date < v_from then
    raise exception '% %: Available from %. Choose another size or pickup date.', v_name, v_label, to_char(v_from, 'FMDD Mon YYYY');
  end if;
  if v_until is not null and v_pickup_date > v_until then
    raise exception '% %: Available until %. Choose another size or pickup date.', v_name, v_label, to_char(v_until, 'FMDD Mon YYYY');
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_preorder_size_availability() from public;

-- INSERT only: existing confirmed orders and historical snapshots remain unchanged.
create trigger order_items_preorder_size_availability
before insert on public.order_items
for each row execute function public.enforce_preorder_size_availability();
