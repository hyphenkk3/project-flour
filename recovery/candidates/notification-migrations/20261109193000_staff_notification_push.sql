-- Staff-only Web Push preferences, subscriptions and retryable delivery state.
-- Provider requests are performed by the post-response server dispatch path,
-- never by order triggers or a checkout transaction.

alter table public.staff_notification_preferences
  add column if not exists push_enabled boolean not null default false;

alter table public.staff_notification_preferences
  add column if not exists push_enabled_at timestamptz;

create or replace function public.staff_notification_set_push_enabled_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.push_enabled then
    if tg_op = 'INSERT' then
      new.push_enabled_at := clock_timestamp();
    elsif old.push_enabled is distinct from true then
      new.push_enabled_at := clock_timestamp();
    else
      new.push_enabled_at := old.push_enabled_at;
    end if;
  else
    new.push_enabled_at := null;
  end if;
  return new;
end;
$$;

revoke all on function public.staff_notification_set_push_enabled_at()
  from public, anon, authenticated, service_role;

drop trigger if exists staff_notification_preferences_push_enabled_at
  on public.staff_notification_preferences;
create trigger staff_notification_preferences_push_enabled_at
before insert or update of push_enabled, push_enabled_at
on public.staff_notification_preferences
for each row
execute function public.staff_notification_set_push_enabled_at();

create table if not exists public.staff_notification_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff_profiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_secret text not null,
  expiration_time timestamptz,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint staff_notification_push_endpoint_length
    check (length(endpoint) between 1 and 2048),
  constraint staff_notification_push_key_lengths
    check (length(p256dh) between 80 and 120 and length(auth_secret) between 16 and 64)
);

create index if not exists staff_notification_push_subscriptions_staff_active_idx
  on public.staff_notification_push_subscriptions (staff_id, created_at)
  where revoked_at is null;

create table if not exists public.staff_notification_push_deliveries (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.staff_notification_events (id) on delete cascade,
  staff_id uuid not null references public.staff_profiles (id) on delete cascade,
  subscription_id uuid not null references public.staff_notification_push_subscriptions (id) on delete cascade,
  status text not null default 'pending',
  attempt_count integer not null default 0,
  next_attempt_at timestamptz,
  claimed_until timestamptz,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_notification_push_deliveries_event_subscription_unique
    unique (event_id, subscription_id),
  constraint staff_notification_push_deliveries_status_check
    check (status in ('pending', 'claimed', 'sent', 'failed')),
  constraint staff_notification_push_deliveries_attempt_check
    check (attempt_count between 0 and 5),
  constraint staff_notification_push_deliveries_error_code_length
    check (error_code is null or length(error_code) <= 100)
);

create index if not exists staff_notification_push_deliveries_retry_idx
  on public.staff_notification_push_deliveries (status, next_attempt_at, claimed_until, created_at)
  where status <> 'sent';

alter table public.staff_notification_push_subscriptions enable row level security;
alter table public.staff_notification_push_deliveries enable row level security;

revoke all on table public.staff_notification_push_subscriptions
  from public, anon, authenticated;
revoke all on table public.staff_notification_push_deliveries
  from public, anon, authenticated;
grant all on table public.staff_notification_push_subscriptions to service_role;
grant all on table public.staff_notification_push_deliveries to service_role;

