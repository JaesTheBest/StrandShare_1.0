-- 082_force_utc8_workflow_timestamps.sql
-- Ensure all workflow timestamp columns on Event_Applications and
-- Event_Requests use Asia/Manila (UTC+8 / PHT) wall-clock:
--   1) Switch column DEFAULTs from now() (UTC) to timezone('Asia/Manila', now()).
--   2) Backfill existing rows that were stored under the old UTC defaults by
--      shifting them forward 8 hours.

begin;

-- ---------------------------------------------------------------------------
-- 1) Update DEFAULTs so future inserts land in Manila wall-clock
-- ---------------------------------------------------------------------------

alter table public."Event_Applications"
  alter column "Created_At" set default timezone('Asia/Manila', now()),
  alter column "Updated_At" set default timezone('Asia/Manila', now());

alter table public."Event_Requests"
  alter column "Created_At" set default timezone('Asia/Manila', now()),
  alter column "Updated_At" set default timezone('Asia/Manila', now()),
  alter column "Staff_Prepared_At" set default timezone('Asia/Manila', now());

-- ---------------------------------------------------------------------------
-- 2) Backfill existing rows: shift UTC values forward 8h to Manila wall-clock
--    Suspend user triggers so workflow validation and SMTP outbox enqueue
--    logic does not re-fire during the data shift.
-- ---------------------------------------------------------------------------

set local session_replication_role = replica;

-- --- Event_Applications ---
-- When Updated_At still equals Created_At, the row was never updated and both
-- columns hold the old UTC default. Shift Updated_At in those cases only;
-- otherwise the post-076 UPDATE trigger already corrected it to Manila.
update public."Event_Applications"
set "Updated_At" = "Updated_At" + interval '8 hours'
where "Created_At" is not null
  and "Updated_At" = "Created_At";

update public."Event_Applications"
set "Created_At" = "Created_At" + interval '8 hours'
where "Created_At" is not null;

update public."Event_Applications"
set "Staff_Contacted_At" = "Staff_Contacted_At" + interval '8 hours'
where "Staff_Contacted_At" is not null;

update public."Event_Applications"
set "Staff_Reviewed_At" = "Staff_Reviewed_At" + interval '8 hours'
where "Staff_Reviewed_At" is not null;

update public."Event_Applications"
set "Staff_Rejected_At" = "Staff_Rejected_At" + interval '8 hours'
where "Staff_Rejected_At" is not null;

-- --- Event_Requests ---
update public."Event_Requests"
set "Updated_At" = "Updated_At" + interval '8 hours'
where "Created_At" is not null
  and "Updated_At" = "Created_At";

update public."Event_Requests"
set "Created_At" = "Created_At" + interval '8 hours'
where "Created_At" is not null;

update public."Event_Requests"
set "Staff_Prepared_At" = "Staff_Prepared_At" + interval '8 hours'
where "Staff_Prepared_At" is not null;

update public."Event_Requests"
set "Admin_Reviewed_At" = "Admin_Reviewed_At" + interval '8 hours'
where "Admin_Reviewed_At" is not null;

-- session_replication_role is automatically restored at COMMIT.

commit;
