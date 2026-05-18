-- 071_event_requests_and_smtp_workflow.sql
-- Introduce Event_Requests final table and SMTP email queue workflow.

begin;

-- Ensure old event-application outbox/auth-invite artifacts are removed.
drop trigger if exists trg_enqueue_event_application_email_outbox on public."Event_Applications";
drop function if exists public.enqueue_event_application_email_outbox() cascade;
drop function if exists public.set_event_application_email_outbox_updated_at() cascade;
drop table if exists public."Event_Application_Email_Outbox" cascade;

-- ---------------------------------------------------------------------------
-- Event requests (staff-prepared final details, admin-approved)
-- ---------------------------------------------------------------------------
create table if not exists public."Event_Requests" (
  "Event_Request_ID" serial primary key,
  "Event_Application_ID" integer not null,
  "Event_Name" character varying(255) not null,
  "Start_Date" timestamp without time zone,
  "End_Date" timestamp without time zone,
  "Venue_Name" character varying(255),
  "Country" character varying(255) default 'Philippines',
  "Region" character varying(255),
  "Province" character varying(255),
  "City_Municipality" character varying(255),
  "Barangay" character varying(255),
  "Street" character varying(255),
  "Longitude" numeric(10, 7),
  "Latitude" numeric(10, 7),
  "Event_Photo_URL" character varying(500),
  "Event_By" character varying(255),
  "Partnered_With" character varying(255),
  "Partner_Social_Media_Link" character varying(500),
  "Status" character varying(50) not null default 'Pending Admin Approval',
  "Staff_Prepared_By_User_ID" integer,
  "Staff_Prepared_At" timestamp without time zone not null default now(),
  "Staff_Contact_Notes" text,
  "Admin_Reviewer_User_ID" integer,
  "Admin_Reviewed_At" timestamp without time zone,
  "Admin_Decision_Reason" text,
  "Created_At" timestamp without time zone not null default now(),
  "Updated_At" timestamp without time zone not null default now(),
  constraint event_requests_event_application_fkey
    foreign key ("Event_Application_ID") references public."Event_Applications"("Event_Application_ID") on delete cascade,
  constraint event_requests_staff_prepared_by_fkey
    foreign key ("Staff_Prepared_By_User_ID") references public.users(user_id) on delete set null,
  constraint event_requests_admin_reviewer_fkey
    foreign key ("Admin_Reviewer_User_ID") references public.users(user_id) on delete set null,
  constraint event_requests_status_check
    check (
      lower(replace(replace(replace(coalesce("Status", ''), '_', ''), ' ', ''), '-', '')) in (
        'pendingadminapproval',
        'approved',
        'rejected',
        'cancelled'
      )
    ),
  constraint event_requests_end_after_start_check
    check (
      "Start_Date" is null
      or "End_Date" is null
      or "End_Date" >= "Start_Date"
    ),
  constraint event_requests_latitude_range
    check ("Latitude" is null or ("Latitude" >= -90 and "Latitude" <= 90)),
  constraint event_requests_longitude_range
    check ("Longitude" is null or ("Longitude" >= -180 and "Longitude" <= 180))
);

create unique index if not exists idx_event_requests_event_application_unique
  on public."Event_Requests" ("Event_Application_ID");

create index if not exists idx_event_requests_status
  on public."Event_Requests" ("Status");

create index if not exists idx_event_requests_updated_at
  on public."Event_Requests" ("Updated_At" desc);

-- ---------------------------------------------------------------------------
-- Extend applications for staff/admin split decisions and request linking
-- ---------------------------------------------------------------------------
alter table public."Event_Applications"
  add column if not exists "Linked_Event_Request_ID" integer,
  add column if not exists "Staff_Rejection_Reason" text,
  add column if not exists "Staff_Rejected_At" timestamp without time zone,
  add column if not exists "Staff_Rejected_By_User_ID" integer,
  add column if not exists "Rejected_By_Role" character varying(30);

