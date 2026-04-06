-- 019_update_h_representative_policies.sql
-- Compatibility migration for H-Representative terminology.
-- Idempotent: safe to run multiple times.

-- If an older environment still has public."Hospitals" but not
-- public."H-Representatives", rename it to match the current app queries.
do $$
begin
  if to_regclass('public."H-Representatives"') is null
     and to_regclass('public."Hospitals"') is not null then
    alter table public."Hospitals" rename to "H-Representatives";
  end if;

  -- If both exist, copy missing rows by Hospital_ID into the current table.
  if to_regclass('public."H-Representatives"') is not null
     and to_regclass('public."Hospitals"') is not null then
    insert into public."H-Representatives" (
      "Hospital_ID",
      "Hospital_Name",
      "Hospital_Logo",
      "Country",
      "Region",
      "City",
      "Barangay",
      "Street",
      "Contact_Number",
      "Created_At",
      "Updated_At"
    )
    select
      h."Hospital_ID",
      h."Hospital_Name",
      h."Hospital_Logo",
      h."Country",
      h."Region",
      h."City",
      h."Barangay",
      h."Street",
      h."Contact_Number",
      h."Created_At",
      h."Updated_At"
    from public."Hospitals" h
    where not exists (
      select 1
      from public."H-Representatives" hr
      where hr."Hospital_ID" = h."Hospital_ID"
    );
  end if;
end
$$;

create or replace function public.is_h_representative_or_super_admin(role_value text)
returns boolean
language sql
immutable
as $$
  select lower(replace(replace(replace(coalesce(role_value, ''), '_', ''), ' ', ''), '-', ''))
         in ('hospital', 'hstaff', 'hrepresentative', 'superadmin');
$$;

insert into storage.buckets (id, name, public)
values ('patient_assets', 'patient_assets', true)
on conflict (id) do update set public = excluded.public;

insert into storage.buckets (id, name, public)
values ('wig_request_previews', 'wig_request_previews', true)
on conflict (id) do update set public = excluded.public;

-- Refresh patient_assets policies.
drop policy if exists patient_assets_insert_hstaff on storage.objects;
drop policy if exists patient_assets_update_hstaff on storage.objects;
drop policy if exists patient_assets_delete_hstaff on storage.objects;
drop policy if exists patient_assets_insert_h_representative on storage.objects;
drop policy if exists patient_assets_update_h_representative on storage.objects;
drop policy if exists patient_assets_delete_h_representative on storage.objects;
drop policy if exists patient_assets_select_public on storage.objects;

create policy patient_assets_insert_h_representative
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'patient_assets'
    and (storage.foldername(name))[1] = auth.uid()::text
    and (storage.foldername(name))[2] in ('patient-picture', 'medical-document')
    and exists (
      select 1
      from public.users u
      where u.auth_user_id = auth.uid()
        and public.is_h_representative_or_super_admin(u.role)
    )
  );

create policy patient_assets_update_h_representative
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'patient_assets'
    and (storage.foldername(name))[1] = auth.uid()::text
    and (storage.foldername(name))[2] in ('patient-picture', 'medical-document')
    and exists (
      select 1
      from public.users u
      where u.auth_user_id = auth.uid()
        and public.is_h_representative_or_super_admin(u.role)
    )
  )
  with check (
    bucket_id = 'patient_assets'
    and (storage.foldername(name))[1] = auth.uid()::text
    and (storage.foldername(name))[2] in ('patient-picture', 'medical-document')
    and exists (
      select 1
      from public.users u
      where u.auth_user_id = auth.uid()
        and public.is_h_representative_or_super_admin(u.role)
    )
  );

create policy patient_assets_delete_h_representative
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'patient_assets'
    and (storage.foldername(name))[1] = auth.uid()::text
    and (storage.foldername(name))[2] in ('patient-picture', 'medical-document')
    and exists (
      select 1
      from public.users u
      where u.auth_user_id = auth.uid()
        and public.is_h_representative_or_super_admin(u.role)
    )
  );

create policy patient_assets_select_public
  on storage.objects
  for select
  to public
  using (bucket_id = 'patient_assets');

-- Refresh wig_request_previews policies.
drop policy if exists wig_request_previews_insert_hstaff on storage.objects;
drop policy if exists wig_request_previews_update_hstaff on storage.objects;
drop policy if exists wig_request_previews_delete_hstaff on storage.objects;
drop policy if exists wig_request_previews_insert_h_representative on storage.objects;
drop policy if exists wig_request_previews_update_h_representative on storage.objects;
drop policy if exists wig_request_previews_delete_h_representative on storage.objects;
drop policy if exists wig_request_previews_select_public on storage.objects;

create policy wig_request_previews_insert_h_representative
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
        and public.is_h_representative_or_super_admin(u.role)
    )
  );

create policy wig_request_previews_update_h_representative
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
        and public.is_h_representative_or_super_admin(u.role)
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
        and public.is_h_representative_or_super_admin(u.role)
    )
  );

create policy wig_request_previews_delete_h_representative
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
        and public.is_h_representative_or_super_admin(u.role)
    )
  );

create policy wig_request_previews_select_public
  on storage.objects
  for select
  to public
  using (bucket_id = 'wig_request_previews');
