-- 072_fix_event_applications_insert_rls.sql
-- Allow any authenticated user to submit public event applications.
-- Keep intake-only safeguards: pending status and null reviewer columns on insert.

begin;

drop policy if exists event_applications_insert_authenticated_requestor on public."Event_Applications";
create policy event_applications_insert_authenticated_requestor
on public."Event_Applications"
for insert
to authenticated
with check (
  lower(replace(replace(replace(coalesce("Status", ''), '_', ''), ' ', ''), '-', '')) = 'pendingstaffreview'
  and "Staff_Reviewer_User_ID" is null
  and "Admin_Reviewer_User_ID" is null
  and (
    "Created_By_User_ID" is null
    or exists (
      select 1
      from public.users u
      where u.auth_user_id = auth.uid()
        and u.user_id = public."Event_Applications"."Created_By_User_ID"
    )
  )
);

commit;

