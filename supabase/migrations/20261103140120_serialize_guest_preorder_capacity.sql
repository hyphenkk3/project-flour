-- Serialize every transaction that can reserve, release, or change a
-- production-capacity bucket. The lock is date-scoped so unrelated pickup
-- dates continue independently; it remains held until commit or rollback.

create or replace function public._lock_production_capacity_date(p_pickup_date date)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $function$
begin
  if p_pickup_date is null then
    raise exception 'Pickup date is required for capacity locking';
  end if;

  -- Two-key advisory locks reserve the WBPC namespace and use the day offset
  -- as the second key. Separate dates never contend on this lock.
  perform pg_catalog.pg_advisory_xact_lock(
    1463951427,
    (p_pickup_date - date '2000-01-01')
  );
end;
$function$;

alter function public._lock_production_capacity_date(date) owner to postgres;
revoke all on function public._lock_production_capacity_date(date)
  from public, anon, authenticated, service_role;

-- Replace the prior STABLE helper with a VOLATILE helper. VOLATILE is
-- required so the post-lock query sees a competing transaction that committed
-- while this transaction waited for the date lock. Existing booking statuses
-- are preserved; active waiting-list holds are included because they reserve
-- units until converted, released, or expired.
create or replace function public._guest_preorder_item_fully_booked(
  p_pickup_date date,
  p_collection_id uuid,
  p_cake_id uuid,
  p_size_id uuid,
  p_quantity integer
)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $function$
declare
  v_capacity public.production_capacity%rowtype;
  v_used integer;
begin
  if p_quantity is null or p_quantity < 1 then
    return false;
  end if;

  perform public._lock_production_capacity_date(p_pickup_date);

  select c.*
  into v_capacity
  from public.production_capacity c
  where c.pickup_date = p_pickup_date
    and c.library_cake_id = p_cake_id
    and (c.library_cake_size_id is null or c.library_cake_size_id = p_size_id)
    and (c.collection_id is null or c.collection_id = p_collection_id)
  order by
    (c.library_cake_size_id is not null) desc,
    (c.collection_id is not null) desc
  limit 1;

  if not found then
    return false;
  end if;

  select coalesce(sum(oi.quantity), 0)::integer
  into v_used
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where o.pickup_date = p_pickup_date
    and o.extra_stock_id is null
    and o.status::text in (
      'submitted',
      'pending_confirmation',
      'awaiting_payment',
      'paid'
    )
    and oi.cake_id = p_cake_id
    and (
      v_capacity.library_cake_size_id is null
      or oi.cake_size_id = v_capacity.library_cake_size_id
    )
    and (
      v_capacity.collection_id is null
      or o.collection_id = v_capacity.collection_id
    );

  select v_used + coalesce(sum(h.quantity), 0)::integer
  into v_used
  from public.production_capacity_holds h
  where h.capacity_id = v_capacity.id
    and h.status = 'active'
    and h.held_until > now();

  return (v_used + p_quantity) > v_capacity.capacity_quantity;
end;
$function$;

alter function public._guest_preorder_item_fully_booked(date, uuid, uuid, uuid, integer)
  owner to postgres;
revoke all on function public._guest_preorder_item_fully_booked(date, uuid, uuid, uuid, integer)
  from public, anon, authenticated;

-- Capacity administration already takes a bucket-specific advisory lock and
-- then locks matching orders/capacity rows. Take the shared date lock first so
-- that its lock order matches checkouts, order edits and waiting-list holds.
-- Preserve the existing function body, owner and ACLs while inserting only
-- the new first lock. Refuse unexpected function drift instead of replacing
-- an unreviewed implementation.
do $migration$
declare
  v_function oid := to_regprocedure(
    'public.set_production_capacity(uuid,date,uuid,uuid,uuid,integer,text)'
  );
  v_definition text;
  v_original text;
  v_date_lock text := '  perform public._lock_production_capacity_date(p_pickup_date);';
  v_bucket_lock text := '  perform pg_advisory_xact_lock(';
