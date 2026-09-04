-- Staff notification email fallback sweep via pg_cron.
-- Does not enable the dormant per-event pg_net trigger.
-- Does not store the dispatcher URL or secret in this file.

create extension if not exists pg_cron;

-- Keep per-event HTTP dormant even if the shared dispatch GUCs are set
-- for the 15-minute sweep. Phase 3 can turn this on explicitly.
create or replace function public.staff_notification_request_dispatch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  dispatch_url text;
  dispatch_secret text;
  per_event text;
begin
  per_event := current_setting(
    'app.settings.staff_notification_pg_net_per_event',
    true
  );
  if lower(coalesce(btrim(per_event), '')) is distinct from 'on' then
    return new;
  end if;

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

create or replace function public.staff_notification_cron_sweep()
returns void
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
    raise warning
      'staff notification cron sweep skipped: dispatch url is not configured';
    return;
  end if;

  if dispatch_secret is null or btrim(dispatch_secret) = '' then
    raise warning
      'staff notification cron sweep skipped: dispatch secret is not configured';
    return;
  end if;

  begin
    perform net.http_get(
      url := btrim(dispatch_url),
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || btrim(dispatch_secret)
      ),
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

do $$
declare
  job record;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise warning 'pg_cron is not installed; sweep job was not scheduled';
    return;
  end if;

  for job in
    select jobid
    from cron.job
    where jobname = 'staff-notification-email-dispatch-sweep'
  loop
    perform cron.unschedule(job.jobid);
  end loop;

  perform cron.schedule(
    'staff-notification-email-dispatch-sweep',
    '*/15 * * * *',
    'select public.staff_notification_cron_sweep()'
  );
exception
  when undefined_table then
    raise warning 'cron.job is not available; sweep job was not scheduled';
  when undefined_function then
    raise warning 'cron.schedule is not available; sweep job was not scheduled';
end
$$;
