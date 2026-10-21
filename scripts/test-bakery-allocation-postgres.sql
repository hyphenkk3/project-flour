create role anon;
create role authenticated;
create role service_role;

create table public.orders (
  id uuid primary key,
  customer_id uuid,
  extra_stock_id uuid,
  production_started_at timestamptz
);
create table public.order_items (
  id uuid primary key,
  order_id uuid not null references public.orders(id),
  cake_id uuid not null,
  cake_size_id uuid not null,
  cake_name text not null,
  size_label text not null,
  quantity integer not null check (quantity > 0)
);
create table public.extra_stock (
  id uuid primary key,
  order_id uuid,
  lifecycle text not null,
  sold_at timestamptz,
  cut_into_slices_at timestamptz,
  walk_in_held_until timestamptz,
  library_cake_id uuid,
  library_cake_size_id uuid,
  cake_name text not null,
  size_label text not null
);

create function public._bind_rpc_actor(uuid) returns uuid
language sql immutable as $$ select $1 $$;
create function public._staff_role_code(uuid) returns text
language sql immutable as $$
  select case when $1 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid
    then 'bakery' else 'customer_operations' end
$$;
create function public._require_rpc_roles(uuid, text[], text) returns void
language plpgsql immutable as $$
begin
  if public._staff_role_code($1) <> all($2) then raise exception '%', $3; end if;
end
$$;
create function public._mark_guest_order_production_started_impl(uuid, uuid)
returns public.orders language plpgsql as $$
declare result public.orders;
begin
  update public.orders set production_started_at = clock_timestamp()
  where id = $1 returning * into result;
  return result;
end
$$;
create function public.mark_guest_order_production_started(uuid, uuid)
returns public.orders language sql as $$ select public._mark_guest_order_production_started_impl($1, $2) $$;

insert into public.orders(id) values
 ('00000000-0000-0000-0000-000000000001'),
 ('00000000-0000-0000-0000-000000000002'),
 ('00000000-0000-0000-0000-000000000003'),
 ('00000000-0000-0000-0000-000000000004'),
 ('00000000-0000-0000-0000-000000000005'),
 ('00000000-0000-0000-0000-000000000006'),
 ('00000000-0000-0000-0000-000000000007'),
 ('00000000-0000-0000-0000-000000000008');

insert into public.order_items(id, order_id, cake_id, cake_size_id, cake_name, size_label, quantity) values
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','Chocolate','6 inch',2),
 ('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','Chocolate','6 inch',2),
 ('10000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','Chocolate','6 inch',3),
 ('10000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000004','20000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001','Matcha','6 inch',1),
 ('10000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000005','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','Chocolate','6 inch',1),
 ('10000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-000000000006','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','Chocolate','6 inch',1),
 ('10000000-0000-0000-0000-000000000007','00000000-0000-0000-0000-000000000007','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','Chocolate','6 inch',1),
 ('10000000-0000-0000-0000-000000000008','00000000-0000-0000-0000-000000000008','20000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001','Matcha','6 inch',1),
 ('10000000-0000-0000-0000-000000000009','00000000-0000-0000-0000-000000000008','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','Chocolate','6 inch',2);

insert into public.extra_stock(id, order_id, lifecycle, sold_at, library_cake_id, library_cake_size_id, cake_name, size_label) values
 ('40000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','confirmed',clock_timestamp(),'20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','Chocolate','6 inch'),
 ('40000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002','confirmed',clock_timestamp(),'20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','Chocolate','6 inch'),
 ('40000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000003','confirmed',clock_timestamp(),'20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','Chocolate','6 inch'),
 ('40000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000003','confirmed',clock_timestamp(),'20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','Chocolate','6 inch'),
 ('40000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000008','confirmed',clock_timestamp(),'20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','Chocolate','6 inch'),
 ('40000000-0000-0000-0000-000000000008','00000000-0000-0000-0000-000000000005','confirmed',clock_timestamp(),'20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','Chocolate','6 inch'),
 ('40000000-0000-0000-0000-000000000009','00000000-0000-0000-0000-000000000005','confirmed',clock_timestamp(),'20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','Chocolate','6 inch'),
 ('40000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000004','confirmed',clock_timestamp(),'20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','Chocolate','6 inch');

-- Reciprocal link plus legacy pointer must still count each physical row once.
update public.orders set extra_stock_id = '40000000-0000-0000-0000-000000000001'
where id = '00000000-0000-0000-0000-000000000002';
update public.orders set extra_stock_id = '40000000-0000-0000-0000-000000000005'
where id = '00000000-0000-0000-0000-000000000008';

-- Stale primary pointer is deliberately dangling and must fail closed.
update public.orders set extra_stock_id = '49999999-9999-9999-9999-999999999999'
where id = '00000000-0000-0000-0000-000000000006';

-- Unassigned physical stock used by the serialization race test.
insert into public.extra_stock(id, lifecycle, cake_name, size_label)
values ('40000000-0000-0000-0000-000000000007','confirmed','Chocolate','6 inch');
