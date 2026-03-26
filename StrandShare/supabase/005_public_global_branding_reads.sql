-- 005_public_global_branding_reads.sql
-- Make branding readable by everyone (including logged-out users)
-- while keeping write access restricted to super admin.

-- app_theme_settings: allow public read of the singleton theme row.
drop policy if exists app_theme_settings_select_authenticated on public.app_theme_settings;

create policy app_theme_settings_select_public
  on public.app_theme_settings
  for select
  to public
  using (id = 1);

-- branding_assets: ensure only super admin can write branding files.
drop policy if exists branding_assets_insert_own_folder on storage.objects;
drop policy if exists branding_assets_update_own_folder on storage.objects;
drop policy if exists branding_assets_delete_own_folder on storage.objects;

create policy branding_assets_insert_super_admin
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'branding_assets'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1
      from public.users u
      where u.auth_user_id = auth.uid()
        and lower(replace(replace(u.role, '_', ''), ' ', '')) = 'superadmin'
    )
  );

create policy branding_assets_update_super_admin
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'branding_assets'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1
      from public.users u
      where u.auth_user_id = auth.uid()
        and lower(replace(replace(u.role, '_', ''), ' ', '')) = 'superadmin'
    )
  )
  with check (
    bucket_id = 'branding_assets'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1
      from public.users u
      where u.auth_user_id = auth.uid()
        and lower(replace(replace(u.role, '_', ''), ' ', '')) = 'superadmin'
    )
  );

create policy branding_assets_delete_super_admin
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'branding_assets'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1
      from public.users u
      where u.auth_user_id = auth.uid()
        and lower(replace(replace(u.role, '_', ''), ' ', '')) = 'superadmin'
    )
  );

-- Keep branding asset reads public so everyone can render logo/background.
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
