-- 030_donation_drive_proposals_storage_policies.sql
-- Storage bucket and RLS policies for donation drive proposal PDF uploads.

do $$
begin
  if exists (select 1 from storage.buckets where id = 'donation_drive_proposals') then
    update storage.buckets
    set
      name = 'donation_drive_proposals',
      public = false
    where id = 'donation_drive_proposals';
  else
    insert into storage.buckets (id, name, public)
    values ('donation_drive_proposals', 'donation_drive_proposals', false);
  end if;
end
$$;

-- INSERT: Organization, Staff, and Super Admin users can upload PDF files
-- under <auth.uid()>/donation-drive-proposals/ path only.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'donation_drive_proposals_insert_org_staff_admin'
  ) then
    create policy donation_drive_proposals_insert_org_staff_admin
      on storage.objects
      for insert
      to authenticated
      with check (
        bucket_id = 'donation_drive_proposals'
        and (storage.foldername(name))[1] = auth.uid()::text
        and (storage.foldername(name))[2] = 'donation-drive-proposals'
        and lower(storage.extension(name)) = 'pdf'
        and exists (
          select 1
          from public.users u
          where u.auth_user_id = auth.uid()
            and lower(replace(replace(replace(coalesce(u.role, ''), '_', ''), ' ', ''), '-', ''))
              in ('organization', 'organizations', 'staff', 'superadmin')
        )
      );
  end if;
end
$$;

-- SELECT: Organization, Staff, and Super Admin users can read proposal files.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'donation_drive_proposals_select_org_staff_admin'
  ) then
    create policy donation_drive_proposals_select_org_staff_admin
      on storage.objects
      for select
      to authenticated
      using (
        bucket_id = 'donation_drive_proposals'
        and exists (
          select 1
          from public.users u
          where u.auth_user_id = auth.uid()
            and lower(replace(replace(replace(coalesce(u.role, ''), '_', ''), ' ', ''), '-', ''))
              in ('organization', 'organizations', 'staff', 'superadmin')
        )
      );
  end if;
end
$$;

-- UPDATE: Users can update only their own uploaded proposal files.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'donation_drive_proposals_update_owner'
  ) then
    create policy donation_drive_proposals_update_owner
      on storage.objects
      for update
      to authenticated
      using (
        bucket_id = 'donation_drive_proposals'
        and (storage.foldername(name))[1] = auth.uid()::text
        and (storage.foldername(name))[2] = 'donation-drive-proposals'
      )
      with check (
        bucket_id = 'donation_drive_proposals'
        and (storage.foldername(name))[1] = auth.uid()::text
        and (storage.foldername(name))[2] = 'donation-drive-proposals'
        and lower(storage.extension(name)) = 'pdf'
      );
  end if;
end
$$;

-- DELETE: Users can delete only their own uploaded proposal files.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'donation_drive_proposals_delete_owner'
  ) then
    create policy donation_drive_proposals_delete_owner
      on storage.objects
      for delete
      to authenticated
      using (
        bucket_id = 'donation_drive_proposals'
        and (storage.foldername(name))[1] = auth.uid()::text
        and (storage.foldername(name))[2] = 'donation-drive-proposals'
      );
  end if;
end
$$;
