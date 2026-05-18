-- 076_remove_admin_fields_from_event_applications_and_use_utc8_timestamps.sql
-- Intake table cleanup + workflow timestamp normalization to UTC+8 (Asia/Manila).

begin;

-- ------------------------------------------------------------
-- 1) Event_Applications should be intake-only (no direct admin fields)
-- ------------------------------------------------------------

drop policy if exists event_applications_select_staff_admin on public."Event_Applications";
drop policy if exists event_applications_select_owner on public."Event_Applications";
drop policy if exists event_applications_insert_anon on public."Event_Applications";
drop policy if exists event_applications_update_owner_pending on public."Event_Applications";
drop policy if exists event_applications_insert_authenticated_requestor on public."Event_Applications";
drop policy if exists event_applications_insert_staff_admin on public."Event_Applications";
drop policy if exists event_applications_update_staff on public."Event_Applications";
drop policy if exists event_applications_update_admin on public."Event_Applications";
drop policy if exists event_applications_delete_admin on public."Event_Applications";

create policy event_applications_select_staff_admin
on public."Event_Applications"
for select
to authenticated
using (
  exists (
    select 1
    from public.users u
    where u.auth_user_id = auth.uid()
      and public.is_staff_or_admin_role(u.role)
  )
);

create policy event_applications_insert_anon
on public."Event_Applications"
for insert
to anon
with check (
  lower(replace(replace(replace(coalesce("Status", ''), '_', ''), ' ', ''), '-', '')) = 'pendingstaffreview'
  and "Staff_Reviewer_User_ID" is null
  and "Staff_Rejected_By_User_ID" is null
  and "Assigned_Staff_User_ID" is null
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
  and "Assigned_Staff_User_ID" is null
  and "Linked_Event_Request_ID" is null
  and not exists (
    select 1
    from public.users u
    where u.auth_user_id = auth.uid()
      and public.is_staff_or_admin_role(u.role)
  )
);

create policy event_applications_update_staff
on public."Event_Applications"
for update
to authenticated
using (
  exists (
    select 1
    from public.users u
    where u.auth_user_id = auth.uid()
      and public.normalize_app_role(u.role) = 'staff'
  )
)
with check (
  exists (
    select 1
    from public.users u
    where u.auth_user_id = auth.uid()
      and public.normalize_app_role(u.role) = 'staff'
  )
);

create policy event_applications_delete_admin
on public."Event_Applications"
for delete
to authenticated
using (
  exists (
    select 1
    from public.users u
    where u.auth_user_id = auth.uid()
      and public.is_admin_role(u.role)
  )
);

alter table public."Event_Applications"
  drop constraint if exists event_applications_admin_reviewer_fkey,
  drop constraint if exists event_applications_created_by_fkey;

alter table public."Event_Applications"
  drop column if exists "Admin_Reviewer_User_ID",
  drop column if exists "Admin_Reviewed_At",
  drop column if exists "Admin_Decision_Reason",
  drop column if exists "Created_By_User_ID";

-- ------------------------------------------------------------
-- 2) Timestamp helpers should use UTC+8 local wall-clock values
-- ------------------------------------------------------------

create or replace function public.set_event_applications_updated_at()
returns trigger
language plpgsql
as $$
begin
  new."Updated_At" = timezone('Asia/Manila', now());
  return new;
end;
$$;

create or replace function public.set_event_requests_updated_at()
returns trigger
language plpgsql
as $$
begin
  new."Updated_At" = timezone('Asia/Manila', now());
  return new;
end;
$$;

create or replace function public.set_smtp_email_outbox_updated_at()
returns trigger
language plpgsql
as $$
begin
  new."Updated_At" = timezone('Asia/Manila', now());
  return new;
end;
$$;

-- ------------------------------------------------------------
-- 3) Event application workflow (staff-owned + sync-safe)
-- ------------------------------------------------------------

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
      if coalesce(new."Assigned_Staff_User_ID", 0) = 0 then
        new."Assigned_Staff_User_ID" = actor_user_id;
      end if;
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
    -- This mirror transition is allowed only for sync/update consistency.
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

