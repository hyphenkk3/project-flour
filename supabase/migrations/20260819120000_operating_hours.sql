-- Persisted operating hours: one weekly + dated-override source for
-- pickup, delivery, dine-in booking, Hyphen, and Whitebird.
-- TypeScript availability and SQL/RPC validators read these tables.
-- Extra submit_guest_extra_order is unchanged (still pickup-only).
-- Apply AFTER 20260819100000_dine_in_reservation_venue.sql.
-- Do not apply to live until instructed.

create type public.operating_hours_capability as enum (
  'pickup',
  'delivery',
  'dine_in',
  'hyphen',
  'whitebird'
);

create table public.operating_hours_weekly (
  capability public.operating_hours_capability not null,
  weekday smallint not null,
  enabled boolean not null default true,
  opens_at time,
  closes_at time,
  latest_bookable time,
  usual_start time,
  usual_end time,
  updated_at timestamptz not null default now(),
  constraint operating_hours_weekly_weekday_range
    check (weekday >= 0 and weekday <= 6),
  constraint operating_hours_weekly_pk
    primary key (capability, weekday)
);

create table public.operating_hours_date_overrides (
  override_date date not null,
  capability public.operating_hours_capability not null,
  enabled boolean not null,
  opens_at time,
  closes_at time,
  latest_bookable time,
  usual_start time,
  usual_end time,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operating_hours_date_overrides_pk
    primary key (override_date, capability)
);

comment on table public.operating_hours_weekly is
  'Weekly operating hours by capability. Owner/Manager editable. Seed is the current Whitebird schedule, not a permanent constant.';

comment on table public.operating_hours_date_overrides is
  'Dated overrides (public holiday / special open or close). SQL and TypeScript both read this table.';

create trigger operating_hours_weekly_set_updated_at
before update on public.operating_hours_weekly
for each row execute function public.set_updated_at();

create trigger operating_hours_date_overrides_set_updated_at
before update on public.operating_hours_date_overrides
for each row execute function public.set_updated_at();

alter table public.operating_hours_weekly enable row level security;
alter table public.operating_hours_date_overrides enable row level security;

revoke all on table public.operating_hours_weekly from public;
revoke all on table public.operating_hours_weekly from anon;
revoke all on table public.operating_hours_date_overrides from public;
revoke all on table public.operating_hours_date_overrides from anon;

grant select on table public.operating_hours_weekly to anon, authenticated;
grant select, insert, update, delete on table public.operating_hours_weekly
  to authenticated;
grant select on table public.operating_hours_date_overrides to anon, authenticated;
grant select, insert, update, delete on table public.operating_hours_date_overrides
  to authenticated;

create policy operating_hours_weekly_select
on public.operating_hours_weekly for select to anon, authenticated
using (true);

create policy operating_hours_weekly_write
on public.operating_hours_weekly for all to authenticated
using (true) with check (true);

create policy operating_hours_date_overrides_select
on public.operating_hours_date_overrides for select to anon, authenticated
using (true);

create policy operating_hours_date_overrides_write
on public.operating_hours_date_overrides for all to authenticated
using (true) with check (true);

-- Seed: current Whitebird schedule (editable after apply).
insert into public.operating_hours_weekly
  (capability, weekday, enabled, opens_at, closes_at, latest_bookable, usual_start, usual_end)
values
  -- Pickup (preserve existing customer slots)
  ('pickup', 0, true, '12:00', '21:30', '21:30', '15:00', '17:30'),
  ('pickup', 1, true, '12:00', '17:30', '17:30', '15:00', '17:30'),
  ('pickup', 2, true, '12:00', '17:30', '17:30', '15:00', '17:30'),
  ('pickup', 3, true, '12:00', '15:00', '15:00', '13:00', '15:00'),
  ('pickup', 4, true, '12:00', '17:30', '17:30', '15:00', '17:30'),
  ('pickup', 5, true, '12:00', '21:30', '21:30', '15:00', '17:30'),
  ('pickup', 6, true, '12:00', '21:30', '21:30', '15:00', '17:30'),
  -- Delivery
  ('delivery', 0, true, '12:00', '15:00', '15:00', null, null),
  ('delivery', 1, true, '12:00', '15:00', '15:00', null, null),
  ('delivery', 2, true, '12:00', '15:00', '15:00', null, null),
  ('delivery', 3, false, null, null, null, null, null),
  ('delivery', 4, true, '12:00', '15:00', '15:00', null, null),
  ('delivery', 5, true, '12:00', '15:00', '15:00', null, null),
  ('delivery', 6, true, '12:00', '15:00', '15:00', null, null),
  -- Cake dine-in booking window
  ('dine_in', 0, true, '12:00', '21:30', '21:30', null, null),
  ('dine_in', 1, true, '12:00', '17:00', '17:00', null, null),
  ('dine_in', 2, true, '12:00', '17:00', '17:00', null, null),
  ('dine_in', 3, false, null, null, null, null, null),
  ('dine_in', 4, true, '12:00', '17:00', '17:00', null, null),
  ('dine_in', 5, true, '12:00', '21:30', '21:30', null, null),
  ('dine_in', 6, true, '12:00', '21:30', '21:30', null, null),
  -- Hyphen outlet
  ('hyphen', 0, true, '09:00', '17:30', '17:00', null, null),
  ('hyphen', 1, true, '09:00', '17:30', '17:00', null, null),
  ('hyphen', 2, true, '09:00', '17:30', '17:00', null, null),
  ('hyphen', 3, false, null, null, null, null, null),
  ('hyphen', 4, true, '09:00', '17:30', '17:00', null, null),
  ('hyphen', 5, true, '09:00', '17:30', '17:00', null, null),
  ('hyphen', 6, true, '09:00', '17:30', '17:00', null, null),
  -- Whitebird outlet
  ('whitebird', 0, true, '10:00', '22:00', '21:30', null, null),
  ('whitebird', 1, true, '10:00', '17:30', '17:00', null, null),
  ('whitebird', 2, true, '10:00', '17:30', '17:00', null, null),
  ('whitebird', 3, false, null, null, null, null, null),
  ('whitebird', 4, true, '10:00', '17:30', '17:00', null, null),
  ('whitebird', 5, true, '10:00', '22:00', '21:30', null, null),
  ('whitebird', 6, true, '10:00', '22:00', '21:30', null, null);

