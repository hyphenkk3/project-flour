-- Cake media: size-specific photos, one configurable default, Storage metadata.
-- Extends library_cake_photos. Does not replace the table.
-- Do not store image binaries in Postgres.

alter table public.library_cake_photos
  add column if not exists cake_size_id uuid
    references public.library_cake_sizes (id)
    on delete set null,
  add column if not exists is_default boolean not null default false,
  add column if not exists storage_path text;

comment on column public.library_cake_photos.cake_size_id is
  'Optional product-size assignment. Null = general/lifestyle photo.';
comment on column public.library_cake_photos.is_default is
  'Configured default photo for this cake. At most one row per cake.';
comment on column public.library_cake_photos.storage_path is
  'Object path in the library-cake-photos bucket when the file is stored here.';

create index if not exists library_cake_photos_cake_size_id_idx
  on public.library_cake_photos (cake_size_id);

drop index if exists library_cake_photos_one_default;
create unique index library_cake_photos_one_default
  on public.library_cake_photos (cake_id)
  where is_default = true;

drop index if exists library_cake_photos_one_per_size;
create unique index library_cake_photos_one_per_size
  on public.library_cake_photos (cake_id, cake_size_id)
  where cake_size_id is not null;

-- Public storefront files only. UUID paths; listing is not granted to anon.
-- The bucket is public so known object URLs can be fetched for storefront
-- display. There is no anonymous list policy.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'library-cake-photos',
  'library-cake-photos',
  true,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists library_cake_photos_storage_public_read
  on storage.objects;
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
      and r.code in ('owner', 'manager')
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
      and r.code in ('owner', 'manager')
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
      and r.code in ('owner', 'manager')
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
      and r.code in ('owner', 'manager')
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
      and r.code in ('owner', 'manager')
  )
);
