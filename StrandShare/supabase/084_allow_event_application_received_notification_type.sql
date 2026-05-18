-- 084_allow_event_application_received_notification_type.sql
-- Fix SMTP outbox check constraint so INSERT from
-- enqueue_event_application_received_email() is accepted.

begin;

alter table public."SMTP_Email_Outbox"
  drop constraint if exists smtp_email_outbox_notification_type_check;

alter table public."SMTP_Email_Outbox"
  add constraint smtp_email_outbox_notification_type_check
  check (
    lower(replace(replace(replace(coalesce("Notification_Type", ''), '_', ''), ' ', ''), '-', '')) in (
      'eventapplicationreceived',
      'staffrejected',
      'staffendorsedpendingadmin',
      'adminapproved',
      'adminrejected'
    )
  );

commit;

