-- 025_organization_logos_storage_policies.sql
-- Storage bucket and RLS policies for organization application logos.

do $$
begin
  if exists (select 1 from storage.buckets where id = 'organization_logos') then
    update storage.buckets
    set
      name = 'organization_logos',
      public = true
    where id = 'organization_logos';
  else
    insert into storage.buckets (id, name, public)
    values ('organization_logos', 'organization_logos', true);
  end if;
end
$$;

-- INSERT: Public applicants can upload logos only inside applications/... path.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'organization_logos_insert_public_applications'
  ) then
    create policy organization_logos_insert_public_applications
      on storage.objects
      for insert
      to public
      with check (
        bucket_id = 'organization_logos'
        and (storage.foldername(name))[1] = 'applications'
        and lower(storage.extension(name)) in ('png', 'jpg', 'jpeg', 'webp')
      );
  end if;
end
$$;

-- Public read access so application logos can be displayed directly in the UI.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'organization_logos_select_public'
  ) then
    create policy organization_logos_select_public
      on storage.objects
      for select
      to public
      using (bucket_id = 'organization_logos');
  end if;
end
$$;