create or replace function public.sync_event_request_decision_to_application()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_status_key text;
  new_status_key text;
  manila_now timestamp without time zone := timezone('Asia/Manila', now());
begin
  old_status_key := lower(replace(replace(replace(coalesce(old."Status", ''), '_', ''), ' ', ''), '-', ''));
  new_status_key := lower(replace(replace(replace(coalesce(new."Status", ''), '_', ''), ' ', ''), '-', ''));

  if old_status_key = new_status_key then
    return new;
  end if;

  if new_status_key in ('approved', 'rejected') then
    update public."Event_Applications" ea
    set
      "Status" = case when new_status_key = 'approved' then 'Approved' else 'Rejected' end,
      "Updated_At" = manila_now
    where ea."Event_Application_ID" = new."Event_Application_ID";
  end if;

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
    "Assigned_Staff_User_ID" = coalesce(new."Staff_Prepared_By_User_ID", ea."Assigned_Staff_User_ID"),
    "Updated_At" = manila_now
  where ea."Event_Application_ID" = new."Event_Application_ID";

  return new;
end;
$$;

-- ------------------------------------------------------------
-- 4) Event request workflow with UTC+8 timestamps
-- ------------------------------------------------------------

create or replace function public.enforce_event_request_insert_by_staff()
returns trigger
language plpgsql
as $$
declare
  actor_user_id integer;
  actor_role_key text;
  application_visibility text;
  normalized_visibility text;
  manila_now timestamp without time zone := timezone('Asia/Manila', now());
begin
  select u.user_id, public.normalize_app_role(u.role)
  into actor_user_id, actor_role_key
  from public.users u
  where u.auth_user_id = auth.uid()
  limit 1;

  if actor_user_id is null then
    raise exception 'Unable to resolve actor profile for event request creation.';
  end if;

  if actor_role_key <> 'staff' then
    raise exception 'Only staff can create event requests.';
  end if;

  if length(trim(coalesce(new."Event_Photo_URL", ''))) = 0 then
    raise exception 'Event poster photo URL is required before submitting request to admin.';
  end if;

  select coalesce(nullif(trim(ea."Event_Visibility"), ''), 'Public')
  into application_visibility
  from public."Event_Applications" ea
  where ea."Event_Application_ID" = new."Event_Application_ID"
  limit 1;

  normalized_visibility := lower(replace(replace(replace(coalesce(new."Event_Visibility", application_visibility, 'Public'), '_', ''), ' ', ''), '-', ''));
  new."Event_Visibility" := case when normalized_visibility = 'private' then 'Private' else 'Public' end;

  new."Staff_Prepared_By_User_ID" := coalesce(new."Staff_Prepared_By_User_ID", actor_user_id);
  new."Staff_Prepared_At" := coalesce(new."Staff_Prepared_At", manila_now);
  new."Status" := coalesce(nullif(trim(new."Status"), ''), 'Pending Admin Approval');

  if lower(replace(replace(replace(coalesce(new."Status", ''), '_', ''), ' ', ''), '-', '')) <> 'pendingadminapproval' then
    raise exception 'New event requests must start as Pending Admin Approval.';
  end if;

  if new."Event_Visibility" <> 'Private' then
    new."Private_Event_Code" := null;
    new."Private_Event_Code_Sent_At" := null;
  end if;

  return new;
end;
$$;

create or replace function public.enforce_event_request_workflow()
returns trigger
language plpgsql
as $$
declare
  actor_user_id integer;
  actor_role_key text;
  old_status_key text;
  new_status_key text;
  visibility_key text;
  candidate_code text;
  attempt_count integer := 0;
  manila_now timestamp without time zone := timezone('Asia/Manila', now());