begin
  if v_function is null then
    raise exception 'Expected set_production_capacity(uuid,date,uuid,uuid,uuid,integer,text) is missing';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_proc p
    join pg_catalog.pg_roles r on r.oid = p.proowner
    where p.oid = v_function
      and r.rolname = 'postgres'
      and p.prosecdef
      and p.proconfig @> array['search_path=public']
      and has_function_privilege('authenticated', p.oid, 'EXECUTE')
      and has_function_privilege('service_role', p.oid, 'EXECUTE')
      and not has_function_privilege('anon', p.oid, 'EXECUTE')
  ) then
    raise exception 'set_production_capacity owner, SECURITY DEFINER, search_path, or grants differ from the reviewed DEV contract';
  end if;

  v_definition := pg_catalog.pg_get_functiondef(v_function);
  if position('production_capacity:' in v_definition) = 0
     or position(v_date_lock in v_definition) > 0
     or length(v_definition) - length(replace(v_definition, v_bucket_lock, ''))
        <> length(v_bucket_lock) then
    raise exception 'set_production_capacity body differs from the reviewed lock-order prerequisite';
  end if;

  v_original := v_definition;
  v_definition := replace(
    v_definition,
    v_bucket_lock,
    v_date_lock || E'\n\n' || v_bucket_lock
  );
  if v_definition = v_original then
    raise exception 'Could not insert the shared date lock before the capacity bucket lock';
  end if;

  execute v_definition;

  v_definition := pg_catalog.pg_get_functiondef(v_function);
  if position(v_date_lock in v_definition) = 0
     or position(v_date_lock in v_definition) > position(v_bucket_lock in v_definition) then
    raise exception 'set_production_capacity did not retain the required shared lock order';
  end if;
end;
$migration$;

-- Waiting-list matching is also VOLATILE because it now acquires the same
-- transaction-scoped date lock as checkouts and order mutations.
create or replace function public._waiting_list_matching_capacity(
  p_pickup_date date,
  p_cake_id uuid,
  p_size_id uuid,
  p_collection_id uuid
)
returns public.production_capacity
language plpgsql
volatile
security definer
set search_path = public
as $function$
declare
  v_row public.production_capacity;
begin
  perform public._lock_production_capacity_date(p_pickup_date);

  select c.*
  into v_row
  from public.production_capacity c
  where c.pickup_date = p_pickup_date
    and c.library_cake_id = p_cake_id
    and (c.library_cake_size_id is null or c.library_cake_size_id = p_size_id)
    and (c.collection_id is null or c.collection_id = p_collection_id)
  order by
    (c.library_cake_size_id is not null) desc,
    (c.collection_id is not null) desc
  limit 1;

  return v_row;
end;
$function$;

alter function public._waiting_list_matching_capacity(date, uuid, uuid, uuid)
  owner to postgres;
revoke all on function public._waiting_list_matching_capacity(date, uuid, uuid, uuid)
  from public, anon, authenticated;

-- Lock both sides in date order for moves between dates. These BEFORE triggers
-- cover guest/staff order RPCs, order edits, cancellations, direct permitted
-- row writes, capacity configuration and waiting-list holds.
create or replace function public._lock_capacity_order_row()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  old_consumes boolean := false;
  new_consumes boolean := false;
begin
  if tg_op <> 'INSERT' then
    old_consumes := old.extra_stock_id is null and old.status::text in (
      'submitted', 'pending_confirmation', 'awaiting_payment', 'paid'
    );
  end if;
  if tg_op <> 'DELETE' then
    new_consumes := new.extra_stock_id is null and new.status::text in (
      'submitted', 'pending_confirmation', 'awaiting_payment', 'paid'
    );
  end if;

  if tg_op = 'INSERT' then
    if new_consumes then
      perform public._lock_production_capacity_date(new.pickup_date);
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    if old_consumes then
      perform public._lock_production_capacity_date(old.pickup_date);
    end if;
    return old;
  end if;

  if old_consumes or new_consumes then
    if old_consumes and new_consumes and old.pickup_date <> new.pickup_date then
      if old.pickup_date < new.pickup_date then
        perform public._lock_production_capacity_date(old.pickup_date);
        perform public._lock_production_capacity_date(new.pickup_date);
      else
        perform public._lock_production_capacity_date(new.pickup_date);
        perform public._lock_production_capacity_date(old.pickup_date);
      end if;
    elsif old_consumes then
      perform public._lock_production_capacity_date(old.pickup_date);
    elsif new_consumes then
      perform public._lock_production_capacity_date(new.pickup_date);
    end if;
  end if;
  return new;
