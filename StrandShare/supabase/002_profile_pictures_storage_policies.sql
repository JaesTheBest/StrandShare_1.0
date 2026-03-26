-- 002_profile_pictures_storage_policies.sql
-- Creates the profile_pictures bucket and applies RLS policies so authenticated users
-- can upload/update/delete files only inside their own folder: <auth.uid()>/<filename>.

insert into storage.buckets (id, name, public)
values ('profile_pictures', 'profile_pictures', true)
on conflict (id) do update set public = excluded.public;

-- INSERT policy: authenticated user can upload only into their own folder.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'profile_pictures_insert_own_folder'
  ) then
    create policy profile_pictures_insert_own_folder
      on storage.objects
      for insert
      to authenticated
      with check (
        bucket_id = 'profile_pictures'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;
end
$$;

-- UPDATE policy: authenticated user can update only files in their own folder.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'profile_pictures_update_own_folder'
  ) then
    create policy profile_pictures_update_own_folder
      on storage.objects
      for update
      to authenticated
      using (
        bucket_id = 'profile_pictures'
        and (storage.foldername(name))[1] = auth.uid()::text
      )
      with check (
        bucket_id = 'profile_pictures'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;
end
$$;

-- DELETE policy: authenticated user can delete only files in their own folder.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'profile_pictures_delete_own_folder'
  ) then
    create policy profile_pictures_delete_own_folder
      on storage.objects
      for delete
      to authenticated
      using (
        bucket_id = 'profile_pictures'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;
end
$$;

-- Optional SELECT policy for private buckets.
-- For public buckets this is not required for public URL reads, but harmless.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'profile_pictures_select_public_or_own'
  ) then
    create policy profile_pictures_select_public_or_own
      on storage.objects
      for select
      to public
      using (
        bucket_id = 'profile_pictures'
      );
  end if;
end
$$;
