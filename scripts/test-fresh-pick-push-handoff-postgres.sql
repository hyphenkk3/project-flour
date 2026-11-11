\set ON_ERROR_STOP on

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
end $$;

create table public.staff_notification_events (
  id uuid primary key, code text not null, payload jsonb not null,
  created_at timestamptz not null default now()
);
create table public.staff_profiles (
  id uuid primary key, is_active boolean not null, archived_at timestamptz
);
create table public.staff_notification_preferences (
  staff_id uuid not null, notification_code text not null,
  push_enabled boolean not null, push_enabled_at timestamptz
);
create table public.staff_notification_push_subscriptions (
  id uuid primary key, staff_id uuid not null, endpoint text not null,
  p256dh text not null, auth_secret text not null,
  expiration_time timestamptz, created_at timestamptz not null default now(), revoked_at timestamptz
);
create table public.staff_notification_push_deliveries (
  id uuid primary key default gen_random_uuid(), event_id uuid not null,
  staff_id uuid not null, subscription_id uuid not null,
  status text not null default 'pending', attempt_count integer not null default 0,
  next_attempt_at timestamptz, claimed_until timestamptz, error_code text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint staff_notification_push_deliveries_event_subscription_unique unique (event_id, subscription_id),
  constraint staff_notification_push_deliveries_status_check check (status in ('pending', 'claimed', 'sent', 'failed')),
  constraint staff_notification_push_deliveries_attempt_check check (attempt_count between 0 and 5)
);
create table public.extra_stock (
  id uuid primary key, lifecycle text not null, sold_at timestamptz,
  cut_into_slices_at timestamptz, walk_in_held_by uuid,
  walk_in_held_at timestamptz, walk_in_held_until timestamptz
);
create function public.extra_walk_in_hold_is_active(timestamptz, timestamptz default now())
returns boolean language sql stable as $$ select $1 is not null and $1 >= $2 $$;
create function public.staff_notification_fresh_pick_hold_reminder_is_current(jsonb)
returns boolean language plpgsql volatile as $$
declare
  p_payload alias for $1;
  v_stock_id uuid; v_held_by uuid; v_held_at timestamptz; v_held_until timestamptz;
  v_stock public.extra_stock;
begin
  if jsonb_typeof(p_payload) is distinct from 'object'
    or coalesce(p_payload ->> 'extra_stock_id', '') !~* '^[0-9a-f-]{36}$'
    or coalesce(p_payload ->> 'walk_in_held_by', '') !~* '^[0-9a-f-]{36}$'
    or nullif(p_payload ->> 'walk_in_held_at', '') is null
    or nullif(p_payload ->> 'walk_in_held_until', '') is null then return false; end if;
  v_stock_id := (p_payload ->> 'extra_stock_id')::uuid;
  v_held_by := (p_payload ->> 'walk_in_held_by')::uuid;
  begin
    v_held_at := (p_payload ->> 'walk_in_held_at')::timestamptz;
    v_held_until := (p_payload ->> 'walk_in_held_until')::timestamptz;
  exception when invalid_datetime_format or datetime_field_overflow then return false; end;
  select * into v_stock from public.extra_stock where id = v_stock_id for update;
  if not found then return false; end if;
  return v_stock.lifecycle = 'confirmed' and v_stock.sold_at is null
    and v_stock.cut_into_slices_at is null and v_stock.walk_in_held_by = v_held_by
    and v_stock.walk_in_held_at = v_held_at and v_stock.walk_in_held_until = v_held_until
    and public.extra_walk_in_hold_is_active(v_stock.walk_in_held_until, clock_timestamp());
end $$;
revoke all on function public.staff_notification_fresh_pick_hold_reminder_is_current(jsonb)
  from public, anon, authenticated;
grant execute on function public.staff_notification_fresh_pick_hold_reminder_is_current(jsonb)
  to service_role;

insert into public.staff_profiles values
  ('00000000-0000-4000-8000-000000000001', true, null),
  ('00000000-0000-4000-8000-000000000002', true, null);
insert into public.staff_notification_preferences values
  ('00000000-0000-4000-8000-000000000001', 'fresh_pick_walk_in_hold_reminder', true, now() - interval '1 hour'),
  ('00000000-0000-4000-8000-000000000002', 'fresh_pick_walk_in_hold_reminder', false, null),
  ('00000000-0000-4000-8000-000000000001', 'order_paid', true, now() - interval '1 hour');
insert into public.staff_notification_push_subscriptions (id, staff_id, endpoint, p256dh, auth_secret, created_at) values
  ('00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000001', 'https://fcm.googleapis.com/a', repeat('a', 80), repeat('b', 16), now() - interval '1 hour'),
  ('00000000-0000-4000-8000-000000000012', '00000000-0000-4000-8000-000000000002', 'https://fcm.googleapis.com/b', repeat('a', 80), repeat('b', 16), now() - interval '1 hour');
