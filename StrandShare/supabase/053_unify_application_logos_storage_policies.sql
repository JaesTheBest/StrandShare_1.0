-- 053_unify_application_logos_storage_policies.sql
-- Idempotent migration that ensures both organization and partner-hospital
-- application logo uploads work for anon + authenticated sessions.
-- Safe to run multiple times. Supersedes 010, 025, 050, 051, and 052 for these buckets.

-- ---------------------------------------------------------------------------
-- Buckets
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('organization_logos', 'organization_logos', true)
on conflict (id) do update set public = excluded.public;

insert into storage.buckets (id, name, public)
values ('hospital_logos', 'hospital_logos', true)
on conflict (id) do update set public = excluded.public;

-- ---------------------------------------------------------------------------
-- Drop any prior insert policies so the new policy is the single source of truth
-- ---------------------------------------------------------------------------

drop policy if exists organization_logos_insert_public_applications on storage.objects;
drop policy if exists organization_logos_insert_anon_applications on storage.objects;
drop policy if exists organization_logos_insert_authenticated_applications on storage.objects;
drop policy if exists organization_logos_insert_public_any_applications on storage.objects;

drop policy if exists hospital_logos_insert_public_applications on storage.objects;
drop policy if exists hospital_logos_insert_anon_applications on storage.objects;
drop policy if exists hospital_logos_insert_authenticated_applications on storage.objects;
drop policy if exists hospital_logos_insert_public_any_applications on storage.objects;

-- ---------------------------------------------------------------------------
-- Public insert: applicants (anon or authenticated) can upload into applications/
-- ---------------------------------------------------------------------------

create policy organization_logos_insert_public_any_applications
  on storage.objects
  for insert
  to public
  with check (
    bucket_id = 'organization_logos'
    and (storage.foldername(name))[1] = 'applications'
  );

create policy hospital_logos_insert_public_any_applications
  on storage.objects
  for insert
  to public
  with check (
    bucket_id = 'hospital_logos'
    and (storage.foldername(name))[1] = 'applications'
  );

-- ---------------------------------------------------------------------------
-- Public read: needed so application reviewers + applicants can render logos
-- ---------------------------------------------------------------------------

drop policy if exists organization_logos_select_public on storage.objects;
create policy organization_logos_select_public
  on storage.objects
  for select
  to public
  using (bucket_id = 'organization_logos');

drop policy if exists hospital_logos_select_public on storage.objects;
create policy hospital_logos_select_public
  on storage.objects
  for select
  to public
  using (bucket_id = 'hospital_logos');
