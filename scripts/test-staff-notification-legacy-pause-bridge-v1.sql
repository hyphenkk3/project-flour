\set ON_ERROR_STOP on

-- Guard against accidentally running this fixture on a hosted or non-disposable
-- database. The harness creates this exact local database before invoking psql.
do $$
begin
  if current_database() <> 'whitebird_email_pause_bridge_disposable' then
    raise exception 'Refusing to run pause-bridge SQL tests outside the named disposable database.';
  end if;
end;
$$;

begin;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin;
  end if;
end;
$$;

create table public.staff_notification_events (
  id uuid primary key,
  created_at timestamptz not null,
  title text not null
);

create table public.staff_notification_email_deliveries (
  id uuid primary key,
  event_id uuid not null,
  staff_id uuid not null,
  status text not null check (status in ('sent', 'failed', 'claimed')),
  error text,
  resend_id text,
  attempt_count integer not null default 0,
  next_attempt_at timestamptz,
  claimed_until timestamptz,
  updated_at timestamptz not null
);

-- Minimal pre-bridge function definitions with the Production signatures and
-- service_role-only grants. CREATE OR REPLACE must retain these grants.
create function public.claim_staff_notification_email_deliveries(
  p_limit integer default 50,
  p_event_id uuid default null,
  p_lease_seconds integer default 120
)
returns table (
  delivery_id uuid,
  event_id uuid,
  staff_id uuid,
  staff_email text,
  claimed_until timestamptz,
  event_key text,
  code text,
  title text,
  description text,
  href text,
  payload jsonb,
  order_id uuid
)
language plpgsql security definer set search_path = public
as $$ begin return; end; $$;

create function public.complete_staff_notification_email_delivery(
  p_event_id uuid,
  p_staff_id uuid,
  p_status text,
  p_error text default null,
  p_resend_id text default null,
  p_claimed_until timestamptz default null
)
returns boolean
language plpgsql security definer set search_path = public
as $$ begin return true; end; $$;

create function public.suppress_staff_notification_email_delivery(
  p_event_id uuid,
  p_staff_id uuid,
  p_reason text,
  p_claimed_until timestamptz
)
returns boolean
language plpgsql security definer set search_path = public
as $$ begin return true; end; $$;

