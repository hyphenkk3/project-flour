-- Per-staff sound preference for the existing new-order web notification.
-- Sound remains disabled by default and does not participate in checkout.
alter table public.staff_notification_preferences
  add column if not exists sound_enabled boolean not null default false;