create unique index if not exists idx_event_applications_linked_request_unique
  on public."Event_Applications" ("Linked_Event_Request_ID")
  where "Linked_Event_Request_ID" is not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'event_applications_linked_event_request_fkey'
  ) then
    alter table public."Event_Applications"
      add constraint event_applications_linked_event_request_fkey
      foreign key ("Linked_Event_Request_ID") references public."Event_Requests"("Event_Request_ID") on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'event_applications_staff_rejected_by_fkey'
  ) then
    alter table public."Event_Applications"
      add constraint event_applications_staff_rejected_by_fkey
      foreign key ("Staff_Rejected_By_User_ID") references public.users(user_id) on delete set null;
  end if;
end
$$;

alter table public."Event_Applications"
  drop constraint if exists event_applications_rejected_by_role_check;

alter table public."Event_Applications"
  add constraint event_applications_rejected_by_role_check
  check (
    "Rejected_By_Role" is null
    or lower(replace(replace(replace(coalesce("Rejected_By_Role", ''), '_', ''), ' ', ''), '-', '')) in ('staff', 'admin')
  );

-- ---------------------------------------------------------------------------
-- Updated event application workflow: staff can reject; staff endorsement requires linked request.
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
  old_rejected_by_key text;
begin
  old_status_key := lower(replace(replace(replace(coalesce(old."Status", ''), '_', ''), ' ', ''), '-', ''));
  new_status_key := lower(replace(replace(replace(coalesce(new."Status", ''), '_', ''), ' ', ''), '-', ''));
  old_rejected_by_key := lower(replace(replace(replace(coalesce(old."Rejected_By_Role", ''), '_', ''), ' ', ''), '-', ''));

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
      new."Rejected_By_Role" = 'staff';
      new."Staff_Reviewer_User_ID" = actor_user_id;
      new."Staff_Reviewed_At" = coalesce(new."Staff_Reviewed_At", now());
      new."Admin_Reviewer_User_ID" = null;
      new."Admin_Reviewed_At" = null;
      new."Admin_Decision_Reason" = null;
    elsif old_status_key in ('pendingstaffreview', 'rejected', 'appealed') and new_status_key = 'pendingadmindecision' then
      if coalesce(new."Linked_Event_Request_ID", 0) = 0 then
        raise exception 'Linked event request is required before submitting to admin decision.';
      end if;

      if old_status_key = 'rejected' and old_rejected_by_key = 'admin' then
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
      new."Rejected_By_Role" = null;
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
        new."Rejected_By_Role" = 'admin';
      else
        new."Rejected_By_Role" = null;
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

-- ---------------------------------------------------------------------------
-- Event request workflow: staff creates pending request; admin decides.
-- ---------------------------------------------------------------------------
create or replace function public.set_event_requests_updated_at()
returns trigger
language plpgsql
as $$
begin
  new."Updated_At" = now();
  return new;
end;
$$;

create or replace function public.enforce_event_request_insert_by_staff()
returns trigger
language plpgsql
as $$
declare
  actor_user_id integer;
  actor_role_key text;
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

  new."Staff_Prepared_By_User_ID" := coalesce(new."Staff_Prepared_By_User_ID", actor_user_id);
  new."Staff_Prepared_At" := coalesce(new."Staff_Prepared_At", now());
  new."Status" := coalesce(nullif(trim(new."Status"), ''), 'Pending Admin Approval');

  if lower(replace(replace(replace(coalesce(new."Status", ''), '_', ''), ' ', ''), '-', '')) <> 'pendingadminapproval' then
    raise exception 'New event requests must start as Pending Admin Approval.';
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
begin
  old_status_key := lower(replace(replace(replace(coalesce(old."Status", ''), '_', ''), ' ', ''), '-', ''));
  new_status_key := lower(replace(replace(replace(coalesce(new."Status", ''), '_', ''), ' ', ''), '-', ''));

  if old_status_key is not distinct from new_status_key then
    new."Updated_At" = now();
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
      new."Admin_Reviewed_At" = now();
      if new_status_key = 'rejected' and length(trim(coalesce(new."Admin_Decision_Reason", ''))) = 0 then
        raise exception 'Admin rejection reason is required for event requests.';
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

  new."Updated_At" = now();
  return new;
