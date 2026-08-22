-- Order availability: Owner-closed pickup dates for new customer preorders.
-- Separate from catalogues, website override, and weekly pickup hours.
-- Empty by default — do not seed closed dates.
-- Reopening a date deletes the exception row.

create table if not exists public.order_availability_overrides (
  pickup_date date primary key,
  closed boolean not null default true,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint order_availability_overrides_closed_true
    check (closed = true)
);

comment on table public.order_availability_overrides is
  'Explicit pickup dates where new customer preorders are closed. '
  'Absence of a row means the weekly pickup schedule applies. '
  'Does not change catalogues, website override, or Library cakes.';

comment on column public.order_availability_overrides.note is
  'Owner-only note. Never expose to customers.';

drop trigger if exists order_availability_overrides_set_updated_at
  on public.order_availability_overrides;
create trigger order_availability_overrides_set_updated_at
before update on public.order_availability_overrides
for each row
execute function public.set_updated_at();

alter table public.order_availability_overrides enable row level security;

revoke all on table public.order_availability_overrides from public;
revoke all on table public.order_availability_overrides from anon;
grant select, insert, update, delete on table public.order_availability_overrides
  to authenticated;

drop policy if exists order_availability_overrides_authenticated_all
  on public.order_availability_overrides;
create policy order_availability_overrides_authenticated_all
on public.order_availability_overrides
for all
to authenticated
using (true)
with check (true);

create or replace function public.is_pickup_orders_closed(p_date date)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.order_availability_overrides o
    where o.pickup_date = p_date
      and o.closed = true
  );
$$;

comment on function public.is_pickup_orders_closed(date) is
  'True when the Owner has closed new customer preorders for that pickup date.';

revoke all on function public.is_pickup_orders_closed(date) from public;
grant execute on function public.is_pickup_orders_closed(date)
  to anon, authenticated;

create or replace function public.list_closed_pickup_order_dates(
  p_from date,
  p_to date
)
returns table (pickup_date date)
language sql
stable
security definer
set search_path = public
as $$
  select o.pickup_date
  from public.order_availability_overrides o
  where o.closed = true
    and (p_from is null or o.pickup_date >= p_from)
    and (p_to is null or o.pickup_date <= p_to)
  order by o.pickup_date;
$$;

comment on function public.list_closed_pickup_order_dates(date, date) is
  'Customer-safe list of pickup dates with orders closed. Dates only — no Owner notes.';

revoke all on function public.list_closed_pickup_order_dates(date, date)
  from public;
grant execute on function public.list_closed_pickup_order_dates(date, date)
  to anon, authenticated;

-- Weekly public slots plus order-availability overlay.
-- MUST stay aligned with WEEKLY_PROFILES in pickup-schedule.ts.
-- PICKUP_DATE_OVERRIDES remains code-config and is currently empty.
create or replace function public.is_valid_public_pickup_slot(
  p_date date,
  p_time time
)
returns boolean
language plpgsql
stable
set search_path = public
as $$
declare
  dow integer;
  latest time;
  earliest time := time '12:00';
  minute_part integer;
