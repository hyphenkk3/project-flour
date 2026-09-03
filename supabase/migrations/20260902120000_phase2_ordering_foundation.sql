-- Phase 2 — Ordering / availability / waiting-list SCHEMA FOUNDATION
-- Additive only. Does not change customer UI, engines, or existing RPC lead
-- calculation behaviour yet.
--
-- Goals:
-- 1) Per-variant preorder_days on library_cake_sizes (default 2 = current rule)
-- 2) Malaysia timezone / day-rollover configuration (Asia/Kuala_Lumpur)
-- 3) Date-closure audit history for order_availability_overrides
-- 4) Production capacity + capacity change history
-- 5) Waiting-list request + items + events
-- 6) Preorder lead-time exception approval foundation
-- 7) Post-payment one-time customer-change tracking on orders
--
-- Decision — preorder_days on library_cake_sizes (not library_cakes /
-- collection_cakes):
--   Price is already size-specific; production lead time may differ by size.
--   Catalogue membership is cake-level and must not redefine production lead.
--   Existing sizes backfill to 2 days to preserve current global behaviour.

-- ---------------------------------------------------------------------------
-- 0) Malaysia calendar helper (new foundation — does not rewrite Singapore
--    helpers used by existing discount/approval RPCs)
-- ---------------------------------------------------------------------------

create or replace function public.malaysia_calendar_date(p_ts timestamptz)
returns date
language sql
stable
as $$
  select (p_ts at time zone 'Asia/Kuala_Lumpur')::date;
$$;

comment on function public.malaysia_calendar_date(timestamptz) is
  'Calendar date in Asia/Kuala_Lumpur (no preorder day-rollover).';

revoke all on function public.malaysia_calendar_date(timestamptz) from public;
grant execute on function public.malaysia_calendar_date(timestamptz)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1) Business operating config (singleton)
-- ---------------------------------------------------------------------------

create table if not exists public.business_operating_config (
  id smallint primary key default 1 check (id = 1),
  business_timezone text not null default 'Asia/Kuala_Lumpur',
  -- Local time when preorder DAY 0 advances to the next calendar date.
  -- Default midnight: calendar date in Malaysia is DAY 0 (matches current
  -- business examples: 27/8 11:59 → day 27; 28/8 12:00 → day 28).
  -- A non-midnight value (e.g. 12:00) means timestamps before that local time
  -- still belong to the previous calendar day.
  preorder_day_rollover_time time not null default time '00:00:00',
  waiting_list_response_minutes integer not null default 30
    check (waiting_list_response_minutes > 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.staff_profiles (id) on delete set null,
  constraint business_operating_config_timezone_kl
    check (business_timezone = 'Asia/Kuala_Lumpur')
);

comment on table public.business_operating_config is
  'Singleton Whitebird operating configuration. Timezone is Malaysia (Asia/Kuala_Lumpur).';

comment on column public.business_operating_config.preorder_day_rollover_time is
  'Local time in business_timezone when preorder DAY 0 advances. Default 00:00:00 = midnight calendar date. Engine calculation uses malaysia_preorder_business_date().';

comment on column public.business_operating_config.waiting_list_response_minutes is
  'Default response window after CO contacts a waiting-list customer. Per-catalogue override may apply.';

drop trigger if exists business_operating_config_set_updated_at
  on public.business_operating_config;
create trigger business_operating_config_set_updated_at
before update on public.business_operating_config
for each row
execute function public.set_updated_at();

insert into public.business_operating_config (id)
values (1)
on conflict (id) do nothing;

-- Preorder DAY 0 in Malaysia time.
-- Default rollover 00:00:00 (= calendar date):
--   27/8 11:59:59 MYT → business date 27/8 → 2-day earliest 29/8
--   28/8 12:00:00 MYT → business date 28/8 → 2-day earliest 30/8
-- Non-midnight rollover (e.g. 12:00): timestamps before that local time use
-- the previous calendar date as DAY 0.
create or replace function public.malaysia_preorder_business_date(
  p_ts timestamptz default now()
)
returns date
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_local timestamp;
  v_rollover time;
  v_date date;
begin
  select c.preorder_day_rollover_time
  into v_rollover
  from public.business_operating_config c
  where c.id = 1;

  v_rollover := coalesce(v_rollover, time '00:00:00');
  v_local := timezone('Asia/Kuala_Lumpur', p_ts);
  v_date := v_local::date;

  -- Midnight boundary: calendar date is DAY 0.
  if v_rollover = time '00:00:00' then
    return v_date;
  end if;

  if v_local::time < v_rollover then
    return (v_date - 1);
  end if;

  return v_date;
end;
$$;

comment on function public.malaysia_preorder_business_date(timestamptz) is
  'Preorder DAY 0 in Asia/Kuala_Lumpur using business_operating_config.preorder_day_rollover_time. '
  'Does not replace singapore_calendar_date used by legacy discount/approval RPCs.';

revoke all on function public.malaysia_preorder_business_date(timestamptz) from public;
grant execute on function public.malaysia_preorder_business_date(timestamptz)
  to anon, authenticated;

alter table public.business_operating_config enable row level security;

revoke all on table public.business_operating_config from public;
revoke all on table public.business_operating_config from anon;
grant select, update on table public.business_operating_config to authenticated;

drop policy if exists business_operating_config_authenticated_select
  on public.business_operating_config;
create policy business_operating_config_authenticated_select
on public.business_operating_config
for select to authenticated
using (true);

drop policy if exists business_operating_config_authenticated_update
  on public.business_operating_config;
create policy business_operating_config_authenticated_update
on public.business_operating_config
for update to authenticated
using (true)
with check (true);

-- ---------------------------------------------------------------------------
-- 2) Per-variant preorder days
-- ---------------------------------------------------------------------------

alter table public.library_cake_sizes
  add column if not exists preorder_days integer;

update public.library_cake_sizes
set preorder_days = 2
where preorder_days is null;

alter table public.library_cake_sizes
  alter column preorder_days set default 2;

alter table public.library_cake_sizes
  alter column preorder_days set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'library_cake_sizes_preorder_days_positive'
  ) then
    alter table public.library_cake_sizes
      add constraint library_cake_sizes_preorder_days_positive
      check (preorder_days >= 1);
  end if;
