-- Keep ordinary dispatch strictly tied to one notification event. The separate
-- batch RPC only lists work for the separately authenticated retry endpoint.

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
  if p_event_id is null then
    raise exception 'event_id_required' using errcode = '22023';
  end if;

  -- Preserve the existing DEV Push cleanup behavior for expired devices.
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
    where e.id = p_event_id
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
  if p_event_id is null then
    raise exception 'event_id_required' using errcode = '22023';
  end if;

  -- Do not claim a reminder whose exact physical hold has ended or changed.
  -- Live leases remain untouched for their current sender to finish its own
  -- immediate pre-send check.
  update public.staff_notification_push_deliveries d
  set status = 'suppressed',
      next_attempt_at = null,
      claimed_until = null,
      error_code = 'stale_hold',
      updated_at = v_now
  from public.staff_notification_events e
  where e.id = d.event_id
    and d.event_id = p_event_id
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
    where d.event_id = p_event_id
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
    set status = 'claimed', claimed_until = v_now + v_lease,
      attempt_count = d.attempt_count + 1, updated_at = v_now
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
  if p_status is null or p_status not in ('sent', 'failed', 'suppressed') then
    return false;
  end if;
  if p_status = 'suppressed' and p_error_code is distinct from 'stale_hold' then
    return false;
  end if;

  update public.staff_notification_push_deliveries d
  set
    status = case when p_revoke_subscription then 'failed' else p_status end,
    next_attempt_at = case
      when p_status in ('sent', 'suppressed') or p_revoke_subscription or d.attempt_count >= 5 then null
      when d.attempt_count = 1 then now() + interval '1 minute'
      when d.attempt_count = 2 then now() + interval '5 minutes'
      when d.attempt_count = 3 then now() + interval '15 minutes'
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

create or replace function public.list_staff_notification_push_batch_event_ids(
  p_limit integer default 10
)
returns table (event_id uuid)
language sql
security definer
set search_path = public
as $$
  with eligible_events as (
    select distinct e.id, e.created_at
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
    where not exists (
      select 1
      from public.staff_notification_push_deliveries existing
      where existing.event_id = e.id
        and existing.subscription_id = sub.id
    )
      and (
        e.code is distinct from 'fresh_pick_walk_in_hold_reminder'
        or public.staff_notification_fresh_pick_hold_reminder_is_current(e.payload)
      )
    union
    select distinct e.id, e.created_at
    from public.staff_notification_push_deliveries d
    join public.staff_notification_events e on e.id = d.event_id
    join public.staff_notification_preferences pref
      on pref.staff_id = d.staff_id
     and pref.notification_code = e.code
     and pref.push_enabled = true
     and pref.push_enabled_at is not null
     and e.created_at >= pref.push_enabled_at
    join public.staff_profiles sp
      on sp.id = d.staff_id
     and sp.is_active = true
     and sp.archived_at is null
    join public.staff_notification_push_subscriptions sub
      on sub.id = d.subscription_id
     and sub.staff_id = d.staff_id
     and sub.revoked_at is null
     and (sub.expiration_time is null or sub.expiration_time > now())
     and e.created_at >= sub.created_at
    where d.attempt_count < 5
      and (
        e.code is distinct from 'fresh_pick_walk_in_hold_reminder'
        or public.staff_notification_fresh_pick_hold_reminder_is_current(e.payload)
      )
      and (
        d.status = 'pending'
        or (d.status = 'failed' and d.next_attempt_at <= now())
        or (d.status = 'claimed' and d.claimed_until <= now())
      )
  )
  select eligible_events.id
  from eligible_events
  order by eligible_events.created_at asc, eligible_events.id asc
  limit greatest(1, least(coalesce(p_limit, 10), 50));
$$;

revoke all on function public.list_staff_notification_push_batch_event_ids(integer)
  from public, anon, authenticated;
grant execute on function public.list_staff_notification_push_batch_event_ids(integer)
  to service_role;
