-- Fresh Pick Walk-in Hold.
-- Additive. One physical extra_stock row = one hold instance.
-- Does not change lifecycle (proposed | confirmed | rejected).
-- Availability is derived: walk_in_held_until < now() is available even if
-- cleanup cron never runs.

alter table public.extra_stock
  add column if not exists walk_in_held_at timestamptz;

alter table public.extra_stock
  add column if not exists walk_in_held_until timestamptz;

alter table public.extra_stock
  add column if not exists walk_in_held_by uuid
    references public.staff_profiles (id) on delete set null;

alter table public.extra_stock
  add column if not exists walk_in_hold_extended_at timestamptz;

alter table public.extra_stock
  add column if not exists walk_in_hold_reminder_sent_at timestamptz;

comment on column public.extra_stock.walk_in_held_at is
  'When the current Walk-in Hold instance started. Cleared on release or expiry cleanup.';

comment on column public.extra_stock.walk_in_held_until is
  'Walk-in Hold expiry. Derived availability: null or < now() means not held.';

comment on column public.extra_stock.walk_in_held_by is
  'Staff who placed the current Walk-in Hold instance.';

comment on column public.extra_stock.walk_in_hold_extended_at is
  'When the one allowed extension was used for the current hold instance.';

comment on column public.extra_stock.walk_in_hold_reminder_sent_at is
  'When the 3-minute expiry reminder was written for the current hold instance.';

create index if not exists extra_stock_walk_in_held_until_idx
  on public.extra_stock (walk_in_held_until)
  where walk_in_held_until is not null;

create or replace function public.extra_walk_in_hold_minutes()
returns integer
language sql
immutable
parallel safe
as $$
  select 15;
$$;

create or replace function public.extra_walk_in_hold_extension_minutes()
returns integer
language sql
immutable
parallel safe
as $$
  select 15;
$$;

create or replace function public.extra_walk_in_hold_reminder_lead_minutes()
returns integer
language sql
immutable
parallel safe
as $$
  select 3;
$$;

create or replace function public.extra_walk_in_hold_is_active(
  p_held_until timestamptz,
  p_at timestamptz default now()
)
returns boolean
language sql
stable
parallel safe
as $$
  select p_held_until is not null and p_held_until >= p_at;
$$;

create or replace function public._assert_extra_stock_not_walk_in_held(
  p_held_until timestamptz
)
returns void
language plpgsql
stable
as $$
begin
  if public.extra_walk_in_hold_is_active(p_held_until) then
    raise exception 'This Fresh Pick is currently on walk-in hold.';
  end if;
end;
$$;

create or replace function public._extra_walk_in_hold_role_allowed(p_role text)
returns boolean
language sql
immutable
parallel safe
as $$
  select p_role in ('owner', 'manager', 'customer_operations');
$$;