end $$;

comment on column public.library_cake_sizes.preorder_days is
  'Minimum calendar preorder days for this size/variant (DAY 0 model). '
  'Default 2 preserves the previous global Whole Cake lead rule.';

create index if not exists library_cake_sizes_preorder_days_idx
  on public.library_cake_sizes (preorder_days);

-- ---------------------------------------------------------------------------
-- 3) Date closure audit history (extends order_availability_overrides)
-- ---------------------------------------------------------------------------

alter table public.order_availability_overrides
  add column if not exists closed_by uuid references public.staff_profiles (id)
    on delete set null;

alter table public.order_availability_overrides
  add column if not exists closed_at timestamptz;

create table if not exists public.order_availability_override_events (
  id uuid primary key default gen_random_uuid(),
  pickup_date date not null,
  action text not null,
  note text,
  actor_staff_id uuid references public.staff_profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint order_availability_override_events_action_check
    check (action in ('closed', 'reopened'))
);

comment on table public.order_availability_override_events is
  'Append-only history for closing/reopening new-preorder dates. '
  'Does not alter confirmed orders. Closure only blocks NEW orders.';

create index if not exists order_availability_override_events_date_idx
  on public.order_availability_override_events (pickup_date, created_at desc);

create index if not exists order_availability_override_events_actor_idx
  on public.order_availability_override_events (actor_staff_id, created_at desc);

alter table public.order_availability_override_events enable row level security;

revoke all on table public.order_availability_override_events from public;
revoke all on table public.order_availability_override_events from anon;
grant select, insert on table public.order_availability_override_events
  to authenticated;

drop policy if exists order_availability_override_events_authenticated_select
  on public.order_availability_override_events;
create policy order_availability_override_events_authenticated_select
on public.order_availability_override_events
for select to authenticated
using (true);

drop policy if exists order_availability_override_events_authenticated_insert
  on public.order_availability_override_events;
create policy order_availability_override_events_authenticated_insert
on public.order_availability_override_events
for insert to authenticated
with check (true);

-- Auto-audit existing Library close/reopen mutations (direct table upsert/delete).
-- Resolves actor from auth.uid() when present. Helpers below rely on this trigger
-- for event rows (they do not insert events themselves).
create or replace function public._order_availability_overrides_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
begin
  select sp.id
  into v_actor
  from public.staff_profiles sp
  where sp.auth_user_id = auth.uid()
    and sp.is_active = true
  limit 1;

  if tg_op = 'DELETE' then
    insert into public.order_availability_override_events (
      pickup_date, action, note, actor_staff_id
    ) values (
      old.pickup_date,
      'reopened',
      old.note,
      coalesce(v_actor, old.closed_by)
    );
    return old;
  end if;

  -- INSERT or UPDATE while closed=true
  if new.closed is true then
    if tg_op = 'INSERT'
      or old.closed is distinct from new.closed
      or old.note is distinct from new.note
      or old.closed_by is distinct from new.closed_by then
      new.closed_by := coalesce(new.closed_by, v_actor);
      new.closed_at := coalesce(new.closed_at, now());
      insert into public.order_availability_override_events (
        pickup_date, action, note, actor_staff_id
      ) values (
        new.pickup_date,
        'closed',
        new.note,
        coalesce(new.closed_by, v_actor)
      );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists order_availability_overrides_audit_write
  on public.order_availability_overrides;
create trigger order_availability_overrides_audit_write
before insert or update on public.order_availability_overrides
for each row
execute function public._order_availability_overrides_audit();

drop trigger if exists order_availability_overrides_audit_delete
  on public.order_availability_overrides;
create trigger order_availability_overrides_audit_delete
before delete on public.order_availability_overrides
for each row
execute function public._order_availability_overrides_audit();

revoke all on function public._order_availability_overrides_audit()
  from public, anon, authenticated;

