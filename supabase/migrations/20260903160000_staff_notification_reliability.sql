-- Staff notification reliability.
-- Idempotent event log + email delivery state.
-- Authoritative sources (one per category):
--   new_order          orders INSERT (submitted, not Fresh Picks)
--   order_paid         orders UPDATE to paid (status or payment_status)
--   order_cancelled    orders UPDATE to cancelled
--   last_minute        orders INSERT/UPDATE when order_source becomes last_minute
--   order_confirmed    order_timeline_events INSERT customer_confirmed
--   order_edited       order_timeline_events INSERT order_updated
--   approval_required  operations_approval_requests INSERT pending
-- Waiting-list tables are intentionally not sources.
-- Triggers never raise into the business transaction.

create table if not exists public.staff_notification_events (
  id uuid primary key default gen_random_uuid(),
  event_key text not null,
  code text not null,
  order_id uuid references public.orders (id) on delete set null,
  approval_id uuid,
  title text not null,
  description text not null default '',
  href text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint staff_notification_events_event_key_unique unique (event_key),
  constraint staff_notification_events_code_check check (
    code in (
      'new_order',
      'order_paid',
      'order_confirmed',
      'order_cancelled',
      'order_edited',
      'approval_required',
      'last_minute'
    )
  )
);

create index if not exists staff_notification_events_created_at_idx
  on public.staff_notification_events (created_at desc);

create index if not exists staff_notification_events_code_idx
  on public.staff_notification_events (code);

create table if not exists public.staff_notification_email_deliveries (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null
    references public.staff_notification_events (id)
    on delete cascade,
  staff_id uuid not null
    references public.staff_profiles (id)
    on delete cascade,
  status text not null,
  error text,
  resend_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_notification_email_deliveries_unique
    unique (event_id, staff_id),
  constraint staff_notification_email_deliveries_status_check check (
    status in ('sent', 'failed')
  )
);

create index if not exists staff_notification_email_deliveries_event_idx
  on public.staff_notification_email_deliveries (event_id);

alter table public.staff_notification_events enable row level security;
alter table public.staff_notification_email_deliveries enable row level security;

drop policy if exists staff_notification_events_staff_select
  on public.staff_notification_events;
create policy staff_notification_events_staff_select
  on public.staff_notification_events
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.staff_profiles
      where staff_profiles.auth_user_id = auth.uid()
        and staff_profiles.is_active = true
    )
  );

revoke all on table public.staff_notification_events from public, anon;
revoke all on table public.staff_notification_email_deliveries from public, anon;
grant select on table public.staff_notification_events to authenticated;

