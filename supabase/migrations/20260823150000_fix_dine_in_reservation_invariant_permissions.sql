-- Allow the internal dine-in reservation invariant trigger to inspect
-- protected order tables without exposing those tables to anon users.

create or replace function public.assert_order_dine_in_reservation_invariant()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order_id uuid;
  v_method public.fulfilment_method;
  v_count integer;
begin
  if tg_table_name = 'orders' then
    if tg_op = 'DELETE' then
      return null;
    end if;

    v_order_id := new.id;
    v_method := new.fulfilment_method;
  else
    v_order_id := coalesce(new.order_id, old.order_id);

    select o.fulfilment_method
      into v_method
    from public.orders o
    where o.id = v_order_id;

    if not found then
      return null;
    end if;
  end if;

  select count(*)
    into v_count
  from public.order_dine_in_reservations r
  where r.order_id = v_order_id;

  if v_method = 'dine_in' and v_count <> 1 then
    raise exception
      'Dine-in orders require exactly one reservation (found %)',
      v_count;
  end if;

  if v_method is distinct from 'dine_in' and v_count <> 0 then
    raise exception
      'Dine-in reservation is not allowed when fulfilment is %',
      v_method;
  end if;

  return null;
end;
$$;

revoke all on function public.assert_order_dine_in_reservation_invariant()
from public, anon, authenticated;