insert into public.extra_stock values (
  '00000000-0000-4000-8000-000000000101', 'confirmed', null, null,
  '00000000-0000-4000-8000-000000000001', now(), now() + interval '3 minutes'
);
insert into public.staff_notification_events (id, code, payload) values (
  '00000000-0000-4000-8000-000000000201', 'fresh_pick_walk_in_hold_reminder',
  jsonb_build_object('extra_stock_id', '00000000-0000-4000-8000-000000000101',
    'walk_in_held_by', '00000000-0000-4000-8000-000000000001',
    'walk_in_held_at', (select walk_in_held_at from public.extra_stock where id = '00000000-0000-4000-8000-000000000101'),
    'walk_in_held_until', (select walk_in_held_until from public.extra_stock where id = '00000000-0000-4000-8000-000000000101'))
);
insert into public.staff_notification_events values (
  '00000000-0000-4000-8000-000000000202', 'order_paid', '{}'::jsonb, now()
);

begin;
\ir ../supabase/migrations/20261111120000_staff_notification_fresh_pick_push_handoff.sql
rollback;

do $$
declare
  v_status_constraint text;
begin
  if to_regprocedure('public.list_due_fresh_pick_hold_reminder_push_event_ids(integer)') is not null then
    raise exception 'rollback left the new candidate function installed';
  end if;
  select pg_get_constraintdef(oid) into v_status_constraint
  from pg_constraint
  where conname = 'staff_notification_push_deliveries_status_check';
  if v_status_constraint like '%suppressed%' then
    raise exception 'rollback left the candidate status change installed';
  end if;
end $$;

\ir ../supabase/migrations/20261111120000_staff_notification_fresh_pick_push_handoff.sql
\ir ../supabase/migrations/20261111120000_staff_notification_fresh_pick_push_handoff.sql

do $$
declare
  v_event uuid := '00000000-0000-4000-8000-000000000201';
  v_delivery uuid; v_until timestamptz; v_count integer; v_suppressed integer; v_status text; v_attempt integer;
