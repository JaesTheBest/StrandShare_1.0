-- 070_disable_event_application_email_outbox_use_auth_invite_only.sql
-- Disable/remove DB outbox queue and rely on Auth invite email flow only.

begin;

-- Stop automatic queue inserts from event status updates.
drop trigger if exists trg_enqueue_event_application_email_outbox on public."Event_Applications";

-- Remove queue helper functions.
drop function if exists public.enqueue_event_application_email_outbox() cascade;
drop function if exists public.resolve_event_application_email(text, text, text) cascade;

-- Remove queue table and any dependent policy/index/trigger objects.
drop table if exists public."Event_Application_Email_Outbox" cascade;

-- Remove queue updated-at helper if no longer needed.
drop function if exists public.set_event_application_email_outbox_updated_at() cascade;

commit;
