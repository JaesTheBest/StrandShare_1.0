-- 069_refresh_event_application_email_outbox_after_event_schema_refactor.sql
-- Recompile event application outbox trigger for Event_Name/Event_Title compatibility.
-- DEPRECATED: superseded by Auth invite-email flow only.
-- If this file was applied, run 070_disable_event_application_email_outbox_use_auth_invite_only.sql.

begin;

create or replace function public.resolve_event_application_email(
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

create or replace function public.enqueue_event_application_email_outbox()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id integer;
  recipient_email text;
  revision integer;
  event_name_value text;
  old_status_key text;
  new_status_key text;
  rejection_reason text;
begin
  recipient_email := public.resolve_event_application_email(
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

  revision := coalesce(new."Resubmission_Count", 0);
  event_name_value := coalesce(
    nullif(trim(to_jsonb(new) ->> 'Event_Name'), ''),
    nullif(trim(to_jsonb(new) ->> 'Event_Title'), ''),
    ''
  );

  if tg_op = 'UPDATE' and old."Staff_Contacted_At" is null and new."Staff_Contacted_At" is not null then
    insert into public."Event_Application_Email_Outbox" (
      "Event_Application_ID",
      "Queue_Key",
      "Notification_Type",
      "Recipient_Email",
      "Template_Key",
      "Payload",
      "Created_By_User_ID"
    )
    values (
      new."Event_Application_ID",
      'staff_contacted:v' || revision::text,
      'staff_contacted',
      recipient_email,
      'event_staff_contacted',
      jsonb_build_object(
        'event_application_id', new."Event_Application_ID",
        'event_name', event_name_value,
        'preferred_contact_method', coalesce(new."Preferred_Contact_Method", ''),
        'preferred_contact_detail', coalesce(new."Preferred_Contact_Detail", ''),
        'staff_contacted_at', new."Staff_Contacted_At",
        'staff_contact_notes', coalesce(new."Staff_Contact_Notes", ''),
        'workflow_revision', revision
      ),
      actor_user_id
    )
    on conflict ("Event_Application_ID", "Queue_Key") do nothing;
  end if;

  if tg_op = 'UPDATE' then
    old_status_key := lower(replace(replace(replace(coalesce(old."Status", ''), '_', ''), ' ', ''), '-', ''));
    new_status_key := lower(replace(replace(replace(coalesce(new."Status", ''), '_', ''), ' ', ''), '-', ''));

    if old_status_key <> new_status_key and new_status_key in ('approved', 'rejected') then
      rejection_reason := trim(coalesce(new."Admin_Decision_Reason", ''));

      insert into public."Event_Application_Email_Outbox" (
        "Event_Application_ID",
        "Queue_Key",
        "Notification_Type",
        "Recipient_Email",
        "Template_Key",
        "Payload",
        "Created_By_User_ID"
      )
      values (
        new."Event_Application_ID",
        case
          when new_status_key = 'approved' then 'admin_approved:v' || revision::text
          else 'admin_rejected:v' || revision::text
        end,
        case
          when new_status_key = 'approved' then 'admin_approved'
          else 'admin_rejected'
        end,
        recipient_email,
        case
          when new_status_key = 'approved' then 'event_admin_approved'
          else 'event_admin_rejected'
        end,
        jsonb_build_object(
          'event_application_id', new."Event_Application_ID",
          'event_name', event_name_value,
          'preferred_contact_method', coalesce(new."Preferred_Contact_Method", ''),
          'preferred_contact_detail', coalesce(new."Preferred_Contact_Detail", ''),
          'status', coalesce(new."Status", ''),
          'admin_decision_reason', case when new_status_key = 'rejected' then rejection_reason else '' end,
          'admin_reviewed_at', new."Admin_Reviewed_At",
          'workflow_revision', revision
        ),
        actor_user_id
      )
      on conflict ("Event_Application_ID", "Queue_Key") do nothing;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enqueue_event_application_email_outbox on public."Event_Applications";
create trigger trg_enqueue_event_application_email_outbox
  after insert or update on public."Event_Applications"
  for each row
  execute function public.enqueue_event_application_email_outbox();

commit;
