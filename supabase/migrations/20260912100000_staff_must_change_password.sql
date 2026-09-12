-- Admin password reset: forced change after a temporary password is issued.
-- Additive only. Default false. No data rewrite. No RLS changes.

alter table public.staff_profiles
  add column if not exists must_change_password boolean not null default false;

comment on column public.staff_profiles.must_change_password is
  'When true, staff must choose a new password before using Whitebird. Set by admin password reset; cleared after the staff member completes the forced change.';
