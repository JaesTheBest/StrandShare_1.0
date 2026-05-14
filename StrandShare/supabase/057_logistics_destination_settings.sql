-- 057_logistics_destination_settings.sql
-- Create singleton Logistics_Settings table and allow Staff/Super Admin to edit it.

begin;

create table if not exists public."Logistics_Settings" (
  "Logistics_Settings_ID" integer generated always as identity not null,
  "Destination_Name" character varying not null,
  "Street" character varying null,
  "Region" character varying null,
  "Barangay" character varying null,
  "City" character varying null,
  "Province" character varying null,
  "Country" character varying null default 'Philippines'::character varying,
  "Contact_Person" character varying null,
  "Contact_Number" character varying null,
  "Longitude" numeric null,
  "Latitude" numeric null,
  "Updated_At" timestamp without time zone null default now(),
  constraint "Logistics_Settings_pkey" primary key ("Logistics_Settings_ID")
);

alter table if exists public."Logistics_Settings"
  add column if not exists "Destination_Name" character varying,
  add column if not exists "Street" character varying,
  add column if not exists "Region" character varying,
  add column if not exists "Barangay" character varying,
  add column if not exists "City" character varying,
  add column if not exists "Province" character varying,
  add column if not exists "Country" character varying default 'Philippines',
  add column if not exists "Contact_Person" character varying,
  add column if not exists "Contact_Number" character varying,
  add column if not exists "Longitude" numeric,
  add column if not exists "Latitude" numeric,
  add column if not exists "Updated_At" timestamp without time zone default now();

update public."Logistics_Settings"
set "Country" = 'Philippines'
where coalesce(nullif(trim("Country"), ''), '') = '';

alter table public."Logistics_Settings"
  alter column "Destination_Name" set not null;

create unique index if not exists idx_logistics_settings_singleton
  on public."Logistics_Settings" ((true));

create or replace function public.normalize_app_role(role_value text)
returns text
language sql
immutable
as $$
  select lower(replace(replace(replace(coalesce(role_value, ''), '_', ''), ' ', ''), '-', ''));
$$;

create or replace function public.is_staff_or_super_admin_role(role_value text)
returns boolean
language sql
immutable
as $$
  select public.normalize_app_role(role_value) in ('staff', 'superadmin');
$$;

create or replace function public.set_logistics_settings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new."Updated_At" = now();
  return new;
end;
$$;

drop trigger if exists trg_set_logistics_settings_updated_at on public."Logistics_Settings";
create trigger trg_set_logistics_settings_updated_at
before update on public."Logistics_Settings"
for each row
execute function public.set_logistics_settings_updated_at();

alter table public."Logistics_Settings" enable row level security;

grant select, insert, update on public."Logistics_Settings" to authenticated;

do $$
begin
  if to_regclass('public."Logistics_Settings_Logistics_Settings_ID_seq"') is not null then
    grant usage, select on sequence public."Logistics_Settings_Logistics_Settings_ID_seq" to authenticated;
  end if;
end
$$;

drop policy if exists logistics_settings_select_authenticated on public."Logistics_Settings";
create policy logistics_settings_select_authenticated
on public."Logistics_Settings"
for select
to authenticated
using (true);

drop policy if exists logistics_settings_insert_staff_super_admin on public."Logistics_Settings";
create policy logistics_settings_insert_staff_super_admin
on public."Logistics_Settings"
for insert
to authenticated
with check (
  exists (
    select 1
    from public.users u
    where u.auth_user_id = auth.uid()
      and public.is_staff_or_super_admin_role(u.role)
  )
);

drop policy if exists logistics_settings_update_staff_super_admin on public."Logistics_Settings";
create policy logistics_settings_update_staff_super_admin
on public."Logistics_Settings"
for update
to authenticated
using (
  exists (
    select 1
    from public.users u
    where u.auth_user_id = auth.uid()
      and public.is_staff_or_super_admin_role(u.role)
  )
)
with check (
  exists (
    select 1
    from public.users u
    where u.auth_user_id = auth.uid()
      and public.is_staff_or_super_admin_role(u.role)
  )
);

commit;