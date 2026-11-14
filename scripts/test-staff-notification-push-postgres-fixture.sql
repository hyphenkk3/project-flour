do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  else
    alter role service_role nologin bypassrls;
  end if;
end;
$$;

create table public.staff_profiles (
  id uuid primary key,
  is_active boolean not null default true,
  archived_at timestamptz,
  role_id uuid
);

create table public.staff_notification_events (
  id uuid primary key,
  code text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- The DEV handoff calls this real hold validator. The compatibility fixture
-- stubs only its physical-stock decision so queue/suppression behavior remains
-- deterministic without reproducing the unrelated stock subsystem.
create function public.staff_notification_fresh_pick_hold_reminder_is_current(p_payload jsonb)
returns boolean
language sql
stable
as $$ select coalesce((p_payload ->> 'fixture_hold_current')::boolean, false) $$;
revoke all on function public.staff_notification_fresh_pick_hold_reminder_is_current(jsonb)
  from public, anon, authenticated;
grant execute on function public.staff_notification_fresh_pick_hold_reminder_is_current(jsonb)
  to service_role;

create table public.staff_notification_preferences (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff_profiles(id),
  notification_code text not null,
  web_enabled boolean not null default true,
  sound_enabled boolean not null default false,
  unique (staff_id, notification_code)
);

insert into public.staff_profiles (id, role_id) values
  ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001');

insert into public.staff_notification_preferences (staff_id, notification_code)
values
  ('10000000-0000-4000-8000-000000000001', 'new_order'),
  ('10000000-0000-4000-8000-000000000002', 'new_order'),
  ('10000000-0000-4000-8000-000000000001', 'fresh_pick_walk_in_hold_reminder');
