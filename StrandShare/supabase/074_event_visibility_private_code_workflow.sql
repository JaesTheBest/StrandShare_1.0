-- 074_event_visibility_private_code_workflow.sql
-- Add private/public event type and private code delivery on admin approval.

begin;

alter table public."Event_Applications"
  add column if not exists "Event_Visibility" character varying(20);

update public."Event_Applications"
set "Event_Visibility" = 'Public'
where coalesce(trim("Event_Visibility"), '') = '';

alter table public."Event_Applications"
  alter column "Event_Visibility" set default 'Public';

alter table public."Event_Applications"
  drop constraint if exists event_applications_event_visibility_check;

alter table public."Event_Applications"
  add constraint event_applications_event_visibility_check
  check (
    lower(replace(replace(replace(coalesce("Event_Visibility", ''), '_', ''), ' ', ''), '-', '')) in ('public', 'private')
  );

alter table public."Event_Requests"
  add column if not exists "Event_Visibility" character varying(20),
  add column if not exists "Private_Event_Code" character varying(40),
  add column if not exists "Private_Event_Code_Sent_At" timestamp without time zone;

update public."Event_Requests" er
set "Event_Visibility" = coalesce(
  nullif(trim(er."Event_Visibility"), ''),
  nullif(trim(ea."Event_Visibility"), ''),
  'Public'
)
from public."Event_Applications" ea
where ea."Event_Application_ID" = er."Event_Application_ID";

update public."Event_Requests"
set "Event_Visibility" = 'Public'
where coalesce(trim("Event_Visibility"), '') = '';

alter table public."Event_Requests"
  alter column "Event_Visibility" set default 'Public';

alter table public."Event_Requests"
  drop constraint if exists event_requests_event_visibility_check;

alter table public."Event_Requests"
  add constraint event_requests_event_visibility_check
  check (
    lower(replace(replace(replace(coalesce("Event_Visibility", ''), '_', ''), ' ', ''), '-', '')) in ('public', 'private')
  );

alter table public."Event_Requests"
  drop constraint if exists event_requests_private_code_required_when_private_approved_check;

alter table public."Event_Requests"
  add constraint event_requests_private_code_required_when_private_approved_check
  check (
    lower(replace(replace(replace(coalesce("Status", ''), '_', ''), ' ', ''), '-', '')) <> 'approved'
    or lower(replace(replace(replace(coalesce("Event_Visibility", 'public'), '_', ''), ' ', ''), '-', '')) <> 'private'
    or nullif(trim(coalesce("Private_Event_Code", '')), '') is not null
  );

create unique index if not exists idx_event_requests_private_event_code_unique
  on public."Event_Requests" ("Private_Event_Code")
  where "Private_Event_Code" is not null;

create or replace function public.generate_private_event_code()
returns text
language plpgsql
as $$
declare
  generated text;
begin
  generated := upper(substr(md5(random()::text || clock_timestamp()::text || coalesce(auth.uid()::text, '')), 1, 10));
  return 'EVT-' || substr(generated, 1, 5) || '-' || substr(generated, 6, 5);
end;
$$;

create or replace function public.enforce_event_request_insert_by_staff()
returns trigger
language plpgsql
as $$
declare
  actor_user_id integer;
  actor_role_key text;
  application_visibility text;
  normalized_visibility text;
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
  new."Staff_Prepared_At" := coalesce(new."Staff_Prepared_At", now());
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

  new."Updated_At" = now();
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
    queue_key := 'er_admin_approved:' || new."Event_Request_ID"::text || ':' || to_char(coalesce(new."Admin_Reviewed_At", now()), 'YYYYMMDDHH24MISS');

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
      set "Private_Event_Code_Sent_At" = coalesce(er."Private_Event_Code_Sent_At", now())
      where er."Event_Request_ID" = new."Event_Request_ID"
        and er."Private_Event_Code_Sent_At" is null;
    end if;
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

commit;