begin
  if p_date is null or p_time is null then
    return false;
  end if;

  if public.is_pickup_orders_closed(p_date) then
    return false;
  end if;

  minute_part := extract(minute from p_time)::integer;
  if minute_part not in (0, 30) then
    return false;
  end if;
  if extract(second from p_time) <> 0 then
    return false;
  end if;

  -- PostgreSQL DOW: 0 Sunday … 6 Saturday (matches JS Date#getDay).
  dow := extract(dow from p_date)::integer;
  if dow = 3 then
    latest := time '15:00';
  elsif dow in (0, 5, 6) then
    latest := time '21:30';
  else
    latest := time '17:30';
  end if;

  return p_time >= earliest and p_time <= latest;
end;
$$;

comment on function public.is_valid_public_pickup_slot(date, time) is
  'Customer public pickup slot membership. Same weekly windows as '
  'getEffectivePickupSchedule, then false when order availability is closed.';

revoke all on function public.is_valid_public_pickup_slot(date, time) from public;
grant execute on function public.is_valid_public_pickup_slot(date, time)
  to anon, authenticated;

create or replace function public.submit_guest_preorder(
  p_customer_name text,
  p_phone text,
  p_email text,
  p_pickup_date date,
  p_pickup_time time,
  p_notes text,
  p_items jsonb,
  p_email_submission_receipt_requested boolean default false
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  cake_row public.library_cakes;
  size_row public.library_cake_sizes;
  new_order public.orders;
  active_collection public.collections;
  item jsonb;
  v_qty integer;
  v_cake_id uuid;
  v_size_id uuid;
  item_count integer := 0;
  complimentary_row record;
  v_email text;
  v_receipt_requested boolean;
  earliest_pickup date;
begin
  if char_length(trim(coalesce(p_customer_name, ''))) = 0 then
    raise exception 'Full name is required';
  end if;
  if char_length(trim(coalesce(p_phone, ''))) = 0 then
    raise exception 'Phone number is required';
  end if;

  v_email := nullif(trim(coalesce(p_email, '')), '');
  v_receipt_requested := coalesce(p_email_submission_receipt_requested, false);

  if v_receipt_requested and v_email is null then
    raise exception 'Email is required when requesting a copy of your preorder submission';
  end if;

  if p_pickup_date is null or p_pickup_time is null then
    raise exception 'Please choose a valid pickup time for that date.';
  end if;

  -- Same earliest date as PickupSlotFields (tomorrow, Asia/Singapore).
  earliest_pickup := timezone('Asia/Singapore', now())::date + 1;
  if p_pickup_date < earliest_pickup then
    raise exception 'Please choose a valid pickup time for that date.';
  end if;

  if public.is_pickup_orders_closed(p_pickup_date) then
    raise exception 'Orders are closed for that pickup date.';
  end if;

  if not public.is_valid_public_pickup_slot(p_pickup_date, p_pickup_time) then
    raise exception 'Please choose a valid pickup time for that date.';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one cake is required';
  end if;

  active_collection := public.storefront_current_collection();
  if active_collection.id is null then
    raise exception 'No active collection is available';
  end if;

  insert into public.orders (
    order_number,
    customer_id,
    guest_name,
    guest_phone,
    guest_email,
    fulfilment_method,
    pickup_date,
    pickup_time,
    status,
    payment_status,
    customer_notes,
    collection_id,
    confirmation_needs_resend,
    order_source,
    email_submission_receipt_requested
  )
  values (
    public.allocate_order_number(),
    null,
    trim(p_customer_name),
    trim(p_phone),
    v_email,
    'pickup',
    p_pickup_date,
    p_pickup_time,
    'submitted',
    'unpaid',
    nullif(trim(coalesce(p_notes, '')), ''),
    active_collection.id,
    false,
    'customer_website',
    v_receipt_requested
  )
  returning * into new_order;

  for item in select * from jsonb_array_elements(p_items)
  loop
    v_cake_id := (item ->> 'cake_id')::uuid;
    v_size_id := (item ->> 'cake_size_id')::uuid;
    v_qty := coalesce((item ->> 'quantity')::integer, 1);

    if v_qty < 1 then
      raise exception 'Quantity must be at least 1';
    end if;

    select lc.*
    into cake_row
    from public.library_cakes lc
    where lc.id = v_cake_id;
    if not found then
      raise exception 'Cake is not available';
    end if;

    if cake_row.status not in ('active', 'seasonal') then
      raise exception 'Cake is not available in the current collection';
    end if;

    if not exists (
      select 1
      from public.collection_cakes cc
      where cc.collection_id = active_collection.id
        and cc.library_cake_id = cake_row.id
        and cc.available = true
    ) then
      raise exception 'Cake is not available in the current collection';
    end if;

    select lcs.*
    into size_row
    from public.library_cake_sizes lcs
    where lcs.id = v_size_id
      and lcs.cake_id = v_cake_id;
    if not found then
      raise exception 'Cake size is not available';
    end if;

    insert into public.order_items (
      order_id,
      cake_id,
      cake_size_id,
      quantity,
      unit_price,
      cake_name,
      size_label
    )
    values (
      new_order.id,
      cake_row.id,
      size_row.id,
      v_qty,
      size_row.price,
      cake_row.name,
      size_row.label
    );

    item_count := item_count + 1;
  end loop;

  if item_count = 0 then
    raise exception 'At least one cake is required';
  end if;

  for complimentary_row in
    select
      cci.complimentary_item_type_id,
      cit.name,
      cci.default_quantity,
      cci.sort_order
    from public.collection_complimentary_items cci
    join public.complimentary_item_types cit
      on cit.id = cci.complimentary_item_type_id
    where cci.collection_id = active_collection.id
      and cci.is_available = true
      and cci.is_default = true
      and cci.default_quantity > 0
    order by cci.sort_order asc, cit.name asc
  loop
    insert into public.order_complimentary_items (
      order_id,
      complimentary_item_type_id,
      name,
      quantity,
      sort_order
    )
    values (
      new_order.id,
      complimentary_row.complimentary_item_type_id,
      complimentary_row.name,
      complimentary_row.default_quantity,
      complimentary_row.sort_order
    );
  end loop;

  insert into public.order_timeline_events (
    order_id,
    event_type,
    actor_staff_id,
    metadata
  )
  values (
    new_order.id,
    'preorder_submitted',
    null,
    jsonb_build_object(
      'item_count', item_count,
      'source', 'customer_website',
      'email_submission_receipt_requested', v_receipt_requested
    )
  );

  return new_order;
end;
$$;

revoke all on function public.submit_guest_preorder(
  text, text, text, date, time, text, jsonb, boolean
) from public;
grant execute on function public.submit_guest_preorder(
  text, text, text, date, time, text, jsonb, boolean
) to anon, authenticated;
