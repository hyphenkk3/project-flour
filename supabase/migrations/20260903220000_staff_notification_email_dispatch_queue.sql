-- Staff notification email dispatch queue: pending selection, retry, claim.
-- Event sources and in-app delivery are unchanged.

alter table public.staff_notification_email_deliveries
  add column if not exists attempt_count integer not null default 0;

alter table public.staff_notification_email_deliveries
  add column if not exists next_attempt_at timestamptz;

alter table public.staff_notification_email_deliveries
  add column if not exists claimed_until timestamptz;

alter table public.staff_notification_email_deliveries
  drop constraint if exists staff_notification_email_deliveries_status_check;

alter table public.staff_notification_email_deliveries
  add constraint staff_notification_email_deliveries_status_check
  check (status in ('sent', 'failed', 'claimed'));

alter table public.staff_notification_email_deliveries
  drop constraint if exists staff_notification_email_deliveries_attempt_count_check;

alter table public.staff_notification_email_deliveries
  add constraint staff_notification_email_deliveries_attempt_count_check
  check (attempt_count >= 0);

-- Existing failed rows are retryable immediately (one attempt already used).
update public.staff_notification_email_deliveries
set
  attempt_count = greatest(attempt_count, 1),
  next_attempt_at = coalesce(next_attempt_at, now())
where status = 'failed'
  and attempt_count < 5
  and next_attempt_at is null;

create index if not exists staff_notification_email_deliveries_retry_idx
  on public.staff_notification_email_deliveries (status, next_attempt_at, claimed_until)
  where status is distinct from 'sent';

create or replace function public.staff_notification_email_retry_delay(
  p_attempt_count integer
)
returns interval
language sql
immutable
as $$
  select case p_attempt_count
    when 1 then interval '1 minute'
    when 2 then interval '5 minutes'
    when 3 then interval '15 minutes'
    when 4 then interval '1 hour'
    else null
  end;
$$;

revoke all on function public.staff_notification_email_retry_delay(integer)
  from public, anon, authenticated;

create or replace function public.staff_notification_email_delivery_is_claimable(
  p_status text,
  p_attempt_count integer,
  p_next_attempt_at timestamptz,
  p_claimed_until timestamptz,
  p_now timestamptz default now()
)
returns boolean
language sql
immutable
as $$
  select
    p_status is distinct from 'sent'
    and coalesce(p_attempt_count, 0) < 5
    and (
      p_claimed_until is null
      or p_claimed_until <= p_now
    )
    and (
      p_status is distinct from 'failed'
      or (
        p_next_attempt_at is not null
        and p_next_attempt_at <= p_now
      )
    );
$$;

revoke all on function public.staff_notification_email_delivery_is_claimable(
  text, integer, timestamptz, timestamptz, timestamptz
) from public, anon, authenticated;

create or replace function public.claim_staff_notification_email_deliveries(
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
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer := greatest(coalesce(p_limit, 50), 1);
  v_lease interval := make_interval(secs => greatest(coalesce(p_lease_seconds, 120), 1));
  v_now timestamptz := now();
begin
  return query
  with pending_events as materialized (
    select e.id
    from public.staff_notification_events e
    where (p_event_id is null or e.id = p_event_id)
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
          and coalesce(pref.email_enabled, true) = true
          and (
            d.id is null
            or public.staff_notification_email_delivery_is_claimable(
              d.status,
              d.attempt_count,
              d.next_attempt_at,
              d.claimed_until,
              v_now
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
    where coalesce(pref.email_enabled, true) = true
      and (
        d.id is null
        or public.staff_notification_email_delivery_is_claimable(
          d.status,
          d.attempt_count,
          d.next_attempt_at,
          d.claimed_until,
          v_now
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
      v_now + v_lease,
      v_now
    from pending_pairs
    on conflict (event_id, staff_id) do update
    set
      status = 'claimed',
      claimed_until = excluded.claimed_until,
      updated_at = excluded.updated_at
    where public.staff_notification_email_deliveries.status is distinct from 'sent'
      and public.staff_notification_email_delivery_is_claimable(
        public.staff_notification_email_deliveries.status,
        public.staff_notification_email_deliveries.attempt_count,
        public.staff_notification_email_deliveries.next_attempt_at,
        public.staff_notification_email_deliveries.claimed_until,
        v_now
      )
    returning
      id,
      event_id,
      staff_id,
      claimed_until
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
$$;

revoke all on function public.claim_staff_notification_email_deliveries(
  integer, uuid, integer
) from public, anon, authenticated;

grant execute on function public.claim_staff_notification_email_deliveries(
  integer, uuid, integer
) to service_role;

create or replace function public.complete_staff_notification_email_delivery(
  p_event_id uuid,
  p_staff_id uuid,
  p_status text,
  p_error text default null,
  p_resend_id text default null,
  p_claimed_until timestamptz default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer := 0;
  v_now timestamptz := now();
begin
  if p_status not in ('sent', 'failed') then
    return false;
  end if;

  update public.staff_notification_email_deliveries
  set
    status = p_status,
    error = case when p_status = 'sent' then null else p_error end,
    resend_id = case
      when p_status = 'sent' then p_resend_id
      else staff_notification_email_deliveries.resend_id
    end,
    attempt_count = staff_notification_email_deliveries.attempt_count + 1,
    claimed_until = null,
    next_attempt_at = case
      when p_status = 'sent' then null
      else v_now + public.staff_notification_email_retry_delay(
        staff_notification_email_deliveries.attempt_count + 1
      )
    end,
    updated_at = v_now
  where event_id = p_event_id
    and staff_id = p_staff_id
    and status = 'claimed'
    and claimed_until is not distinct from p_claimed_until;

  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

revoke all on function public.complete_staff_notification_email_delivery(
  uuid, uuid, text, text, text, timestamptz
) from public, anon, authenticated;

grant execute on function public.complete_staff_notification_email_delivery(
  uuid, uuid, text, text, text, timestamptz
) to service_role;
