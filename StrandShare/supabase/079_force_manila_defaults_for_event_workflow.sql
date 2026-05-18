-- 079_force_manila_defaults_for_event_workflow.sql
-- Ensure insert-time timestamps are stored in UTC+8 (Asia/Manila)
-- for event intake/request/email workflow tables.

begin;

-- Event applications
alter table public."Event_Applications"
  alter column "Created_At" set default timezone('Asia/Manila', now()),
  alter column "Updated_At" set default timezone('Asia/Manila', now());

-- Event requests
alter table public."Event_Requests"
  alter column "Created_At" set default timezone('Asia/Manila', now()),
  alter column "Updated_At" set default timezone('Asia/Manila', now()),
  alter column "Staff_Prepared_At" set default timezone('Asia/Manila', now());

-- SMTP outbox
alter table public."SMTP_Email_Outbox"
  alter column "Created_At" set default timezone('Asia/Manila', now()),
  alter column "Updated_At" set default timezone('Asia/Manila', now()),
  alter column "Next_Attempt_At" set default timezone('Asia/Manila', now());

commit;
