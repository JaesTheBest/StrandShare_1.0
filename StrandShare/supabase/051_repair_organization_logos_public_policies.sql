-- 051_repair_organization_logos_public_policies.sql
-- Repair organization logo upload policies so application uploads work for anon and authenticated users.

insert into storage.buckets (id, name, public)
values ('organization_logos', 'organization_logos', true)
on conflict (id) do update set public = excluded.public;

-- Remove legacy policies that may be mis-scoped.
drop policy if exists organization_logos_insert_public_applications on storage.objects;
drop policy if exists organization_logos_insert_anon_applications on storage.objects;
drop policy if exists organization_logos_insert_authenticated_applications on storage.objects;
drop policy if exists organization_logos_select_public on storage.objects;

-- ANON insert policy for public application page uploads.
create policy organization_logos_insert_anon_applications
  on storage.objects
  for insert
  to anon
  with check (
    bucket_id = 'organization_logos'
    and (storage.foldername(name))[1] = 'applications'
    and lower(storage.extension(name)) in ('png', 'jpg', 'jpeg', 'webp')
  );

-- AUTHENTICATED insert policy for users with active session.
create policy organization_logos_insert_authenticated_applications
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'organization_logos'
    and (storage.foldername(name))[1] = 'applications'
    and lower(storage.extension(name)) in ('png', 'jpg', 'jpeg', 'webp')
  );

-- Public read for rendering logo URLs.
create policy organization_logos_select_public
  on storage.objects
  for select
  to public
  using (bucket_id = 'organization_logos');