end;
$function$;

create or replace function public._lock_capacity_order_item_row()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  old_date date;
  new_date date;
  old_status text;
  new_status text;
  old_extra_stock_id uuid;
  new_extra_stock_id uuid;
begin
  if tg_op <> 'INSERT' then
    select o.pickup_date, o.status::text, o.extra_stock_id into old_date, old_status, old_extra_stock_id
    from public.orders o where o.id = old.order_id;
  end if;
  if tg_op <> 'DELETE' then
    select o.pickup_date, o.status::text, o.extra_stock_id into new_date, new_status, new_extra_stock_id
    from public.orders o where o.id = new.order_id;
  end if;

  if old_extra_stock_id is null
     and old_status in ('submitted', 'pending_confirmation', 'awaiting_payment', 'paid')
     and new_extra_stock_id is null
     and new_status in ('submitted', 'pending_confirmation', 'awaiting_payment', 'paid')
     and old_date is distinct from new_date then
    if old_date < new_date then
      perform public._lock_production_capacity_date(old_date);
      perform public._lock_production_capacity_date(new_date);
    else
      perform public._lock_production_capacity_date(new_date);
      perform public._lock_production_capacity_date(old_date);
    end if;
  elsif old_extra_stock_id is null
    and old_status in ('submitted', 'pending_confirmation', 'awaiting_payment', 'paid') then
    perform public._lock_production_capacity_date(old_date);
  elsif new_extra_stock_id is null
    and new_status in ('submitted', 'pending_confirmation', 'awaiting_payment', 'paid') then
    perform public._lock_production_capacity_date(new_date);
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$function$;

create or replace function public._lock_capacity_definition_row()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $function$
begin
  if tg_op = 'INSERT' then
    perform public._lock_production_capacity_date(new.pickup_date);
    return new;
  elsif tg_op = 'DELETE' then
    perform public._lock_production_capacity_date(old.pickup_date);
    return old;
  end if;

  if old.pickup_date is distinct from new.pickup_date then
    if old.pickup_date < new.pickup_date then
      perform public._lock_production_capacity_date(old.pickup_date);
      perform public._lock_production_capacity_date(new.pickup_date);
    else
      perform public._lock_production_capacity_date(new.pickup_date);
      perform public._lock_production_capacity_date(old.pickup_date);
    end if;
  else
    perform public._lock_production_capacity_date(new.pickup_date);
  end if;
  return new;
end;
$function$;

create or replace function public._lock_capacity_hold_row()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  old_date date;
  new_date date;
begin
  if tg_op <> 'INSERT' then
    select c.pickup_date into old_date
    from public.production_capacity c where c.id = old.capacity_id;
  end if;
  if tg_op <> 'DELETE' then
    select c.pickup_date into new_date
    from public.production_capacity c where c.id = new.capacity_id;
  end if;

  if old_date is not null and new_date is not null and old_date <> new_date then
    if old_date < new_date then
      perform public._lock_production_capacity_date(old_date);
      perform public._lock_production_capacity_date(new_date);
    else
      perform public._lock_production_capacity_date(new_date);
      perform public._lock_production_capacity_date(old_date);
    end if;
  elsif old_date is not null then
    perform public._lock_production_capacity_date(old_date);
  elsif new_date is not null then
    perform public._lock_production_capacity_date(new_date);
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$function$;

