-- 047_legal_documents_policies.sql
-- RLS + storage policies for legal consent PDF management.

create table if not exists public.legal_documents (
  legal_document_id integer generated always as identity primary key,
  document_type character varying not null,
  version character varying not null,
  title character varying not null,
  content text not null,
  is_active boolean default true,
  effective_at timestamp without time zone default now(),
  created_at timestamp without time zone default now(),
  file_path character varying
);

create index if not exists idx_legal_documents_document_type_created_at
  on public.legal_documents (document_type, created_at desc);

alter table public.legal_documents enable row level security;

drop policy if exists legal_documents_select_authenticated on public.legal_documents;
create policy legal_documents_select_authenticated
on public.legal_documents
for select
to authenticated
using (true);

drop policy if exists legal_documents_insert_staff_super_admin on public.legal_documents;
create policy legal_documents_insert_staff_super_admin
on public.legal_documents
for insert
to authenticated
with check (
  exists (
    select 1
    from public.users u
    where u.auth_user_id = auth.uid()
      and lower(replace(replace(replace(coalesce(u.role, ''), '_', ''), ' ', ''), '-', ''))
        in ('superadmin', 'staff')
  )
);

drop policy if exists legal_documents_update_staff_super_admin on public.legal_documents;
create policy legal_documents_update_staff_super_admin
on public.legal_documents
for update
to authenticated
using (
  exists (
    select 1
    from public.users u
    where u.auth_user_id = auth.uid()
      and lower(replace(replace(replace(coalesce(u.role, ''), '_', ''), ' ', ''), '-', ''))
        in ('superadmin', 'staff')
  )
)
with check (
  exists (
    select 1
    from public.users u
    where u.auth_user_id = auth.uid()
      and lower(replace(replace(replace(coalesce(u.role, ''), '_', ''), ' ', ''), '-', ''))
        in ('superadmin', 'staff')
  )
);

drop policy if exists legal_documents_delete_super_admin on public.legal_documents;
create policy legal_documents_delete_super_admin
on public.legal_documents
for delete
to authenticated
using (
  exists (
    select 1
    from public.users u
    where u.auth_user_id = auth.uid()
      and lower(replace(replace(replace(coalesce(u.role, ''), '_', ''), ' ', ''), '-', '')) = 'superadmin'
  )
);

do $$
begin
  if exists (select 1 from storage.buckets where id = 'legal-documents') then
    update storage.buckets
    set name = 'legal-documents'
    where id = 'legal-documents';
  else
    insert into storage.buckets (id, name, public)
    values ('legal-documents', 'legal-documents', false);
  end if;
end
$$;

drop policy if exists legal_documents_bucket_insert_staff_super_admin on storage.objects;
create policy legal_documents_bucket_insert_staff_super_admin
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'legal-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
    and (storage.foldername(name))[2] = 'legal-documents'
    and lower(storage.extension(name)) = 'pdf'
    and exists (
      select 1
      from public.users u
      where u.auth_user_id = auth.uid()
        and lower(replace(replace(replace(coalesce(u.role, ''), '_', ''), ' ', ''), '-', ''))
          in ('superadmin', 'staff')
    )
  );

drop policy if exists legal_documents_bucket_update_staff_super_admin on storage.objects;
create policy legal_documents_bucket_update_staff_super_admin
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'legal-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
    and (storage.foldername(name))[2] = 'legal-documents'
    and exists (
      select 1
      from public.users u
      where u.auth_user_id = auth.uid()
        and lower(replace(replace(replace(coalesce(u.role, ''), '_', ''), ' ', ''), '-', ''))
          in ('superadmin', 'staff')
    )
  )
  with check (
    bucket_id = 'legal-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
    and (storage.foldername(name))[2] = 'legal-documents'
    and lower(storage.extension(name)) = 'pdf'
    and exists (
      select 1
      from public.users u
      where u.auth_user_id = auth.uid()
        and lower(replace(replace(replace(coalesce(u.role, ''), '_', ''), ' ', ''), '-', ''))
          in ('superadmin', 'staff')
    )
  );

drop policy if exists legal_documents_bucket_delete_staff_super_admin on storage.objects;
create policy legal_documents_bucket_delete_staff_super_admin
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'legal-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
    and (storage.foldername(name))[2] = 'legal-documents'
    and exists (
      select 1
      from public.users u
      where u.auth_user_id = auth.uid()
        and lower(replace(replace(replace(coalesce(u.role, ''), '_', ''), ' ', ''), '-', ''))
          in ('superadmin', 'staff')
    )
  );

drop policy if exists legal_documents_bucket_select_authenticated on storage.objects;
create policy legal_documents_bucket_select_authenticated
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'legal-documents');