create or replace function public.operating_hours_resolved(
  p_capability public.operating_hours_capability,
  p_date date
)
returns table (
  enabled boolean,
  opens_at time,
  closes_at time,
  latest_bookable time,
  usual_start time,
  usual_end time
)
language sql
stable
security definer
set search_path = public
as $$
  select
    o.enabled,
    o.opens_at,
    o.closes_at,
    o.latest_bookable,
    o.usual_start,
    o.usual_end
  from public.operating_hours_date_overrides o
  where o.override_date = p_date
    and o.capability = p_capability
  union all
  select
    w.enabled,
    w.opens_at,
    w.closes_at,
    w.latest_bookable,
    w.usual_start,
    w.usual_end
  from public.operating_hours_weekly w
  where w.capability = p_capability
    and w.weekday = extract(dow from p_date)::smallint
    and not exists (
      select 1
      from public.operating_hours_date_overrides o
      where o.override_date = p_date
        and o.capability = p_capability
    )
  limit 1;
$$;

create or replace function public._operating_hours_last_bookable(
  p_latest time,
  p_closes time
)
returns time
language sql
immutable
as $$
  select coalesce(p_latest, p_closes - interval '30 minutes');
$$;

create or replace function public._time_within_operating_hours(
  p_capability public.operating_hours_capability,
  p_date date,
  p_time time
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_enabled boolean;
  v_opens time;
  v_closes time;
  v_latest time;
  v_last time;
begin
  if p_date is null or p_time is null then
    return false;
  end if;
  if not public._clock_on_30_min_grid(p_time) then
    return false;
  end if;
  select r.enabled, r.opens_at, r.closes_at, r.latest_bookable
    into v_enabled, v_opens, v_closes, v_latest
  from public.operating_hours_resolved(p_capability, p_date) r;
  if not found or v_enabled is not true or v_opens is null then
    return false;
  end if;
  v_last := public._operating_hours_last_bookable(v_latest, v_closes);
  if v_last is null then
    return false;
  end if;
  return p_time >= v_opens and p_time <= v_last;
end;
$$;

create or replace function public._pickup_slot_in_weekly_hours(
  p_date date,
  p_time time
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public._time_within_operating_hours('pickup', p_date, p_time);
$$;

create or replace function public.is_valid_delivery_slot(
  p_date date,
  p_time time
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public._time_within_operating_hours('delivery', p_date, p_time);
$$;

create or replace function public.is_valid_dine_in_slot(
  p_date date,
  p_time time
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public._time_within_operating_hours('dine_in', p_date, p_time) then
    return false;
  end if;
  return public._time_within_operating_hours('hyphen', p_date, p_time)
      or public._time_within_operating_hours('whitebird', p_date, p_time);
end;
$$;

create or replace function public.is_valid_dine_in_venue(
  p_date date,
  p_time time,
  p_venue public.dine_in_venue
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_venue is null then
    return false;
  end if;
  if not public._time_within_operating_hours('dine_in', p_date, p_time) then
    return false;
  end if;
  if p_venue = 'hyphen' then
    return public._time_within_operating_hours('hyphen', p_date, p_time);
  end if;
  return public._time_within_operating_hours('whitebird', p_date, p_time);
end;
$$;

grant execute on function public.operating_hours_resolved(
  public.operating_hours_capability, date
) to anon, authenticated;
grant execute on function public._time_within_operating_hours(
  public.operating_hours_capability, date, time
) to anon, authenticated;
grant execute on function public._pickup_slot_in_weekly_hours(date, time)
  to anon, authenticated, service_role;
grant execute on function public.is_valid_delivery_slot(date, time)
  to anon, authenticated;
grant execute on function public.is_valid_dine_in_slot(date, time)
  to anon, authenticated;
grant execute on function public.is_valid_dine_in_venue(
  date, time, public.dine_in_venue
) to anon, authenticated;

comment on function public.is_valid_dine_in_slot(date, time) is
  'Cake dine-in booking window from operating_hours_weekly / date overrides. '
  'A time is valid only when dine-in booking is open and at least one outlet accepts it.';

comment on function public.is_valid_dine_in_venue(
  date, time, public.dine_in_venue
) is
  'Venue must be bookable from persisted outlet hours at that date/time.';

comment on function public.is_valid_delivery_slot(date, time) is
  'Delivery window from persisted operating hours.';

comment on function public._pickup_slot_in_weekly_hours(date, time) is
  'Pickup slots from persisted pickup hours. Extra uses this without the orders-closed overlay.';
