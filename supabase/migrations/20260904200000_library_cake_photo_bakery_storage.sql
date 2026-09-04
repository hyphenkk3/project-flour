-- Allow Bakery to manage cake photo objects in Storage.
-- Does not rebuild the library-cake-photos bucket or table.
-- Library cake-record configuration remains Owner + Manager only.

drop policy if exists library_cake_photos_storage_staff_select
  on storage.objects;
drop policy if exists library_cake_photos_storage_staff_insert
  on storage.objects;
drop policy if exists library_cake_photos_storage_staff_update
  on storage.objects;
drop policy if exists library_cake_photos_storage_staff_delete
  on storage.objects;

create policy library_cake_photos_storage_staff_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'library-cake-photos'
  and exists (
    select 1
    from public.staff_profiles sp
    join public.roles r on r.id = sp.role_id
    where sp.auth_user_id = auth.uid()
      and sp.is_active = true
      and r.code in ('owner', 'manager', 'bakery')
  )
);

create policy library_cake_photos_storage_staff_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'library-cake-photos'
  and exists (
    select 1
    from public.staff_profiles sp
    join public.roles r on r.id = sp.role_id
    where sp.auth_user_id = auth.uid()
      and sp.is_active = true
      and r.code in ('owner', 'manager', 'bakery')
  )
);

create policy library_cake_photos_storage_staff_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'library-cake-photos'
  and exists (
    select 1
    from public.staff_profiles sp
    join public.roles r on r.id = sp.role_id
    where sp.auth_user_id = auth.uid()
      and sp.is_active = true
      and r.code in ('owner', 'manager', 'bakery')
  )
)
with check (
  bucket_id = 'library-cake-photos'
  and exists (
    select 1
    from public.staff_profiles sp
    join public.roles r on r.id = sp.role_id
    where sp.auth_user_id = auth.uid()
      and sp.is_active = true
      and r.code in ('owner', 'manager', 'bakery')
  )
);

create policy library_cake_photos_storage_staff_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'library-cake-photos'
  and exists (
    select 1
    from public.staff_profiles sp
    join public.roles r on r.id = sp.role_id
    where sp.auth_user_id = auth.uid()
      and sp.is_active = true
      and r.code in ('owner', 'manager', 'bakery')
  )
);