revoke all on function public.claim_staff_notification_email_deliveries(integer, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.claim_staff_notification_email_deliveries(integer, uuid, integer)
  to service_role;
revoke all on function public.complete_staff_notification_email_delivery(uuid, uuid, text, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.complete_staff_notification_email_delivery(uuid, uuid, text, text, text, timestamptz)
  to service_role;
revoke all on function public.suppress_staff_notification_email_delivery(uuid, uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.suppress_staff_notification_email_delivery(uuid, uuid, text, timestamptz)
  to service_role;

insert into public.staff_notification_events (id, created_at, title)
values ('10000000-0000-0000-0000-000000000001', '2026-10-01 00:00:00+00', 'Historical pending event');

insert into public.staff_notification_email_deliveries (
  id, event_id, staff_id, status, error, resend_id, attempt_count,
  next_attempt_at, claimed_until, updated_at
)
values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', 'failed', 'prior failure', null, 3, '2026-10-01 00:00:00+00', null, '2026-10-01 00:00:00+00'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000001', 'claimed', null, null, 1, null, '2026-10-08 00:00:00+00', '2026-10-07 00:00:00+00'),
  ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000001', 'sent', null, 'provider-id', 1, null, null, '2026-10-01 00:00:00+00');

create temporary table bridge_delivery_snapshot as
select * from public.staff_notification_email_deliveries;
create temporary table bridge_event_snapshot as
select * from public.staff_notification_events;
create temporary table bridge_function_snapshot as
select
  p.oid::regprocedure::text as function_signature,
  pg_get_userbyid(p.proowner) as function_owner,
  p.proacl as function_acl,
  pg_get_function_result(p.oid) as function_result
from pg_proc p
where p.oid in (
  'public.claim_staff_notification_email_deliveries(integer,uuid,integer)'::regprocedure,
  'public.complete_staff_notification_email_delivery(uuid,uuid,text,text,text,timestamptz)'::regprocedure,
  'public.suppress_staff_notification_email_delivery(uuid,uuid,text,timestamptz)'::regprocedure
);

\ir ../supabase/migrations/20261009120413_staff_notification_legacy_pause_bridge_v1.sql
\ir ../supabase/migrations/20261009120413_staff_notification_legacy_pause_bridge_v1.sql

do $$
declare
  v_count integer;
  v_completed boolean;
begin
  select count(*) into v_count
  from public.claim_staff_notification_email_deliveries(50, null, 120);
  if v_count <> 0 then
    raise exception 'Legacy claim RPC returned rows while paused.';
  end if;

  v_completed := public.complete_staff_notification_email_delivery(
    '10000000-0000-0000-0000-000000000003',
    '30000000-0000-0000-0000-000000000001',
    'sent', null, 'should-not-write', '2026-10-08 00:00:00+00'
  );
  if v_completed is distinct from false then
    raise exception 'Legacy completion RPC did not fail closed with false.';
  end if;

  v_completed := public.suppress_staff_notification_email_delivery(
    '10000000-0000-0000-0000-000000000003',
    '30000000-0000-0000-0000-000000000001',
    'synthetic stale hold',
    '2026-10-08 00:00:00+00'
  );
  if v_completed is distinct from false then
    raise exception 'Legacy suppression RPC did not fail closed with false.';
  end if;

  if exists (
    (select * from public.staff_notification_email_deliveries
     except select * from bridge_delivery_snapshot)
    union all
    (select * from bridge_delivery_snapshot
     except select * from public.staff_notification_email_deliveries)
  ) then
    raise exception 'Delivery rows changed after bridge RPC calls.';
  end if;

  if exists (
    (select * from public.staff_notification_events
     except select * from bridge_event_snapshot)
    union all
    (select * from bridge_event_snapshot
     except select * from public.staff_notification_events)
  ) then
    raise exception 'Notification event rows changed after bridge RPC calls.';
  end if;

  if exists (
    (
      select
        p.oid::regprocedure::text,
        pg_get_userbyid(p.proowner),
        p.proacl,
        pg_get_function_result(p.oid)
      from pg_proc p
      where p.oid in (
        'public.claim_staff_notification_email_deliveries(integer,uuid,integer)'::regprocedure,
        'public.complete_staff_notification_email_delivery(uuid,uuid,text,text,text,timestamptz)'::regprocedure,
        'public.suppress_staff_notification_email_delivery(uuid,uuid,text,timestamptz)'::regprocedure
      )
      except
      select * from bridge_function_snapshot
    )
    union all
    (
      select * from bridge_function_snapshot
      except
      select
        p.oid::regprocedure::text,
        pg_get_userbyid(p.proowner),
        p.proacl,
        pg_get_function_result(p.oid)
      from pg_proc p
      where p.oid in (
        'public.claim_staff_notification_email_deliveries(integer,uuid,integer)'::regprocedure,
        'public.complete_staff_notification_email_delivery(uuid,uuid,text,text,text,timestamptz)'::regprocedure,
        'public.suppress_staff_notification_email_delivery(uuid,uuid,text,timestamptz)'::regprocedure
      )
    )
  ) then
    raise exception 'Legacy function owners, ACLs, or return types changed.';
  end if;

  if exists (
    select 1 from public.staff_notification_email_deliveries
    where event_id = '10000000-0000-0000-0000-000000000001'
  ) then
    raise exception 'A pending event acquired a delivery row.';
  end if;

  if not has_function_privilege('service_role',
      'public.claim_staff_notification_email_deliveries(integer,uuid,integer)', 'EXECUTE')
     or has_function_privilege('anon',
      'public.claim_staff_notification_email_deliveries(integer,uuid,integer)', 'EXECUTE')
     or has_function_privilege('authenticated',
      'public.claim_staff_notification_email_deliveries(integer,uuid,integer)', 'EXECUTE') then
    raise exception 'Claim RPC grants changed during replacement.';
  end if;

  if not has_function_privilege('service_role',
      'public.complete_staff_notification_email_delivery(uuid,uuid,text,text,text,timestamptz)', 'EXECUTE')
     or has_function_privilege('anon',
      'public.complete_staff_notification_email_delivery(uuid,uuid,text,text,text,timestamptz)', 'EXECUTE')
     or has_function_privilege('authenticated',
      'public.complete_staff_notification_email_delivery(uuid,uuid,text,text,text,timestamptz)', 'EXECUTE') then
    raise exception 'Completion RPC grants changed during replacement.';
  end if;

  if not has_function_privilege('service_role',
      'public.suppress_staff_notification_email_delivery(uuid,uuid,text,timestamptz)', 'EXECUTE')
     or has_function_privilege('anon',
      'public.suppress_staff_notification_email_delivery(uuid,uuid,text,timestamptz)', 'EXECUTE')
     or has_function_privilege('authenticated',
      'public.suppress_staff_notification_email_delivery(uuid,uuid,text,timestamptz)', 'EXECUTE') then
    raise exception 'Suppression RPC grants changed during replacement.';
  end if;

  if not (select prosecdef from pg_proc where oid =
      'public.claim_staff_notification_email_deliveries(integer,uuid,integer)'::regprocedure)
     or not (select prosecdef from pg_proc where oid =
      'public.complete_staff_notification_email_delivery(uuid,uuid,text,text,text,timestamptz)'::regprocedure)
     or not (select prosecdef from pg_proc where oid =
      'public.suppress_staff_notification_email_delivery(uuid,uuid,text,timestamptz)'::regprocedure) then
    raise exception 'SECURITY DEFINER behavior changed.';
  end if;
end;
$$;

rollback;

\echo 'PASS: legacy claim/finalization pause bridge SQL assertions'