create or replace function public.emit_staff_notification_event(
  p_event_key text,
  p_code text,
  p_order_id uuid,
  p_approval_id uuid,
  p_title text,
  p_description text,
  p_href text,
  p_payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_id uuid;
begin
  insert into public.staff_notification_events (
    event_key,
    code,
    order_id,
    approval_id,
    title,
    description,
    href,
    payload
  )
  values (
    p_event_key,
    p_code,
    p_order_id,
    p_approval_id,
    p_title,
    coalesce(p_description, ''),
    p_href,
    coalesce(p_payload, '{}'::jsonb)
  )
  on conflict (event_key) do nothing
  returning id into inserted_id;

  return inserted_id;
exception
  when others then
    raise warning 'staff notification emit failed: %', sqlerrm;
    return null;
end;
$$;

revoke all on function public.emit_staff_notification_event(
  text, text, uuid, uuid, text, text, text, jsonb
) from public, anon, authenticated;

create or replace function public._staff_notification_order_description(
  p_guest_name text,
  p_cake_name text,
  p_pickup_date date,
  p_order_number text
)
returns text
language sql
immutable
as $$
  select concat_ws(
    ' · ',
    nullif(trim(coalesce(p_guest_name, '')), ''),
    nullif(trim(coalesce(p_cake_name, '')), ''),
    p_pickup_date::text,
    nullif(trim(coalesce(p_order_number, '')), '')
  );
$$;

create or replace function public.staff_notification_on_orders()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_description text;
  v_href text;
  v_payload jsonb;
begin
  v_href := '/owner/orders/' || new.id::text;
  v_description := public._staff_notification_order_description(
    new.guest_name,
    new.cake_name,
    new.pickup_date,
    new.order_number
  );
  v_payload := jsonb_build_object(
    'guestName', new.guest_name,
    'cakeName', new.cake_name,
    'pickupDate', new.pickup_date,
    'orderNumber', new.order_number,
    'orderSource', new.order_source
  );

  if tg_op = 'INSERT' then
    if new.status is distinct from 'cancelled' then
      if new.status = 'submitted' and new.extra_stock_id is null then
        perform public.emit_staff_notification_event(
          'new_order:' || new.id::text,
          'new_order',
          new.id,
          null,
          'New order received',
          v_description,
          v_href,
          v_payload
        );
      end if;

      if new.order_source = 'last_minute' then
        perform public.emit_staff_notification_event(
          'last_minute:' || new.id::text,
          'last_minute',
          new.id,
          null,
          'Last-minute order',
          v_description,
          v_href,
          v_payload
        );
      end if;
    end if;

    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
      perform public.emit_staff_notification_event(
        'order_cancelled:' || new.id::text,
        'order_cancelled',
        new.id,
        null,
        'Order cancelled',
        v_description,
        v_href,
        v_payload
      );
      return new;
    end if;

    if new.status = 'cancelled' then
      return new;
    end if;

    if (
      new.status = 'paid'
      or new.payment_status = 'paid'
    )
      and not (
        old.status = 'paid'
        or old.payment_status = 'paid'
      )
    then
      perform public.emit_staff_notification_event(
        'order_paid:' || new.id::text,
        'order_paid',
        new.id,
        null,
        'Order paid',
        v_description,
        v_href,
        v_payload
      );
    end if;

    if new.order_source = 'last_minute'
      and old.order_source is distinct from 'last_minute'
    then
      perform public.emit_staff_notification_event(
        'last_minute:' || new.id::text,
        'last_minute',
        new.id,
        null,
        'Last-minute order',
        v_description,
        v_href,
        v_payload
      );
    end if;
  end if;

  return new;
exception
  when others then
    raise warning 'staff notification orders trigger failed: %', sqlerrm;
    return new;
end;
$$;

drop trigger if exists staff_notification_on_orders_insert
  on public.orders;
create trigger staff_notification_on_orders_insert
after insert on public.orders
for each row
execute function public.staff_notification_on_orders();

drop trigger if exists staff_notification_on_orders_update
  on public.orders;
create trigger staff_notification_on_orders_update
after update on public.orders
for each row
execute function public.staff_notification_on_orders();

create or replace function public.staff_notification_on_timeline()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  order_row public.orders;
  v_description text;
  v_href text;
  v_payload jsonb;
begin
  select *
    into order_row
  from public.orders
  where id = new.order_id;

  if not found then
    return new;
  end if;

  if order_row.status = 'cancelled' then
    return new;
  end if;

  v_href := '/owner/orders/' || order_row.id::text;
  v_description := public._staff_notification_order_description(
    order_row.guest_name,
    order_row.cake_name,
    order_row.pickup_date,
    order_row.order_number
  );
  v_payload := jsonb_build_object(
    'guestName', order_row.guest_name,
    'cakeName', order_row.cake_name,
    'pickupDate', order_row.pickup_date,
    'orderNumber', order_row.order_number
  );

  if new.event_type = 'customer_confirmed' then
    perform public.emit_staff_notification_event(
      'order_confirmed:' || order_row.id::text,
      'order_confirmed',
      order_row.id,
      null,
      'Order confirmed',
      v_description,
      v_href,
      v_payload
    );
  elsif new.event_type = 'order_updated' then
    perform public.emit_staff_notification_event(
      'order_edited:' || new.id::text,
      'order_edited',
      order_row.id,
      null,
      'Order edited',
      v_description,
      v_href,
      v_payload
    );
  end if;

  return new;
exception
  when others then
    raise warning 'staff notification timeline trigger failed: %', sqlerrm;
    return new;
end;
$$;

drop trigger if exists staff_notification_on_timeline_insert
  on public.order_timeline_events;
create trigger staff_notification_on_timeline_insert
after insert on public.order_timeline_events
for each row
execute function public.staff_notification_on_timeline();

create or replace function public.staff_notification_on_approvals()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_href text;
  v_description text;
begin
  if new.status is distinct from 'pending' then
    return new;
  end if;

  v_href := case
    when new.order_id is not null then '/owner/orders/' || new.order_id::text
    else '/owner/approvals'
  end;
  v_description := case
    when coalesce(new.request_type, '') <> '' then
      'Approval requested · ' || new.request_type
    else
      'A new approval request requires your attention.'
  end;

  perform public.emit_staff_notification_event(
    'approval_required:' || new.id::text,
    'approval_required',
    new.order_id,
    new.id,
    'Approval required',
    v_description,
    v_href,
    jsonb_build_object('requestType', new.request_type)
  );

  return new;
exception
  when others then
    raise warning 'staff notification approval trigger failed: %', sqlerrm;
    return new;
end;
$$;

drop trigger if exists staff_notification_on_approvals_insert
  on public.operations_approval_requests;
create trigger staff_notification_on_approvals_insert
after insert on public.operations_approval_requests
for each row
execute function public.staff_notification_on_approvals();

create or replace function public.staff_notification_request_dispatch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  dispatch_url text;
  dispatch_secret text;
begin
  dispatch_url := current_setting(
    'app.settings.staff_notification_dispatch_url',
    true
  );
  dispatch_secret := current_setting(
    'app.settings.staff_notification_dispatch_secret',
    true
  );

  if dispatch_url is null or btrim(dispatch_url) = '' then
    return new;
  end if;

  begin
    perform net.http_post(
      url := dispatch_url,
      body := jsonb_build_object('eventId', new.id::text),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || coalesce(dispatch_secret, '')
      )
    );
  exception
    when undefined_function then
      null;
    when undefined_object then
      null;
    when others then
      raise warning 'staff notification pg_net dispatch failed: %', sqlerrm;
  end;

  return new;
exception
  when others then
    raise warning 'staff notification dispatch trigger failed: %', sqlerrm;
    return new;
end;
$$;

drop trigger if exists staff_notification_request_dispatch
  on public.staff_notification_events;
create trigger staff_notification_request_dispatch
after insert on public.staff_notification_events
for each row
execute function public.staff_notification_request_dispatch();

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'staff_notification_events'
  ) then
    alter publication supabase_realtime
      add table public.staff_notification_events;
  end if;
exception
  when undefined_object then
    null;
end
$$;
