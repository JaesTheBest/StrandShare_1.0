-- 080_move_assigned_staff_to_event_requests.sql
-- Move "Assigned_Staff_User_ID" from Event_Applications to Event_Requests.
-- Admin assigns staff on approval of an Event_Request; the column no longer
-- lives on Event_Applications.

begin;

-- ---------------------------------------------------------------------------
-- 1) Add Assigned_Staff_User_ID column to Event_Requests
-- ---------------------------------------------------------------------------

alter table public."Event_Requests"
  add column if not exists "Assigned_Staff_User_ID" integer;

alter table public."Event_Requests"
  drop constraint if exists event_requests_assigned_staff_fkey;

alter table public."Event_Requests"
  add constraint event_requests_assigned_staff_fkey
  foreign key ("Assigned_Staff_User_ID") references public.users(user_id) on delete set null;

create index if not exists idx_event_requests_assigned_staff
  on public."Event_Requests" using btree ("Assigned_Staff_User_ID");

-- ---------------------------------------------------------------------------
-- 2) Backfill from Event_Applications where data already existed
-- ---------------------------------------------------------------------------

update public."Event_Requests" er
set "Assigned_Staff_User_ID" = ea."Assigned_Staff_User_ID"
from public."Event_Applications" ea
where er."Event_Application_ID" = ea."Event_Application_ID"
  and ea."Assigned_Staff_User_ID" is not null
  and er."Assigned_Staff_User_ID" is null;

-- ---------------------------------------------------------------------------
-- 3) Replace insert RLS policies that referenced the old column
-- ---------------------------------------------------------------------------

drop policy if exists event_applications_insert_anon on public."Event_Applications";
drop policy if exists event_applications_insert_authenticated_requestor on public."Event_Applications";

create policy event_applications_insert_anon
on public."Event_Applications"
for insert
to anon
with check (
  lower(replace(replace(replace(coalesce("Status", ''), '_', ''), ' ', ''), '-', '')) = 'pendingstaffreview'
  and "Staff_Reviewer_User_ID" is null
  and "Staff_Rejected_By_User_ID" is null
  and "Linked_Event_Request_ID" is null
);

create policy event_applications_insert_authenticated_requestor
on public."Event_Applications"
for insert
to authenticated
with check (
  lower(replace(replace(replace(coalesce("Status", ''), '_', ''), ' ', ''), '-', '')) = 'pendingstaffreview'
  and "Staff_Reviewer_User_ID" is null
  and "Staff_Rejected_By_User_ID" is null
  and "Linked_Event_Request_ID" is null
  and not exists (
    select 1
    from public.users u
    where u.auth_user_id = auth.uid()
      and public.is_staff_or_admin_role(u.role)
  )
);

-- ---------------------------------------------------------------------------
-- 4) Drop trigger logic that still touches Event_Applications.Assigned_Staff_User_ID
-- ---------------------------------------------------------------------------

create or replace function public.enforce_event_application_workflow()
returns trigger
language plpgsql
as $$
declare
  actor_user_id integer;
  actor_role_key text;
  old_status_key text;
  new_status_key text;
  manila_now timestamp without time zone := timezone('Asia/Manila', now());
begin
  old_status_key := lower(replace(replace(replace(coalesce(old."Status", ''), '_', ''), ' ', ''), '-', ''));
  new_status_key := lower(replace(replace(replace(coalesce(new."Status", ''), '_', ''), ' ', ''), '-', ''));

  if old_status_key is not distinct from new_status_key then
    new."Updated_At" = manila_now;
    return new;
  end if;

  select
    u.user_id,
    public.normalize_app_role(u.role)
  into actor_user_id, actor_role_key
  from public.users u
  where u.auth_user_id = auth.uid()
  limit 1;

  -- Allow system-driven sync updates (e.g., from Event_Requests trigger) even when auth.uid() is null.
  if actor_user_id is null then
    if old_status_key = 'pendingadmindecision' and new_status_key in ('approved', 'rejected') then
      new."Updated_At" = manila_now;
      return new;
    end if;

    raise exception 'Unable to resolve actor profile for event application workflow update.';
  end if;

  if actor_role_key = 'staff' then
    if old_status_key = 'pendingstaffreview' and new_status_key = 'rejected' then
      if length(trim(coalesce(new."Staff_Rejection_Reason", ''))) = 0 then
        raise exception 'Staff rejection reason is required when rejecting event applications.';
      end if;

      new."Staff_Rejected_By_User_ID" = actor_user_id;
      new."Staff_Rejected_At" = manila_now;
      new."Staff_Reviewer_User_ID" = actor_user_id;
      new."Staff_Reviewed_At" = coalesce(new."Staff_Reviewed_At", manila_now);
    elsif old_status_key in ('pendingstaffreview', 'rejected', 'appealed') and new_status_key = 'pendingadmindecision' then
      if coalesce(new."Linked_Event_Request_ID", 0) = 0 then
        raise exception 'Linked event request is required before submitting to admin decision.';
      end if;

      new."Staff_Reviewer_User_ID" = actor_user_id;
      new."Staff_Reviewed_At" = coalesce(new."Staff_Reviewed_At", manila_now);
      new."Staff_Rejection_Reason" = null;
      new."Staff_Rejected_At" = null;
      new."Staff_Rejected_By_User_ID" = null;
    elsif old_status_key = 'rejected' and new_status_key = 'appealed' then
      new."Staff_Reviewer_User_ID" = actor_user_id;
      new."Staff_Reviewed_At" = coalesce(new."Staff_Reviewed_At", manila_now);
    else
      raise exception 'Staff cannot change event application status from % to %.', old."Status", new."Status";
    end if;
  elsif actor_role_key = 'admin' then
    -- Admin decisions are made on Event_Requests table.
    if not (old_status_key = 'pendingadmindecision' and new_status_key in ('approved', 'rejected')) then
      raise exception 'Admin cannot change event application status directly. Use Event_Requests.';
    end if;
  else
    raise exception 'Only staff or admin can change event application status.';
  end if;

  new."Updated_At" = manila_now;
  return new;
