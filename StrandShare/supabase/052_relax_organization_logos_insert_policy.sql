-- 052_relax_organization_logos_insert_policy.sql
-- Force a permissive insert policy for organization application logo uploads.

insert into storage.buckets (id, name, public)
values ('organization_logos', 'organization_logos', true)
on conflict (id) do update set public = excluded.public;

-- Remove all known org-logo insert policies to avoid conflicting checks.
drop policy if exists organization_logos_insert_public_applications on storage.objects;
drop policy if exists organization_logos_insert_anon_applications on storage.objects;
drop policy if exists organization_logos_insert_authenticated_applications on storage.objects;
drop policy if exists organization_logos_insert_public_any_applications on storage.objects;

-- Public insert for application flow (covers anon and authenticated sessions).
create policy organization_logos_insert_public_any_applications
  on storage.objects
  for insert
  to public
  with check (
    bucket_id = 'organization_logos'
    and (storage.foldername(name))[1] = 'applications'
  );

-- Keep public read for rendering URLs.
drop policy if exists organization_logos_select_public on storage.objects;
create policy organization_logos_select_public
  on storage.objects
  for select
  to public
  using (bucket_id = 'organization_logos');
