-- 075_fix_event_application_workflow_without_rejected_by_role.sql
-- Fix trigger functions to work with schemas that do not include Rejected_By_Role.

begin;

create or replace function public.enforce_event_application_workflow()
returns trigger
language plpgsql
as $$
declare
  actor_user_id integer;
  actor_role_key text;
  old_status_key text;
  new_status_key text;
begin
  old_status_key := lower(replace(replace(replace(coalesce(old."Status", ''), '_', ''), ' ', ''), '-', ''));
  new_status_key := lower(replace(replace(replace(coalesce(new."Status", ''), '_', ''), ' ', ''), '-', ''));

  if old_status_key is not distinct from new_status_key then
    new."Updated_At" = now();
    return new;
  end if;

  select
    u.user_id,
    public.normalize_app_role(u.role)
  into actor_user_id, actor_role_key
  from public.users u
  where u.auth_user_id = auth.uid()
  limit 1;

  if actor_user_id is null then
    raise exception 'Unable to resolve actor profile for event application workflow update.';
  end if;

  if actor_role_key = 'staff' then
    if old_status_key = 'pendingstaffreview' and new_status_key = 'rejected' then
      if length(trim(coalesce(new."Staff_Rejection_Reason", ''))) = 0 then
        raise exception 'Staff rejection reason is required when rejecting event applications.';
      end if;

      new."Staff_Rejected_By_User_ID" = actor_user_id;
      new."Staff_Rejected_At" = now();
      new."Staff_Reviewer_User_ID" = actor_user_id;
      new."Staff_Reviewed_At" = coalesce(new."Staff_Reviewed_At", now());
      new."Admin_Reviewer_User_ID" = null;
      new."Admin_Reviewed_At" = null;
      new."Admin_Decision_Reason" = null;
    elsif old_status_key in ('pendingstaffreview', 'rejected', 'appealed') and new_status_key = 'pendingadmindecision' then
      if coalesce(new."Linked_Event_Request_ID", 0) = 0 then
        raise exception 'Linked event request is required before submitting to admin decision.';
      end if;

      if old_status_key = 'rejected' and coalesce(old."Admin_Reviewer_User_ID", 0) > 0 then
        raise exception 'Staff cannot directly resubmit an admin-rejected application without appeal flow.';
      end if;

      new."Staff_Reviewer_User_ID" = actor_user_id;
      new."Staff_Reviewed_At" = coalesce(new."Staff_Reviewed_At", now());
      if coalesce(new."Assigned_Staff_User_ID", 0) = 0 then
        new."Assigned_Staff_User_ID" = actor_user_id;
      end if;
      new."Staff_Rejection_Reason" = null;
      new."Staff_Rejected_At" = null;
      new."Staff_Rejected_By_User_ID" = null;
      new."Admin_Reviewer_User_ID" = null;
      new."Admin_Reviewed_At" = null;
      new."Admin_Decision_Reason" = null;
    elsif old_status_key = 'rejected' and new_status_key = 'appealed' then
      new."Staff_Reviewer_User_ID" = actor_user_id;
      new."Staff_Reviewed_At" = coalesce(new."Staff_Reviewed_At", now());
    else
      raise exception 'Staff cannot change event application status from % to %.', old."Status", new."Status";
    end if;
  elsif actor_role_key = 'admin' then
    if old_status_key = 'pendingadmindecision' and new_status_key in ('approved', 'rejected') then
      new."Admin_Reviewer_User_ID" = actor_user_id;
      new."Admin_Reviewed_At" = now();

      if new_status_key = 'rejected' then
        if length(trim(coalesce(new."Admin_Decision_Reason", ''))) = 0 then
          raise exception 'Admin decision reason is required when rejecting event applications.';
        end if;
      else
        new."Admin_Decision_Reason" = null;
      end if;
    else
      raise exception 'Admin cannot change event application status from % to %.', old."Status", new."Status";
    end if;
  else
    raise exception 'Only staff or admin can change event application status.';
  end if;

  new."Updated_At" = now();
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
      "Admin_Decision_Reason" = case when new_status_key = 'rejected' then nullif(trim(new."Admin_Decision_Reason"), '') else null end,
      "Admin_Reviewed_At" = coalesce(new."Admin_Reviewed_At", now()),
      "Admin_Reviewer_User_ID" = new."Admin_Reviewer_User_ID"
    where ea."Event_Application_ID" = new."Event_Application_ID";
  end if;

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
    queue_key := 'ea_staff_rejected:' || new."Event_Application_ID"::text || ':' || to_char(coalesce(new."Staff_Rejected_At", now()), 'YYYYMMDDHH24MISS');

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

commit;