end;
$$;

create or replace function public.link_event_request_to_application()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  manila_now timestamp without time zone := timezone('Asia/Manila', now());
begin
  update public."Event_Applications" ea
  set
    "Linked_Event_Request_ID" = new."Event_Request_ID",
    "Status" = 'Pending Admin Decision',
    "Staff_Contact_Notes" = coalesce(new."Staff_Contact_Notes", ea."Staff_Contact_Notes"),
    "Staff_Contacted_At" = coalesce(ea."Staff_Contacted_At", manila_now),
    "Updated_At" = manila_now
  where ea."Event_Application_ID" = new."Event_Application_ID";

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5) Rewrite Event_Attendees RLS policies to join through Event_Requests
--    (these depend on Event_Applications.Assigned_Staff_User_ID; must be
--    dropped and recreated before the column can be removed)
-- ---------------------------------------------------------------------------

drop policy if exists event_attendees_select_staff_admin_or_owner on public."Event_Attendees";
create policy event_attendees_select_staff_admin_or_owner
on public."Event_Attendees"
for select
to authenticated
using (
  exists (
    select 1
    from public.users u
    where u.auth_user_id = auth.uid()
      and public.is_admin_role(u.role)
  )
  or exists (
    select 1
    from public.users u
    join public."Event_Requests" er
      on er."Assigned_Staff_User_ID" = u.user_id
    where u.auth_user_id = auth.uid()
      and public.normalize_app_role(u.role) = 'staff'
      and er."Event_Application_ID" = public."Event_Attendees"."Event_Application_ID"
  )
  or exists (
    select 1
    from public.users u
    where u.auth_user_id = auth.uid()
      and u.user_id = public."Event_Attendees"."User_ID"
  )
);

drop policy if exists event_attendees_insert_staff_admin on public."Event_Attendees";
create policy event_attendees_insert_staff_admin
on public."Event_Attendees"
for insert
to authenticated
with check (
  exists (
    select 1
    from public.users u
    where u.auth_user_id = auth.uid()
      and public.is_admin_role(u.role)
  )
  or exists (
    select 1
    from public.users u
    join public."Event_Requests" er
      on er."Assigned_Staff_User_ID" = u.user_id
    where u.auth_user_id = auth.uid()
      and public.normalize_app_role(u.role) = 'staff'
      and er."Event_Application_ID" = public."Event_Attendees"."Event_Application_ID"
  )
);

drop policy if exists event_attendees_update_staff_admin on public."Event_Attendees";
create policy event_attendees_update_staff_admin
on public."Event_Attendees"
for update
to authenticated
using (
  exists (
    select 1
    from public.users u
    where u.auth_user_id = auth.uid()
      and public.is_admin_role(u.role)
  )
  or exists (
    select 1
    from public.users u
    join public."Event_Requests" er
      on er."Assigned_Staff_User_ID" = u.user_id
    where u.auth_user_id = auth.uid()
      and public.normalize_app_role(u.role) = 'staff'
      and er."Event_Application_ID" = public."Event_Attendees"."Event_Application_ID"
  )
)
with check (
  exists (
    select 1
    from public.users u
    where u.auth_user_id = auth.uid()
      and public.is_admin_role(u.role)
  )
  or exists (
    select 1
    from public.users u
    join public."Event_Requests" er
      on er."Assigned_Staff_User_ID" = u.user_id
    where u.auth_user_id = auth.uid()
      and public.normalize_app_role(u.role) = 'staff'
      and er."Event_Application_ID" = public."Event_Attendees"."Event_Application_ID"
  )
);

-- ---------------------------------------------------------------------------
-- 6) Drop Assigned_Staff_User_ID from Event_Applications
-- ---------------------------------------------------------------------------

alter table public."Event_Applications"
  drop constraint if exists event_applications_assigned_staff_fkey;

drop index if exists idx_event_applications_assigned_staff;

alter table public."Event_Applications"
  drop column if exists "Assigned_Staff_User_ID";

-- ---------------------------------------------------------------------------
-- 7) RLS: let assigned staff see their Event_Requests
-- ---------------------------------------------------------------------------

drop policy if exists event_requests_select_assigned_staff on public."Event_Requests";

create policy event_requests_select_assigned_staff
on public."Event_Requests"
for select
to authenticated
using (
  exists (
    select 1
    from public.users u
    where u.auth_user_id = auth.uid()
      and u.user_id = "Assigned_Staff_User_ID"
  )
);

commit;
