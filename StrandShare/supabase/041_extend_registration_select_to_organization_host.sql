-- 041_extend_registration_select_to_organization_host.sql
-- Allow members of the host organization to SELECT registrations for the
-- drives they host. Without this, ViewDrivePage on the Organization role sees
-- zero attendees because previous policies only granted access to:
--   * Super Admin
--   * Staff assigned to the drive
--   * The donor themselves

drop policy if exists donation_drive_registrations_select_staff_super_admin_or_owner on public."Donation_Drive_Registrations";
create policy donation_drive_registrations_select_staff_super_admin_or_owner
on public."Donation_Drive_Registrations"
for select
to authenticated
using (
  -- Super Admin: full access.
  exists (
    select 1
    from public.users u
    where u.auth_user_id = auth.uid()
      and lower(replace(replace(replace(coalesce(u.role, ''), '_', ''), ' ', ''), '-', '')) = 'superadmin'
  )
  -- Staff assigned to the drive.
  or exists (
    select 1
    from public.users u
    join public."Donation_Drive_Requests" req
      on req."Donation_Drive_ID" = public."Donation_Drive_Registrations"."Donation_Drive_ID"
    where u.auth_user_id = auth.uid()
      and lower(replace(replace(replace(coalesce(u.role, ''), '_', ''), ' ', ''), '-', '')) = 'staff'
      and req."Assigned_Staff_User_ID" = u.user_id
  )
  -- The donor themselves (their own registration row).
  or exists (
    select 1
    from public.users u
    where u.auth_user_id = auth.uid()
      and u.user_id = public."Donation_Drive_Registrations"."User_ID"
  )
  -- Active members of the organization that hosts the drive.
  or exists (
    select 1
    from public.users u
    join public."Donation_Drive_Requests" req
      on req."Donation_Drive_ID" = public."Donation_Drive_Registrations"."Donation_Drive_ID"
    join public."Organization_Members" om
      on om."Organization_ID" = req."Organization_ID"
     and om."User_ID" = u.user_id
    where u.auth_user_id = auth.uid()
      and lower(coalesce(om."Status", 'active')) = 'active'
  )
);
