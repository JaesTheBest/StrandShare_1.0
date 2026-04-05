-- 011_patient_assets_storage_policies.sql
-- Storage bucket and RLS policies for patient pictures and medical documents.

insert into storage.buckets (id, name, public)
values ('patient_assets', 'patient_assets', true)
on conflict (id) do update set public = excluded.public;

-- INSERT: H-Staff/Super Admin can upload only inside <auth.uid()>/patient-picture|medical-document/... paths.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'patient_assets_insert_hstaff'
  ) then
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
  end if;
end
$$;

-- UPDATE: H-Staff/Super Admin can update only their own patient asset paths.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'patient_assets_update_hstaff'
  ) then
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
  end if;
end
$$;

-- DELETE: H-Staff/Super Admin can delete only their own patient asset paths.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'patient_assets_delete_hstaff'
  ) then
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
  end if;
end
$$;

-- Public read access so uploaded assets can be rendered directly in UI.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'patient_assets_select_public'
  ) then
    create policy patient_assets_select_public
      on storage.objects
      for select
      to public
      using (bucket_id = 'patient_assets');
  end if;
end
$$;
