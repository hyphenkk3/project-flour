\set ON_ERROR_STOP on

-- Synthetic-only PostgreSQL 17 fixture. Run only in a fresh disposable database.
do $roles$
begin
  if not exists (select 1 from pg_roles where rolname='anon') then execute 'create role anon nologin'; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then execute 'create role authenticated nologin'; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then execute 'create role service_role nologin'; end if;
end
$roles$;

create table public.staff_profiles (
  id uuid primary key,
  is_active boolean not null default true,
  archived_at timestamptz,
  role_id uuid
);
create table public.staff_notification_preferences (
  staff_id uuid not null references public.staff_profiles(id),
  notification_code text not null,
  email_enabled boolean not null default true,
  primary key (staff_id, notification_code)
);
create table public.staff_notification_events (
  id uuid primary key,
  event_key text not null unique,
  code text not null,
  order_id uuid,
  approval_id uuid,
  title text not null,
  description text not null default '',
  href text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create function public.staff_notification_fresh_pick_hold_reminder_is_current(jsonb)
returns boolean language sql immutable as
$$ select coalesce(($1->>'current')::boolean, false) $$;

create schema supabase_migrations;
create table supabase_migrations.schema_migrations(version text primary key);
insert into supabase_migrations.schema_migrations values ('20261106104602');

create table public.cakes(id integer primary key, name text not null);
create table public.collections(id integer primary key, status text not null);
create table public.orders(id integer primary key, status text not null);
create table public.stock(id integer primary key, quantity integer not null);
insert into public.cakes values (1, 'synthetic cake');
insert into public.collections values (1, 'open');
insert into public.orders values (1, 'pending');
insert into public.stock values (1, 3);

begin;
\ir 20261109110501_staff_notification_sound_preference.sql
\ir 20261109193000_staff_notification_push.sql
\ir 20261109213004_staff_notification_preferences_revoke_client_truncate.sql
\ir 20261111110823_staff_notification_fresh_pick_push_handoff.sql
\ir 20261116120000_staff_notification_push_event_scope_reconstructed.sql
commit;

insert into public.staff_profiles (id, is_active) values
  ('00000000-0000-0000-0000-000000000001', true),
  ('00000000-0000-0000-0000-000000000002', true);
insert into public.staff_notification_preferences (staff_id, notification_code, push_enabled)
values
  ('00000000-0000-0000-0000-000000000001', 'new_order', true),
  ('00000000-0000-0000-0000-000000000002', 'new_order', true),
  ('00000000-0000-0000-0000-000000000001', 'fresh_pick_walk_in_hold_reminder', true);
insert into public.staff_notification_push_subscriptions
  (staff_id, endpoint, p256dh, auth_secret, created_at)
values
  ('00000000-0000-0000-0000-000000000001', 'https://push.invalid/a', repeat('p', 80), repeat('a', 16), now() - interval '1 minute'),
  ('00000000-0000-0000-0000-000000000002', 'https://push.invalid/b', repeat('q', 80), repeat('b', 16), now() - interval '1 minute');
insert into public.staff_notification_events (id, event_key, code, title, description, href, payload, created_at) values
  ('10000000-0000-0000-0000-000000000001', 'fixture:10000000-0000-0000-0000-000000000001', 'new_order', 'Synthetic event', '', '/owner', '{}', now()),
  ('10000000-0000-0000-0000-000000000002', 'fixture:10000000-0000-0000-0000-000000000002', 'new_order', 'Synthetic event', '', '/owner', '{}', now()),
  ('10000000-0000-0000-0000-000000000003', 'fixture:10000000-0000-0000-0000-000000000003', 'fresh_pick_walk_in_hold_reminder', 'Synthetic event', '', '/owner', '{"current":false}', now());

-- The same one-event queue call is idempotent and cannot create for its neighbor.
do $$
declare a integer; b integer;
begin
  a := public.queue_staff_notification_push_deliveries('10000000-0000-0000-0000-000000000001', 10);
  b := public.queue_staff_notification_push_deliveries('10000000-0000-0000-0000-000000000001', 10);
  if a <> 2 or b <> 0 then raise exception 'queue idempotency failed: %, %', a, b; end if;
  if exists (select 1 from public.staff_notification_push_deliveries where event_id = '10000000-0000-0000-0000-000000000002') then
    raise exception 'queue escaped event scope';
  end if;
  if public.queue_staff_notification_push_deliveries('10000000-0000-0000-0000-000000000002', 10) <> 2 then
    raise exception 'second event did not queue independently';
  end if;
end $$;

-- A claim cannot suppress or claim a different event's stale Fresh Pick row.
insert into public.staff_notification_push_deliveries (event_id, staff_id, subscription_id, status)
select '10000000-0000-0000-0000-000000000003', sp.id, sub.id, 'pending'
from public.staff_profiles sp
join public.staff_notification_push_subscriptions sub on sub.staff_id = sp.id
where sp.id = '00000000-0000-0000-0000-000000000001';

do $$
declare n integer;
begin
  select count(*) into n from public.claim_staff_notification_push_deliveries(10, '10000000-0000-0000-0000-000000000001', 120)
    where event_id <> '10000000-0000-0000-0000-000000000001';
  if n <> 0 then raise exception 'claim escaped event scope'; end if;
  if (select status from public.staff_notification_push_deliveries where event_id = '10000000-0000-0000-0000-000000000003') <> 'pending' then
    raise exception 'claim changed a different event';
  end if;
  select count(*) into n from public.claim_staff_notification_push_deliveries(10, '10000000-0000-0000-0000-000000000003', 120);
  if n <> 0 then raise exception 'stale Fresh Pick row was claimed'; end if;
  if (select status from public.staff_notification_push_deliveries where event_id = '10000000-0000-0000-0000-000000000003') <> 'suppressed' then
    raise exception 'stale Fresh Pick row was not suppressed';
  end if;
end $$;

-- Missing IDs fail closed; no unscoped queue or claim is possible.
do $$
begin
  begin
    perform public.queue_staff_notification_push_deliveries(null, 10);
    raise exception 'null queue event was accepted';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform * from public.claim_staff_notification_push_deliveries(10, null, 120);
    raise exception 'null claim event was accepted';
  exception when sqlstate '22023' then null;
  end;
end $$;

-- Role grants remain server-only and notification feature defaults stay off.
do $$
begin
  if has_function_privilege('anon', 'public.queue_staff_notification_push_deliveries(uuid,integer)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.queue_staff_notification_push_deliveries(uuid,integer)', 'EXECUTE')
    or not has_function_privilege('service_role', 'public.queue_staff_notification_push_deliveries(uuid,integer)', 'EXECUTE') then
    raise exception 'queue function privilege mismatch';
  end if;
  if has_function_privilege('anon', 'public.claim_staff_notification_push_deliveries(integer,uuid,integer)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.claim_staff_notification_push_deliveries(integer,uuid,integer)', 'EXECUTE')
    or not has_function_privilege('service_role', 'public.claim_staff_notification_push_deliveries(integer,uuid,integer)', 'EXECUTE') then
    raise exception 'claim function privilege mismatch';
  end if;
  if (select bool_or(sound_enabled) from public.staff_notification_preferences)
    or (select bool_or(push_enabled) from public.staff_notification_preferences where notification_code = 'new_order') is not true then
    raise exception 'preference defaults or fixture state mismatch';
  end if;
  if (select count(*) from supabase_migrations.schema_migrations where version = '20261106104602') <> 1
    or (select count(*) from supabase_migrations.schema_migrations) <> 1 then
    raise exception 'migration history changed';
  end if;
  if (select status from public.orders where id=1) <> 'pending'
    or (select name from public.cakes where id=1) <> 'synthetic cake'
    or (select status from public.collections where id=1) <> 'open'
    or (select quantity from public.stock where id=1) <> 3 then
    raise exception 'business fixture changed';
  end if;
end $$;

select 'RECONSTRUCTED_EVENT_SCOPE_SYNTHETIC_FIXTURE=PASS' as result;
