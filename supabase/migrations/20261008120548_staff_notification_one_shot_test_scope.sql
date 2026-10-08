-- DEV-only single-use staff email test scope.
-- Normal claims remain disabled for the complete test-mode lifecycle.
begin;
set local lock_timeout = '5s';
lock table public.staff_notification_dispatch_config in access exclusive mode;
lock table public.staff_notification_email_deliveries in access exclusive mode;
do $$
begin
  if exists (
    select 1 from public.staff_notification_email_deliveries where status = 'claimed'
  ) then
    raise exception 'One-shot email test migration requires all delivery claims to drain.'
      using errcode = '55006';
  end if;
end;
$$;

alter table public.staff_notification_dispatch_config
  add column if not exists email_dispatch_test_mode boolean not null default false;
alter table public.staff_notification_dispatch_config
  alter column email_dispatch_test_mode set default false,
  alter column email_dispatch_test_mode set not null;

create schema if not exists staff_email_test_private authorization postgres;
revoke all on schema staff_email_test_private from public, anon, authenticated, service_role;

create table staff_email_test_private.staff_notification_email_test_scopes (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.staff_notification_events(id) on delete restrict,
  staff_id uuid not null references public.staff_profiles(id) on delete restrict,
  scope_status text not null check (scope_status in ('pending', 'armed', 'consumed', 'expired', 'revoked')),
  expires_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  created_by text not null,
  claim_result text check (claim_result is null or claim_result in ('claimed', 'not_eligible')),
  claimed_delivery_id uuid references public.staff_notification_email_deliveries(id) on delete restrict,
  provider_attempt_state text not null default 'not_started'
    check (provider_attempt_state in ('not_started', 'authorized', 'accepted', 'failed', 'unknown', 'blocked')),
  provider_attempt_authorized_at timestamptz,
  provider_result_recorded_at timestamptz,
  provider_request_id text,
  provider_error text
);
alter table staff_email_test_private.staff_notification_email_test_scopes enable row level security;
revoke all on table staff_email_test_private.staff_notification_email_test_scopes
  from public, anon, authenticated, service_role;
create unique index staff_notification_email_test_scopes_one_open
  on staff_email_test_private.staff_notification_email_test_scopes ((true))
  where scope_status in ('pending', 'armed');
create index staff_notification_email_test_scopes_event_idx
  on staff_email_test_private.staff_notification_email_test_scopes(event_id);
alter table staff_email_test_private.staff_notification_email_test_scopes owner to postgres;

-- Global app/DB callers fail closed throughout test mode. The dedicated test
-- claim below does not invoke either normal claim RPC.
create or replace function public.staff_notification_email_dispatch_is_enabled()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_enabled boolean;
  v_test_mode boolean;
begin
  begin
    select config.email_dispatch_enabled, config.email_dispatch_test_mode
      into v_enabled, v_test_mode
    from public.staff_notification_dispatch_config config
    where config.id = true;
    if coalesce(v_test_mode, false) then
      -- Test mode never opens ordinary dispatch RPCs. The dedicated one-shot
      -- function below uses its own exact-pair claim implementation.
      return false;
    end if;
    return coalesce(v_enabled, false);
  exception when others then
    return false;
  end;
end;
$$;
alter function public.staff_notification_email_dispatch_is_enabled() owner to postgres;
revoke all on function public.staff_notification_email_dispatch_is_enabled()
  from public, anon, authenticated;
grant execute on function public.staff_notification_email_dispatch_is_enabled()
  to service_role;

