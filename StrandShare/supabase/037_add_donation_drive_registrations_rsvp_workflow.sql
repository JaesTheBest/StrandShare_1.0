-- 037_add_donation_drive_registrations_rsvp_workflow.sql
-- Adds/aligns Donation_Drive_Registrations schema for RSVP attendance scanning.

create table if not exists public."Donation_Drive_Registrations" (
  "Registration_ID" serial primary key,
  "Donation_Drive_ID" integer not null,
  "User_ID" integer not null,
  "Organization_ID" integer,
  "Registration_Status" character varying(50) default 'Pending',
  "Attendance_Status" character varying(50) default 'Not Marked',
  "Attendance_Marked_At" timestamp without time zone,
  "Registered_At" timestamp without time zone default now(),
  "Updated_At" timestamp without time zone default now(),
  constraint donation_drive_registrations_drive_user_unique unique ("Donation_Drive_ID", "User_ID")
);

alter table if exists public."Donation_Drive_Registrations"
  add column if not exists "Donation_Drive_ID" integer,
  add column if not exists "User_ID" integer,
  add column if not exists "Organization_ID" integer,
  add column if not exists "Registration_Status" character varying(50) default 'Pending',
  add column if not exists "Attendance_Status" character varying(50) default 'Not Marked',
  add column if not exists "Attendance_Marked_At" timestamp without time zone,
  add column if not exists "Registered_At" timestamp without time zone default now(),
  add column if not exists "Updated_At" timestamp without time zone default now();

do $$
begin
  if to_regclass('public."Donation_Drive_Registrations"') is null then
    return;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'donation_drive_registrations_drive_user_unique'
      and conrelid = 'public."Donation_Drive_Registrations"'::regclass
  ) then
    alter table public."Donation_Drive_Registrations"
      add constraint donation_drive_registrations_drive_user_unique
      unique ("Donation_Drive_ID", "User_ID");
  end if;

  if to_regclass('public."Donation_Drive_Requests"') is not null
     and not exists (
       select 1
       from pg_constraint
       where conname = 'donation_drive_registrations_donation_drive_id_fkey'
         and conrelid = 'public."Donation_Drive_Registrations"'::regclass
     ) then
    alter table public."Donation_Drive_Registrations"
      add constraint donation_drive_registrations_donation_drive_id_fkey
      foreign key ("Donation_Drive_ID")
      references public."Donation_Drive_Requests"("Donation_Drive_ID")
      on delete cascade;
  end if;

  if to_regclass('public.users') is not null
     and not exists (
       select 1
       from pg_constraint
       where conname = 'donation_drive_registrations_user_id_fkey'
         and conrelid = 'public."Donation_Drive_Registrations"'::regclass
     ) then
    alter table public."Donation_Drive_Registrations"
      add constraint donation_drive_registrations_user_id_fkey
      foreign key ("User_ID")
      references public.users(user_id)
      on delete cascade;
  end if;

  if to_regclass('public."Organizations"') is not null
     and not exists (
       select 1
       from pg_constraint
       where conname = 'donation_drive_registrations_organization_id_fkey'
         and conrelid = 'public."Donation_Drive_Registrations"'::regclass
     ) then
    alter table public."Donation_Drive_Registrations"
      add constraint donation_drive_registrations_organization_id_fkey
      foreign key ("Organization_ID")
      references public."Organizations"("Organization_ID")
      on delete set null;
  end if;
end
$$;

create index if not exists idx_donation_drive_registrations_drive_id
  on public."Donation_Drive_Registrations" ("Donation_Drive_ID");

create index if not exists idx_donation_drive_registrations_user_id
  on public."Donation_Drive_Registrations" ("User_ID");

create index if not exists idx_donation_drive_registrations_attendance_status
  on public."Donation_Drive_Registrations" ("Attendance_Status");

create or replace function public.set_donation_drive_registrations_updated_at()
returns trigger
language plpgsql
as $$
begin
  new."Updated_At" = now();
  return new;
end;
$$;

drop trigger if exists trg_set_donation_drive_registrations_updated_at on public."Donation_Drive_Registrations";
create trigger trg_set_donation_drive_registrations_updated_at
  before update on public."Donation_Drive_Registrations"
  for each row
  execute function public.set_donation_drive_registrations_updated_at();

alter table if exists public."Donation_Drive_Registrations" enable row level security;

grant select, insert, update, delete on public."Donation_Drive_Registrations" to authenticated;

do $$
begin
  if to_regclass('public."Donation_Drive_Registrations_Registration_ID_seq"') is not null then
    grant usage, select
      on sequence public."Donation_Drive_Registrations_Registration_ID_seq"
      to authenticated;
  end if;
end
$$;

drop policy if exists donation_drive_registrations_select_staff_super_admin_or_owner on public."Donation_Drive_Registrations";
create policy donation_drive_registrations_select_staff_super_admin_or_owner
on public."Donation_Drive_Registrations"
for select
to authenticated
using (
  exists (
    select 1
    from public.users u
    where u.auth_user_id = auth.uid()
      and lower(replace(replace(replace(coalesce(u.role, ''), '_', ''), ' ', ''), '-', '')) in ('staff', 'superadmin')
  )
  or exists (
    select 1
    from public.users u
    where u.auth_user_id = auth.uid()
      and u.user_id = public."Donation_Drive_Registrations"."User_ID"
  )
);

drop policy if exists donation_drive_registrations_insert_staff_super_admin on public."Donation_Drive_Registrations";
create policy donation_drive_registrations_insert_staff_super_admin
on public."Donation_Drive_Registrations"
for insert
to authenticated
with check (
  exists (
    select 1
    from public.users u
    where u.auth_user_id = auth.uid()
      and lower(replace(replace(replace(coalesce(u.role, ''), '_', ''), ' ', ''), '-', '')) in ('staff', 'superadmin')
  )
);

drop policy if exists donation_drive_registrations_update_staff_super_admin on public."Donation_Drive_Registrations";
create policy donation_drive_registrations_update_staff_super_admin
on public."Donation_Drive_Registrations"
for update
to authenticated
using (
  exists (
    select 1
    from public.users u
    where u.auth_user_id = auth.uid()
      and lower(replace(replace(replace(coalesce(u.role, ''), '_', ''), ' ', ''), '-', '')) in ('staff', 'superadmin')
  )
)
with check (
  exists (
    select 1
    from public.users u
    where u.auth_user_id = auth.uid()
      and lower(replace(replace(replace(coalesce(u.role, ''), '_', ''), ' ', ''), '-', '')) in ('staff', 'superadmin')
  )
);

drop policy if exists donation_drive_registrations_delete_staff_super_admin on public."Donation_Drive_Registrations";
create policy donation_drive_registrations_delete_staff_super_admin
on public."Donation_Drive_Registrations"
for delete
to authenticated
using (
  exists (
    select 1
    from public.users u
    where u.auth_user_id = auth.uid()
      and lower(replace(replace(replace(coalesce(u.role, ''), '_', ''), ' ', ''), '-', '')) in ('staff', 'superadmin')
  )
);
