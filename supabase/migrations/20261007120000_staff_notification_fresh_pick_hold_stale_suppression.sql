-- Suppress stale Fresh Pick Walk-in Hold reminders before the DEV dispatcher is reconnected.
-- The reminder must still identify the exact current physical hold at claim and pre-send time.

alter table public.staff_notification_email_deliveries
  drop constraint if exists staff_notification_email_deliveries_status_check;

alter table public.staff_notification_email_deliveries
  add constraint staff_notification_email_deliveries_status_check
  check (status in ('sent', 'failed', 'claimed', 'suppressed'));

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
    p_status in ('claimed', 'failed')
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

-- Lock the exact physical stock row before evaluating the hold. clock_timestamp()
-- is evaluated after any row-lock wait, so an expired hold cannot pass on stale time.
create or replace function public.staff_notification_fresh_pick_hold_reminder_is_current(
  p_payload jsonb
)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_stock_id uuid;
  v_held_by uuid;
  v_held_until timestamptz;
  v_held_at timestamptz;
  v_stock public.extra_stock;
begin
  if jsonb_typeof(p_payload) is distinct from 'object'
    or coalesce(p_payload ->> 'extra_stock_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or coalesce(p_payload ->> 'walk_in_held_by', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or nullif(p_payload ->> 'walk_in_held_at', '') is null
    or nullif(p_payload ->> 'walk_in_held_until', '') is null
  then
    return false;
  end if;

  v_stock_id := (p_payload ->> 'extra_stock_id')::uuid;
  v_held_by := (p_payload ->> 'walk_in_held_by')::uuid;
  begin
    v_held_at := (p_payload ->> 'walk_in_held_at')::timestamptz;
    v_held_until := (p_payload ->> 'walk_in_held_until')::timestamptz;
  exception
    when invalid_datetime_format or datetime_field_overflow then
      return false;
  end;

  select e.*
    into v_stock
  from public.extra_stock e
  where e.id = v_stock_id
  for update;

  if not found then
    return false;
  end if;

  return v_stock.lifecycle = 'confirmed'
    and v_stock.sold_at is null
    and v_stock.cut_into_slices_at is null
    and v_stock.walk_in_held_by = v_held_by
    and v_stock.walk_in_held_at = v_held_at
    and v_stock.walk_in_held_until = v_held_until
    and public.extra_walk_in_hold_is_active(
      v_stock.walk_in_held_until,
      clock_timestamp()
    );
end;
$$;

revoke all on function public.staff_notification_fresh_pick_hold_reminder_is_current(jsonb)
  from public, anon, authenticated;
grant execute on function public.staff_notification_fresh_pick_hold_reminder_is_current(jsonb)
  to service_role;

-- Add the hold start to new reminder payloads so replacement holds are distinct
-- even if the same staff member reuses the physical stock item.
create or replace function public.sweep_extra_walk_in_hold_reminders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  stock_row public.extra_stock;
  v_count integer := 0;
  v_key text;
  v_clock text;
  v_inserted uuid;
  v_lead interval;
begin
  v_lead := make_interval(mins => public.extra_walk_in_hold_reminder_lead_minutes());

  for stock_row in
    select e.*
    from public.extra_stock e
    where e.walk_in_held_until is not null
      and e.walk_in_hold_reminder_sent_at is null
      and e.sold_at is null
      and e.cut_into_slices_at is null
      and e.lifecycle = 'confirmed'
      and e.walk_in_held_until - v_lead <= now()
      and now() < e.walk_in_held_until
    for update skip locked
  loop
    v_clock := to_char(
      timezone('Asia/Singapore', stock_row.walk_in_held_until),
      'HH12:MI AM'
    );
    v_key := concat(
      'fresh_pick_walk_in_hold_reminder:',
      stock_row.id::text,
      ':',
      to_char(stock_row.walk_in_held_until at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    );

    v_inserted := public.emit_staff_notification_event(
      v_key,
      'fresh_pick_walk_in_hold_reminder',
      null,
      null,
      'Fresh Pick walk-in hold',
      concat_ws(
        ' · ',
        nullif(trim(stock_row.cake_name), ''),
        nullif(trim(stock_row.size_label), ''),
        concat('hold expires ', btrim(v_clock))
      ),
      '/customer-operations/fresh-picks',
      jsonb_build_object(
        'extra_stock_id', stock_row.id,
        'walk_in_held_at', stock_row.walk_in_held_at,
        'cake_name', stock_row.cake_name,
        'size_label', stock_row.size_label,
        'walk_in_held_until', stock_row.walk_in_held_until,
        'walk_in_held_by', stock_row.walk_in_held_by
      )
    );

    update public.extra_stock e
    set
      walk_in_hold_reminder_sent_at = now(),
      updated_at = now()
    where e.id = stock_row.id
      and e.walk_in_hold_reminder_sent_at is null
      and public.extra_walk_in_hold_is_active(e.walk_in_held_until);

    if found then
      v_count := v_count + 1;
    end if;
    perform v_inserted;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.sweep_extra_walk_in_hold_reminders()
  from public, anon, authenticated;
grant execute on function public.sweep_extra_walk_in_hold_reminders()
  to service_role;

-- Claim-time stale-hold check is scoped only to Fresh Pick Walk-in Hold reminders.
-- Other event types retain existing recipient, deduplication, and retry behavior.
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
#variable_conflict use_column
declare
  v_limit integer := greatest(coalesce(p_limit, 50), 1);
  v_lease interval := make_interval(secs => greatest(coalesce(p_lease_seconds, 120), 1));
begin
  return query
  with pending_events as materialized (
    select e.id
    from public.staff_notification_events e
    where (p_event_id is null or e.id = p_event_id)
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
    where coalesce(pref.email_enabled, true) = true
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
$$;

revoke all on function public.claim_staff_notification_email_deliveries(
  integer, uuid, integer
) from public, anon, authenticated;
grant execute on function public.claim_staff_notification_email_deliveries(
  integer, uuid, integer
) to service_role;

create or replace function public.suppress_staff_notification_email_delivery(
  p_event_id uuid,
  p_staff_id uuid,
  p_reason text,
  p_claimed_until timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer := 0;
begin
  update public.staff_notification_email_deliveries
  set
    status = 'suppressed',
    error = left(coalesce(nullif(btrim(p_reason), ''), 'Reminder is no longer actionable.'), 2000),
    next_attempt_at = null,
    claimed_until = null,
    updated_at = clock_timestamp()
  where event_id = p_event_id
    and staff_id = p_staff_id
    and status = 'claimed'
    and claimed_until is not distinct from p_claimed_until;

  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

revoke all on function public.suppress_staff_notification_email_delivery(
  uuid, uuid, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.suppress_staff_notification_email_delivery(
  uuid, uuid, text, timestamptz
) to service_role;