-- At deferred-check time all order lines and holds in the transaction are
-- visible. The date lock is already held; the check prevents a staff path or a
-- direct permitted write from bypassing the same capacity boundary.
create or replace function public._assert_order_capacity(p_order_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_order public.orders;
  v_line record;
  v_capacity public.production_capacity;
  v_orders integer;
  v_holds integer;
begin
  select o.* into v_order from public.orders o where o.id = p_order_id;
  if not found or v_order.extra_stock_id is not null or v_order.status::text not in (
    'submitted', 'pending_confirmation', 'awaiting_payment', 'paid'
  ) then
    return;
  end if;

  perform public._lock_production_capacity_date(v_order.pickup_date);

  for v_line in
    select oi.cake_id, oi.cake_size_id
    from public.order_items oi
    where oi.order_id = v_order.id
    group by oi.cake_id, oi.cake_size_id
  loop
    select c.* into v_capacity
    from public.production_capacity c
    where c.pickup_date = v_order.pickup_date
      and c.library_cake_id = v_line.cake_id
      and (c.library_cake_size_id is null or c.library_cake_size_id = v_line.cake_size_id)
      and (c.collection_id is null or c.collection_id = v_order.collection_id)
    order by
      (c.library_cake_size_id is not null) desc,
      (c.collection_id is not null) desc
    limit 1;
    if not found then continue; end if;

    select coalesce(sum(oi.quantity), 0)::integer into v_orders
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where o.pickup_date = v_capacity.pickup_date
      and o.extra_stock_id is null
      and o.status::text in ('submitted', 'pending_confirmation', 'awaiting_payment', 'paid')
      and oi.cake_id = v_capacity.library_cake_id
      and (v_capacity.library_cake_size_id is null or oi.cake_size_id = v_capacity.library_cake_size_id)
      and (v_capacity.collection_id is null or o.collection_id = v_capacity.collection_id);

    select coalesce(sum(h.quantity), 0)::integer into v_holds
    from public.production_capacity_holds h
    where h.capacity_id = v_capacity.id
      and h.status = 'active'
      and h.held_until > now();

    if v_orders + v_holds > v_capacity.capacity_quantity then
      raise exception using
        errcode = '23514',
        message = 'Fully Booked: this date no longer has enough capacity for your order.';
    end if;
  end loop;
end;
$function$;

create or replace function public._assert_capacity_bucket(p_capacity_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_capacity public.production_capacity;
  v_orders integer;
  v_holds integer;
begin
  select c.* into v_capacity
  from public.production_capacity c where c.id = p_capacity_id;
  if not found then return; end if;

  perform public._lock_production_capacity_date(v_capacity.pickup_date);

  select coalesce(sum(oi.quantity), 0)::integer into v_orders
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  join lateral (
    select c2.id
    from public.production_capacity c2
    where c2.pickup_date = o.pickup_date
      and c2.library_cake_id = oi.cake_id
      and (c2.library_cake_size_id is null or c2.library_cake_size_id = oi.cake_size_id)
      and (c2.collection_id is null or c2.collection_id = o.collection_id)
    order by
      (c2.library_cake_size_id is not null) desc,
      (c2.collection_id is not null) desc
    limit 1
  ) chosen on chosen.id = v_capacity.id
  where o.pickup_date = v_capacity.pickup_date
    and o.extra_stock_id is null
    and o.status::text in ('submitted', 'pending_confirmation', 'awaiting_payment', 'paid')
    and oi.cake_id = v_capacity.library_cake_id
    and (v_capacity.library_cake_size_id is null or oi.cake_size_id = v_capacity.library_cake_size_id)
    and (v_capacity.collection_id is null or o.collection_id = v_capacity.collection_id);

  select coalesce(sum(h.quantity), 0)::integer into v_holds
  from public.production_capacity_holds h
  where h.capacity_id = v_capacity.id
    and h.status = 'active'
    and h.held_until > now();

  if v_orders + v_holds > v_capacity.capacity_quantity then
    raise exception using
      errcode = '23514',
      message = 'Capacity cannot be reduced below active orders and waiting-list holds.';
  end if;
end;
$function$;

create or replace function public._check_capacity_after_write()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_order_id uuid;
  v_hold public.production_capacity_holds;
begin
  if tg_table_name = 'orders' then
    if tg_op = 'UPDATE'
      and old.pickup_date is not distinct from new.pickup_date
      and old.collection_id is not distinct from new.collection_id
      and old.status is not distinct from new.status then
      return null;
    end if;
    if tg_op <> 'DELETE' then
      perform public._assert_order_capacity(new.id);
    end if;
    return null;
  elsif tg_table_name = 'order_items' then
    if tg_op = 'UPDATE'
      and old.order_id is not distinct from new.order_id
      and old.cake_id is not distinct from new.cake_id
      and old.cake_size_id is not distinct from new.cake_size_id
      and old.quantity is not distinct from new.quantity then
      return null;
    end if;
    if tg_op <> 'DELETE' then
      perform public._assert_order_capacity(new.order_id);
    end if;
    return null;
  elsif tg_table_name = 'production_capacity_holds' then
    if tg_op = 'UPDATE'
      and old.capacity_id is not distinct from new.capacity_id
      and old.quantity is not distinct from new.quantity
      and old.status is not distinct from new.status
      and old.held_until is not distinct from new.held_until then
      return null;
    end if;
    if tg_op <> 'DELETE' and new.status = 'active' and new.held_until > now() then
      perform public._assert_capacity_bucket(new.capacity_id);
    end if;
    return null;
  elsif tg_table_name = 'production_capacity' then
    if tg_op = 'UPDATE'
      and old.pickup_date is not distinct from new.pickup_date
      and old.library_cake_id is not distinct from new.library_cake_id
      and old.library_cake_size_id is not distinct from new.library_cake_size_id
      and old.collection_id is not distinct from new.collection_id
      and old.capacity_quantity is not distinct from new.capacity_quantity then
      return null;
    end if;
    if tg_op <> 'DELETE' then
      perform public._assert_capacity_bucket(new.id);
    end if;
    return null;
  end if;
  return null;
end;
$function$;

alter function public._lock_capacity_order_row() owner to postgres;
alter function public._lock_capacity_order_item_row() owner to postgres;
alter function public._lock_capacity_definition_row() owner to postgres;
alter function public._lock_capacity_hold_row() owner to postgres;
alter function public._assert_order_capacity(uuid) owner to postgres;
alter function public._assert_capacity_bucket(uuid) owner to postgres;
alter function public._check_capacity_after_write() owner to postgres;

revoke all on function public._lock_capacity_order_row() from public, anon, authenticated, service_role;
revoke all on function public._lock_capacity_order_item_row() from public, anon, authenticated, service_role;
revoke all on function public._lock_capacity_definition_row() from public, anon, authenticated, service_role;
revoke all on function public._lock_capacity_hold_row() from public, anon, authenticated, service_role;
revoke all on function public._assert_order_capacity(uuid) from public, anon, authenticated, service_role;
revoke all on function public._assert_capacity_bucket(uuid) from public, anon, authenticated, service_role;
revoke all on function public._check_capacity_after_write() from public, anon, authenticated, service_role;

drop trigger if exists lock_production_capacity_orders on public.orders;
create trigger lock_production_capacity_orders
before insert or delete or update of pickup_date, collection_id, status, extra_stock_id
on public.orders
for each row execute function public._lock_capacity_order_row();

drop trigger if exists lock_production_capacity_order_items on public.order_items;
create trigger lock_production_capacity_order_items
before insert or update or delete
on public.order_items
for each row execute function public._lock_capacity_order_item_row();

drop trigger if exists lock_production_capacity_definitions on public.production_capacity;
create trigger lock_production_capacity_definitions
before insert or update or delete
on public.production_capacity
for each row execute function public._lock_capacity_definition_row();

drop trigger if exists lock_production_capacity_holds on public.production_capacity_holds;
create trigger lock_production_capacity_holds
before insert or update or delete
on public.production_capacity_holds
for each row execute function public._lock_capacity_hold_row();

drop trigger if exists assert_production_capacity_orders on public.orders;
create constraint trigger assert_production_capacity_orders
after insert or update on public.orders
deferrable initially deferred
for each row execute function public._check_capacity_after_write();

drop trigger if exists assert_production_capacity_order_items on public.order_items;
create constraint trigger assert_production_capacity_order_items
after insert or update on public.order_items
deferrable initially deferred
for each row execute function public._check_capacity_after_write();

drop trigger if exists assert_production_capacity_definitions on public.production_capacity;
create constraint trigger assert_production_capacity_definitions
after insert or update on public.production_capacity
deferrable initially deferred
for each row execute function public._check_capacity_after_write();

drop trigger if exists assert_production_capacity_holds on public.production_capacity_holds;
create constraint trigger assert_production_capacity_holds
after insert or update on public.production_capacity_holds
deferrable initially deferred
for each row execute function public._check_capacity_after_write();

comment on function public._lock_production_capacity_date(date) is
  'Internal transaction-scoped serialization for all production-capacity mutations on one pickup date.';
comment on function public._guest_preorder_item_fully_booked(date, uuid, uuid, uuid, integer) is
  'Authoritative guest capacity check. Locks the pickup date and includes active, unexpired waiting-list holds.';
comment on function public._assert_order_capacity(uuid) is
  'Deferred integrity check ensuring order mutations cannot exceed the matching production-capacity bucket.';
