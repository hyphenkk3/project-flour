-- Staff credential-change audit trail.
-- Append-only. Stores metadata only — never passwords, hashes, tokens,
-- or Passkey secrets. Writes are service-role only.

create table if not exists public.staff_credential_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  actor_staff_id uuid references public.staff_profiles (id) on delete set null,
  subject_staff_id uuid not null
    references public.staff_profiles (id) on delete cascade,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint staff_credential_events_type_check
    check (
      event_type in (
        'username_changed',
        'email_changed',
        'password_changed',
        'admin_password_reset',
        'passkey_added',
        'passkey_removed'
      )
    )
);

create index if not exists staff_credential_events_created_at_idx
  on public.staff_credential_events (created_at desc);

create index if not exists staff_credential_events_subject_idx
  on public.staff_credential_events (subject_staff_id, created_at desc);

comment on table public.staff_credential_events is
  'Append-only audit of successful staff credential/security changes. '
  'Never stores passwords, hashes, tokens, or Passkey secrets.';

alter table public.staff_credential_events enable row level security;

revoke all on table public.staff_credential_events from public, anon, authenticated;
grant select on table public.staff_credential_events to authenticated;
grant all on table public.staff_credential_events to service_role;

create policy staff_credential_events_owner_manager_select
on public.staff_credential_events
for select
to authenticated
using (public._current_staff_role_code() in ('owner', 'manager'));
