-- Staff archive: hide deactivated staff from the normal Staff Management list
-- while retaining identity and Auth. Additive only. No data rewrite. No RLS changes.

alter table public.staff_profiles
  add column if not exists archived_at timestamptz;

comment on column public.staff_profiles.archived_at is
  'When set, the staff member is archived: hidden from the normal Staff Management list, inactive, and unable to sign in. Restore clears this and returns them to deactivated.';

alter table public.staff_profiles
  drop constraint if exists staff_profiles_archived_inactive_chk;

alter table public.staff_profiles
  add constraint staff_profiles_archived_inactive_chk
  check (archived_at is null or is_active = false);

create index if not exists staff_profiles_archived_at_idx
  on public.staff_profiles (archived_at)
  where archived_at is not null;
