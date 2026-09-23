-- Library asset image upload. Same file rules as cake photo uploads.
-- Does not change cake photo storage or catalogue logic.

alter table public.library_assets
  add column if not exists storage_path text;

comment on column public.library_assets.storage_path is
  'Object path in the library-assets bucket when the file is stored here.';

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'library-assets',
  'library-assets',
  true,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists library_assets_storage_staff_select
  on storage.objects;
drop policy if exists library_assets_storage_staff_insert
  on storage.objects;
drop policy if exists library_assets_storage_staff_update
  on storage.objects;
drop policy if exists library_assets_storage_staff_delete
  on storage.objects;

create policy library_assets_storage_staff_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'library-assets'
  and exists (
    select 1
    from public.staff_profiles sp
    join public.roles r on r.id = sp.role_id
    where sp.auth_user_id = auth.uid()
      and sp.is_active = true
      and r.code in ('owner', 'manager')
  )
);

create policy library_assets_storage_staff_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'library-assets'
  and exists (
    select 1
    from public.staff_profiles sp
    join public.roles r on r.id = sp.role_id
    where sp.auth_user_id = auth.uid()
      and sp.is_active = true
      and r.code in ('owner', 'manager')
  )
);

create policy library_assets_storage_staff_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'library-assets'
  and exists (
    select 1
    from public.staff_profiles sp
    join public.roles r on r.id = sp.role_id
    where sp.auth_user_id = auth.uid()
      and sp.is_active = true
      and r.code in ('owner', 'manager')
  )
)
with check (
  bucket_id = 'library-assets'
  and exists (
    select 1
    from public.staff_profiles sp
    join public.roles r on r.id = sp.role_id
    where sp.auth_user_id = auth.uid()
      and sp.is_active = true
      and r.code in ('owner', 'manager')
  )
);

create policy library_assets_storage_staff_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'library-assets'
  and exists (
    select 1
    from public.staff_profiles sp
    join public.roles r on r.id = sp.role_id
    where sp.auth_user_id = auth.uid()
      and sp.is_active = true
      and r.code in ('owner', 'manager')
  )
);
