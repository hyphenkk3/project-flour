-- Blocks database-trigger and scheduled HTTP dispatch before any pg_net call.
-- Queue rows, preferences, web notifications and WhatsApp are untouched.
-- This does not block unknown/legacy direct provider calls; provider pause required.
create or replace function public.staff_notification_email_delivery_is_paused()
returns boolean language sql stable security definer set search_path=pg_catalog
as $function$ select true $function$;
revoke all on function public.staff_notification_email_delivery_is_paused()
 from public, anon, authenticated, service_role;

create or replace function public.staff_notification_request_dispatch()
returns trigger language plpgsql security definer set search_path to 'public'
as $function$
declare cfg public.staff_notification_dispatch_config; headers jsonb;
begin
 if public.staff_notification_email_delivery_is_paused() then return new; end if;
 select * into cfg from public.staff_notification_dispatch_config where id=true;
 if cfg.dispatch_url is null or btrim(cfg.dispatch_url)='' or cfg.per_event_enabled is not true then return new; end if;
 headers:=public.staff_notification_dispatch_headers(true);
 if headers is null then return new; end if;
 begin
  perform net.http_post(url:=btrim(cfg.dispatch_url),body:=jsonb_build_object('eventId',new.id::text),headers:=headers);
 exception when undefined_function then null; when undefined_object then null;
 when others then raise warning 'staff notification pg_net dispatch failed: %',sqlerrm;
 end;
 return new;
exception when others then raise warning 'staff notification dispatch trigger failed: %',sqlerrm; return new;
end
$function$;

create or replace function public.staff_notification_cron_sweep()
returns void language plpgsql security definer set search_path to 'public'
as $function$
declare cfg public.staff_notification_dispatch_config; headers jsonb;
begin
 if public.staff_notification_email_delivery_is_paused() then return; end if;
 select * into cfg from public.staff_notification_dispatch_config where id=true;
 if cfg.dispatch_url is null or btrim(cfg.dispatch_url)='' then
  raise warning 'staff notification cron sweep skipped: dispatch url is not configured'; return;
 end if;
 headers:=public.staff_notification_dispatch_headers(false);
 if headers is null then raise warning 'staff notification cron sweep skipped: dispatch secret is not configured'; return; end if;
 begin
  perform net.http_get(url:=btrim(cfg.dispatch_url),headers:=headers,timeout_milliseconds:=15000);
 exception when undefined_function then raise warning 'staff notification cron sweep skipped: http helper is not available';
 when undefined_object then raise warning 'staff notification cron sweep skipped: http helper is not available';
 when others then raise warning 'staff notification cron sweep failed: %',sqlerrm;
 end;
end
$function$;
