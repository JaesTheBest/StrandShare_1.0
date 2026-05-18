-- 066_event_application_email_outbox.sql
-- Minimal outbound email queue for event applications (non-redundant with in-app notifications).
-- DEPRECATED: superseded by Auth invite-email flow only.
-- If this file was applied, run 070_disable_event_application_email_outbox_use_auth_invite_only.sql.

begin;

create table if not exists public."Event_Application_Email_Outbox" (
  "Email_Outbox_ID" bigserial primary key,
  "Event_Application_ID" integer not null,
  "Queue_Key" character varying(120) not null,
  "Notification_Type" character varying(50) not null,
  "Recipient_Email" character varying(255) not null,
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
  constraint event_application_email_outbox_event_application_fkey
    foreign key ("Event_Application_ID") references public."Event_Applications"("Event_Application_ID") on delete cascade,
  constraint event_application_email_outbox_processed_by_fkey
    foreign key ("Processed_By_User_ID") references public.users(user_id) on delete set null,
  constraint event_application_email_outbox_created_by_fkey
    foreign key ("Created_By_User_ID") references public.users(user_id) on delete set null,
  constraint event_application_email_outbox_notification_type_check
    check (
      lower(replace(replace(replace(coalesce("Notification_Type", ''), '_', ''), ' ', ''), '-', '')) in (
        'staffcontacted',
        'adminapproved',
        'adminrejected'
      )
    ),
  constraint event_application_email_outbox_status_check
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

create unique index if not exists idx_event_application_email_outbox_event_queue_key_unique
  on public."Event_Application_Email_Outbox" ("Event_Application_ID", "Queue_Key");

create index if not exists idx_event_application_email_outbox_status_next_attempt
  on public."Event_Application_Email_Outbox" ("Status", "Next_Attempt_At");

create index if not exists idx_event_application_email_outbox_recipient_email
  on public."Event_Application_Email_Outbox" ("Recipient_Email");

create or replace function public.set_event_application_email_outbox_updated_at()
returns trigger
language plpgsql
as $$
begin
  new."Updated_At" = now();
  return new;
end;
$$;

drop trigger if exists trg_set_event_application_email_outbox_updated_at on public."Event_Application_Email_Outbox";
create trigger trg_set_event_application_email_outbox_updated_at
  before update on public."Event_Application_Email_Outbox"
  for each row
  execute function public.set_event_application_email_outbox_updated_at();

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

alter table public."Event_Application_Email_Outbox" enable row level security;

revoke all on public."Event_Application_Email_Outbox" from anon;
revoke all on public."Event_Application_Email_Outbox" from authenticated;
grant select on public."Event_Application_Email_Outbox" to authenticated;

drop policy if exists event_application_email_outbox_select_admin on public."Event_Application_Email_Outbox";
create policy event_application_email_outbox_select_admin
on public."Event_Application_Email_Outbox"
for select
to authenticated
using (
  exists (
    select 1
    from public.users u
    where u.auth_user_id = auth.uid()
      and public.is_admin_role(u.role)
  )
);

grant select, insert, update on public."Event_Application_Email_Outbox" to service_role;

do $$
begin
  if to_regclass('public."Event_Application_Email_Outbox_Email_Outbox_ID_seq"') is not null then
    grant usage, select on sequence public."Event_Application_Email_Outbox_Email_Outbox_ID_seq" to service_role;
  end if;
end
$$;

commit;
