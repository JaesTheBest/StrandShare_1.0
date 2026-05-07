-- 044_completed_wigs_storage_policies.sql
-- Storage bucket + RLS policies for completed wig photos
-- (front / side / top angles uploaded when QA scans the bundle waybill on
--  the Upload Wig Stocks page).
--
-- Bucket name uses the project's lowercase convention. Display label can be
-- "Completed Wigs" anywhere in the UI.

do $$
begin
  if exists (select 1 from storage.buckets where id = 'completed_wigs') then
    update storage.buckets
    set name = 'completed_wigs', public = true
    where id = 'completed_wigs';
  else
    insert into storage.buckets (id, name, public)
    values ('completed_wigs', 'completed_wigs', true);
  end if;
end
$$;

-- INSERT: QA Stylist / Staff / Super Admin can upload wig photos under
--   <auth.uid()>/completed-wigs/ path.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'completed_wigs_insert_qa_staff_admin'
  ) then
    create policy completed_wigs_insert_qa_staff_admin
      on storage.objects
      for insert
      to authenticated
      with check (
        bucket_id = 'completed_wigs'
        and (storage.foldername(name))[1] = auth.uid()::text
        and (storage.foldername(name))[2] = 'completed-wigs'
        and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp')
        and exists (
          select 1
          from public.users u
          where u.auth_user_id = auth.uid()
            and lower(replace(replace(replace(coalesce(u.role, ''), '_', ''), ' ', ''), '-', ''))
              in ('qastylist', 'staff', 'superadmin')
        )
      );
  end if;
end
$$;

-- SELECT: bucket is public above, so anonymous reads are allowed (matches
-- how other public branding/event buckets work). If you ever flip the bucket
-- to private, add an authenticated SELECT policy here.

-- UPDATE: only the uploader (folder owner) can replace their own files.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'completed_wigs_update_owner'
  ) then
    create policy completed_wigs_update_owner
      on storage.objects
      for update
      to authenticated
      using (
        bucket_id = 'completed_wigs'
        and (storage.foldername(name))[1] = auth.uid()::text
        and (storage.foldername(name))[2] = 'completed-wigs'
      )
      with check (
        bucket_id = 'completed_wigs'
        and (storage.foldername(name))[1] = auth.uid()::text
        and (storage.foldername(name))[2] = 'completed-wigs'
        and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp')
      );
  end if;
end
$$;

-- DELETE: only the uploader can delete their own files.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'completed_wigs_delete_owner'
  ) then
    create policy completed_wigs_delete_owner
      on storage.objects
      for delete
      to authenticated
      using (
        bucket_id = 'completed_wigs'
        and (storage.foldername(name))[1] = auth.uid()::text
        and (storage.foldername(name))[2] = 'completed-wigs'
      );
  end if;
end
$$;
