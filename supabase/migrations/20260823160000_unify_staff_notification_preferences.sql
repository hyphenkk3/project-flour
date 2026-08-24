-- Unify staff notification preferences
-- Adds independent web + email channels and web notification behaviour.

alter table public.staff_notification_preferences
  add column if not exists web_enabled boolean not null default true,
  add column if not exists web_mode text not null default 'transient';

alter table public.staff_notification_preferences
  drop constraint if exists staff_notification_preferences_web_mode_check;

alter table public.staff_notification_preferences

  add constraint staff_notification_preferences_web_mode_check
  check (web_mode in ('transient', 'persistent'));
