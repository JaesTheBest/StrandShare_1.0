-- 038_harden_donation_drive_registrations_assigned_staff_scanner.sql
-- Removes redundant Organization_ID from Donation_Drive_Registrations,
-- normalizes RSVP status semantics, and enforces assigned-staff scanner access.

do $$
declare
  organization_column_exists boolean := false;
  mismatch_count integer := 0;
begin
  if to_regclass('public."Donation_Drive_Registrations"') is null then
    return;
  end if;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'Donation_Drive_Registrations'
      and column_name = 'Organization_ID'
  )
  into organization_column_exists;

  if organization_column_exists and to_regclass('public."Donation_Drive_Requests"') is not null then
    -- Safe migration check: inspect mismatches before removing redundant Organization_ID.
    select count(*)
    into mismatch_count
    from public."Donation_Drive_Registrations" reg
    join public."Donation_Drive_Requests" req
      on req."Donation_Drive_ID" = reg."Donation_Drive_ID"
    where reg."Organization_ID" is not null
      and req."Organization_ID" is not null
      and reg."Organization_ID" <> req."Organization_ID";

    if mismatch_count > 0 then
      raise notice 'Found % Donation_Drive_Registrations rows with Organization_ID mismatch against Donation_Drive_Requests. Dropping redundant Organization_ID anyway.', mismatch_count;
    end if;
  end if;
end
$$;

alter table if exists public."Donation_Drive_Registrations"
  drop constraint if exists donation_drive_registrations_organization_id_fkey;

drop index if exists public.idx_donation_drive_registrations_organization_id;
drop index if exists public."idx_Donation_Drive_Registrations_Organization_ID";

alter table if exists public."Donation_Drive_Registrations"
  drop column if exists "Organization_ID";

alter table if exists public."Donation_Drive_Registrations"
  add column if not exists "Registration_Status" character varying(50) default 'Approved',
  add column if not exists "Attendance_Status" character varying(50) default 'Not Marked',
  add column if not exists "Attendance_Marked_At" timestamp without time zone,
  add column if not exists "Updated_At" timestamp without time zone default now();

update public."Donation_Drive_Registrations"
set "Registration_Status" = 'Approved'
where coalesce(trim("Registration_Status"), '') = ''
  or lower(replace(replace(replace(coalesce("Registration_Status", ''), '_', ''), ' ', ''), '-', '')) like 'pending%';

update public."Donation_Drive_Registrations"
set "Attendance_Status" = 'Not Marked'
where coalesce(trim("Attendance_Status"), '') = '';

alter table if exists public."Donation_Drive_Registrations"
  alter column "Registration_Status" set default 'Approved',
  alter column "Registration_Status" set not null,
  alter column "Attendance_Status" set default 'Not Marked',
  alter column "Attendance_Status" set not null;

alter table if exists public."Donation_Drive_Registrations"
  drop constraint if exists donation_drive_registrations_registration_status_no_pending;

alter table if exists public."Donation_Drive_Registrations"
  add constraint donation_drive_registrations_registration_status_no_pending
  check (
    coalesce(trim("Registration_Status"), '') <> ''
    and lower(replace(replace(replace(coalesce("Registration_Status", ''), '_', ''), ' ', ''), '-', '')) not like 'pending%'
  );

alter table if exists public."Donation_Drive_Registrations"
  drop constraint if exists donation_drive_registrations_attendance_status_not_empty;

alter table if exists public."Donation_Drive_Registrations"
  add constraint donation_drive_registrations_attendance_status_not_empty
  check (coalesce(trim("Attendance_Status"), '') <> '');

comment on column public."Donation_Drive_Registrations"."Registration_Status"
  is 'RSVP lifecycle status. Pending is not allowed; default is Approved.';

comment on column public."Donation_Drive_Registrations"."Attendance_Status"
  is 'Event-day attendance status independent from RSVP lifecycle (for example: Not Marked, Present, No Show).';

comment on column public."Donation_Drive_Registrations"."Attendance_Marked_At"
  is 'Timestamp when attendance was marked by an authorized scanner action.';

-- Restrict staff access to registrations of drives assigned to them.
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
      and lower(replace(replace(replace(coalesce(u.role, ''), '_', ''), ' ', ''), '-', '')) = 'superadmin'
  )
  or exists (
    select 1
    from public.users u
    join public."Donation_Drive_Requests" req
      on req."Donation_Drive_ID" = public."Donation_Drive_Registrations"."Donation_Drive_ID"
    where u.auth_user_id = auth.uid()
      and lower(replace(replace(replace(coalesce(u.role, ''), '_', ''), ' ', ''), '-', '')) = 'staff'
      and req."Assigned_Staff_User_ID" = u.user_id
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
      and lower(replace(replace(replace(coalesce(u.role, ''), '_', ''), ' ', ''), '-', '')) = 'superadmin'
  )
  or exists (
    select 1
    from public.users u
    join public."Donation_Drive_Requests" req
      on req."Donation_Drive_ID" = public."Donation_Drive_Registrations"."Donation_Drive_ID"
    where u.auth_user_id = auth.uid()
      and lower(replace(replace(replace(coalesce(u.role, ''), '_', ''), ' ', ''), '-', '')) = 'staff'
      and req."Assigned_Staff_User_ID" = u.user_id
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
      and lower(replace(replace(replace(coalesce(u.role, ''), '_', ''), ' ', ''), '-', '')) = 'superadmin'
  )
  or exists (
    select 1
    from public.users u
    join public."Donation_Drive_Requests" req
      on req."Donation_Drive_ID" = public."Donation_Drive_Registrations"."Donation_Drive_ID"
    where u.auth_user_id = auth.uid()
      and lower(replace(replace(replace(coalesce(u.role, ''), '_', ''), ' ', ''), '-', '')) = 'staff'
      and req."Assigned_Staff_User_ID" = u.user_id
  )
)
with check (
  exists (
    select 1
    from public.users u
    where u.auth_user_id = auth.uid()
      and lower(replace(replace(replace(coalesce(u.role, ''), '_', ''), ' ', ''), '-', '')) = 'superadmin'
  )
  or exists (
    select 1
    from public.users u
    join public."Donation_Drive_Requests" req
      on req."Donation_Drive_ID" = public."Donation_Drive_Registrations"."Donation_Drive_ID"
    where u.auth_user_id = auth.uid()
      and lower(replace(replace(replace(coalesce(u.role, ''), '_', ''), ' ', ''), '-', '')) = 'staff'
      and req."Assigned_Staff_User_ID" = u.user_id
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
      and lower(replace(replace(replace(coalesce(u.role, ''), '_', ''), ' ', ''), '-', '')) = 'superadmin'
  )
  or exists (
    select 1
    from public.users u
    join public."Donation_Drive_Requests" req
      on req."Donation_Drive_ID" = public."Donation_Drive_Registrations"."Donation_Drive_ID"
    where u.auth_user_id = auth.uid()
      and lower(replace(replace(replace(coalesce(u.role, ''), '_', ''), ' ', ''), '-', '')) = 'staff'
      and req."Assigned_Staff_User_ID" = u.user_id
  )
);
