-- 056_repair_hospital_representative_rls.sql
-- Fixes RLS violations on Hospital_Representative during hospital approval and assignment flows.

begin;

create or replace function public.normalize_app_role(role_value text)
returns text
language sql
immutable
as $$
  select lower(replace(replace(replace(coalesce(role_value, ''), '_', ''), ' ', ''), '-', ''));
$$;

-- Keep compatibility if an older environment still has Hospital_Staff.
do $$
begin
  if to_regclass('public."Hospital_Representative"') is null
     and to_regclass('public."Hospital_Staff"') is not null then
    alter table public."Hospital_Staff" rename to "Hospital_Representative";
  end if;
end
$$;

alter table if exists public."Hospital_Representative" enable row level security;

grant select, insert, update, delete on public."Hospital_Representative" to authenticated;

do $$
begin
  if to_regclass('public."Hospital_Representative_Link_ID_seq"') is not null then
    grant usage, select on sequence public."Hospital_Representative_Link_ID_seq" to authenticated;
  end if;
end
$$;

drop policy if exists hospital_representative_select_authenticated on public."Hospital_Representative";
create policy hospital_representative_select_authenticated
on public."Hospital_Representative"
for select
to authenticated
using (true);

drop policy if exists hospital_representative_insert_super_admin on public."Hospital_Representative";
create policy hospital_representative_insert_super_admin
on public."Hospital_Representative"
for insert
to authenticated
with check (
  exists (
    select 1
    from public.users u
    where u.auth_user_id = auth.uid()
      and public.normalize_app_role(u.role) = 'superadmin'
  )
);

drop policy if exists hospital_representative_update_super_admin on public."Hospital_Representative";
create policy hospital_representative_update_super_admin
on public."Hospital_Representative"
for update
to authenticated
using (
  exists (
    select 1
    from public.users u
    where u.auth_user_id = auth.uid()
      and public.normalize_app_role(u.role) = 'superadmin'
  )
)
with check (
  exists (
    select 1
    from public.users u
    where u.auth_user_id = auth.uid()
      and public.normalize_app_role(u.role) = 'superadmin'
  )
);

drop policy if exists hospital_representative_delete_super_admin on public."Hospital_Representative";
create policy hospital_representative_delete_super_admin
on public."Hospital_Representative"
for delete
to authenticated
using (
  exists (
    select 1
    from public.users u
    where u.auth_user_id = auth.uid()
      and public.normalize_app_role(u.role) = 'superadmin'
  )
);

commit;