CREATE OR REPLACE FUNCTION public.claim_staff_notification_email_deliveries(p_limit integer DEFAULT 50, p_event_id uuid DEFAULT NULL::uuid, p_lease_seconds integer DEFAULT 120, p_staff_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(delivery_id uuid, event_id uuid, staff_id uuid, staff_email text, claimed_until timestamp with time zone, event_key text, code text, title text, description text, href text, payload jsonb, order_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
declare
  v_limit integer := greatest(coalesce(p_limit, 50), 1);
  v_lease interval := make_interval(secs => greatest(coalesce(p_lease_seconds, 120), 1));
begin
  if not coalesce(public.staff_notification_email_dispatch_is_enabled(), false) then
    return;
  end if;

  return query
  with pending_events as materialized (
    select e.id
    from public.staff_notification_events e
    where (p_event_id is null or e.id = p_event_id)
      and not exists (
        select 1 from staff_email_test_private.staff_notification_email_test_scopes test_scope
        where test_scope.event_id = e.id
      )
      and exists (
        select 1
        from public.staff_notification_email_activation_boundary activation
        where activation.singleton is true
          and e.created_at > activation.activated_at
      )
      and (
        e.code is distinct from 'fresh_pick_walk_in_hold_reminder'
        or public.staff_notification_fresh_pick_hold_reminder_is_current(e.payload)
      )
      and exists (
        select 1
        from public.staff_profiles sp
        left join public.staff_notification_preferences pref
          on pref.staff_id = sp.id
         and pref.notification_code = e.code
        left join public.staff_notification_email_deliveries d
          on d.event_id = e.id
         and d.staff_id = sp.id
        where sp.is_active = true
          and sp.email is not null
          and btrim(sp.email) <> ''
          and (p_staff_id is null or sp.id = p_staff_id)
          and coalesce(pref.email_enabled, true) = true
          and (
            d.id is null
            or public.staff_notification_email_delivery_is_claimable(
              d.status,
              d.attempt_count,
              d.next_attempt_at,
              d.claimed_until,
              clock_timestamp()
            )
          )
      )
    order by e.created_at asc
    limit v_limit
    for update skip locked
  ),
  pending_pairs as (
    select
      e.id as event_id,
      sp.id as staff_id,
      btrim(sp.email) as staff_email
    from pending_events pe
    join public.staff_notification_events e
      on e.id = pe.id
    join public.staff_profiles sp
      on sp.is_active = true
     and sp.email is not null
     and btrim(sp.email) <> ''
    left join public.staff_notification_preferences pref
      on pref.staff_id = sp.id
     and pref.notification_code = e.code
    left join public.staff_notification_email_deliveries d
      on d.event_id = e.id
     and d.staff_id = sp.id
    where exists (
        select 1
        from public.staff_notification_email_activation_boundary activation
        where activation.singleton is true
          and e.created_at > activation.activated_at
      )
      and (p_staff_id is null or sp.id = p_staff_id)
      and coalesce(pref.email_enabled, true) = true
      and (
        d.id is null
        or public.staff_notification_email_delivery_is_claimable(
          d.status,
          d.attempt_count,
          d.next_attempt_at,
          d.claimed_until,
          clock_timestamp()
        )
      )
  ),
  claimed as (
    insert into public.staff_notification_email_deliveries (
      event_id,
      staff_id,
      status,
      error,
      resend_id,
      attempt_count,
      next_attempt_at,
      claimed_until,
      updated_at
    )
    select
      pending_pairs.event_id,
      pending_pairs.staff_id,
      'claimed',
      null,
      null,
      0,
      null,
      clock_timestamp() + v_lease,
      clock_timestamp()
    from pending_pairs
    on conflict (event_id, staff_id) do update
    set
      status = 'claimed',
      claimed_until = excluded.claimed_until,
      updated_at = excluded.updated_at
    where public.staff_notification_email_deliveries.status
      not in ('sent', 'suppressed')
      and public.staff_notification_email_delivery_is_claimable(
        public.staff_notification_email_deliveries.status,
        public.staff_notification_email_deliveries.attempt_count,
        public.staff_notification_email_deliveries.next_attempt_at,
        public.staff_notification_email_deliveries.claimed_until,
        clock_timestamp()
      )
    returning
      id,
      public.staff_notification_email_deliveries.event_id,
      public.staff_notification_email_deliveries.staff_id,
      public.staff_notification_email_deliveries.claimed_until
  )
  select
    claimed.id,
    claimed.event_id,
    claimed.staff_id,
    pending_pairs.staff_email,
    claimed.claimed_until,
    e.event_key,
    e.code,
    e.title,
    e.description,
    e.href,
    e.payload,
    e.order_id
  from claimed
  join pending_pairs
    on pending_pairs.event_id = claimed.event_id
   and pending_pairs.staff_id = claimed.staff_id
  join public.staff_notification_events e
    on e.id = claimed.event_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.claim_staff_notification_email_deliveries_for_staff(p_event_id uuid, p_staff_id uuid, p_limit integer DEFAULT 50, p_lease_seconds integer DEFAULT 120)
 RETURNS TABLE(delivery_id uuid, event_id uuid, staff_id uuid, staff_email text, claimed_until timestamp with time zone, event_key text, code text, title text, description text, href text, payload jsonb, order_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
declare
  v_limit integer := greatest(coalesce(p_limit, 50), 1);
  v_lease interval := make_interval(secs => greatest(coalesce(p_lease_seconds, 120), 1));
begin
  if p_event_id is null or p_staff_id is null then
    raise exception 'Targeted staff notification claims require event and staff IDs.'
      using errcode = '22023';
  end if;

  if not coalesce(public.staff_notification_email_dispatch_is_enabled(), false) then
    return;
  end if;

  return query
  with pending_events as materialized (
    select e.id
    from public.staff_notification_events e
    where e.id = p_event_id
      and not exists (
        select 1 from staff_email_test_private.staff_notification_email_test_scopes test_scope
        where test_scope.event_id = e.id
      )
      and exists (
        select 1
        from public.staff_notification_email_activation_boundary activation
        where activation.singleton is true
          and e.created_at > activation.activated_at
      )
      and (
        e.code is distinct from 'fresh_pick_walk_in_hold_reminder'
        or public.staff_notification_fresh_pick_hold_reminder_is_current(e.payload)
      )
      and exists (
        select 1
        from public.staff_profiles sp
        left join public.staff_notification_preferences pref
          on pref.staff_id = sp.id
         and pref.notification_code = e.code
        left join public.staff_notification_email_deliveries d
          on d.event_id = e.id
         and d.staff_id = sp.id
        where sp.is_active = true
          and sp.email is not null
          and btrim(sp.email) <> ''
          and sp.id = p_staff_id
          and coalesce(pref.email_enabled, true) = true
          and (
            d.id is null
            or public.staff_notification_email_delivery_is_claimable(
              d.status,
              d.attempt_count,
              d.next_attempt_at,
              d.claimed_until,
              clock_timestamp()
            )
          )
      )
    order by e.created_at asc
    limit v_limit
    for update skip locked
  ),
  pending_pairs as (
    select
      e.id as event_id,
      sp.id as staff_id,
      btrim(sp.email) as staff_email
    from pending_events pe
    join public.staff_notification_events e
      on e.id = pe.id
    join public.staff_profiles sp
      on sp.is_active = true
     and sp.email is not null
     and btrim(sp.email) <> ''
    left join public.staff_notification_preferences pref
      on pref.staff_id = sp.id
     and pref.notification_code = e.code
    left join public.staff_notification_email_deliveries d
      on d.event_id = e.id
     and d.staff_id = sp.id
    where exists (
        select 1
        from public.staff_notification_email_activation_boundary activation
        where activation.singleton is true
          and e.created_at > activation.activated_at
      )
      and sp.id = p_staff_id
      and coalesce(pref.email_enabled, true) = true
      and (
        d.id is null
        or public.staff_notification_email_delivery_is_claimable(
          d.status,
          d.attempt_count,
          d.next_attempt_at,
          d.claimed_until,
          clock_timestamp()
        )
      )
  ),
  claimed as (
    insert into public.staff_notification_email_deliveries (
      event_id,
      staff_id,
      status,
      error,
      resend_id,
      attempt_count,
      next_attempt_at,
      claimed_until,
      updated_at
    )
    select
      pending_pairs.event_id,
      pending_pairs.staff_id,
      'claimed',
      null,
      null,
      0,
      null,
      clock_timestamp() + v_lease,
      clock_timestamp()
    from pending_pairs
    on conflict (event_id, staff_id) do update
    set
      status = 'claimed',
      claimed_until = excluded.claimed_until,
      updated_at = excluded.updated_at
    where public.staff_notification_email_deliveries.status
      not in ('sent', 'suppressed')
      and public.staff_notification_email_delivery_is_claimable(
        public.staff_notification_email_deliveries.status,
        public.staff_notification_email_deliveries.attempt_count,
        public.staff_notification_email_deliveries.next_attempt_at,
        public.staff_notification_email_deliveries.claimed_until,
        clock_timestamp()
      )
    returning
      id,
      public.staff_notification_email_deliveries.event_id,
      public.staff_notification_email_deliveries.staff_id,
      public.staff_notification_email_deliveries.claimed_until
  )
  select
    claimed.id,
    claimed.event_id,
    claimed.staff_id,
    pending_pairs.staff_email,
    claimed.claimed_until,
    e.event_key,
    e.code,
    e.title,
    e.description,
    e.href,
    e.payload,
    e.order_id
  from claimed
  join pending_pairs
    on pending_pairs.event_id = claimed.event_id
   and pending_pairs.staff_id = claimed.staff_id
  join public.staff_notification_events e
    on e.id = claimed.event_id;
end;
$function$;

-- Owner-created scopes are consumed under a row lock. Normal RPC callers have
-- no transaction-local scope context and therefore remain blocked.
create or replace function public.staff_notification_email_test_scope_is_armed(
  p_scope_id uuid, p_event_id uuid, p_staff_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not coalesce(config.email_dispatch_enabled, false)
     and coalesce(config.email_dispatch_test_mode, false)
     and exists (
       select 1 from staff_email_test_private.staff_notification_email_test_scopes scope
       where scope.id = p_scope_id
         and scope.event_id = p_event_id
         and scope.staff_id = p_staff_id
         and scope.scope_status = 'armed'
         and scope.expires_at > clock_timestamp()
     )
  from public.staff_notification_dispatch_config config
  where config.id = true;
$$;

create or replace function public.claim_staff_notification_email_test_delivery(
  p_scope_id uuid, p_event_id uuid, p_staff_id uuid
)
returns table (
  delivery_id uuid, event_id uuid, staff_id uuid, staff_email text,
  claimed_until timestamptz, event_key text, code text, title text,
  description text, href text, payload jsonb, order_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_gate boolean;
  v_test_mode boolean;
  v_scope staff_email_test_private.staff_notification_email_test_scopes%rowtype;
  v_count integer := 0;
  v_claimed_id uuid;
begin
  if p_scope_id is null or p_event_id is null or p_staff_id is null then
    raise exception 'Scope, event, and staff IDs are required.' using errcode = '22023';
  end if;
  select config.email_dispatch_enabled, config.email_dispatch_test_mode
    into v_gate, v_test_mode
  from public.staff_notification_dispatch_config config
  where config.id = true
  for update;
  if not found or coalesce(v_gate, false) or not coalesce(v_test_mode, false) then return; end if;

  select * into v_scope
  from staff_email_test_private.staff_notification_email_test_scopes scope
  where scope.id = p_scope_id
  for update;
  if not found or v_scope.event_id <> p_event_id or v_scope.staff_id <> p_staff_id
     or v_scope.scope_status <> 'armed' or v_scope.expires_at <= clock_timestamp() then
    return;
  end if;

  return query
  with pending_events as materialized (
    select e.id
    from public.staff_notification_events e
    where e.id = p_event_id
      and e.created_at > (
        select activation.activated_at
        from public.staff_notification_email_activation_boundary activation
        where activation.singleton is true
      )
      and exists (
        select 1 from staff_email_test_private.staff_notification_email_test_scopes scope
        where scope.id = p_scope_id and scope.event_id = e.id
          and scope.staff_id = p_staff_id and scope.scope_status = 'armed'
          and scope.expires_at > clock_timestamp()
      )
      and (
        e.code is distinct from 'fresh_pick_walk_in_hold_reminder'
        or public.staff_notification_fresh_pick_hold_reminder_is_current(e.payload)
      )
      and exists (
        select 1
        from public.staff_profiles sp
        left join public.staff_notification_preferences pref
          on pref.staff_id = sp.id and pref.notification_code = e.code
        left join public.staff_notification_email_deliveries d
          on d.event_id = e.id and d.staff_id = sp.id
        where sp.id = p_staff_id and sp.is_active = true
          and sp.email is not null and btrim(sp.email) <> ''
          and coalesce(pref.email_enabled, true) = true
          and (
            d.id is null
            or public.staff_notification_email_delivery_is_claimable(
              d.status, d.attempt_count, d.next_attempt_at,
              d.claimed_until, clock_timestamp()
            )
          )
      )
    limit 1
    for update skip locked
  ),
  pending_pair as (
    select e.id as event_id, sp.id as staff_id, btrim(sp.email) as staff_email
    from pending_events pe
    join public.staff_notification_events e on e.id = pe.id
    join public.staff_profiles sp on sp.id = p_staff_id
      and sp.is_active = true and sp.email is not null and btrim(sp.email) <> ''
    left join public.staff_notification_preferences pref
      on pref.staff_id = sp.id and pref.notification_code = e.code
    left join public.staff_notification_email_deliveries d
      on d.event_id = e.id and d.staff_id = sp.id
    where coalesce(pref.email_enabled, true) = true
      and (
        d.id is null
        or public.staff_notification_email_delivery_is_claimable(
          d.status, d.attempt_count, d.next_attempt_at,
          d.claimed_until, clock_timestamp()
        )
      )
  ),
  claimed as (
    insert into public.staff_notification_email_deliveries (
      event_id, staff_id, status, error, resend_id, attempt_count,
      next_attempt_at, claimed_until, updated_at
    )
    select pending_pair.event_id, pending_pair.staff_id, 'claimed', null,
      null, 0, null, clock_timestamp() + interval '120 seconds', clock_timestamp()
    from pending_pair
    on conflict (event_id, staff_id) do update
    set status = 'claimed', claimed_until = excluded.claimed_until,
        updated_at = excluded.updated_at
    where public.staff_notification_email_deliveries.status not in ('sent', 'suppressed')
      and public.staff_notification_email_delivery_is_claimable(
        public.staff_notification_email_deliveries.status,
        public.staff_notification_email_deliveries.attempt_count,
        public.staff_notification_email_deliveries.next_attempt_at,
        public.staff_notification_email_deliveries.claimed_until,
        clock_timestamp()
      )
    returning id, public.staff_notification_email_deliveries.event_id,
      public.staff_notification_email_deliveries.staff_id,
      public.staff_notification_email_deliveries.claimed_until
  )
  select claimed.id, claimed.event_id, claimed.staff_id, pending_pair.staff_email,
    claimed.claimed_until, e.event_key, e.code, e.title, e.description,
    e.href, e.payload, e.order_id
  from claimed
  join pending_pair on pending_pair.event_id = claimed.event_id
    and pending_pair.staff_id = claimed.staff_id
  join public.staff_notification_events e on e.id = claimed.event_id;

  get diagnostics v_count = row_count;
  if v_count = 1 then
    select delivery.id into v_claimed_id
    from public.staff_notification_email_deliveries delivery
    where delivery.event_id = p_event_id and delivery.staff_id = p_staff_id
      and delivery.status = 'claimed' and delivery.claimed_until > clock_timestamp();
    update staff_email_test_private.staff_notification_email_test_scopes
    set scope_status = 'consumed', claim_result = 'claimed', claimed_delivery_id = v_claimed_id
    where id = p_scope_id;
  else
    update staff_email_test_private.staff_notification_email_test_scopes
    set scope_status = 'consumed', claim_result = 'not_eligible'
    where id = p_scope_id;
  end if;
end;
$$;

create or replace function public.staff_notification_email_test_scope_is_current(
  p_scope_id uuid, p_event_id uuid, p_staff_id uuid, p_delivery_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not coalesce(config.email_dispatch_enabled, false)
     and coalesce(config.email_dispatch_test_mode, false)
     and exists (
       select 1 from staff_email_test_private.staff_notification_email_test_scopes scope
       join public.staff_notification_email_deliveries delivery
         on delivery.id = scope.claimed_delivery_id
       where scope.id = p_scope_id and scope.event_id = p_event_id
         and scope.staff_id = p_staff_id and scope.claimed_delivery_id = p_delivery_id
         and scope.scope_status = 'consumed'
         and scope.provider_attempt_state = 'not_started'
         and scope.expires_at > clock_timestamp()
         and delivery.event_id = p_event_id and delivery.staff_id = p_staff_id
         and delivery.status = 'claimed'
         and delivery.claimed_until > clock_timestamp()
     )
  from public.staff_notification_dispatch_config config
  where config.id = true;
$$;

create or replace function public.authorize_staff_notification_email_test_provider_attempt(
  p_scope_id uuid, p_event_id uuid, p_staff_id uuid, p_delivery_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_gate boolean;
  v_test_mode boolean;
  v_updated integer;
begin
  select config.email_dispatch_enabled, config.email_dispatch_test_mode
    into v_gate, v_test_mode
  from public.staff_notification_dispatch_config config
  where config.id = true for update;
  if coalesce(v_gate, false) or not coalesce(v_test_mode, false) then return false; end if;
  update staff_email_test_private.staff_notification_email_test_scopes scope
  set provider_attempt_state = 'authorized',
      provider_attempt_authorized_at = clock_timestamp()
  where scope.id = p_scope_id and scope.event_id = p_event_id
    and scope.staff_id = p_staff_id and scope.claimed_delivery_id = p_delivery_id
    and scope.scope_status = 'consumed'
    and scope.provider_attempt_state = 'not_started'
    and scope.expires_at > clock_timestamp()
    and exists (
      select 1 from public.staff_notification_email_deliveries delivery
      where delivery.id = p_delivery_id and delivery.event_id = p_event_id
        and delivery.staff_id = p_staff_id and delivery.status = 'claimed'
        and delivery.claimed_until > clock_timestamp()
    );
  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

create or replace function public.complete_staff_notification_email_test_provider_attempt(
  p_scope_id uuid, p_event_id uuid, p_staff_id uuid,
  p_result text, p_provider_request_id text default null, p_error text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated integer;
begin
  if p_result not in ('accepted', 'failed', 'unknown', 'blocked') then
    raise exception 'Invalid provider result.' using errcode = '22023';
  end if;
  update staff_email_test_private.staff_notification_email_test_scopes scope
  set provider_attempt_state = p_result,
      provider_result_recorded_at = clock_timestamp(),
      provider_request_id = p_provider_request_id,
      provider_error = left(p_error, 2000)
  where scope.id = p_scope_id and scope.event_id = p_event_id
    and scope.staff_id = p_staff_id and scope.scope_status = 'consumed'
    and (
      scope.provider_attempt_state = 'authorized'
      or (p_result = 'blocked' and scope.provider_attempt_state = 'not_started')
    );
  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

alter function public.staff_notification_email_test_scope_is_armed(uuid, uuid, uuid) owner to postgres;
alter function public.claim_staff_notification_email_test_delivery(uuid, uuid, uuid) owner to postgres;
alter function public.staff_notification_email_test_scope_is_current(uuid, uuid, uuid, uuid) owner to postgres;
alter function public.authorize_staff_notification_email_test_provider_attempt(uuid, uuid, uuid, uuid) owner to postgres;
alter function public.complete_staff_notification_email_test_provider_attempt(uuid, uuid, uuid, text, text, text) owner to postgres;
revoke all on function public.staff_notification_email_test_scope_is_armed(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.claim_staff_notification_email_test_delivery(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.staff_notification_email_test_scope_is_current(uuid, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.authorize_staff_notification_email_test_provider_attempt(uuid, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.complete_staff_notification_email_test_provider_attempt(uuid, uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.staff_notification_email_test_scope_is_armed(uuid, uuid, uuid) to service_role;
grant execute on function public.claim_staff_notification_email_test_delivery(uuid, uuid, uuid) to service_role;
grant execute on function public.staff_notification_email_test_scope_is_current(uuid, uuid, uuid, uuid) to service_role;
grant execute on function public.authorize_staff_notification_email_test_provider_attempt(uuid, uuid, uuid, uuid) to service_role;
grant execute on function public.complete_staff_notification_email_test_provider_attempt(uuid, uuid, uuid, text, text, text) to service_role;


-- Manual owner-only arming. No application endpoint can create a test scope.
create or replace function staff_email_test_private.arm_staff_notification_email_test_scope(
  p_scope_id uuid, p_event_id uuid, p_staff_id uuid, p_expires_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dispatch_url text;
  v_per_event boolean;
  v_enabled boolean;
  v_test_mode boolean;
  v_activated_at timestamptz;
begin
  if p_scope_id is null or p_event_id is null or p_staff_id is null
     or p_expires_at <= clock_timestamp()
     or p_expires_at > clock_timestamp() + interval '10 minutes' then
    raise exception 'A valid scope and expiry no more than ten minutes away are required.'
      using errcode = '22023';
  end if;
  lock table public.staff_notification_dispatch_config in share row exclusive mode;
  lock table public.staff_notification_email_deliveries in share row exclusive mode;
  select config.dispatch_url, config.per_event_enabled,
         config.email_dispatch_enabled, config.email_dispatch_test_mode
    into v_dispatch_url, v_per_event, v_enabled, v_test_mode
  from public.staff_notification_dispatch_config config
  where config.id = true for update;
  if not found or coalesce(v_enabled, false) or coalesce(v_test_mode, false)
     or v_dispatch_url is not null or coalesce(v_per_event, false) then
    raise exception 'DEV email dispatch must be fully disabled before arming a test.'
      using errcode = '55000';
  end if;
  if exists (
    select 1 from public.staff_notification_email_deliveries
    where status = 'claimed'
  ) then
    raise exception 'All existing delivery claims must drain before arming a test.'
      using errcode = '55006';
  end if;
  select activation.activated_at into v_activated_at
  from public.staff_notification_email_activation_boundary activation
  where activation.singleton is true;
  if v_activated_at is null or not exists (
    select 1 from public.staff_notification_events event
    where event.id = p_event_id and event.created_at > v_activated_at
  ) then
    raise exception 'The test event must be strictly newer than the activation boundary.'
      using errcode = '55000';
  end if;
  if not exists (
    select 1 from public.staff_profiles staff
    where staff.id = p_staff_id and staff.is_active = true
      and staff.email is not null and btrim(staff.email) <> ''
  ) then
    raise exception 'The approved staff recipient is not active or has no email.'
      using errcode = '55000';
  end if;
  if exists (
    select 1 from public.staff_notification_email_deliveries delivery
    where delivery.event_id = p_event_id
  ) then
    raise exception 'A test event must not already have email delivery rows.'
      using errcode = '55000';
  end if;
  insert into staff_email_test_private.staff_notification_email_test_scopes(
    id, event_id, staff_id, scope_status, expires_at, created_by
  ) values (p_scope_id, p_event_id, p_staff_id, 'armed', p_expires_at, session_user::text);
  update public.staff_notification_dispatch_config
  set email_dispatch_test_mode = true,
      updated_at = clock_timestamp()
  where id = true;
  return true;
end;
$$;

-- Atomic shutdown: the committed state has both flags false. Every normal
-- claim checks the master flag, so no global claim resumes before that commit.
create or replace function staff_email_test_private.shutdown_staff_notification_email_test_scope(
  p_scope_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated integer;
begin
  lock table public.staff_notification_dispatch_config in share row exclusive mode;
  lock table staff_email_test_private.staff_notification_email_test_scopes in share row exclusive mode;
  update public.staff_notification_dispatch_config
  set email_dispatch_enabled = false,
      email_dispatch_test_mode = false,
      updated_at = clock_timestamp()
  where id = true;
  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    raise exception 'Dispatch config singleton missing; shutdown failed closed.'
      using errcode = '55000';
  end if;
  update staff_email_test_private.staff_notification_email_test_scopes
  set scope_status = 'revoked'
  where id = p_scope_id and scope_status in ('pending', 'armed');
  return true;
end;
$$;

alter function staff_email_test_private.arm_staff_notification_email_test_scope(uuid, uuid, uuid, timestamptz) owner to postgres;
alter function staff_email_test_private.shutdown_staff_notification_email_test_scope(uuid) owner to postgres;
revoke all on function staff_email_test_private.arm_staff_notification_email_test_scope(uuid, uuid, uuid, timestamptz) from public, anon, authenticated, service_role;
revoke all on function staff_email_test_private.shutdown_staff_notification_email_test_scope(uuid) from public, anon, authenticated, service_role;

commit;
