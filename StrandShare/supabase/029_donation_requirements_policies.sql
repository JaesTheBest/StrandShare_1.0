-- 029_donation_requirements_policies.sql
-- Donation requirements table + RLS policies for Super Admin and Staff.

create table if not exists public."Donation_Requirements" (
  "Donation_Requirement_ID" serial primary key,
  "Minimum_Number_Donor" integer,
  "Minimum_Hair_Length" numeric(5, 2),
  "Chemical_Treatment_Status" boolean default false,
  "Colored_Hair_Status" boolean default false,
  "Bleached_Hair_Status" boolean default false,
  "Rebonded_Hair_Status" boolean default false,
  "Hair_Texture_Status" character varying(100),
  "Notes" text,
  "Updated_At" timestamp without time zone default now(),
  "Updated_By" integer
);

alter table if exists public."Donation_Requirements"
  add column if not exists "Minimum_Number_Donor" integer,
  add column if not exists "Minimum_Hair_Length" numeric(5, 2),
  add column if not exists "Chemical_Treatment_Status" boolean default false,
  add column if not exists "Colored_Hair_Status" boolean default false,
  add column if not exists "Bleached_Hair_Status" boolean default false,
  add column if not exists "Rebonded_Hair_Status" boolean default false,
  add column if not exists "Hair_Texture_Status" character varying(100),
  add column if not exists "Notes" text,
  add column if not exists "Updated_At" timestamp without time zone default now(),
  add column if not exists "Updated_By" integer;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'donation_requirements_updated_by_fkey'
      and conrelid = 'public."Donation_Requirements"'::regclass
  ) then
    alter table public."Donation_Requirements"
      add constraint donation_requirements_updated_by_fkey
      foreign key ("Updated_By") references public.users(user_id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'donation_requirements_min_donor_nonnegative'
      and conrelid = 'public."Donation_Requirements"'::regclass
  ) then
    alter table public."Donation_Requirements"
      add constraint donation_requirements_min_donor_nonnegative
      check ("Minimum_Number_Donor" is null or "Minimum_Number_Donor" >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'donation_requirements_min_hair_length_nonnegative'
      and conrelid = 'public."Donation_Requirements"'::regclass
  ) then
    alter table public."Donation_Requirements"
      add constraint donation_requirements_min_hair_length_nonnegative
      check ("Minimum_Hair_Length" is null or "Minimum_Hair_Length" >= 0);
  end if;
end
$$;

create index if not exists idx_donation_requirements_updated_at
  on public."Donation_Requirements" ("Updated_At" desc);

create or replace function public.is_super_admin_or_staff(role_value text)
returns boolean
language sql
immutable
as $$
  select lower(replace(replace(replace(coalesce(role_value, ''), '_', ''), ' ', ''), '-', ''))
         in ('superadmin', 'staff');
$$;

create or replace function public.set_donation_requirements_updated_at()
returns trigger
language plpgsql
as $$
begin
  new."Updated_At" = now();
  return new;
end;
$$;

drop trigger if exists trg_set_donation_requirements_updated_at on public."Donation_Requirements";
create trigger trg_set_donation_requirements_updated_at
  before update on public."Donation_Requirements"
  for each row
  execute function public.set_donation_requirements_updated_at();

alter table public."Donation_Requirements" enable row level security;

drop policy if exists donation_requirements_select_authenticated on public."Donation_Requirements";
create policy donation_requirements_select_authenticated
on public."Donation_Requirements"
for select
to authenticated
using (true);

drop policy if exists donation_requirements_insert_super_admin_staff on public."Donation_Requirements";
create policy donation_requirements_insert_super_admin_staff
on public."Donation_Requirements"
for insert
to authenticated
with check (
  exists (
    select 1
    from public.users u
    where u.auth_user_id = auth.uid()
      and public.is_super_admin_or_staff(u.role)
  )
);

drop policy if exists donation_requirements_update_super_admin_staff on public."Donation_Requirements";
create policy donation_requirements_update_super_admin_staff
on public."Donation_Requirements"
for update
to authenticated
using (
  exists (
    select 1
    from public.users u
    where u.auth_user_id = auth.uid()
      and public.is_super_admin_or_staff(u.role)
  )
)
with check (
  exists (
    select 1
    from public.users u
    where u.auth_user_id = auth.uid()
      and public.is_super_admin_or_staff(u.role)
  )
);

drop policy if exists donation_requirements_delete_super_admin on public."Donation_Requirements";
create policy donation_requirements_delete_super_admin
on public."Donation_Requirements"
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
