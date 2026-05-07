-- 045_fix_bundle_status_backfill.sql
-- Migration 043 failed adding hair_submission_bundles_status_check because
-- legacy rows still carried older Status values (Open/Sealed from 040,
-- Wig Created from 042, etc.). This script normalizes every row to one of:
--   Draft / In Production / Wig Completed / Cancelled
-- then re-applies the check constraint. Idempotent.

-- Drop the constraint if it exists (in case 043 partially applied).
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'hair_submission_bundles_status_check'
      and conrelid = 'public."Hair_Submission_Bundles"'::regclass
  ) then
    alter table public."Hair_Submission_Bundles"
      drop constraint hair_submission_bundles_status_check;
  end if;
end
$$;

-- Make sure the new columns from 043 actually exist (cheap if already added).
alter table public."Hair_Submission_Bundles"
  add column if not exists "Wig_Front_Image_Path" character varying(500),
  add column if not exists "Wig_Side_Image_Path" character varying(500),
  add column if not exists "Wig_Top_Image_Path" character varying(500),
  add column if not exists "Draft_Submission_IDs" jsonb default '[]'::jsonb;

-- Default for new rows.
alter table public."Hair_Submission_Bundles"
  alter column "Status" set default 'In Production';

-- Normalize every existing row to a canonical Status value.
update public."Hair_Submission_Bundles"
set "Status" = case lower(coalesce("Status", ''))
    when 'draft'          then 'Draft'
    when 'pending'        then 'In Production'
    when 'open'           then 'In Production'
    when 'sealed'         then 'In Production'
    when 'in production'  then 'In Production'
    when 'in_production'  then 'In Production'
    when 'wig created'    then 'Wig Completed'
    when 'wig_created'    then 'Wig Completed'
    when 'wig completed'  then 'Wig Completed'
    when 'wig_completed'  then 'Wig Completed'
    when 'cancelled'      then 'Cancelled'
    when 'canceled'       then 'Cancelled'
    else 'In Production'  -- safe fallback for any unexpected value
  end;

-- Re-apply the new check constraint.
alter table public."Hair_Submission_Bundles"
  add constraint hair_submission_bundles_status_check
  check (
    lower("Status") in (
      'draft',
      'in production',
      'in_production',
      'wig completed',
      'wig_completed',
      'cancelled'
    )
  );