create or replace function public._clear_extra_walk_in_hold(p_extra_stock_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.extra_stock e
  set
    walk_in_held_at = null,
    walk_in_held_until = null,
    walk_in_held_by = null,
    walk_in_hold_extended_at = null,
    walk_in_hold_reminder_sent_at = null,
    updated_at = now()
  where e.id = p_extra_stock_id;
end;
$$;

revoke all on function public._clear_extra_walk_in_hold(uuid) from public;
grant execute on function public._clear_extra_walk_in_hold(uuid) to service_role;

-- Block sold / cut / unconfirm / window moves while a hold is active.
-- Hold metadata changes (place / extend / release / reminder) are allowed.
create or replace function public._extra_stock_guard_walk_in_hold()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.extra_walk_in_hold_is_active(old.walk_in_held_until) then
    return new;
  end if;

  if new.sold_at is distinct from old.sold_at
     or new.cut_into_slices_at is distinct from old.cut_into_slices_at
     or new.lifecycle is distinct from old.lifecycle
     or new.pickup_available_from_at is distinct from old.pickup_available_from_at
     or new.pickup_through_at is distinct from old.pickup_through_at
     or new.prepared_on is distinct from old.prepared_on
     or new.confirmed_at is distinct from old.confirmed_at
     or new.confirmed_by is distinct from old.confirmed_by
  then
    raise exception 'This Fresh Pick is currently on walk-in hold.';
  end if;

  return new;
end;
$$;

drop trigger if exists extra_stock_guard_walk_in_hold on public.extra_stock;
create trigger extra_stock_guard_walk_in_hold
before update on public.extra_stock
for each row
execute function public._extra_stock_guard_walk_in_hold();

drop policy if exists extra_stock_public_confirmed_select on public.extra_stock;
create policy extra_stock_public_confirmed_select
on public.extra_stock
for select
to anon
using (
  lifecycle = 'confirmed'
  and sold_at is null
  and confirmed_at is not null
  and pickup_through_at is not null
  and now() >= confirmed_at
  and now() <= pickup_through_at
  and (walk_in_held_until is null or walk_in_held_until < now())
);

create or replace function public.hold_extra_stock_walk_in(
  p_extra_stock_id uuid,
  p_actor_staff_id uuid
)
returns public.extra_stock
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  stock_row public.extra_stock;
  v_until timestamptz;
begin
  if p_extra_stock_id is null then
    raise exception 'EXTRA stock is required';
  end if;
  if p_actor_staff_id is null then
    raise exception 'Staff actor is required';
  end if;
  if not exists (
    select 1 from public.staff_profiles sp where sp.id = p_actor_staff_id
  ) then
    raise exception 'Staff actor not found';
  end if;

  v_role := public._staff_role_code(p_actor_staff_id);
  if not public._extra_walk_in_hold_role_allowed(v_role) then
    raise exception 'Not authorized to place a walk-in hold';
  end if;

  select e.*
  into stock_row
  from public.extra_stock e
  where e.id = p_extra_stock_id
  for update;

  if not found then
    raise exception 'EXTRA stock not found';
  end if;

  if stock_row.lifecycle <> 'confirmed' then
    raise exception 'Only a confirmed Fresh Pick can be held';
  end if;
  if stock_row.sold_at is not null then
    raise exception 'This Fresh Pick has already been sold or assigned';
  end if;
  if stock_row.cut_into_slices_at is not null then
    raise exception 'This Fresh Pick was cut into slices';
  end if;
  if stock_row.pickup_through_at is null or now() > stock_row.pickup_through_at then
    raise exception 'This Fresh Pick is no longer available';
  end if;
  if public.extra_walk_in_hold_is_active(stock_row.walk_in_held_until) then
    raise exception 'This Fresh Pick is currently on walk-in hold.';
  end if;

  if stock_row.walk_in_held_until is not null
     and stock_row.walk_in_held_until < now() then
    perform public._record_extra_stock_event(
      p_extra_stock_id,
      'hold_expired',
      null,
      jsonb_build_object(
        'walk_in_held_until', stock_row.walk_in_held_until,
        'walk_in_held_by', stock_row.walk_in_held_by,
        'replaced_by_new_hold', true
      )
    );
  end if;

  v_until := now() + make_interval(mins => public.extra_walk_in_hold_minutes());

  update public.extra_stock e
  set
    walk_in_held_at = now(),
    walk_in_held_until = v_until,
    walk_in_held_by = p_actor_staff_id,
    walk_in_hold_extended_at = null,
    walk_in_hold_reminder_sent_at = null,
    updated_at = now()
  where e.id = p_extra_stock_id
    and e.lifecycle = 'confirmed'
    and e.sold_at is null
    and e.cut_into_slices_at is null
    and (e.walk_in_held_until is null or e.walk_in_held_until < now())
  returning * into stock_row;

  if not found then
    raise exception 'This Fresh Pick is currently on walk-in hold.';
  end if;

  perform public._record_extra_stock_event(
    p_extra_stock_id,
    'hold',
    p_actor_staff_id,
    jsonb_build_object(
      'walk_in_held_until', stock_row.walk_in_held_until,
      'hold_minutes', public.extra_walk_in_hold_minutes()
    )
  );

  return stock_row;
end;
$$;

revoke all on function public.hold_extra_stock_walk_in(uuid, uuid) from public;
grant execute on function public.hold_extra_stock_walk_in(uuid, uuid)
  to authenticated, service_role;

create or replace function public.extend_extra_stock_walk_in_hold(
  p_extra_stock_id uuid,
  p_actor_staff_id uuid
)
returns public.extra_stock
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  stock_row public.extra_stock;
  v_until timestamptz;
begin
  if p_extra_stock_id is null then
    raise exception 'EXTRA stock is required';
  end if;
  if p_actor_staff_id is null then
    raise exception 'Staff actor is required';
  end if;
  if not exists (
    select 1 from public.staff_profiles sp where sp.id = p_actor_staff_id
  ) then
    raise exception 'Staff actor not found';
  end if;

  v_role := public._staff_role_code(p_actor_staff_id);
  if not public._extra_walk_in_hold_role_allowed(v_role) then
    raise exception 'Not authorized to extend a walk-in hold';
  end if;

  select e.*
  into stock_row
  from public.extra_stock e
  where e.id = p_extra_stock_id
  for update;

  if not found then
    raise exception 'EXTRA stock not found';
  end if;

  if stock_row.lifecycle <> 'confirmed'
     or stock_row.sold_at is not null
     or stock_row.cut_into_slices_at is not null then
    raise exception 'This Fresh Pick is no longer available';
  end if;

  if not public.extra_walk_in_hold_is_active(stock_row.walk_in_held_until) then
    raise exception 'This walk-in hold has expired';
  end if;

  if stock_row.walk_in_hold_extended_at is not null then
    raise exception 'This walk-in hold has already been extended';
  end if;

  v_until := stock_row.walk_in_held_until
    + make_interval(mins => public.extra_walk_in_hold_extension_minutes());

  update public.extra_stock e
  set
    walk_in_held_until = v_until,
    walk_in_hold_extended_at = now(),
    walk_in_hold_reminder_sent_at = null,
    updated_at = now()
  where e.id = p_extra_stock_id
    and e.walk_in_hold_extended_at is null
    and public.extra_walk_in_hold_is_active(e.walk_in_held_until)
  returning * into stock_row;

  if not found then
    raise exception 'This walk-in hold cannot be extended';
  end if;

  perform public._record_extra_stock_event(
    p_extra_stock_id,
    'hold_extended',
    p_actor_staff_id,
    jsonb_build_object(
      'walk_in_held_until', stock_row.walk_in_held_until,
      'extension_minutes', public.extra_walk_in_hold_extension_minutes()
    )
  );

  return stock_row;
end;
$$;

revoke all on function public.extend_extra_stock_walk_in_hold(uuid, uuid)
  from public;
grant execute on function public.extend_extra_stock_walk_in_hold(uuid, uuid)
  to authenticated, service_role;

create or replace function public.release_extra_stock_walk_in_hold(
  p_extra_stock_id uuid,
  p_actor_staff_id uuid
)
returns public.extra_stock
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  stock_row public.extra_stock;
  v_until timestamptz;
begin
  if p_extra_stock_id is null then
    raise exception 'EXTRA stock is required';
  end if;
  if p_actor_staff_id is null then
    raise exception 'Staff actor is required';
  end if;
  if not exists (
    select 1 from public.staff_profiles sp where sp.id = p_actor_staff_id
  ) then
    raise exception 'Staff actor not found';
  end if;

  v_role := public._staff_role_code(p_actor_staff_id);
  if not public._extra_walk_in_hold_role_allowed(v_role) then
    raise exception 'Not authorized to release a walk-in hold';
  end if;

  select e.*
  into stock_row
  from public.extra_stock e
  where e.id = p_extra_stock_id
  for update;

  if not found then
    raise exception 'EXTRA stock not found';
  end if;

  if not public.extra_walk_in_hold_is_active(stock_row.walk_in_held_until) then
    raise exception 'There is no active walk-in hold';
  end if;

  v_until := stock_row.walk_in_held_until;

  perform public._clear_extra_walk_in_hold(p_extra_stock_id);

  perform public._record_extra_stock_event(
    p_extra_stock_id,
    'hold_released',
    p_actor_staff_id,
    jsonb_build_object('walk_in_held_until', v_until)
  );

  select e.* into stock_row from public.extra_stock e where e.id = p_extra_stock_id;
  return stock_row;
end;
$$;

revoke all on function public.release_extra_stock_walk_in_hold(uuid, uuid)
  from public;
grant execute on function public.release_extra_stock_walk_in_hold(uuid, uuid)
  to authenticated, service_role;

-- Optional tidy: does not make inventory available. Derived expiry does that.
create or replace function public.sweep_expired_extra_walk_in_holds()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  stock_row public.extra_stock;
  v_count integer := 0;
begin
  for stock_row in
    select e.*
    from public.extra_stock e
    where e.walk_in_held_until is not null
      and e.walk_in_held_until < now()
    for update skip locked
  loop
    perform public._clear_extra_walk_in_hold(stock_row.id);
    perform public._record_extra_stock_event(
      stock_row.id,
      'hold_expired',
      null,
      jsonb_build_object(
        'walk_in_held_until', stock_row.walk_in_held_until,
        'walk_in_held_by', stock_row.walk_in_held_by
      )
    );
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.sweep_expired_extra_walk_in_holds()
  from public, anon, authenticated;
grant execute on function public.sweep_expired_extra_walk_in_holds()
  to service_role;

alter table public.staff_notification_events
  drop constraint if exists staff_notification_events_code_check;

alter table public.staff_notification_events
  add constraint staff_notification_events_code_check
  check (
    code in (
      'new_order',
      'order_paid',
      'order_confirmed',
      'order_cancelled',
      'order_edited',
      'approval_required',
      'last_minute',
      'fresh_pick_walk_in_hold_reminder'
    )
  );

alter table public.staff_notification_preferences
  drop constraint if exists staff_notification_preferences_code_check;

alter table public.staff_notification_preferences
  add constraint staff_notification_preferences_code_check
  check (
    notification_code in (
      'new_order',
      'order_paid',
      'order_confirmed',
      'order_cancelled',
      'order_edited',
      'approval_required',
      'last_minute',
      'fresh_pick_walk_in_hold_reminder'
    )
  );

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

do $$
declare
  job record;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise warning 'pg_cron is not installed; walk-in hold jobs were not scheduled';
    return;
  end if;

  for job in
    select jobid
    from cron.job
    where jobname in (
      'extra-walk-in-hold-reminders',
      'extra-walk-in-hold-expiry-cleanup'
    )
  loop
    perform cron.unschedule(job.jobid);
  end loop;

  perform cron.schedule(
    'extra-walk-in-hold-reminders',
    '* * * * *',
    'select public.sweep_extra_walk_in_hold_reminders()'
  );

  perform cron.schedule(
    'extra-walk-in-hold-expiry-cleanup',
    '* * * * *',
    'select public.sweep_expired_extra_walk_in_holds()'
  );
exception
  when undefined_table then
    raise warning 'cron.job is not available; walk-in hold jobs were not scheduled';
  when undefined_function then
    raise warning 'cron.schedule is not available; walk-in hold jobs were not scheduled';
end
$$;
create or replace function public.submit_guest_extra_order(
  p_customer_name text,
  p_phone text,
  p_email text,
  p_pickup_date date,
  p_pickup_time time,
  p_notes text,
  p_extra_stock_id uuid,
  p_email_submission_receipt_requested boolean default false,
  p_include_receipt boolean default false,
  p_complimentary jsonb default '[]'::jsonb,
  p_paid_addons jsonb default '[]'::jsonb,
  p_extra_stock_ids uuid[] default null,
  p_fulfilment_method public.fulfilment_method default 'pickup',
  p_delivery jsonb default null,
  p_dine_in jsonb default null
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  stock_row public.extra_stock;
  size_row public.library_cake_sizes;
  new_order public.orders;
  active_collection public.collections;
  complimentary jsonb;
  addon jsonb;
  v_email text;
  v_receipt_requested boolean;
  v_include_receipt boolean;
  v_pickup_at timestamptz;
  v_updated int;
  v_qty integer;
  v_type_id uuid;
  v_comp_code text;
  v_comp_name text;
  v_comp_sort integer;
  v_addon_code text;
  v_paid jsonb := '[]'::jsonb;
  v_ids uuid[];
  v_id uuid;
  v_primary uuid;
  v_expected int;
  v_method public.fulfilment_method;
begin
  if char_length(trim(coalesce(p_customer_name, ''))) = 0 then
    raise exception 'Full name is required';
  end if;
  if char_length(trim(coalesce(p_phone, ''))) = 0 then
    raise exception 'Phone number is required';
  end if;
  v_email := nullif(trim(coalesce(p_email, '')), '');
  v_receipt_requested := coalesce(p_email_submission_receipt_requested, false);
  v_include_receipt := coalesce(p_include_receipt, false);
  if v_receipt_requested and v_email is null then
    raise exception 'Email is required when requesting a copy of your preorder submission';
  end if;
  if p_extra_stock_ids is not null
     and coalesce(array_length(p_extra_stock_ids, 1), 0) > 0 then
    v_ids := p_extra_stock_ids;
  else
    if p_extra_stock_id is null then
      raise exception 'Extra is required';
    end if;
    v_ids := array[p_extra_stock_id];
  end if;
  if exists (
    select 1 from unnest(v_ids) as extra_id group by extra_id having count(*) > 1
  ) then
    raise exception 'Extra is required';
  end if;
  v_primary := v_ids[1];
  v_expected := array_length(v_ids, 1);
  v_method := coalesce(p_fulfilment_method, 'pickup'::public.fulfilment_method);

  perform public._assert_fresh_picks_customer_fulfilment(
    p_pickup_date,
    p_pickup_time,
    v_method
  );

  v_pickup_at := timezone(
    'Asia/Singapore',
    (p_pickup_date::text || ' ' || p_pickup_time::text)::timestamp
  );

  for v_id in
    select extra_id from unnest(v_ids) as extra_id order by extra_id
  loop
    select e.*
    into stock_row
    from public.extra_stock e
    where e.id = v_id
    for update;

    if not found then
      raise exception 'Extra is not available';
    end if;
    if stock_row.lifecycle <> 'confirmed' then
      raise exception 'Extra is not available';
    end if;
    if stock_row.sold_at is not null then
      raise exception 'This Extra cake has already been sold';
    end if;
    if stock_row.cut_into_slices_at is not null then
      raise exception 'This Extra cake has already been sold';
    end if;
    if public.extra_walk_in_hold_is_active(stock_row.walk_in_held_until) then
      raise exception 'This Fresh Pick is currently on walk-in hold.';
    end if;
    if stock_row.confirmed_at is not null and now() < stock_row.confirmed_at then
      raise exception 'Extra is not available';
    end if;
    if stock_row.pickup_through_at is null or now() > stock_row.pickup_through_at then
      raise exception 'This Extra is no longer available to order';
    end if;
    if v_pickup_at < stock_row.pickup_available_from_at then
      raise exception 'Please choose a pickup time from the Extra pickup window.';
    end if;
    if p_pickup_date < (timezone('Asia/Singapore', stock_row.pickup_available_from_at))::date
      or p_pickup_date > (timezone('Asia/Singapore', stock_row.pickup_through_at))::date
    then
      raise exception 'Please choose a pickup time from the Extra pickup window.';
    end if;
    if stock_row.library_cake_id is null or stock_row.library_cake_size_id is null then
      raise exception 'This Extra cake cannot be ordered';
    end if;
  end loop;

  if p_complimentary is not null
     and jsonb_typeof(p_complimentary) <> 'array' then
    raise exception 'Complimentary items are invalid';
  end if;
  if p_paid_addons is not null
     and jsonb_typeof(p_paid_addons) <> 'array' then
    raise exception 'Paid add-ons are invalid';
  end if;

  active_collection := public.storefront_collection_for_pickup_date(p_pickup_date);

  update public.extra_stock e
  set sold_at = now(), updated_at = now()
  where e.id = any(v_ids)
    and e.sold_at is null
    and e.lifecycle = 'confirmed'
    and e.cut_into_slices_at is null
    and (e.walk_in_held_until is null or e.walk_in_held_until < now());
  get diagnostics v_updated = row_count;
  if v_updated <> v_expected then
    raise exception 'This Extra cake has already been sold';
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
    extra_stock_id,
    confirmation_needs_resend,
    order_source,
    email_submission_receipt_requested,
    include_receipt
  )
  values (
    public.allocate_order_number(),
    null,
    trim(p_customer_name),
    trim(p_phone),
    v_email,
    v_method,
    p_pickup_date,
    p_pickup_time,
    'submitted',
    'unpaid',
    nullif(trim(coalesce(p_notes, '')), ''),
    null,
    v_primary,
    false,
    'customer_website',
    v_receipt_requested,
    v_include_receipt
  )
  returning * into new_order;

  foreach v_id in array v_ids
  loop
    select e.* into stock_row from public.extra_stock e where e.id = v_id;
    select lcs.*
    into size_row
    from public.library_cake_sizes lcs
    where lcs.id = stock_row.library_cake_size_id
      and lcs.cake_id = stock_row.library_cake_id;
    if not found then
      raise exception 'This Extra cake cannot be ordered';
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
      stock_row.library_cake_id,
      stock_row.library_cake_size_id,
      1,
      coalesce(size_row.price, 0),
      stock_row.cake_name,
      stock_row.size_label
    );
  end loop;

  update public.extra_stock e
  set order_id = new_order.id, updated_at = now()
  where e.id = any(v_ids);

  if p_complimentary is not null
     and jsonb_typeof(p_complimentary) = 'array' then
    for complimentary in select * from jsonb_array_elements(p_complimentary)
    loop
      v_qty := coalesce((complimentary ->> 'quantity')::integer, 1);
      if v_qty <= 0 then
        continue;
      end if;
      if v_qty <> 1 then
        raise exception 'Complimentary quantity for this order must be 1';
      end if;

      if active_collection.id is null then
        raise exception 'Complimentary item is not available';
      end if;

      v_comp_name := null;
      v_comp_sort := 0;
      v_comp_code := nullif(lower(trim(coalesce(complimentary ->> 'code', ''))), '');
      begin
        v_type_id := nullif(trim(coalesce(complimentary ->> 'type_id', '')), '')::uuid;
      exception
        when others then
          v_type_id := null;
      end;

      select
        cit.id,
        cit.name,
        cci.sort_order
      into v_type_id, v_comp_name, v_comp_sort
      from public.complimentary_item_types cit
      join public.collection_complimentary_items cci
        on cci.complimentary_item_type_id = cit.id
      where cci.collection_id = active_collection.id
        and cci.is_available = true
        and cit.code in ('birthday_topper', 'candle', 'knife')
        and (
          (v_type_id is not null and cit.id = v_type_id)
          or (v_comp_code is not null and cit.code = v_comp_code)
        )
      limit 1;

      if v_comp_name is null then
        raise exception 'Complimentary item is not available';
      end if;

      insert into public.order_complimentary_items (
        order_id,
        complimentary_item_type_id,
        name,
        quantity,
        sort_order
      )
      values (
        new_order.id,
        v_type_id,
        v_comp_name,
        1,
        v_comp_sort
      );
    end loop;
  end if;

  if p_paid_addons is not null
     and jsonb_typeof(p_paid_addons) <> 'array' then
    raise exception 'Paid add-ons are invalid';
  end if;

  if p_paid_addons is not null
     and jsonb_typeof(p_paid_addons) = 'array' then
    for addon in select * from jsonb_array_elements(p_paid_addons)
    loop
      v_addon_code := nullif(lower(trim(coalesce(addon ->> 'code', ''))), '');
      if v_addon_code is null
         or v_addon_code not in ('birthday_card', 'wishing_card') then
        raise exception 'Paid add-on is not available';
      end if;
      v_qty := coalesce((addon ->> 'quantity')::integer, 1);
      if v_qty <> 1 then
        raise exception 'Paid add-on quantity for this order must be 1';
      end if;
    end loop;

    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'code', trim(addon_row ->> 'code'),
          'quantity', 1,
          'messages', case
            when addon_row ? 'messages' and jsonb_typeof(addon_row -> 'messages') = 'array'
              then jsonb_build_array(addon_row -> 'messages' -> 0)
            when addon_row ? 'written_message'
              then jsonb_build_array(addon_row -> 'written_message')
            else '[]'::jsonb
          end
        )
        order by trim(addon_row ->> 'code')
      ),
      '[]'::jsonb
    )
    into v_paid
    from jsonb_array_elements(p_paid_addons) as addon_row;
  end if;

  perform public._sync_order_paid_addons_from_payload(
    new_order.id,
    coalesce(v_paid, '[]'::jsonb)
  );

  perform public._sync_order_fulfilment_from_payload(
    new_order.id,
    v_method,
    case when v_method = 'delivery' then p_delivery else null end,
    case when v_method = 'dine_in' then p_dine_in else null end
  );

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
      'item_count', v_expected,
      'source', 'customer_website_extra',
      'extra_stock_id', v_primary,
      'extra_stock_ids', to_jsonb(v_ids),
      'email_submission_receipt_requested', v_receipt_requested,
      'fulfilment_method', v_method::text
    )
  );

  select * into new_order from public.orders where id = new_order.id;
  return new_order;
exception
  when unique_violation then
    raise exception 'This Extra cake has already been sold';
end;
$$;