end;
$$;

create or replace function public.link_event_request_to_application()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public."Event_Applications" ea
  set
    "Linked_Event_Request_ID" = new."Event_Request_ID",
    "Status" = 'Pending Admin Decision',
    "Staff_Contact_Notes" = coalesce(new."Staff_Contact_Notes", ea."Staff_Contact_Notes"),
    "Staff_Contacted_At" = coalesce(ea."Staff_Contacted_At", now()),
    "Assigned_Staff_User_ID" = coalesce(new."Staff_Prepared_By_User_ID", ea."Assigned_Staff_User_ID")
  where ea."Event_Application_ID" = new."Event_Application_ID";

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
      "Admin_Reviewer_User_ID" = new."Admin_Reviewer_User_ID",
      "Rejected_By_Role" = case when new_status_key = 'rejected' then 'admin' else null end
    where ea."Event_Application_ID" = new."Event_Application_ID";
  end if;

  return new;
end;
$$;

drop trigger if exists trg_set_event_requests_updated_at on public."Event_Requests";
create trigger trg_set_event_requests_updated_at
  before update on public."Event_Requests"
  for each row
  execute function public.set_event_requests_updated_at();

drop trigger if exists trg_enforce_event_request_insert_by_staff on public."Event_Requests";
create trigger trg_enforce_event_request_insert_by_staff
  before insert on public."Event_Requests"
  for each row
  execute function public.enforce_event_request_insert_by_staff();

drop trigger if exists trg_enforce_event_request_workflow on public."Event_Requests";
create trigger trg_enforce_event_request_workflow
  before update on public."Event_Requests"
  for each row
  execute function public.enforce_event_request_workflow();

drop trigger if exists trg_link_event_request_to_application on public."Event_Requests";
create trigger trg_link_event_request_to_application
  after insert on public."Event_Requests"
  for each row
  execute function public.link_event_request_to_application();

drop trigger if exists trg_sync_event_request_decision_to_application on public."Event_Requests";
create trigger trg_sync_event_request_decision_to_application
  after update on public."Event_Requests"
  for each row
  execute function public.sync_event_request_decision_to_application();

-- ---------------------------------------------------------------------------
-- SMTP outbox queue (for external SMTP worker)
-- ---------------------------------------------------------------------------
create table if not exists public."SMTP_Email_Outbox" (
  "SMTP_Email_Outbox_ID" bigserial primary key,
  "Queue_Key" character varying(160) not null,
  "Source_Table" character varying(80) not null,
  "Source_ID" integer not null,
  "Notification_Type" character varying(80) not null,
  "Recipient_Email" character varying(255) not null,
  "Subject" character varying(255) not null,
  "Template_Key" character varying(80) not null,
  "Payload" jsonb not null default '{}'::jsonb,
  "Status" character varying(50) not null default 'Pending',
  "Attempt_Count" integer not null default 0,
  "Last_Error" text,
  "Next_Attempt_At" timestamp without time zone not null default now(),
  "Sent_At" timestamp without time zone,
  "Processed_By_User_ID" integer,
  "Created_By_User_ID" integer,
  "Created_At" timestamp without time zone not null default now(),
  "Updated_At" timestamp without time zone not null default now(),
  constraint smtp_email_outbox_queue_key_unique unique ("Queue_Key"),
  constraint smtp_email_outbox_processed_by_fkey
    foreign key ("Processed_By_User_ID") references public.users(user_id) on delete set null,
  constraint smtp_email_outbox_created_by_fkey
    foreign key ("Created_By_User_ID") references public.users(user_id) on delete set null,
  constraint smtp_email_outbox_notification_type_check
    check (
      lower(replace(replace(replace(coalesce("Notification_Type", ''), '_', ''), ' ', ''), '-', '')) in (
        'staffrejected',
        'staffendorsedpendingadmin',
        'adminapproved',
        'adminrejected'
      )
    ),
  constraint smtp_email_outbox_status_check
    check (
      lower(replace(replace(replace(coalesce("Status", ''), '_', ''), ' ', ''), '-', '')) in (
        'pending',
        'processing',
        'sent',
        'failed',
        'cancelled'
      )
    )
);

