-- 010_hospital_logos_storage_policies.sql
-- Dedicated storage bucket and RLS policies for hospital logos.

insert into storage.buckets (id, name, public)
values ('hospital_logos', 'hospital_logos', true)
on conflict (id) do update set public = excluded.public;

-- INSERT: Super Admin can upload only inside <auth.uid()>/hospital-logo/... paths.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'hospital_logos_insert_super_admin'
  ) then
    create policy hospital_logos_insert_super_admin
      on storage.objects
      for insert
      to authenticated
      with check (
        bucket_id = 'hospital_logos'
        and (storage.foldername(name))[1] = auth.uid()::text
        and (storage.foldername(name))[2] = 'hospital-logo'
        and exists (
          select 1
          from public.users u
          where u.auth_user_id = auth.uid()
            and lower(replace(replace(coalesce(u.role, ''), '_', ''), ' ', '')) = 'superadmin'
        )
      );
  end if;
end
$$;

-- UPDATE: Super Admin can update only their own hospital-logo path.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'hospital_logos_update_super_admin'
  ) then
    create policy hospital_logos_update_super_admin
      on storage.objects
      for update
      to authenticated
      using (
        bucket_id = 'hospital_logos'
        and (storage.foldername(name))[1] = auth.uid()::text
        and (storage.foldername(name))[2] = 'hospital-logo'
        and exists (
          select 1
          from public.users u
          where u.auth_user_id = auth.uid()
            and lower(replace(replace(coalesce(u.role, ''), '_', ''), ' ', '')) = 'superadmin'
        )
      )
      with check (
        bucket_id = 'hospital_logos'
        and (storage.foldername(name))[1] = auth.uid()::text
        and (storage.foldername(name))[2] = 'hospital-logo'
        and exists (
          select 1
          from public.users u
          where u.auth_user_id = auth.uid()
            and lower(replace(replace(coalesce(u.role, ''), '_', ''), ' ', '')) = 'superadmin'
        )
      );
  end if;
end
$$;

-- DELETE: Super Admin can delete only their own hospital-logo path.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'hospital_logos_delete_super_admin'
  ) then
    create policy hospital_logos_delete_super_admin
      on storage.objects
      for delete
      to authenticated
      using (
        bucket_id = 'hospital_logos'
        and (storage.foldername(name))[1] = auth.uid()::text
        and (storage.foldername(name))[2] = 'hospital-logo'
        and exists (
          select 1
          from public.users u
          where u.auth_user_id = auth.uid()
            and lower(replace(replace(coalesce(u.role, ''), '_', ''), ' ', '')) = 'superadmin'
        )
      );
  end if;
end
$$;

-- Public read access for logo rendering via public URLs.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'hospital_logos_select_public'
  ) then
    create policy hospital_logos_select_public
      on storage.objects
      for select
      to public
      using (bucket_id = 'hospital_logos');
  end if;
end
$$;
