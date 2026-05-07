-- 039_refactor_hair_logistics_and_attendee_workflow.sql
-- Simplify Hair_Submissions and Hair_Submission_Details to the new intake shape.
-- Images stay in Hair_Submission_Images so each detail can carry front/top/side
-- angle photos. Logistics + tracking history tables are left untouched.

-- Hair_Submissions: keep only Submission_ID, User_ID, Donation_Drive_ID,
-- Status, Created_At, Updated_At. Drop everything else.
alter table public."Hair_Submissions" drop column if exists "Organization_ID" cascade;
alter table public."Hair_Submissions" drop column if exists "Delivery_Method" cascade;
alter table public."Hair_Submissions" drop column if exists "Pickup_Request" cascade;
alter table public."Hair_Submissions" drop column if exists "Submission_Code" cascade;
alter table public."Hair_Submissions" drop column if exists "Donation_Source" cascade;
alter table public."Hair_Submissions" drop column if exists "Bundle_Quantity" cascade;
alter table public."Hair_Submissions" drop column if exists "Donor_Notes" cascade;

-- Hair_Submission_Details: drop Bundle_Number, replace Updated_At with
-- Updated_By (user FK). Created_At and the rest stay as-is.
alter table public."Hair_Submission_Details" drop column if exists "Bundle_Number" cascade;
alter table public."Hair_Submission_Details" drop column if exists "Updated_At" cascade;

alter table public."Hair_Submission_Details" add column if not exists "Updated_By" integer null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'hair_submission_details_updated_by_fkey'
      and conrelid = 'public."Hair_Submission_Details"'::regclass
  ) then
    alter table public."Hair_Submission_Details"
      add constraint hair_submission_details_updated_by_fkey
      foreign key ("Updated_By")
      references public.users (user_id)
      on delete set null;
  end if;
end
$$;