create index if not exists idx_smtp_email_outbox_status_next_attempt
  on public."SMTP_Email_Outbox" ("Status", "Next_Attempt_At");

create index if not exists idx_smtp_email_outbox_recipient_email
  on public."SMTP_Email_Outbox" ("Recipient_Email");

create or replace function public.set_smtp_email_outbox_updated_at()
returns trigger
language plpgsql
as $$
begin
  new."Updated_At" = now();
  return new;
end;
$$;

create or replace function public.resolve_event_application_recipient_email(
  applicant_email text,
  preferred_contact_method text,
  preferred_contact_detail text
)
returns text
language plpgsql
immutable
as $$
declare
  cleaned_applicant text;
  cleaned_detail text;
  preferred_key text;
begin
  cleaned_applicant := nullif(trim(coalesce(applicant_email, '')), '');
  if cleaned_applicant is not null and cleaned_applicant like '%_@_%._%' then
    return lower(cleaned_applicant);
  end if;

  preferred_key := lower(replace(replace(replace(coalesce(preferred_contact_method, ''), '_', ''), ' ', ''), '-', ''));
  cleaned_detail := nullif(trim(coalesce(preferred_contact_detail, '')), '');

  if preferred_key = 'email' and cleaned_detail is not null and cleaned_detail like '%_@_%._%' then
    return lower(cleaned_detail);
  end if;

  return null;
end;
$$;

create or replace function public.enqueue_smtp_email_outbox(
  queue_key text,
  source_table text,
  source_id integer,
  notification_type text,
  recipient_email text,
  subject text,
  template_key text,
  payload jsonb,
  created_by_user_id integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public."SMTP_Email_Outbox" (
    "Queue_Key",
    "Source_Table",
    "Source_ID",
    "Notification_Type",
    "Recipient_Email",
    "Subject",
    "Template_Key",
    "Payload",
    "Created_By_User_ID"
  )
  values (
    queue_key,
    source_table,
    source_id,
    notification_type,
    recipient_email,
    subject,
    template_key,
    coalesce(payload, '{}'::jsonb),
    created_by_user_id
  )
  on conflict ("Queue_Key") do nothing;
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
  new_rejected_by_key text;
  queue_key text;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  old_status_key := lower(replace(replace(replace(coalesce(old."Status", ''), '_', ''), ' ', ''), '-', ''));
  new_status_key := lower(replace(replace(replace(coalesce(new."Status", ''), '_', ''), ' ', ''), '-', ''));
  new_rejected_by_key := lower(replace(replace(replace(coalesce(new."Rejected_By_Role", ''), '_', ''), ' ', ''), '-', ''));

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

  if new_status_key = 'rejected' and new_rejected_by_key = 'staff' then
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
  elsif new_status_key = 'pendingadmindecision' and old_status_key in ('pendingstaffreview', 'rejected', 'appealed') and coalesce(new."Linked_Event_Request_ID", 0) > 0 then
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
  application_row public."Event_Applications"%rowtype;
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
    queue_key := 'er_admin_approved:' || new."Event_Request_ID"::text || ':' || to_char(coalesce(new."Admin_Reviewed_At", now()), 'YYYYMMDDHH24MISS');

    perform public.enqueue_smtp_email_outbox(
      queue_key,
      'Event_Requests',
      new."Event_Request_ID",
      'admin_approved',
      recipient_email,
      'Event Request Approved by Admin and Ready for Publishing',
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
        'message', 'Your event request has been approved by admin. Our team will contact you using your selected contact method with publication-ready details.'
      ),
      actor_user_id
    );
  elsif new_status_key = 'rejected' then
    queue_key := 'er_admin_rejected:' || new."Event_Request_ID"::text || ':' || to_char(coalesce(new."Admin_Reviewed_At", now()), 'YYYYMMDDHH24MISS');

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

