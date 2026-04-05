-- 013_refresh_patient_assets_storage_policies.sql
-- Recreate patient_assets policies so role normalization and path checks are updated
-- in environments where 011 was already applied.

insert into storage.buckets (id, name, public)
values ('patient_assets', 'patient_assets', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists patient_assets_insert_hstaff on storage.objects;
drop policy if exists patient_assets_update_hstaff on storage.objects;
drop policy if exists patient_assets_delete_hstaff on storage.objects;
drop policy if exists patient_assets_select_public on storage.objects;

create policy patient_assets_insert_hstaff
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'patient_assets'
    and (storage.foldername(name))[1] = auth.uid()::text
    and (storage.foldername(name))[2] in ('patient-picture', 'medical-document')
    and exists (
      select 1
      from public.users u
      where u.auth_user_id = auth.uid()
        and lower(replace(replace(replace(coalesce(u.role, ''), '_', ''), ' ', ''), '-', '')) in ('hospital', 'hstaff', 'superadmin')
    )
  );

create policy patient_assets_update_hstaff
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'patient_assets'
    and (storage.foldername(name))[1] = auth.uid()::text
    and (storage.foldername(name))[2] in ('patient-picture', 'medical-document')
    and exists (
      select 1
      from public.users u
      where u.auth_user_id = auth.uid()
        and lower(replace(replace(replace(coalesce(u.role, ''), '_', ''), ' ', ''), '-', '')) in ('hospital', 'hstaff', 'superadmin')
    )
  )
  with check (
    bucket_id = 'patient_assets'
    and (storage.foldername(name))[1] = auth.uid()::text
    and (storage.foldername(name))[2] in ('patient-picture', 'medical-document')
    and exists (
      select 1
      from public.users u
      where u.auth_user_id = auth.uid()
        and lower(replace(replace(replace(coalesce(u.role, ''), '_', ''), ' ', ''), '-', '')) in ('hospital', 'hstaff', 'superadmin')
    )
  );

create policy patient_assets_delete_hstaff
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'patient_assets'
    and (storage.foldername(name))[1] = auth.uid()::text
    and (storage.foldername(name))[2] in ('patient-picture', 'medical-document')
    and exists (
      select 1
      from public.users u
      where u.auth_user_id = auth.uid()
        and lower(replace(replace(replace(coalesce(u.role, ''), '_', ''), ' ', ''), '-', '')) in ('hospital', 'hstaff', 'superadmin')
    )
  );

create policy patient_assets_select_public
  on storage.objects
  for select
  to public
  using (bucket_id = 'patient_assets');