-- Explicit RPCs for later staff actions (events come from the trigger above).
create or replace function public.record_order_availability_closed(
  p_pickup_date date,
  p_actor_staff_id uuid,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_pickup_date is null then
    raise exception 'Pickup date is required';
  end if;

  insert into public.order_availability_overrides (
    pickup_date, closed, note, closed_by, closed_at
  ) values (
    p_pickup_date,
    true,
    nullif(trim(coalesce(p_note, '')), ''),
    p_actor_staff_id,
    now()
  )
  on conflict (pickup_date) do update
  set
    closed = true,
    note = excluded.note,
    closed_by = excluded.closed_by,
    closed_at = excluded.closed_at,
    updated_at = now();
end;
$$;

create or replace function public.record_order_availability_reopened(
  p_pickup_date date,
  p_actor_staff_id uuid,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_note text;
begin
  if p_pickup_date is null then
    raise exception 'Pickup date is required';
  end if;

  v_note := nullif(trim(coalesce(p_note, '')), '');

  -- Delete fires audit trigger (reopened). Then stamp actor/note on that event
  -- when the caller provided them explicitly (e.g. service-role contexts).
  delete from public.order_availability_overrides
  where pickup_date = p_pickup_date;

  if p_actor_staff_id is not null or v_note is not null then
    update public.order_availability_override_events e
    set
      actor_staff_id = coalesce(p_actor_staff_id, e.actor_staff_id),
      note = coalesce(v_note, e.note)
    where e.id = (
      select x.id
      from public.order_availability_override_events x
      where x.pickup_date = p_pickup_date
        and x.action = 'reopened'
      order by x.created_at desc
      limit 1
    );
  end if;
end;
$$;

revoke all on function public.record_order_availability_closed(date, uuid, text)
  from public, anon;
revoke all on function public.record_order_availability_reopened(date, uuid, text)
  from public, anon;
grant execute on function public.record_order_availability_closed(date, uuid, text)
  to authenticated;
grant execute on function public.record_order_availability_reopened(date, uuid, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 4) Production capacity
-- ---------------------------------------------------------------------------

create table if not exists public.production_capacity (
  id uuid primary key default gen_random_uuid(),
  pickup_date date not null,
  library_cake_id uuid not null
    references public.library_cakes (id) on delete restrict,
  -- NULL size = capacity shared across all sizes of the cake.
  library_cake_size_id uuid
    references public.library_cake_sizes (id) on delete restrict,
  -- Optional special-menu / catalogue scope.
  collection_id uuid
    references public.collections (id) on delete restrict,
  capacity_quantity integer not null
    check (capacity_quantity >= 0),
  waiting_list_enabled boolean not null default false,
  note text,
  created_by uuid references public.staff_profiles (id) on delete set null,
  updated_by uuid references public.staff_profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Size must belong to cake (CHECK cannot use subqueries).
create or replace function public._production_capacity_assert_size_cake()
returns trigger
language plpgsql
as $$
begin
  if new.library_cake_size_id is null then
    return new;
  end if;
  if not exists (
    select 1
    from public.library_cake_sizes s
    where s.id = new.library_cake_size_id
      and s.cake_id = new.library_cake_id
  ) then
    raise exception 'library_cake_size_id must belong to library_cake_id';
  end if;
  return new;
end;
$$;

drop trigger if exists production_capacity_assert_size_cake
  on public.production_capacity;
create trigger production_capacity_assert_size_cake
before insert or update on public.production_capacity
for each row
execute function public._production_capacity_assert_size_cake();

revoke all on function public._production_capacity_assert_size_cake()
  from public, anon, authenticated;

-- Unique key with NULL-safe coalescing (NULL size / collection = shared bucket).
create unique index if not exists production_capacity_unique_scope_idx
  on public.production_capacity (
    pickup_date,
    library_cake_id,
    coalesce(library_cake_size_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(collection_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

create index if not exists production_capacity_date_idx
  on public.production_capacity (pickup_date);

create index if not exists production_capacity_cake_date_idx
  on public.production_capacity (library_cake_id, pickup_date);

create index if not exists production_capacity_collection_date_idx
  on public.production_capacity (collection_id, pickup_date)
  where collection_id is not null;

create index if not exists production_capacity_waiting_list_idx
  on public.production_capacity (pickup_date, waiting_list_enabled)
  where waiting_list_enabled = true;

drop trigger if exists production_capacity_set_updated_at
  on public.production_capacity;
create trigger production_capacity_set_updated_at
before update on public.production_capacity
for each row
execute function public.set_updated_at();

comment on table public.production_capacity is
  'Bakery production capacity by collection date + cake (+ optional size/catalogue). '
  'Customers never see capacity_quantity — only Fully Booked via later engine.';

create table if not exists public.production_capacity_events (
  id uuid primary key default gen_random_uuid(),
  capacity_id uuid references public.production_capacity (id) on delete set null,
  pickup_date date not null,
  library_cake_id uuid not null,
  library_cake_size_id uuid,
  collection_id uuid,
  previous_quantity integer,
  new_quantity integer not null,
  waiting_list_enabled boolean,
  actor_staff_id uuid references public.staff_profiles (id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);

comment on table public.production_capacity_events is
  'Append-only capacity change history. Confirmed-order floor enforcement is engine/RPC later.';

create index if not exists production_capacity_events_capacity_idx
  on public.production_capacity_events (capacity_id, created_at desc);

create index if not exists production_capacity_events_date_cake_idx
  on public.production_capacity_events (pickup_date, library_cake_id, created_at desc);

alter table public.production_capacity enable row level security;
alter table public.production_capacity_events enable row level security;

revoke all on table public.production_capacity from public, anon;
revoke all on table public.production_capacity_events from public, anon;
grant select, insert, update, delete on table public.production_capacity
  to authenticated;
grant select, insert on table public.production_capacity_events
  to authenticated;

drop policy if exists production_capacity_authenticated_all
  on public.production_capacity;
create policy production_capacity_authenticated_all
on public.production_capacity
for all to authenticated
using (true)
with check (true);

drop policy if exists production_capacity_events_authenticated_select
  on public.production_capacity_events;
create policy production_capacity_events_authenticated_select
on public.production_capacity_events
for select to authenticated
using (true);

drop policy if exists production_capacity_events_authenticated_insert
  on public.production_capacity_events;
create policy production_capacity_events_authenticated_insert
on public.production_capacity_events
for insert to authenticated
with check (true);

-- Temporary holds while CO waits for waiting-list response (30-minute window).
create table if not exists public.production_capacity_holds (
  id uuid primary key default gen_random_uuid(),
  capacity_id uuid not null
    references public.production_capacity (id) on delete cascade,
  waiting_list_item_id uuid,
  quantity integer not null check (quantity > 0),
  status text not null default 'active',
  held_at timestamptz not null default now(),
  held_until timestamptz not null,
  released_at timestamptz,
  converted_order_id uuid references public.orders (id) on delete set null,
  created_by uuid references public.staff_profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint production_capacity_holds_status_check
    check (status in ('active', 'released', 'converted', 'expired'))
);

create index if not exists production_capacity_holds_active_idx
  on public.production_capacity_holds (capacity_id, status)
  where status = 'active';

create index if not exists production_capacity_holds_until_idx
  on public.production_capacity_holds (held_until)
  where status = 'active';

drop trigger if exists production_capacity_holds_set_updated_at
  on public.production_capacity_holds;
create trigger production_capacity_holds_set_updated_at
before update on public.production_capacity_holds
for each row
execute function public.set_updated_at();

alter table public.production_capacity_holds enable row level security;

revoke all on table public.production_capacity_holds from public, anon;
grant select, insert, update on table public.production_capacity_holds
  to authenticated;

drop policy if exists production_capacity_holds_authenticated_all
  on public.production_capacity_holds;
create policy production_capacity_holds_authenticated_all
on public.production_capacity_holds
for all to authenticated
using (true)
with check (true);

-- ---------------------------------------------------------------------------
-- 5) Waiting list foundation
-- ---------------------------------------------------------------------------

alter table public.collections
  add column if not exists waiting_list_enabled boolean not null default false;

alter table public.collections
  add column if not exists waiting_list_response_minutes integer;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'collections_waiting_list_response_minutes_positive'
  ) then
    alter table public.collections
      add constraint collections_waiting_list_response_minutes_positive
      check (
        waiting_list_response_minutes is null
        or waiting_list_response_minutes > 0
      );
  end if;
end $$;

comment on column public.collections.waiting_list_enabled is
  'Special-menu / catalogue-level waiting-list enable. Capacity rows may also gate waiting list.';

comment on column public.collections.waiting_list_response_minutes is
  'Optional override for waiting-list response window after CO contact. NULL = business default.';

create table if not exists public.waiting_list_requests (
  id uuid primary key default gen_random_uuid(),
  guest_name text not null,
  guest_phone text not null,
  customer_id uuid references public.customers (id) on delete set null,
  pickup_date date not null,
  open_to_alternatives boolean not null default false,
  status text not null default 'active',
  notes text,
  created_by_staff_id uuid references public.staff_profiles (id) on delete set null,
  cancelled_at timestamptz,
  cancelled_by uuid references public.staff_profiles (id) on delete set null,
  cancel_reason text,
  converted_order_id uuid references public.orders (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint waiting_list_requests_name_not_blank
    check (char_length(trim(guest_name)) > 0),
  constraint waiting_list_requests_phone_not_blank
    check (char_length(trim(guest_phone)) > 0),
  constraint waiting_list_requests_status_check
    check (
      status in (
        'active',
        'partially_converted',
        'converted',
        'cancelled',
        'closed'
      )
    )
);

comment on table public.waiting_list_requests is
  'Waiting-list header. May contain multiple product items for one customer/date.';

comment on column public.waiting_list_requests.open_to_alternatives is
  'Customer open to CO-offered alternative flavours for the SAME collection date.';

create index if not exists waiting_list_requests_date_status_idx
  on public.waiting_list_requests (pickup_date, status);

create index if not exists waiting_list_requests_phone_idx
  on public.waiting_list_requests (guest_phone);

create index if not exists waiting_list_requests_order_idx
  on public.waiting_list_requests (converted_order_id)
  where converted_order_id is not null;

drop trigger if exists waiting_list_requests_set_updated_at
  on public.waiting_list_requests;
create trigger waiting_list_requests_set_updated_at
before update on public.waiting_list_requests
for each row
execute function public.set_updated_at();

create table if not exists public.waiting_list_items (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null
    references public.waiting_list_requests (id) on delete cascade,
  -- Denormalized from request for queue uniqueness + stable historical scope.
  -- Product or date change → new item row (new queue_position); old row keeps
  -- its historical position under a terminal status.
  pickup_date date not null,
  library_cake_id uuid not null
    references public.library_cakes (id) on delete restrict,
  library_cake_size_id uuid
    references public.library_cake_sizes (id) on delete restrict,
  quantity integer not null check (quantity > 0),
  accepted_quantity integer not null default 0
    check (accepted_quantity >= 0),
  remaining_quantity integer not null
    check (remaining_quantity >= 0),
  -- Stable queue position within (pickup_date, cake, size) scope.
  queue_position integer not null check (queue_position > 0),
  status text not null default 'active',
  production_capacity_id uuid
    references public.production_capacity (id) on delete set null,
  contacted_at timestamptz,
  response_deadline_at timestamptz,
  contacted_by_staff_id uuid
    references public.staff_profiles (id) on delete set null,
  outcome_note text,
  converted_order_id uuid references public.orders (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint waiting_list_items_status_check
    check (
      status in (
        'active',
        'contacted',
        'accepted',
        'partially_accepted',
        'declined',
        'expired',
        'cancelled',
        'converted',
        'closed'
      )
    ),
  constraint waiting_list_items_accepted_not_over_quantity
    check (accepted_quantity <= quantity),
  constraint waiting_list_items_remaining_consistent
    check (remaining_quantity = quantity - accepted_quantity)
);

comment on table public.waiting_list_items is
  'Per-product waiting-list lines. Partial fulfilment keeps remaining quantity active.';

comment on column public.waiting_list_items.pickup_date is
  'Collection date for this line (denormalized). Must match request.pickup_date for active lines.';

comment on column public.waiting_list_items.queue_position is
  'Queue order for (pickup_date + cake + size). Quantity-only edits keep position; '
  'product or date changes require a new item/position (enforced later in engine). '
  'Terminal statuses leave the unique active-queue index so history is preserved.';

comment on column public.waiting_list_items.contacted_at is
  'When CO actually contacted the customer — starts the response window.';

comment on column public.waiting_list_items.response_deadline_at is
  'Allocation hold deadline. Defaults from business/catalogue response minutes.';

create index if not exists waiting_list_items_request_idx
  on public.waiting_list_items (request_id);

create index if not exists waiting_list_items_queue_idx
  on public.waiting_list_items (
    pickup_date,
    library_cake_id,
    library_cake_size_id,
    status,
    queue_position
  );

create index if not exists waiting_list_items_status_deadline_idx
  on public.waiting_list_items (status, response_deadline_at)
  where status = 'contacted';

create index if not exists waiting_list_items_capacity_idx
  on public.waiting_list_items (production_capacity_id)
  where production_capacity_id is not null;

-- One active line per product on a request.
create unique index if not exists waiting_list_items_active_product_unique_idx
  on public.waiting_list_items (
    request_id,
    library_cake_id,
    coalesce(library_cake_size_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  where status in ('active', 'contacted', 'partially_accepted');

-- Stable queue positions within (date, cake, size); terminal rows keep history.
create unique index if not exists waiting_list_items_active_queue_position_unique_idx
  on public.waiting_list_items (
    pickup_date,
    library_cake_id,
    coalesce(library_cake_size_id, '00000000-0000-0000-0000-000000000000'::uuid),
    queue_position
  )
  where status in ('active', 'contacted', 'partially_accepted');

drop trigger if exists waiting_list_items_set_updated_at
  on public.waiting_list_items;
create trigger waiting_list_items_set_updated_at
before update on public.waiting_list_items
for each row
execute function public.set_updated_at();

create or replace function public._waiting_list_items_defaults()
returns trigger
language plpgsql
as $$
declare
  v_request_date date;
begin
  if new.pickup_date is null then
    select r.pickup_date
    into v_request_date
    from public.waiting_list_requests r
    where r.id = new.request_id;
    new.pickup_date := v_request_date;
  end if;

  if new.accepted_quantity is null then
    new.accepted_quantity := 0;
  end if;
  if new.remaining_quantity is null
    or tg_op = 'INSERT'
    or new.quantity is distinct from old.quantity
    or new.accepted_quantity is distinct from old.accepted_quantity then
    new.remaining_quantity := new.quantity - new.accepted_quantity;
  end if;
  return new;
end;
$$;

drop trigger if exists waiting_list_items_set_remaining
  on public.waiting_list_items;
drop trigger if exists waiting_list_items_defaults
  on public.waiting_list_items;
create trigger waiting_list_items_defaults
before insert or update on public.waiting_list_items
for each row
execute function public._waiting_list_items_defaults();

revoke all on function public._waiting_list_items_defaults()
  from public, anon, authenticated;

-- FK from holds → items (deferred until items exist)
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'production_capacity_holds_waiting_list_item_fkey'
  ) then
    alter table public.production_capacity_holds
      add constraint production_capacity_holds_waiting_list_item_fkey
      foreign key (waiting_list_item_id)
      references public.waiting_list_items (id)
      on delete set null;
  end if;
end $$;

create table if not exists public.waiting_list_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null
    references public.waiting_list_requests (id) on delete cascade,
  item_id uuid references public.waiting_list_items (id) on delete set null,
  event_type text not null,
  actor_staff_id uuid references public.staff_profiles (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint waiting_list_events_type_not_blank
    check (char_length(trim(event_type)) > 0)
);

comment on table public.waiting_list_events is
  'Append-only waiting-list audit (join, contact, accept, decline, convert, cancel).';

create index if not exists waiting_list_events_request_idx
  on public.waiting_list_events (request_id, created_at desc);

create index if not exists waiting_list_events_item_idx
  on public.waiting_list_events (item_id, created_at desc)
  where item_id is not null;

alter table public.waiting_list_requests enable row level security;
alter table public.waiting_list_items enable row level security;
alter table public.waiting_list_events enable row level security;

revoke all on table public.waiting_list_requests from public, anon;
revoke all on table public.waiting_list_items from public, anon;
revoke all on table public.waiting_list_events from public, anon;

grant select, insert, update on table public.waiting_list_requests to authenticated;
grant select, insert, update on table public.waiting_list_items to authenticated;
grant select, insert on table public.waiting_list_events to authenticated;

drop policy if exists waiting_list_requests_authenticated_all
  on public.waiting_list_requests;
create policy waiting_list_requests_authenticated_all
on public.waiting_list_requests
for all to authenticated
using (true)
with check (true);

drop policy if exists waiting_list_items_authenticated_all
  on public.waiting_list_items;
create policy waiting_list_items_authenticated_all
on public.waiting_list_items
for all to authenticated
using (true)
with check (true);

drop policy if exists waiting_list_events_authenticated_select
  on public.waiting_list_events;
create policy waiting_list_events_authenticated_select
on public.waiting_list_events
for select to authenticated
using (true);

drop policy if exists waiting_list_events_authenticated_insert
  on public.waiting_list_events;
create policy waiting_list_events_authenticated_insert
on public.waiting_list_events
for insert to authenticated
with check (true);

-- ---------------------------------------------------------------------------
-- 6) Staff operational designations (e.g. bakery preorder approver / Jasmine)
-- ---------------------------------------------------------------------------

create table if not exists public.staff_operational_designations (
  staff_id uuid not null
    references public.staff_profiles (id) on delete cascade,
  designation text not null,
  created_at timestamptz not null default now(),
  created_by uuid references public.staff_profiles (id) on delete set null,
  primary key (staff_id, designation),
  constraint staff_operational_designations_code_check
    check (designation in ('bakery_preorder_approver'))
);

comment on table public.staff_operational_designations is
  'Named operational roles beyond base role code. '
  'bakery_preorder_approver designates the Bakery preorder-exception approver '
  '(e.g. Jasmine). Do not hardcode staff UUIDs in migrations.';

alter table public.staff_operational_designations enable row level security;

revoke all on table public.staff_operational_designations from public, anon;
grant select, insert, delete on table public.staff_operational_designations
  to authenticated;

drop policy if exists staff_operational_designations_authenticated_select
  on public.staff_operational_designations;
create policy staff_operational_designations_authenticated_select
on public.staff_operational_designations
for select to authenticated
using (true);

drop policy if exists staff_operational_designations_authenticated_write
  on public.staff_operational_designations;
create policy staff_operational_designations_authenticated_write
on public.staff_operational_designations
for all to authenticated
using (true)
with check (true);

-- ---------------------------------------------------------------------------
-- 7) Preorder lead-time exception approval foundation
-- ---------------------------------------------------------------------------

alter table public.operations_approval_requests
  add column if not exists customer_informed_at timestamptz;

alter table public.operations_approval_requests
  add column if not exists customer_informed_by uuid
    references public.staff_profiles (id) on delete set null;

alter table public.operations_approval_requests
  add column if not exists withdrawn_at timestamptz;

alter table public.operations_approval_requests
  add column if not exists withdrawn_by uuid
    references public.staff_profiles (id) on delete set null;

alter table public.operations_approval_requests
  drop constraint if exists operations_approval_requests_type_check;

alter table public.operations_approval_requests
  add constraint operations_approval_requests_type_check
  check (
    request_type in (
      'discount_exception',
      'late_order_edit',
      'cross_month_pickup',
      'preorder_lead_time_exception'
    )
  );

alter table public.operations_approval_requests
  drop constraint if exists operations_approval_requests_status_check;

alter table public.operations_approval_requests
  add constraint operations_approval_requests_status_check
  check (
    status in (
      'pending',
      'approved',
      'rejected',
      'cancelled',
      'withdrawn'
    )
  );

comment on column public.operations_approval_requests.customer_informed_at is
  'When CO informed the customer of an approved exception. '
  'Distinct from approval itself. Withdrawal allowed only while this is null.';

create or replace function public._operations_approval_can_request(
  p_role text,
  p_request_type text
)
returns boolean
language sql
immutable
as $$
  select
    (
      p_role = 'customer_operations'
      and p_request_type in (
        'discount_exception',
        'late_order_edit',
        'cross_month_pickup',
        'preorder_lead_time_exception'
      )
    )
    or (
      p_role = 'manager'
      and p_request_type = 'cross_month_pickup'
    );
$$;

create or replace function public._operations_approval_can_review(
  p_role text,
  p_request_type text
)
returns boolean
language sql
immutable
as $$
  select
    (
      p_role in ('owner', 'manager')
      and p_request_type in (
        'discount_exception',
        'late_order_edit',
        'cross_month_pickup',
        'preorder_lead_time_exception'
      )
    )
    or (
      p_role = 'bakery'
      and p_request_type = 'preorder_lead_time_exception'
    );
$$;

-- Guard: approving a preorder exception via the generic approve RPC must not
-- fall through into late_order_edit mutation behaviour.
create or replace function public._operations_approval_is_preorder_lead_time(
  p_request_type text
)
returns boolean
language sql
immutable
as $$
  select p_request_type = 'preorder_lead_time_exception';
$$;

revoke all on function public._operations_approval_is_preorder_lead_time(text)
  from public, anon, authenticated;

-- Dedicated create for preorder lead-time exception (does not rewrite the
-- large existing create_operations_approval_request body).
create or replace function public.create_preorder_lead_time_exception_request(
  p_order_id uuid,
  p_actor_staff_id uuid,
  p_reason text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  order_row public.orders;
  v_reason text;
  v_payload jsonb;
  v_request_id uuid;
  v_fingerprint jsonb;
  v_pickup_date date;
  v_required_days integer;
begin
  if p_order_id is null or p_actor_staff_id is null then
    raise exception 'Order and staff actor are required';
  end if;

  v_role := public._staff_role_code(p_actor_staff_id);
  if not public._operations_approval_can_request(
    v_role,
    'preorder_lead_time_exception'
  ) then
    raise exception 'Not authorized to request a preorder lead-time exception';
  end if;

  v_reason := nullif(trim(coalesce(p_reason, '')), '');
  if v_reason is null then
    raise exception 'A reason is required';
  end if;

  select o.* into order_row
  from public.orders o
  where o.id = p_order_id
    and o.customer_id is null
  for update;
  if not found then
    raise exception 'Order not found';
  end if;

  if order_row.status not in (
    'submitted', 'pending_confirmation', 'awaiting_payment', 'paid'
  ) then
    raise exception 'This order cannot receive an approval request';
  end if;

  if exists (
    select 1
    from public.operations_approval_requests r
    where r.order_id = p_order_id
      and r.request_type = 'preorder_lead_time_exception'
      and r.status = 'pending'
  ) then
    raise exception 'A pending preorder lead-time exception already exists for this order';
  end if;

  v_payload := coalesce(p_payload, '{}'::jsonb);
  begin
    v_pickup_date := (v_payload ->> 'requested_pickup_date')::date;
  exception when others then
    v_pickup_date := null;
  end;
  if v_pickup_date is null then
    v_pickup_date := order_row.pickup_date;
  end if;

  begin
    v_required_days := (v_payload ->> 'required_preorder_days')::integer;
  exception when others then
    v_required_days := null;
  end;

  v_payload := jsonb_build_object(
    'kind', 'preorder_lead_time_exception',
    'requested_pickup_date', v_pickup_date,
    'required_preorder_days', v_required_days,
    'order_pickup_date', order_row.pickup_date,
    'details', coalesce(v_payload -> 'details', '{}'::jsonb)
  );

  v_fingerprint := public._operations_approval_fingerprint(p_order_id);

  insert into public.operations_approval_requests (
    order_id,
    request_type,
    status,
    reason,
    payload,
    order_fingerprint,
    requested_by
  ) values (
    p_order_id,
    'preorder_lead_time_exception',
    'pending',
    v_reason,
    v_payload,
    v_fingerprint,
    p_actor_staff_id
  )
  returning id into v_request_id;

  insert into public.order_timeline_events (
    order_id, event_type, actor_staff_id, metadata
  ) values (
    p_order_id,
    'operations_approval_requested',
    p_actor_staff_id,
    jsonb_build_object(
      'approval_request_id', v_request_id,
      'request_type', 'preorder_lead_time_exception'
    )
  );

  return jsonb_build_object(
    'id', v_request_id,
    'status', 'pending',
    'request_type', 'preorder_lead_time_exception'
  );
end;
$$;

create or replace function public.approve_preorder_lead_time_exception(
  p_request_id uuid,
  p_actor_staff_id uuid,
  p_reviewer_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  req public.operations_approval_requests%rowtype;
  v_note text;
  v_has_designation boolean;
begin
  if p_request_id is null or p_actor_staff_id is null then
    raise exception 'Request and staff actor are required';
  end if;

  v_role := public._staff_role_code(p_actor_staff_id);
  v_note := nullif(trim(coalesce(p_reviewer_note, '')), '');

  select r.* into req
  from public.operations_approval_requests r
  where r.id = p_request_id
  for update;
  if not found then
    raise exception 'Approval request not found';
  end if;
  if req.request_type is distinct from 'preorder_lead_time_exception' then
    raise exception 'This function only approves preorder lead-time exceptions';
  end if;
  if req.status <> 'pending' then
    raise exception 'This approval request has already been decided';
  end if;
  if req.requested_by = p_actor_staff_id then
    raise exception 'Requester cannot approve their own request';
  end if;

  if not public._operations_approval_can_review(v_role, req.request_type) then
    raise exception 'Not authorized to approve this approval request';
  end if;

  -- Bakery reviewers should be designated (e.g. Jasmine). Owner/Manager always ok.
  if v_role = 'bakery' then
    select exists (
      select 1
      from public.staff_operational_designations d
      where d.staff_id = p_actor_staff_id
        and d.designation = 'bakery_preorder_approver'
    ) into v_has_designation;
    if not v_has_designation then
      raise exception 'Bakery staff must hold the bakery_preorder_approver designation';
    end if;
  end if;

  update public.operations_approval_requests r
  set
    status = 'approved',
    reviewed_by = p_actor_staff_id,
    reviewed_at = now(),
    reviewer_note = v_note
  where r.id = p_request_id;

  insert into public.order_timeline_events (
    order_id, event_type, actor_staff_id, metadata
  ) values (
    req.order_id,
    'operations_approval_approved',
    p_actor_staff_id,
    jsonb_build_object(
      'approval_request_id', req.id,
      'request_type', 'preorder_lead_time_exception',
      'reviewer_note', v_note
    )
  );

  return jsonb_build_object('id', req.id, 'status', 'approved');
end;
$$;

create or replace function public.mark_preorder_exception_customer_informed(
  p_request_id uuid,
  p_actor_staff_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  req public.operations_approval_requests%rowtype;
begin
  if p_request_id is null or p_actor_staff_id is null then
    raise exception 'Request and staff actor are required';
  end if;

  v_role := public._staff_role_code(p_actor_staff_id);
  if v_role not in ('customer_operations', 'manager', 'owner') then
    raise exception 'Not authorized to mark customer informed';
  end if;

  select r.* into req
  from public.operations_approval_requests r
  where r.id = p_request_id
  for update;
  if not found then
    raise exception 'Approval request not found';
  end if;
  if req.request_type is distinct from 'preorder_lead_time_exception' then
    raise exception 'Only preorder lead-time exceptions support customer informed';
  end if;
  if req.status is distinct from 'approved' then
    raise exception 'Only approved exceptions can be marked customer informed';
  end if;
  if req.customer_informed_at is not null then
    return jsonb_build_object(
      'id', req.id,
      'customer_informed_at', req.customer_informed_at
    );
  end if;

  update public.operations_approval_requests r
  set
    customer_informed_at = now(),
    customer_informed_by = p_actor_staff_id
  where r.id = p_request_id;

  insert into public.order_timeline_events (
    order_id, event_type, actor_staff_id, metadata
  ) values (
    req.order_id,
    'preorder_exception_customer_informed',
    p_actor_staff_id,
    jsonb_build_object('approval_request_id', req.id)
  );

  return jsonb_build_object('id', req.id, 'customer_informed_at', now());
end;
$$;

create or replace function public.withdraw_preorder_lead_time_exception(
  p_request_id uuid,
  p_actor_staff_id uuid,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  req public.operations_approval_requests%rowtype;
  v_note text;
begin
  if p_request_id is null or p_actor_staff_id is null then
    raise exception 'Request and staff actor are required';
  end if;

  v_role := public._staff_role_code(p_actor_staff_id);
  if v_role not in ('owner', 'manager', 'bakery', 'customer_operations') then
    raise exception 'Not authorized to withdraw this approval';
  end if;

  v_note := nullif(trim(coalesce(p_note, '')), '');

  select r.* into req
  from public.operations_approval_requests r
  where r.id = p_request_id
  for update;
  if not found then
    raise exception 'Approval request not found';
  end if;
  if req.request_type is distinct from 'preorder_lead_time_exception' then
    raise exception 'Only preorder lead-time exceptions can be withdrawn this way';
  end if;
  if req.status is distinct from 'approved' then
    raise exception 'Only approved exceptions can be withdrawn';
  end if;
  if req.customer_informed_at is not null then
    raise exception
      'Cannot withdraw after the customer has been informed. Resolve with the customer instead.';
  end if;

  update public.operations_approval_requests r
  set
    status = 'withdrawn',
    withdrawn_at = now(),
    withdrawn_by = p_actor_staff_id,
    reviewer_note = coalesce(v_note, r.reviewer_note)
  where r.id = p_request_id;

  insert into public.order_timeline_events (
    order_id, event_type, actor_staff_id, metadata
  ) values (
    req.order_id,
    'operations_approval_withdrawn',
    p_actor_staff_id,
    jsonb_build_object(
      'approval_request_id', req.id,
      'request_type', 'preorder_lead_time_exception',
      'note', v_note
    )
  );

  return jsonb_build_object('id', req.id, 'status', 'withdrawn');
end;
$$;

revoke all on function public.create_preorder_lead_time_exception_request(uuid, uuid, text, jsonb)
  from public, anon;
revoke all on function public.approve_preorder_lead_time_exception(uuid, uuid, text)
  from public, anon;
revoke all on function public.mark_preorder_exception_customer_informed(uuid, uuid)
  from public, anon;
revoke all on function public.withdraw_preorder_lead_time_exception(uuid, uuid, text)
  from public, anon;

grant execute on function public.create_preorder_lead_time_exception_request(uuid, uuid, text, jsonb)
  to authenticated;
grant execute on function public.approve_preorder_lead_time_exception(uuid, uuid, text)
  to authenticated;
grant execute on function public.mark_preorder_exception_customer_informed(uuid, uuid)
  to authenticated;
grant execute on function public.withdraw_preorder_lead_time_exception(uuid, uuid, text)
  to authenticated;

-- Patch generic approve so preorder exceptions never execute late_order_edit.
create or replace function public.approve_operations_approval_request(
  p_request_id uuid,
  p_actor_staff_id uuid,
  p_reviewer_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  req public.operations_approval_requests%rowtype;
  v_current jsonb;
  v_note text;
  v_action text;
  v_result jsonb;
  v_proposed_date date;
  v_proposed_time text;
  v_before_date date;
  v_before_time text;
  order_row public.orders;
begin
  if p_request_id is null or p_actor_staff_id is null then
    raise exception 'Request and staff actor are required';
  end if;
  v_role := public._staff_role_code(p_actor_staff_id);
  v_note := nullif(trim(coalesce(p_reviewer_note, '')), '');

  select r.* into req
  from public.operations_approval_requests r
  where r.id = p_request_id
  for update;
  if not found then
    raise exception 'Approval request not found';
  end if;
  if req.status <> 'pending' then
    raise exception 'This approval request has already been decided';
  end if;
  if req.requested_by = p_actor_staff_id then
    raise exception 'Requester cannot approve or reject their own request';
  end if;
  if not public._operations_approval_can_review(v_role, req.request_type) then
    raise exception 'Not authorized to approve this approval request';
  end if;

  -- Preorder lead-time exceptions use the dedicated approve path.
  if req.request_type = 'preorder_lead_time_exception' then
    return public.approve_preorder_lead_time_exception(
      p_request_id,
      p_actor_staff_id,
      p_reviewer_note
    );
  end if;

  select o.* into order_row
  from public.orders o
  where o.id = req.order_id
    and o.customer_id is null
  for update;
  if not found then
    raise exception 'Order not found';
  end if;

  v_current := public._operations_approval_fingerprint(req.order_id);
  if not public._operations_approval_fingerprint_matches(
    req.request_type,
    req.order_fingerprint,
    v_current
  ) then
    raise exception 'This approval request is stale. The order has changed since it was created. Review the order and create a new request if the exception is still needed.';
  end if;

  if req.request_type = 'discount_exception' then
    v_action := req.payload ->> 'action';
    if v_action = 'change_august_to_rm10' then
      v_result := public.change_august_promo_to_rm10_physical_voucher(
        req.order_id,
        p_actor_staff_id,
        req.payload ->> 'voucher_number',
        (req.payload ->> 'expiry_date')::date,
        true,
        req.reason
      );
    else
      v_result := public.redeem_rm10_physical_voucher_for_guest_order(
        req.order_id,
        p_actor_staff_id,
        req.payload ->> 'voucher_number',
        (req.payload ->> 'expiry_date')::date,
        true,
        req.reason
      );
    end if;
  elsif req.request_type = 'cross_month_pickup' then
    v_before_date := order_row.pickup_date;
    v_before_time := to_char(order_row.pickup_time, 'HH24:MI');
    v_proposed_date := (req.payload ->> 'proposed_pickup_date')::date;
    v_proposed_time := req.payload ->> 'proposed_pickup_time';
    update public.orders o
    set
      pickup_date = v_proposed_date,
      pickup_time = v_proposed_time::time,
      updated_by = p_actor_staff_id,
      updated_at = now()
    where o.id = req.order_id;
    perform public._operations_approval_outdate_confirmation(
      req.order_id,
      p_actor_staff_id
    );
    insert into public.order_timeline_events (
      order_id, event_type, actor_staff_id, metadata
    ) values (
      req.order_id,
      'order_updated',
      p_actor_staff_id,
      jsonb_build_object(
        'source', 'operations_approval',
        'request_type', 'cross_month_pickup',
        'pickup_before', v_before_date,
        'pickup_time_before', v_before_time,
        'pickup_after', v_proposed_date,
        'pickup_time_after', v_proposed_time
      )
    );
    v_result := jsonb_build_object(
      'pickup_date', v_proposed_date,
      'pickup_time', v_proposed_time
    );
  else
    if coalesce(req.payload #>> '{proposed,pickup_date}', '') <> '' then
      v_proposed_date := (req.payload #>> '{proposed,pickup_date}')::date;
      v_proposed_time := coalesce(
        nullif(req.payload #>> '{proposed,pickup_time}', ''),
        to_char(order_row.pickup_time, 'HH24:MI')
      );
      if date_trunc('month', v_proposed_date::timestamp)
        is distinct from date_trunc('month', order_row.pickup_date::timestamp) then
        raise exception 'Cross-month pickup must use the cross-month approval type';
      end if;
      update public.orders o
      set
        pickup_date = v_proposed_date,
        pickup_time = v_proposed_time::time,
        updated_by = p_actor_staff_id,
        updated_at = now()
      where o.id = req.order_id;
    end if;
    if jsonb_typeof(req.payload #> '{proposed,items}') = 'array'
      and jsonb_array_length(req.payload #> '{proposed,items}') > 0 then
      perform public.sync_guest_order_items(
        req.order_id,
        req.payload #> '{proposed,items}'
      );
    end if;
    if jsonb_typeof(req.payload #> '{proposed,paid_addons}') = 'array' then
      perform public.sync_guest_order_paid_addons(
        req.order_id,
        req.payload #> '{proposed,paid_addons}'
      );
    end if;
    perform public._operations_approval_outdate_confirmation(
      req.order_id,
      p_actor_staff_id
    );
    insert into public.order_timeline_events (
      order_id, event_type, actor_staff_id, metadata
    ) values (
      req.order_id,
      'order_updated',
      p_actor_staff_id,
      jsonb_build_object(
        'source', 'operations_approval',
        'request_type', 'late_order_edit'
      )
    );
    v_result := jsonb_build_object('applied', true);
  end if;

  update public.operations_approval_requests r
  set
    status = 'approved',
    reviewed_by = p_actor_staff_id,
    reviewed_at = now(),
    reviewer_note = v_note
  where r.id = p_request_id;

  insert into public.order_timeline_events (
    order_id, event_type, actor_staff_id, metadata
  ) values (
    req.order_id,
    'operations_approval_approved',
    p_actor_staff_id,
    jsonb_build_object(
      'approval_request_id', req.id,
      'request_type', req.request_type,
      'reviewer_note', v_note
    )
  );

  return jsonb_build_object(
    'id', req.id,
    'status', 'approved',
    'result', v_result
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 8) Post-payment one-time customer change foundation
-- ---------------------------------------------------------------------------

alter table public.orders
  add column if not exists post_payment_customer_change_count integer
    not null default 0;

alter table public.orders
  add column if not exists post_payment_customer_change_used_at timestamptz;

alter table public.orders
  add column if not exists post_payment_change_override_at timestamptz;

alter table public.orders
  add column if not exists post_payment_change_override_by uuid
    references public.staff_profiles (id) on delete set null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'orders_post_payment_customer_change_count_nonneg'
  ) then
    alter table public.orders
      add constraint orders_post_payment_customer_change_count_nonneg
      check (post_payment_customer_change_count >= 0);
  end if;
end $$;

comment on column public.orders.post_payment_customer_change_count is
  'Customer-facing post-payment change allowance used. 0 = unused; 1 = normal allowance consumed. '
  'Pre-payment edits must not increment this. Manager/Owner overrides use override columns.';

comment on column public.orders.post_payment_change_override_at is
  'When Manager/Owner overrode the one-time post-payment change restriction.';

-- ---------------------------------------------------------------------------
-- 9) Fingerprint helper: treat preorder exception like late_order_edit for
--    staleness (items + pickup). Reuse existing matcher via type aliasing in
--    fingerprint_matches if needed later; foundation stores standard fingerprint.
-- ---------------------------------------------------------------------------

comment on function public.create_preorder_lead_time_exception_request(uuid, uuid, text, jsonb) is
  'CO requests Bakery/Manager/Owner approval for a lead-time exception. '
  'Approval and customer_informed are separate states.';

comment on function public.approve_preorder_lead_time_exception(uuid, uuid, text) is
  'Approves a preorder lead-time exception without mutating order lines. '
  'Bakery reviewers require bakery_preorder_approver designation.';

comment on function public.withdraw_preorder_lead_time_exception(uuid, uuid, text) is
  'Withdraws an approved exception only when customer_informed_at is null.';