begin
  old_status_key := lower(replace(replace(replace(coalesce(old."Status", ''), '_', ''), ' ', ''), '-', ''));
  new_status_key := lower(replace(replace(replace(coalesce(new."Status", ''), '_', ''), ' ', ''), '-', ''));

  visibility_key := lower(replace(replace(replace(coalesce(new."Event_Visibility", 'Public'), '_', ''), ' ', ''), '-', ''));
  new."Event_Visibility" := case when visibility_key = 'private' then 'Private' else 'Public' end;

  if old_status_key is not distinct from new_status_key then
    if new."Event_Visibility" <> 'Private' then
      new."Private_Event_Code" := null;
      new."Private_Event_Code_Sent_At" := null;
    end if;

    new."Updated_At" = manila_now;
    return new;
  end if;

  select u.user_id, public.normalize_app_role(u.role)
  into actor_user_id, actor_role_key
  from public.users u
  where u.auth_user_id = auth.uid()
  limit 1;

  if actor_user_id is null then
    raise exception 'Unable to resolve actor profile for event request workflow update.';
  end if;

  if actor_role_key = 'admin' then
    if old_status_key = 'pendingadminapproval' and new_status_key in ('approved', 'rejected') then
      new."Admin_Reviewer_User_ID" = actor_user_id;
      new."Admin_Reviewed_At" = manila_now;
      if new_status_key = 'rejected' and length(trim(coalesce(new."Admin_Decision_Reason", ''))) = 0 then
        raise exception 'Admin rejection reason is required for event requests.';
      end if;

      if new_status_key = 'approved' and new."Event_Visibility" = 'Private' then
        if nullif(trim(coalesce(new."Private_Event_Code", '')), '') is null then
          candidate_code := null;
          while attempt_count < 12 loop
            attempt_count := attempt_count + 1;
            candidate_code := public.generate_private_event_code();

            exit when not exists (
              select 1
              from public."Event_Requests" er
              where er."Private_Event_Code" = candidate_code
                and er."Event_Request_ID" <> old."Event_Request_ID"
            );
          end loop;

          if candidate_code is null
            or exists (
              select 1
              from public."Event_Requests" er
              where er."Private_Event_Code" = candidate_code
                and er."Event_Request_ID" <> old."Event_Request_ID"
            ) then
            raise exception 'Unable to generate unique private event code. Please retry.';
          end if;

          new."Private_Event_Code" := candidate_code;
        end if;
      end if;

      if new."Event_Visibility" <> 'Private' then
        new."Private_Event_Code" := null;
        new."Private_Event_Code_Sent_At" := null;
      end if;
    else
      raise exception 'Admin cannot change event request status from % to %.', old."Status", new."Status";
    end if;
  elsif actor_role_key = 'staff' then
    if old_status_key = 'pendingadminapproval' and new_status_key = 'cancelled' then
      null;
    else
      raise exception 'Staff cannot change event request status from % to %.', old."Status", new."Status";
    end if;
  else
    raise exception 'Only staff or admin can change event request status.';
  end if;

  new."Updated_At" = manila_now;
  return new;
end;
$$;

