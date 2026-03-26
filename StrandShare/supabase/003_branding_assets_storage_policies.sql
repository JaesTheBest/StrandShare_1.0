-- 003_branding_assets_storage_policies.sql
-- Branding image bucket policies for logo/login background uploads.

insert into storage.buckets (id, name, public)
values ('branding_assets', 'branding_assets', true)
on conflict (id) do update set public = excluded.public;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'branding_assets_insert_own_folder'
  ) then
    create policy branding_assets_insert_own_folder
      on storage.objects
      for insert
      to authenticated
      with check (
        bucket_id = 'branding_assets'
        and (storage.foldername(name))[1] = auth.uid()::text
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
      and policyname = 'branding_assets_update_own_folder'
  ) then
    create policy branding_assets_update_own_folder
      on storage.objects
      for update
      to authenticated
      using (
        bucket_id = 'branding_assets'
        and (storage.foldername(name))[1] = auth.uid()::text
      )
      with check (
        bucket_id = 'branding_assets'
        and (storage.foldername(name))[1] = auth.uid()::text
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
      and policyname = 'branding_assets_delete_own_folder'
  ) then
    create policy branding_assets_delete_own_folder
      on storage.objects
      for delete
      to authenticated
      using (
        bucket_id = 'branding_assets'
        and (storage.foldername(name))[1] = auth.uid()::text
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
      and policyname = 'branding_assets_select_public'
  ) then
    create policy branding_assets_select_public
      on storage.objects
      for select
      to public
      using (bucket_id = 'branding_assets');
  end if;
end
$$;
