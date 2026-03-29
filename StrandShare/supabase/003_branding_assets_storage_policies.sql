-- 003_branding_assets_storage_policies.sql
-- Branding image bucket policies for logo/login background uploads.

insert into storage.buckets (id, name, public)
values ('branding_assests', 'branding_assests', true)
on conflict (id) do update set public = excluded.public;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'branding_assests_insert_own_folder'
  ) then
    create policy branding_assests_insert_own_folder
      on storage.objects
      for insert
      to authenticated
      with check (
        bucket_id = 'branding_assests'
        and (storage.foldername(name))[1] = auth.uid()::text
        and (storage.foldername(name))[2] in ('logo', 'login background')
      );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'branding_assests_update_own_folder'
  ) then
    create policy branding_assests_update_own_folder
      on storage.objects
      for update
      to authenticated
      using (
        bucket_id = 'branding_assests'
        and (storage.foldername(name))[1] = auth.uid()::text
        and (storage.foldername(name))[2] in ('logo', 'login background')
      )
      with check (
        bucket_id = 'branding_assests'
        and (storage.foldername(name))[1] = auth.uid()::text
        and (storage.foldername(name))[2] in ('logo', 'login background')
      );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'branding_assests_delete_own_folder'
  ) then
    create policy branding_assests_delete_own_folder
      on storage.objects
      for delete
      to authenticated
      using (
        bucket_id = 'branding_assests'
        and (storage.foldername(name))[1] = auth.uid()::text
        and (storage.foldername(name))[2] in ('logo', 'login background')
      );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'branding_assests_select_public'
  ) then
    create policy branding_assests_select_public
      on storage.objects
      for select
      to public
      using (bucket_id = 'branding_assests');
  end if;
end
$$;
