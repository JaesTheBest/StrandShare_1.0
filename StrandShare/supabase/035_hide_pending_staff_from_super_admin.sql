-- 035_hide_pending_staff_from_super_admin.sql
-- Super Admin should not see donation drives that are still pending Staff approval.

alter table if exists public."Donation_Drive_Requests" enable row level security;

drop policy if exists donation_drive_requests_select_org_staff_super_admin on public."Donation_Drive_Requests";
create policy donation_drive_requests_select_org_staff_super_admin
on public."Donation_Drive_Requests"
for select
to authenticated
using (
  exists (
    select 1
    from public.users u
    where u.auth_user_id = auth.uid()
      and public.normalize_app_role(u.role) = 'staff'
  )
  or (
    exists (
      select 1
      from public.users u
      where u.auth_user_id = auth.uid()
        and public.normalize_app_role(u.role) = 'superadmin'
    )
    and lower(replace(replace(replace(coalesce(public."Donation_Drive_Requests"."Status", ''), '_', ''), ' ', ''), '-', '')) <> 'pendingstaffapproval'
  )
  or exists (
    select 1
    from public.users u
    join public."Organization_Members" om
      on om."User_ID" = u.user_id
    where u.auth_user_id = auth.uid()
      and lower(coalesce(om."Status", 'active')) = 'active'
      and om."Organization_ID" = public."Donation_Drive_Requests"."Organization_ID"
  )
);
