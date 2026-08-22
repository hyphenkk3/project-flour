-- Staff notification preferences
-- One row per staff member + notification event.
-- Preferences are personal to each staff account.

create table public.staff_notification_preferences (
  id uuid primary key default gen_random_uuid(),

  staff_id uuid not null
    references public.staff_profiles (id)
    on delete cascade,

  notification_code text not null,

  email_enabled boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint staff_notification_preferences_unique
    unique (staff_id, notification_code),

  constraint staff_notification_preferences_code_check
    check (
      notification_code in (
        'new_order',
        'order_paid',
        'order_confirmed',
        'order_cancelled',
        'order_edited',
        'approval_required',
        'guest_preorder'
      )
    )
);

create index staff_notification_preferences_staff_id_idx
  on public.staff_notification_preferences (staff_id);

create index staff_notification_preferences_code_idx
  on public.staff_notification_preferences (notification_code);

create trigger staff_notification_preferences_set_updated_at
before update on public.staff_notification_preferences
for each row
execute function public.set_updated_at();

alter table public.staff_notification_preferences enable row level security;

create policy "Staff can read own notification preferences"
on public.staff_notification_preferences
for select
to authenticated
using (
  exists (
    select 1
    from public.staff_profiles
    where staff_profiles.id = staff_notification_preferences.staff_id
      and staff_profiles.auth_user_id = auth.uid()
      and staff_profiles.is_active = true
  )
);

create policy "Staff can insert own notification preferences"
on public.staff_notification_preferences
for insert
to authenticated
with check (
  exists (
    select 1
    from public.staff_profiles
    where staff_profiles.id = staff_notification_preferences.staff_id
      and staff_profiles.auth_user_id = auth.uid()
      and staff_profiles.is_active = true
  )
);

create policy "Staff can update own notification preferences"
on public.staff_notification_preferences
for update
to authenticated
using (
  exists (
    select 1
    from public.staff_profiles
    where staff_profiles.id = staff_notification_preferences.staff_id
      and staff_profiles.auth_user_id = auth.uid()
      and staff_profiles.is_active = true
  )
)
with check (
  exists (
    select 1
    from public.staff_profiles
    where staff_profiles.id = staff_notification_preferences.staff_id
      and staff_profiles.auth_user_id = auth.uid()
      and staff_profiles.is_active = true
  )
);
