\set ON_ERROR_STOP on
DO $fixture_roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
END;
$fixture_roles$;
create schema auth;

create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create function auth.role() returns text language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon')
$$;

create table public.roles (id uuid primary key, code text not null unique);
create table public.staff_profiles (
  id uuid primary key, auth_user_id uuid unique, role_id uuid not null references public.roles(id),
  is_active boolean not null default true, archived_at timestamptz
);
create function public._bind_rpc_actor(p_claimed_staff_id uuid) returns uuid
language plpgsql stable security definer set search_path=public as $$
declare v_uid uuid; v_staff_id uuid; v_active boolean;
begin
  v_uid := auth.uid();
  if v_uid is null then
    if auth.role() is distinct from 'service_role' then raise exception 'Not authenticated'; end if;
    if p_claimed_staff_id is null then raise exception 'Staff actor is required'; end if;
    select id, is_active into v_staff_id, v_active from public.staff_profiles
      where id=p_claimed_staff_id and archived_at is null;
    if v_staff_id is null or v_active is distinct from true then raise exception 'Not authorized'; end if;
    return v_staff_id;
  end if;
  select id into v_staff_id from public.staff_profiles
    where auth_user_id=v_uid and is_active is distinct from false and archived_at is null;
  if v_staff_id is null or (p_claimed_staff_id is not null and p_claimed_staff_id is distinct from v_staff_id)
    then raise exception 'Not authorized'; end if;
  return v_staff_id;
end $$;
create function public._staff_role_code(p_staff_id uuid) returns text
language sql stable security definer set search_path=public as $$
  select r.code from public.staff_profiles sp join public.roles r on r.id=sp.role_id where sp.id=p_staff_id
$$;

create table public.orders (
  id uuid primary key, order_number text not null unique, status text not null,
  payment_status text not null default 'paid', ready_at timestamptz,
  production_started_at timestamptz,
  pickup_date date not null default current_date + 1,
  picked_up_at timestamptz, out_for_delivery_at timestamptz, delivered_at timestamptz,
  extra_stock_id uuid unique, updated_at timestamptz not null default now()
);
create table public.order_items (
  id uuid primary key, order_id uuid not null references public.orders(id), cake_id uuid,
  cake_size_id uuid, cake_name text not null, size_label text not null, quantity integer not null check(quantity>0)
);
create table public.extra_stock (
  id uuid primary key, library_cake_id uuid, library_cake_size_id uuid,
  cake_name text not null, size_label text not null, lifecycle text not null,
  sold_at timestamptz, cut_into_slices_at timestamptz, cut_into_slices_by uuid, order_id uuid,
  ready_for_collection boolean not null default false,
  pickup_through_at timestamptz, walk_in_held_until timestamptz, updated_at timestamptz not null default now()
);
create index extra_stock_order_id_idx on public.extra_stock(order_id);
alter table public.orders add constraint orders_extra_stock_fk foreign key(extra_stock_id) references public.extra_stock(id) deferrable initially deferred;
create table public.order_timeline_events (
  id bigserial primary key, order_id uuid not null references public.orders(id), event_type text not null,
  actor_staff_id uuid, metadata jsonb not null default '{}'
);
create table public.extra_stock_events (
  id bigserial primary key, extra_stock_id uuid not null references public.extra_stock(id),
  event_type text not null, actor_staff_id uuid, metadata jsonb not null default '{}', created_at timestamptz not null default now()
);
create function public._record_extra_stock_event(p_extra_stock_id uuid, p_event_type text, p_actor_staff_id uuid, p_metadata jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path=public as $$
begin insert into public.extra_stock_events(extra_stock_id,event_type,actor_staff_id,metadata)
  values(p_extra_stock_id,p_event_type,p_actor_staff_id,coalesce(p_metadata,'{}'::jsonb)); end $$;

insert into public.roles(id,code) values
('10000000-0000-0000-0000-000000000001','owner'),
('10000000-0000-0000-0000-000000000002','bakery'),
('10000000-0000-0000-0000-000000000003','customer_operations');
insert into public.staff_profiles(id,auth_user_id,role_id) values
('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002'),
('20000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000003');

create function public.test_expect_rejected(p_stock uuid,p_order uuid,p_error text)
returns void language plpgsql as $$
declare v_timeline bigint; v_events bigint; v_order_stock uuid; v_order_link uuid; v_sold timestamptz; v_stock_order uuid; v_message text;
begin
  select count(*) into v_timeline from public.order_timeline_events;
  select count(*) into v_events from public.extra_stock_events;
  select extra_stock_id into v_order_stock from public.orders where id=p_order;
  select order_id,sold_at into v_stock_order,v_sold from public.extra_stock where id=p_stock;
  begin
    perform public.assign_extra_stock_to_order(p_stock,p_order,'20000000-0000-0000-0000-000000000001');
    raise exception 'TEST_EXPECTED_REJECTION_BUT_ASSIGNMENT_SUCCEEDED';
  exception when others then
    get stacked diagnostics v_message = message_text;
    if v_message = 'TEST_EXPECTED_REJECTION_BUT_ASSIGNMENT_SUCCEEDED' then raise; end if;
    if position(p_error in v_message)=0 then raise exception 'Wrong rejection: % (expected substring %)',v_message,p_error; end if;
  end;
  select extra_stock_id into v_order_link from public.orders where id=p_order;
  if v_order_stock is distinct from v_order_link then raise exception 'Rejected call changed order link'; end if;
  if exists(select 1 from public.extra_stock where id=p_stock and (order_id is distinct from v_stock_order or sold_at is distinct from v_sold)) then
    raise exception 'Rejected call changed stock';
  end if;
  if (select count(*) from public.order_timeline_events)<>v_timeline or (select count(*) from public.extra_stock_events)<>v_events then
    raise exception 'Rejected call wrote audit records';
  end if;
end $$;