create or replace function public.enqueue_event_application_smtp_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id integer;
  recipient_email text;
  old_status_key text;
  new_status_key text;
  queue_key text;
  manila_now timestamp without time zone := timezone('Asia/Manila', now());
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  old_status_key := lower(replace(replace(replace(coalesce(old."Status", ''), '_', ''), ' ', ''), '-', ''));
  new_status_key := lower(replace(replace(replace(coalesce(new."Status", ''), '_', ''), ' ', ''), '-', ''));

  if old_status_key = new_status_key then
    return new;
  end if;

  recipient_email := public.resolve_event_application_recipient_email(
    new."Applicant_Email",
    new."Preferred_Contact_Method",
    new."Preferred_Contact_Detail"
  );

  if recipient_email is null then
    return new;
  end if;

  select u.user_id
  into actor_user_id
  from public.users u
  where u.auth_user_id = auth.uid()
  limit 1;

  if new_status_key = 'rejected'
    and old_status_key = 'pendingstaffreview'
    and coalesce(new."Staff_Rejected_By_User_ID", 0) > 0 then
    queue_key := 'ea_staff_rejected:' || new."Event_Application_ID"::text || ':' || to_char(coalesce(new."Staff_Rejected_At", manila_now), 'YYYYMMDDHH24MISS');

    perform public.enqueue_smtp_email_outbox(
      queue_key,
      'Event_Applications',
      new."Event_Application_ID",
      'staff_rejected',
      recipient_email,
      'Event Application Update - Not Approved by Staff',
      'event_staff_rejected',
      jsonb_build_object(
        'event_application_id', new."Event_Application_ID",
        'event_name', coalesce(new."Event_Name", ''),
        'event_overview', coalesce(new."Event_Overview", ''),
        'proposed_start_at', new."Proposed_Start_At",
        'proposed_end_at', new."Proposed_End_At",
        'expected_attendees', new."Expected_Attendees",
        'venue_address', coalesce(new."Venue_Address", ''),
        'street', coalesce(new."Street", ''),
        'barangay', coalesce(new."Barangay", ''),
        'city', coalesce(new."City", ''),
        'province', coalesce(new."Province", ''),
        'region', coalesce(new."Region", ''),
        'country', coalesce(new."Country", ''),
        'staff_rejection_reason', coalesce(new."Staff_Rejection_Reason", ''),
        'preferred_contact_method', coalesce(new."Preferred_Contact_Method", ''),
        'preferred_contact_detail', coalesce(new."Preferred_Contact_Detail", '')
      ),
      actor_user_id
    );
  elsif new_status_key = 'pendingadmindecision'
    and old_status_key in ('pendingstaffreview', 'rejected', 'appealed')
    and coalesce(new."Linked_Event_Request_ID", 0) > 0 then
    queue_key := 'ea_staff_endorsed:' || new."Event_Application_ID"::text || ':' || new."Linked_Event_Request_ID"::text;

    perform public.enqueue_smtp_email_outbox(
      queue_key,
      'Event_Applications',
      new."Event_Application_ID",
      'staff_endorsed_pending_admin',
      recipient_email,
      'Event Application Update - Staff Review Completed',
      'event_staff_endorsed_pending_admin',
      jsonb_build_object(
        'event_application_id', new."Event_Application_ID",
        'linked_event_request_id', new."Linked_Event_Request_ID",
        'event_name', coalesce(new."Event_Name", ''),
        'event_overview', coalesce(new."Event_Overview", ''),
        'proposed_start_at', new."Proposed_Start_At",
        'proposed_end_at', new."Proposed_End_At",
        'expected_attendees', new."Expected_Attendees",
        'venue_address', coalesce(new."Venue_Address", ''),
        'street', coalesce(new."Street", ''),
        'barangay', coalesce(new."Barangay", ''),
        'city', coalesce(new."City", ''),
        'province', coalesce(new."Province", ''),
        'region', coalesce(new."Region", ''),
        'country', coalesce(new."Country", ''),
        'preferred_contact_method', coalesce(new."Preferred_Contact_Method", ''),
        'preferred_contact_detail', coalesce(new."Preferred_Contact_Detail", ''),
        'message', 'Our staff reviewed your request and will contact you using your selected contact method. A separate email will follow after admin approval and publication readiness.'
      ),
      actor_user_id
    );
  end if;

  return new;
end;
$$;