create or replace function public.register_staff_notification_push_subscription(
  p_staff_id uuid,
  p_endpoint text,
  p_p256dh text,
  p_auth_secret text,
  p_expiration_time timestamptz default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_registered boolean;
begin
  perform pg_advisory_xact_lock(hashtext(p_staff_id::text)::bigint);

  if not exists (
    select 1 from public.staff_profiles sp
    where sp.id = p_staff_id and sp.is_active = true and sp.archived_at is null
  ) then
    return false;
  end if;

  if not exists (
    select 1 from public.staff_notification_push_subscriptions sub
    where sub.endpoint = p_endpoint and sub.staff_id = p_staff_id
  ) and (
    select count(*) from public.staff_notification_push_subscriptions sub
    where sub.staff_id = p_staff_id and sub.revoked_at is null
  ) >= 10 then
    return false;
  end if;

  insert into public.staff_notification_push_subscriptions (
    staff_id, endpoint, p256dh, auth_secret, expiration_time, created_at, revoked_at
  ) values (
    p_staff_id, p_endpoint, p_p256dh, p_auth_secret, p_expiration_time, now(), null
  )
  on conflict (endpoint) do update
  set
    p256dh = excluded.p256dh,
    auth_secret = excluded.auth_secret,
    expiration_time = excluded.expiration_time,
    created_at = now(),
    revoked_at = null
  where public.staff_notification_push_subscriptions.staff_id = excluded.staff_id
  returning true into v_registered;

  return coalesce(v_registered, false);
end;
$$;

revoke all on function public.register_staff_notification_push_subscription(uuid, text, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.register_staff_notification_push_subscription(uuid, text, text, text, timestamptz)
  to service_role;

create or replace function public.queue_staff_notification_push_deliveries(
  p_event_id uuid default null,
  p_event_limit integer default 50
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted integer := 0;
  v_limit integer := greatest(1, least(coalesce(p_event_limit, 50), 100));
begin
  update public.staff_notification_push_subscriptions sub
  set revoked_at = now()
  where sub.revoked_at is null
    and sub.expiration_time is not null
    and sub.expiration_time <= now();

  with eligible_pairs as materialized (
    select e.id as event_id, sp.id as staff_id, sub.id as subscription_id
    from public.staff_notification_events e
    join public.staff_notification_preferences pref
      on pref.notification_code = e.code
     and pref.push_enabled = true
     and pref.push_enabled_at is not null
     and e.created_at >= pref.push_enabled_at
    join public.staff_profiles sp
      on sp.id = pref.staff_id
     and sp.is_active = true
     and sp.archived_at is null
    join public.staff_notification_push_subscriptions sub
      on sub.staff_id = sp.id
     and sub.revoked_at is null
     and (sub.expiration_time is null or sub.expiration_time > now())
     and e.created_at >= sub.created_at
    where (p_event_id is null or e.id = p_event_id)
      and not exists (
        select 1
        from public.staff_notification_push_deliveries existing
        where existing.event_id = e.id
          and existing.subscription_id = sub.id
      )
    order by e.created_at asc
    limit v_limit
  ), inserted as (
    insert into public.staff_notification_push_deliveries (
      event_id, staff_id, subscription_id, status
    )
    select event_id, staff_id, subscription_id, 'pending'
    from eligible_pairs
    on conflict (event_id, subscription_id) do nothing
    returning id
  )
  select count(*)::integer into v_inserted from inserted;

  return v_inserted;
end;
$$;

revoke all on function public.queue_staff_notification_push_deliveries(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.queue_staff_notification_push_deliveries(uuid, integer)
  to service_role;

create or replace function public.claim_staff_notification_push_deliveries(
  p_limit integer default 50,
  p_event_id uuid default null,
  p_lease_seconds integer default 120
)
returns table (
  delivery_id uuid,
  event_id uuid,
  staff_id uuid,
  subscription_id uuid,
  claimed_until timestamptz,
  code text,
  endpoint text,
  p256dh text,
  auth_secret text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 100));
  v_lease interval := make_interval(secs => greatest(30, least(coalesce(p_lease_seconds, 120), 600)));
  v_now timestamptz := now();
begin
  return query
  with candidates as materialized (
    select d.id
    from public.staff_notification_push_deliveries d
    join public.staff_notification_events e on e.id = d.event_id
    join public.staff_profiles sp
      on sp.id = d.staff_id and sp.is_active = true and sp.archived_at is null
    join public.staff_notification_preferences pref
      on pref.staff_id = sp.id and pref.notification_code = e.code
     and pref.push_enabled = true and pref.push_enabled_at is not null
     and e.created_at >= pref.push_enabled_at
    join public.staff_notification_push_subscriptions sub
      on sub.id = d.subscription_id and sub.staff_id = sp.id
     and sub.revoked_at is null
     and (sub.expiration_time is null or sub.expiration_time > v_now)
     and e.created_at >= sub.created_at
    where (p_event_id is null or d.event_id = p_event_id)
      and d.attempt_count < 5
      and (
        d.status = 'pending'
        or (d.status = 'failed' and d.next_attempt_at <= v_now)
        or (d.status = 'claimed' and d.claimed_until <= v_now)
      )
    order by d.created_at asc
    limit v_limit
    for update of d skip locked
  ), claimed as (
    update public.staff_notification_push_deliveries d
    set status = 'claimed', claimed_until = v_now + v_lease, updated_at = v_now
    from candidates c
    where d.id = c.id
    returning d.id, d.event_id, d.staff_id, d.subscription_id, d.claimed_until
  )
  select c.id, c.event_id, c.staff_id, c.subscription_id, c.claimed_until,
    e.code, sub.endpoint, sub.p256dh, sub.auth_secret
  from claimed c
  join public.staff_notification_events e on e.id = c.event_id
  join public.staff_notification_push_subscriptions sub on sub.id = c.subscription_id;
end;
$$;

revoke all on function public.claim_staff_notification_push_deliveries(integer, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.claim_staff_notification_push_deliveries(integer, uuid, integer)
  to service_role;

create or replace function public.complete_staff_notification_push_delivery(
  p_delivery_id uuid,
  p_claimed_until timestamptz,
  p_status text,
  p_error_code text default null,
  p_revoke_subscription boolean default false
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated boolean;
begin
  if p_status is null or p_status not in ('sent', 'failed') then
    return false;
  end if;

  update public.staff_notification_push_deliveries d
  set
    status = case when p_revoke_subscription then 'failed' else p_status end,
    attempt_count = least(d.attempt_count + 1, 5),
    next_attempt_at = case
      when p_status = 'sent' or p_revoke_subscription or d.attempt_count + 1 >= 5 then null
      when d.attempt_count + 1 = 1 then now() + interval '1 minute'
      when d.attempt_count + 1 = 2 then now() + interval '5 minutes'
      when d.attempt_count + 1 = 3 then now() + interval '15 minutes'
      else now() + interval '1 hour'
    end,
    claimed_until = null,
    error_code = left(p_error_code, 100),
    updated_at = now()
  where d.id = p_delivery_id
    and d.status = 'claimed'
    and d.claimed_until = p_claimed_until
  returning true into v_updated;

  if not found then
    return false;
  end if;

  if p_revoke_subscription then
    update public.staff_notification_push_subscriptions sub
    set revoked_at = coalesce(sub.revoked_at, now())
    where sub.id = (
      select d.subscription_id
      from public.staff_notification_push_deliveries d
      where d.id = p_delivery_id
    );
  end if;

  return true;
end;
$$;

revoke all on function public.complete_staff_notification_push_delivery(uuid, timestamptz, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.complete_staff_notification_push_delivery(uuid, timestamptz, text, text, boolean)
  to service_role;

create or replace function public.staff_notification_revoke_inactive_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not new.is_active
    or new.archived_at is not null
    or old.role_id is distinct from new.role_id then
    update public.staff_notification_preferences
    set push_enabled = false
    where staff_id = new.id and push_enabled = true;

    update public.staff_notification_push_subscriptions
    set revoked_at = coalesce(revoked_at, now())
    where staff_id = new.id and revoked_at is null;
  end if;
  return new;
end;
$$;

revoke all on function public.staff_notification_revoke_inactive_push()
  from public, anon, authenticated, service_role;

drop trigger if exists staff_notification_revoke_inactive_push
  on public.staff_profiles;
create trigger staff_notification_revoke_inactive_push
after update of is_active, archived_at, role_id
on public.staff_profiles
for each row
when (
  (old.is_active and not new.is_active)
  or (old.archived_at is null and new.archived_at is not null)
  or (old.role_id is distinct from new.role_id)
)
execute function public.staff_notification_revoke_inactive_push();
