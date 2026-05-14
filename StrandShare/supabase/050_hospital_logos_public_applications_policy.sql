-- 050_hospital_logos_public_applications_policy.sql
-- Allow partner hospital applicants to upload logos during application flow.

insert into storage.buckets (id, name, public)
values ('hospital_logos', 'hospital_logos', true)
on conflict (id) do update set public = excluded.public;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'hospital_logos_insert_public_applications'
  ) then
    create policy hospital_logos_insert_public_applications
      on storage.objects
      for insert
      to public
      with check (
        bucket_id = 'hospital_logos'
        and (storage.foldername(name))[1] = 'applications'
        and lower(storage.extension(name)) in ('png', 'jpg', 'jpeg', 'webp')
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
      and policyname = 'hospital_logos_select_public'
  ) then
    create policy hospital_logos_select_public
      on storage.objects
      for select
      to public
      using (bucket_id = 'hospital_logos');
  end if;
end
$$;