begin
  if not has_function_privilege('service_role', 'public.list_due_fresh_pick_hold_reminder_push_event_ids(integer)', 'EXECUTE')
    or has_function_privilege('anon', 'public.list_due_fresh_pick_hold_reminder_push_event_ids(integer)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.list_due_fresh_pick_hold_reminder_push_event_ids(integer)', 'EXECUTE') then
    raise exception 'due-event RPC grants are not service-role-only';
  end if;
  if not has_function_privilege('service_role', 'public.staff_notification_fresh_pick_hold_reminder_is_current(jsonb)', 'EXECUTE')
    or has_function_privilege('anon', 'public.staff_notification_fresh_pick_hold_reminder_is_current(jsonb)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.staff_notification_fresh_pick_hold_reminder_is_current(jsonb)', 'EXECUTE') then
    raise exception 'existing hold validator grants are not service-role-only';
  end if;
  if not has_function_privilege('service_role', 'public.suppress_stale_fresh_pick_hold_reminder_push_deliveries()', 'EXECUTE')
    or has_function_privilege('anon', 'public.suppress_stale_fresh_pick_hold_reminder_push_deliveries()', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.suppress_stale_fresh_pick_hold_reminder_push_deliveries()', 'EXECUTE') then
    raise exception 'stale-suppression RPC grants are not service-role-only';
  end if;
  if not (select prosecdef from pg_proc where oid = 'public.list_due_fresh_pick_hold_reminder_push_event_ids(integer)'::regprocedure) then
    raise exception 'due-event RPC is not SECURITY DEFINER';
  end if;
  if not (select prosecdef from pg_proc where oid = 'public.suppress_stale_fresh_pick_hold_reminder_push_deliveries()'::regprocedure) then
    raise exception 'stale-suppression RPC is not SECURITY DEFINER';
  end if;
  if not has_function_privilege('service_role', 'public.queue_staff_notification_push_deliveries(uuid,integer)', 'EXECUTE')
    or has_function_privilege('anon', 'public.queue_staff_notification_push_deliveries(uuid,integer)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.queue_staff_notification_push_deliveries(uuid,integer)', 'EXECUTE')
    or not has_function_privilege('service_role', 'public.claim_staff_notification_push_deliveries(integer,uuid,integer)', 'EXECUTE')
    or has_function_privilege('anon', 'public.claim_staff_notification_push_deliveries(integer,uuid,integer)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.claim_staff_notification_push_deliveries(integer,uuid,integer)', 'EXECUTE')
    or not has_function_privilege('service_role', 'public.complete_staff_notification_push_delivery(uuid,timestamptz,text,text,boolean)', 'EXECUTE')
    or has_function_privilege('anon', 'public.complete_staff_notification_push_delivery(uuid,timestamptz,text,text,boolean)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.complete_staff_notification_push_delivery(uuid,timestamptz,text,text,boolean)', 'EXECUTE') then
    raise exception 'existing Push RPC grants are not service-role-only';
  end if;
  if exists (
    select 1 from public.list_due_fresh_pick_hold_reminder_push_event_ids(10)
    where event_id = '00000000-0000-4000-8000-000000000202'
  ) then
    raise exception 'unrelated event appeared in the Fresh Pick handoff';
  end if;

  if (select count(*) from public.list_due_fresh_pick_hold_reminder_push_event_ids(10) where event_id = v_event) <> 1 then
    raise exception 'eligible reminder candidate missing';
  end if;
  if public.queue_staff_notification_push_deliveries(v_event, 10) <> 1
    or public.queue_staff_notification_push_deliveries(v_event, 10) <> 0 then
    raise exception 'delivery queue was not exactly-once';
  end if;
  if (select count(*) from public.staff_notification_push_deliveries where event_id = v_event) <> 1 then
    raise exception 'Push-disabled staff received a delivery';
  end if;
  select delivery_id, claimed_until into v_delivery, v_until
    from public.claim_staff_notification_push_deliveries(10, v_event, 120);
  if v_delivery is null then raise exception 'eligible delivery was not claimed'; end if;
  if not public.complete_staff_notification_push_delivery(v_delivery, v_until, 'failed', 'transport_error', false) then
    raise exception 'transient failure was not recorded';
  end if;
  select attempt_count, status into v_attempt, v_status from public.staff_notification_push_deliveries where id = v_delivery;
  if v_attempt <> 1 or v_status <> 'failed' then raise exception 'retry state incorrect'; end if;
  update public.staff_notification_push_deliveries set next_attempt_at = now() - interval '1 second' where id = v_delivery;
  select delivery_id, claimed_until into v_delivery, v_until
    from public.claim_staff_notification_push_deliveries(10, v_event, 120);
  if v_delivery is null then raise exception 'due retry not claimed'; end if;
  if not public.complete_staff_notification_push_delivery(v_delivery, v_until, 'sent', null, false) then
    raise exception 'successful retry not completed';
  end if;
  if public.complete_staff_notification_push_delivery(v_delivery, v_until, 'suppressed', 'wrong_reason', false) then
    raise exception 'invalid suppression reason accepted';
  end if;

  -- Extension, release, sale, expiry, and replacement each invalidate the old
  -- event identity. Seed a pending row to verify terminal stale suppression.
  for v_count in 1..5 loop
    declare
      v_stock uuid := ('00000000-0000-4000-8000-' || lpad((500 + v_count)::text, 12, '0'))::uuid;
      v_stale_event uuid := ('00000000-0000-4000-8000-' || lpad((600 + v_count)::text, 12, '0'))::uuid;
      v_held_at timestamptz := now() - interval '2 minutes';
      v_hold_until timestamptz := now() + interval '3 minutes';
      v_payload jsonb;
    begin
      insert into public.extra_stock values (v_stock, 'confirmed', null, null, '00000000-0000-4000-8000-000000000001', v_held_at, v_hold_until);
      v_payload := jsonb_build_object('extra_stock_id', v_stock, 'walk_in_held_by', '00000000-0000-4000-8000-000000000001', 'walk_in_held_at', v_held_at, 'walk_in_held_until', v_hold_until);
      insert into public.staff_notification_events values (v_stale_event, 'fresh_pick_walk_in_hold_reminder', v_payload, now());
      if v_count = 1 then update public.extra_stock set walk_in_held_at = now(), walk_in_held_until = now() + interval '15 minutes' where id = v_stock;
      elsif v_count = 2 then update public.extra_stock set walk_in_held_by = null, walk_in_held_at = null, walk_in_held_until = null where id = v_stock;
      elsif v_count = 3 then update public.extra_stock set sold_at = now() where id = v_stock;
      elsif v_count = 4 then update public.extra_stock set walk_in_held_until = now() - interval '1 second' where id = v_stock;
      else update public.extra_stock set walk_in_held_by = '00000000-0000-4000-8000-000000000002', walk_in_held_at = now() where id = v_stock;
      end if;
      if public.staff_notification_fresh_pick_hold_reminder_is_current(v_payload) then raise exception 'stale state passed validator'; end if;
      if public.queue_staff_notification_push_deliveries(v_stale_event, 10) <> 0 then raise exception 'stale event queued'; end if;
      insert into public.staff_notification_push_deliveries (event_id, staff_id, subscription_id, status)
        values (v_stale_event, '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000011', 'pending');
      v_suppressed := public.suppress_stale_fresh_pick_hold_reminder_push_deliveries();
      if v_suppressed <> 1 then raise exception 'stale cleanup RPC did not suppress exactly one delivery'; end if;
      select status into v_status from public.staff_notification_push_deliveries where event_id = v_stale_event;
      if v_status <> 'suppressed' then raise exception 'stale delivery not terminally suppressed'; end if;
    end;
  end loop;
end $$;

set role service_role;
do $$
begin
  if (select count(*) from public.list_due_fresh_pick_hold_reminder_push_event_ids(10)) <> 0 then
    raise exception 'service_role candidate RPC returned unexpected events after completion';
  end if;
end $$;
reset role;

select 'Fresh Pick Push handoff PostgreSQL fixture: PASS' as result;
