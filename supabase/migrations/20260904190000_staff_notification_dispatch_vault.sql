-- Staff notification dispatch config backed by Vault secrets.
-- Does not store secrets. Does not enable per-event pg_net.
-- Does not create the pg_net extension.

create table if not exists public.staff_notification_dispatch_config (
  id boolean primary key default true check (id),
  dispatch_url text,
  per_event_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into public.staff_notification_dispatch_config (
  id,
  dispatch_url,
  per_event_enabled
)
values (true, null, false)
on conflict (id) do nothing;

alter table public.staff_notification_dispatch_config enable row level security;

revoke all on table public.staff_notification_dispatch_config
  from public, anon, authenticated;

create or replace function public.staff_notification_vault_secret(p_name text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select nullif(btrim(decrypted_secret), '')
  from vault.decrypted_secrets
  where name = p_name
  limit 1;
$$;

revoke all on function public.staff_notification_vault_secret(text)
  from public, anon, authenticated;

create or replace function public.staff_notification_dispatch_headers(
  p_include_json boolean
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  dispatch_secret text;
  bypass text;
  headers jsonb;
begin
  dispatch_secret := public.staff_notification_vault_secret(
    'staff_notification_dispatch_secret'
  );
  if dispatch_secret is null then
    return null;
  end if;

  headers := jsonb_build_object(
    'Authorization', 'Bearer ' || dispatch_secret
  );
  if p_include_json then
    headers := headers || jsonb_build_object('Content-Type', 'application/json');
  end if;

  bypass := public.staff_notification_vault_secret(
    'staff_notification_vercel_protection_bypass'
  );
  if bypass is not null then
    headers := headers || jsonb_build_object(
      'x-vercel-protection-bypass', bypass
    );
  end if;

  return headers;
end;
$$;

revoke all on function public.staff_notification_dispatch_headers(boolean)
  from public, anon, authenticated;

create or replace function public.staff_notification_request_dispatch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cfg public.staff_notification_dispatch_config;
  headers jsonb;
begin
  select *
    into cfg
  from public.staff_notification_dispatch_config
  where id = true;

  if cfg.dispatch_url is null
    or btrim(cfg.dispatch_url) = ''
    or cfg.per_event_enabled is not true
  then
    return new;
  end if;

  headers := public.staff_notification_dispatch_headers(true);
  if headers is null then
    return new;
  end if;

  begin
    perform net.http_post(
      url := btrim(cfg.dispatch_url),
      body := jsonb_build_object('eventId', new.id::text),
      headers := headers
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

create or replace function public.staff_notification_cron_sweep()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  cfg public.staff_notification_dispatch_config;
  headers jsonb;
begin
  select *
    into cfg
  from public.staff_notification_dispatch_config
  where id = true;

  if cfg.dispatch_url is null or btrim(cfg.dispatch_url) = '' then
    raise warning
      'staff notification cron sweep skipped: dispatch url is not configured';
    return;
  end if;

  headers := public.staff_notification_dispatch_headers(false);
  if headers is null then
    raise warning
      'staff notification cron sweep skipped: dispatch secret is not configured';
    return;
  end if;

  begin
    perform net.http_get(
      url := btrim(cfg.dispatch_url),
      headers := headers,
      timeout_milliseconds := 15000
    );
  exception
    when undefined_function then
      raise warning
        'staff notification cron sweep skipped: http helper is not available';
    when undefined_object then
      raise warning
        'staff notification cron sweep skipped: http helper is not available';
    when others then
      raise warning 'staff notification cron sweep failed: %', sqlerrm;
  end;
end;
$$;

revoke all on function public.staff_notification_cron_sweep()
  from public, anon, authenticated;

-- RETURNS TABLE columns named event_id/staff_id conflict with SQL
-- column references inside this function on Postgres 15+.
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

