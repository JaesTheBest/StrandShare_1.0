-- 033_donation_drive_event_assets_storage_policies.sql
-- Storage bucket and policies for post-event documentation uploads.

do $$
begin
  if exists (select 1 from storage.buckets where id = 'donation_drive_event_assets') then
    update storage.buckets
    set
      name = 'donation_drive_event_assets',
      public = false
    where id = 'donation_drive_event_assets';
  else
    insert into storage.buckets (id, name, public)
    values ('donation_drive_event_assets', 'donation_drive_event_assets', false);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'donation_drive_event_assets_insert_staff_super_admin'
  ) then
    create policy donation_drive_event_assets_insert_staff_super_admin
      on storage.objects
      for insert
      to authenticated
      with check (
        bucket_id = 'donation_drive_event_assets'
        and (storage.foldername(name))[1] = auth.uid()::text
        and (storage.foldername(name))[2] = 'donation-drive-event-assets'
        and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp', 'pdf')
        and exists (
          select 1
          from public.users u
          where u.auth_user_id = auth.uid()
            and lower(replace(replace(replace(coalesce(u.role, ''), '_', ''), ' ', ''), '-', '')) in ('staff', 'superadmin')
        )
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
      and policyname = 'donation_drive_event_assets_select_org_staff_super_admin'
  ) then
    create policy donation_drive_event_assets_select_org_staff_super_admin
      on storage.objects
      for select
      to authenticated
      using (
        bucket_id = 'donation_drive_event_assets'
        and exists (
          select 1
          from public.users u
          where u.auth_user_id = auth.uid()
            and lower(replace(replace(replace(coalesce(u.role, ''), '_', ''), ' ', ''), '-', '')) in ('organization', 'organizations', 'staff', 'superadmin')
        )
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
      and policyname = 'donation_drive_event_assets_update_owner'
  ) then
    create policy donation_drive_event_assets_update_owner
      on storage.objects
      for update
      to authenticated
      using (
        bucket_id = 'donation_drive_event_assets'
        and (storage.foldername(name))[1] = auth.uid()::text
        and (storage.foldername(name))[2] = 'donation-drive-event-assets'
      )
      with check (
        bucket_id = 'donation_drive_event_assets'
        and (storage.foldername(name))[1] = auth.uid()::text
        and (storage.foldername(name))[2] = 'donation-drive-event-assets'
        and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp', 'pdf')
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
      and policyname = 'donation_drive_event_assets_delete_owner'
  ) then
    create policy donation_drive_event_assets_delete_owner
      on storage.objects
      for delete
      to authenticated
      using (
        bucket_id = 'donation_drive_event_assets'
        and (storage.foldername(name))[1] = auth.uid()::text
        and (storage.foldername(name))[2] = 'donation-drive-event-assets'
      );
  end if;
end
$$;