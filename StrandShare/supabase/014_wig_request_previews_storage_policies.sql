-- 014_wig_request_previews_storage_policies.sql
-- Storage bucket and RLS policies for Wig Request preview PDF files.

insert into storage.buckets (id, name, public)
values ('wig_request_previews', 'wig_request_previews', true)
on conflict (id) do update set public = excluded.public;

-- INSERT: H-Staff/Super Admin can upload only inside <auth.uid()>/preview-pdf/*.pdf paths.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'wig_request_previews_insert_hstaff'
  ) then
    create policy wig_request_previews_insert_hstaff
      on storage.objects
      for insert
      to authenticated
      with check (
        bucket_id = 'wig_request_previews'
        and (storage.foldername(name))[1] = auth.uid()::text
        and (storage.foldername(name))[2] = 'preview-pdf'
        and right(lower(name), 4) = '.pdf'
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

-- UPDATE: H-Staff/Super Admin can update only their own preview PDF paths.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'wig_request_previews_update_hstaff'
  ) then
    create policy wig_request_previews_update_hstaff
      on storage.objects
      for update
      to authenticated
      using (
        bucket_id = 'wig_request_previews'
        and (storage.foldername(name))[1] = auth.uid()::text
        and (storage.foldername(name))[2] = 'preview-pdf'
        and right(lower(name), 4) = '.pdf'
        and exists (
          select 1
          from public.users u
          where u.auth_user_id = auth.uid()
            and lower(replace(replace(replace(coalesce(u.role, ''), '_', ''), ' ', ''), '-', '')) in ('hospital', 'hstaff', 'superadmin')
        )
      )
      with check (
        bucket_id = 'wig_request_previews'
        and (storage.foldername(name))[1] = auth.uid()::text
        and (storage.foldername(name))[2] = 'preview-pdf'
        and right(lower(name), 4) = '.pdf'
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

-- DELETE: H-Staff/Super Admin can delete only their own preview PDF paths.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'wig_request_previews_delete_hstaff'
  ) then
    create policy wig_request_previews_delete_hstaff
      on storage.objects
      for delete
      to authenticated
      using (
        bucket_id = 'wig_request_previews'
        and (storage.foldername(name))[1] = auth.uid()::text
        and (storage.foldername(name))[2] = 'preview-pdf'
        and right(lower(name), 4) = '.pdf'
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

-- Public read access so uploaded previews can be opened directly in the browser.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'wig_request_previews_select_public'
  ) then
    create policy wig_request_previews_select_public
      on storage.objects
      for select
      to public
      using (bucket_id = 'wig_request_previews');
  end if;
end
$$;