create or replace function public.enqueue_event_request_smtp_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id integer;
  recipient_email text;
  old_status_key text;
  new_status_key text;
  event_visibility_key text;
  application_row public."Event_Applications"%rowtype;
  queue_key text;
  manila_now timestamp without time zone := timezone('Asia/Manila', now());
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  old_status_key := lower(replace(replace(replace(coalesce(old."Status", ''), '_', ''), ' ', ''), '-', ''));
  new_status_key := lower(replace(replace(replace(coalesce(new."Status", ''), '_', ''), ' ', ''), '-', ''));
  event_visibility_key := lower(replace(replace(replace(coalesce(new."Event_Visibility", 'Public'), '_', ''), ' ', ''), '-', ''));

  if old_status_key = new_status_key then
    return new;
  end if;

  select *
  into application_row
  from public."Event_Applications" ea
  where ea."Event_Application_ID" = new."Event_Application_ID"
  limit 1;

  if application_row."Event_Application_ID" is null then
    return new;
  end if;

  recipient_email := public.resolve_event_application_recipient_email(
    application_row."Applicant_Email",
    application_row."Preferred_Contact_Method",
    application_row."Preferred_Contact_Detail"
  );

  if recipient_email is null then
    return new;
  end if;

  select u.user_id
  into actor_user_id
  from public.users u
  where u.auth_user_id = auth.uid()
  limit 1;

  if new_status_key = 'approved' then
    queue_key := 'er_admin_approved:' || new."Event_Request_ID"::text || ':' || to_char(coalesce(new."Admin_Reviewed_At", manila_now), 'YYYYMMDDHH24MISS');

    perform public.enqueue_smtp_email_outbox(
      queue_key,
      'Event_Requests',
      new."Event_Request_ID",
      'admin_approved',
      recipient_email,
      case when event_visibility_key = 'private'
        then 'Private Event Request Approved by Admin'
        else 'Event Request Approved by Admin and Ready for Publishing'
      end,
      'event_admin_approved',
      jsonb_build_object(
        'event_request_id', new."Event_Request_ID",
        'event_name', coalesce(new."Event_Name", ''),
        'start_date', new."Start_Date",
        'end_date', new."End_Date",
        'venue_name', coalesce(new."Venue_Name", ''),
        'country', coalesce(new."Country", ''),
        'region', coalesce(new."Region", ''),
        'province', coalesce(new."Province", ''),
        'city_municipality', coalesce(new."City_Municipality", ''),
        'barangay', coalesce(new."Barangay", ''),
        'street', coalesce(new."Street", ''),
        'event_by', coalesce(new."Event_By", ''),
        'partnered_with', coalesce(new."Partnered_With", ''),
        'partner_social_media_link', coalesce(new."Partner_Social_Media_Link", ''),
        'event_visibility', case when event_visibility_key = 'private' then 'Private' else 'Public' end,
        'private_event_code', nullif(trim(coalesce(new."Private_Event_Code", '')), ''),
        'message', case when event_visibility_key = 'private'
          then 'Your private event request has been approved. Use the private event code below when required in the mobile app.'
          else 'Your event request has been approved by admin. Our team will contact you using your selected contact method with publication-ready details.'
        end
      ),
      actor_user_id
    );

    if event_visibility_key = 'private' and nullif(trim(coalesce(new."Private_Event_Code", '')), '') is not null then
      update public."Event_Requests" er
      set "Private_Event_Code_Sent_At" = coalesce(er."Private_Event_Code_Sent_At", manila_now)
      where er."Event_Request_ID" = new."Event_Request_ID"
        and er."Private_Event_Code_Sent_At" is null;
    end if;
  elsif new_status_key = 'rejected' then
    queue_key := 'er_admin_rejected:' || new."Event_Request_ID"::text || ':' || to_char(coalesce(new."Admin_Reviewed_At", manila_now), 'YYYYMMDDHH24MISS');

    perform public.enqueue_smtp_email_outbox(
      queue_key,
      'Event_Requests',
      new."Event_Request_ID",
      'admin_rejected',
      recipient_email,
      'Event Request Decision - Admin Rejected',
      'event_admin_rejected',
      jsonb_build_object(
        'event_request_id', new."Event_Request_ID",
        'event_name', coalesce(new."Event_Name", ''),
        'admin_decision_reason', coalesce(new."Admin_Decision_Reason", ''),
        'message', 'Your event request was reviewed by admin and not approved at this time.'
      ),
      actor_user_id
    );
  end if;

  return new;
end;
$$;

commit;
