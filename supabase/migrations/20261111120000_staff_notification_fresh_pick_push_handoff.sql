-- Durable, event-scoped Push handoff for the existing Fresh Pick hold reminder.
-- This migration is a candidate only; no hosted database is changed here.

alter table public.staff_notification_push_deliveries
  drop constraint if exists staff_notification_push_deliveries_status_check;

alter table public.staff_notification_push_deliveries
  add constraint staff_notification_push_deliveries_status_check
  check (status in ('pending', 'claimed', 'sent', 'failed', 'suppressed'));

-- The server scheduler asks for a bounded list of exact event IDs. It does not
-- drain the general Push queue, and it returns no events without an eligible
-- active staff member, preference, and subscription.
create or replace function public.list_due_fresh_pick_hold_reminder_push_event_ids(
  p_limit integer default 10
)
returns table (event_id uuid)
language sql
volatile
security definer
set search_path = public
as $$
  select e.id
  from public.staff_notification_events e
  where e.code = 'fresh_pick_walk_in_hold_reminder'
    and public.staff_notification_fresh_pick_hold_reminder_is_current(e.payload)
    and exists (
      select 1
      from public.staff_notification_preferences pref
      join public.staff_profiles sp
        on sp.id = pref.staff_id
       and sp.is_active = true
       and sp.archived_at is null
      join public.staff_notification_push_subscriptions sub
        on sub.staff_id = sp.id
       and sub.revoked_at is null
       and (sub.expiration_time is null or sub.expiration_time > clock_timestamp())
       and e.created_at >= sub.created_at
      where pref.notification_code = e.code
        and pref.push_enabled = true
        and pref.push_enabled_at is not null
        and e.created_at >= pref.push_enabled_at
    )
    and (
      not exists (
        select 1
        from public.staff_notification_push_deliveries d
        where d.event_id = e.id
      )
      or exists (
        select 1
        from public.staff_notification_push_deliveries d
        where d.event_id = e.id
          and d.attempt_count < 5
          and (
            d.status = 'pending'
            or (d.status = 'failed' and d.next_attempt_at <= clock_timestamp())
            or (d.status = 'claimed' and d.claimed_until <= clock_timestamp())
          )
      )
    )
  order by e.created_at asc
  limit greatest(1, least(coalesce(p_limit, 10), 20));
$$;

revoke all on function public.list_due_fresh_pick_hold_reminder_push_event_ids(integer)
  from public, anon, authenticated;
grant execute on function public.list_due_fresh_pick_hold_reminder_push_event_ids(integer)
  to service_role;

-- The Preview worker must also terminally clear stale rows that it correctly
-- excludes from the due-event list, so those rows cannot remain pending forever.
create or replace function public.suppress_stale_fresh_pick_hold_reminder_push_deliveries()
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_suppressed integer := 0;
begin
  update public.staff_notification_push_deliveries d
  set status = 'suppressed',
      next_attempt_at = null,
      claimed_until = null,
      error_code = 'stale_hold',
      updated_at = clock_timestamp()
  from public.staff_notification_events e
  where e.id = d.event_id
    and e.code = 'fresh_pick_walk_in_hold_reminder'
    and d.status in ('pending', 'failed', 'claimed')
    and (d.status <> 'claimed' or d.claimed_until <= clock_timestamp())
    and not public.staff_notification_fresh_pick_hold_reminder_is_current(e.payload);

  get diagnostics v_suppressed = row_count;
  return v_suppressed;
end;
$$;

revoke all on function public.suppress_stale_fresh_pick_hold_reminder_push_deliveries()
  from public, anon, authenticated;
grant execute on function public.suppress_stale_fresh_pick_hold_reminder_push_deliveries()
  to service_role;

-- Do not queue a reminder after its exact physical hold has changed or ended.
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
      and (
        e.code is distinct from 'fresh_pick_walk_in_hold_reminder'
        or public.staff_notification_fresh_pick_hold_reminder_is_current(e.payload)
      )
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

-- Terminally suppress rows whose exact hold is no longer current. Rows with a
-- live claim are left to their sender's mandatory immediate pre-send check.
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
  update public.staff_notification_push_deliveries d
  set status = 'suppressed',
      next_attempt_at = null,
      claimed_until = null,
      error_code = 'stale_hold',
      updated_at = v_now
  from public.staff_notification_events e
  where e.id = d.event_id
    and e.code = 'fresh_pick_walk_in_hold_reminder'
    and d.status in ('pending', 'failed', 'claimed')
    and (d.status <> 'claimed' or d.claimed_until <= v_now)
    and not public.staff_notification_fresh_pick_hold_reminder_is_current(e.payload);

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
      and (
        e.code is distinct from 'fresh_pick_walk_in_hold_reminder'
        or public.staff_notification_fresh_pick_hold_reminder_is_current(e.payload)
      )
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

-- Pre-send stale detection is terminal; transient provider errors retain the
-- existing bounded retry schedule.
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
  if p_status is null or p_status not in ('sent', 'failed', 'suppressed') then
    return false;
  end if;
  if p_status = 'suppressed' and p_error_code is distinct from 'stale_hold' then
    return false;
  end if;

  update public.staff_notification_push_deliveries d
  set
    status = case when p_revoke_subscription then 'failed' else p_status end,
    attempt_count = case
      when p_status = 'suppressed' then d.attempt_count
      else least(d.attempt_count + 1, 5)
    end,
    next_attempt_at = case
      when p_status in ('sent', 'suppressed') or p_revoke_subscription or d.attempt_count + 1 >= 5 then null
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