drop trigger if exists trg_set_smtp_email_outbox_updated_at on public."SMTP_Email_Outbox";
create trigger trg_set_smtp_email_outbox_updated_at
  before update on public."SMTP_Email_Outbox"
  for each row
  execute function public.set_smtp_email_outbox_updated_at();

drop trigger if exists trg_enqueue_event_application_smtp_notifications on public."Event_Applications";
create trigger trg_enqueue_event_application_smtp_notifications
  after update on public."Event_Applications"
  for each row
  execute function public.enqueue_event_application_smtp_notifications();

drop trigger if exists trg_enqueue_event_request_smtp_notifications on public."Event_Requests";
create trigger trg_enqueue_event_request_smtp_notifications
  after update on public."Event_Requests"
  for each row
  execute function public.enqueue_event_request_smtp_notifications();

-- ---------------------------------------------------------------------------
-- RLS and grants
-- ---------------------------------------------------------------------------
alter table public."Event_Requests" enable row level security;

grant select, insert, update, delete on public."Event_Requests" to authenticated;

do $$
begin
  if to_regclass('public."Event_Requests_Event_Request_ID_seq"') is not null then
    grant usage, select on sequence public."Event_Requests_Event_Request_ID_seq" to authenticated;
  end if;
end
$$;

drop policy if exists event_requests_select_staff_admin on public."Event_Requests";
create policy event_requests_select_staff_admin
on public."Event_Requests"
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

drop policy if exists event_requests_insert_staff_only on public."Event_Requests";
create policy event_requests_insert_staff_only
on public."Event_Requests"
for insert
to authenticated
with check (
  exists (
    select 1
    from public.users u
    where u.auth_user_id = auth.uid()
      and public.normalize_app_role(u.role) = 'staff'
  )
);

drop policy if exists event_requests_update_staff_admin on public."Event_Requests";
create policy event_requests_update_staff_admin
on public."Event_Requests"
for update
to authenticated
using (
  exists (
    select 1
    from public.users u
    where u.auth_user_id = auth.uid()
      and public.is_staff_or_admin_role(u.role)
  )
)
with check (
  exists (
    select 1
    from public.users u
    where u.auth_user_id = auth.uid()
      and public.is_staff_or_admin_role(u.role)
  )
);

drop policy if exists event_requests_delete_admin_only on public."Event_Requests";
create policy event_requests_delete_admin_only
on public."Event_Requests"
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

-- Keep Event_Applications as requestor-facing intake only (no direct staff/admin insert).
drop policy if exists event_applications_insert_staff_admin on public."Event_Applications";

drop policy if exists event_applications_insert_authenticated_requestor on public."Event_Applications";
create policy event_applications_insert_authenticated_requestor
on public."Event_Applications"
for insert
to authenticated
with check (
  lower(replace(replace(replace(coalesce("Status", ''), '_', ''), ' ', ''), '-', '')) = 'pendingstaffreview'
  and "Staff_Reviewer_User_ID" is null
  and "Admin_Reviewer_User_ID" is null
  and not exists (
    select 1
    from public.users u
    where u.auth_user_id = auth.uid()
      and public.is_staff_or_admin_role(u.role)
  )
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

alter table public."SMTP_Email_Outbox" enable row level security;

revoke all on public."SMTP_Email_Outbox" from anon;
revoke all on public."SMTP_Email_Outbox" from authenticated;
grant select on public."SMTP_Email_Outbox" to authenticated;
grant select, insert, update, delete on public."SMTP_Email_Outbox" to service_role;

do $$
begin
  if to_regclass('public."SMTP_Email_Outbox_SMTP_Email_Outbox_ID_seq"') is not null then
    grant usage, select on sequence public."SMTP_Email_Outbox_SMTP_Email_Outbox_ID_seq" to service_role;
  end if;
end
$$;

drop policy if exists smtp_email_outbox_select_staff_admin on public."SMTP_Email_Outbox";
create policy smtp_email_outbox_select_staff_admin
on public."SMTP_Email_Outbox"
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

commit;
