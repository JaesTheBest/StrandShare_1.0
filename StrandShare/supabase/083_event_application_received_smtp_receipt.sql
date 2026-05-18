-- 083_event_application_received_smtp_receipt.sql
-- Send the applicant a receipt email immediately after an Event Application is
-- submitted. The two later milestone emails (staff endorsement -> admin, admin
-- approval / rejection) are already wired up by 076_*.sql; this migration adds
-- the missing "we received your application" step.

begin;

-- ---------------------------------------------------------------------------
-- Trigger function: enqueue receipt email on INSERT
-- ---------------------------------------------------------------------------

create or replace function public.enqueue_event_application_received_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id integer;
  recipient_email text;
  queue_key text;
  manila_now timestamp without time zone := timezone('Asia/Manila', now());
begin
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

  queue_key := 'ea_received:' || new."Event_Application_ID"::text;

  perform public.enqueue_smtp_email_outbox(
    queue_key,
    'Event_Applications',
    new."Event_Application_ID",
    'event_application_received',
    recipient_email,
    'Event Application Received - We''ll Be in Touch Shortly',
    'event_application_received',
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
      'preferred_contact_method', coalesce(new."Preferred_Contact_Method", ''),
      'preferred_contact_detail', coalesce(new."Preferred_Contact_Detail", ''),
      'applicant_first_name', coalesce(new."Applicant_First_Name", ''),
      'applicant_last_name', coalesce(new."Applicant_Last_Name", ''),
      'submitted_at', coalesce(new."Created_At", manila_now),
      'message', 'Thank you for submitting your event application. Our staff will reach out using your preferred contact method to confirm the details. If anything needs to be edited - date, venue, contact, or any other detail - just mention it when our staff contacts you, or reply to this email so we can pass it on before review begins.'
    ),
    actor_user_id
  );

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Trigger: fire after every successful INSERT on Event_Applications
-- ---------------------------------------------------------------------------

drop trigger if exists trg_enqueue_event_application_received_email on public."Event_Applications";

create trigger trg_enqueue_event_application_received_email
after insert on public."Event_Applications"
for each row
execute function public.enqueue_event_application_received_email();

commit;
