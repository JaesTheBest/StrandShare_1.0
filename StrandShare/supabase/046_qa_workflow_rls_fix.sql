-- 046_qa_workflow_rls_fix.sql
-- Adds permissive `authenticated` policies to every table in the QA workflow
-- that previously had RLS turned on (via dashboard or otherwise) but no
-- policies, which silently rejected every write.
--
-- Same shape as Hair_Submission_Bundles' existing
-- `hair_submission_bundles_authenticated_all` policy:
--   for all to authenticated using (true) with check (true)
--
-- Safe to run repeatedly. Tighten later via per-role policies if needed.

-- Wigs ---------------------------------------------------------------------
alter table public."Wigs" enable row level security;
drop policy if exists wigs_authenticated_all on public."Wigs";
create policy wigs_authenticated_all
  on public."Wigs"
  for all
  to authenticated
  using (true)
  with check (true);
grant select, insert, update, delete on public."Wigs" to authenticated;
do $$
begin
  if to_regclass('public."Wigs_Wig_ID_seq"') is not null then
    grant usage, select on sequence public."Wigs_Wig_ID_seq" to authenticated;
  end if;
end
$$;

-- Hair_Submissions ---------------------------------------------------------
alter table public."Hair_Submissions" enable row level security;
drop policy if exists hair_submissions_authenticated_all on public."Hair_Submissions";
create policy hair_submissions_authenticated_all
  on public."Hair_Submissions"
  for all
  to authenticated
  using (true)
  with check (true);
grant select, insert, update, delete on public."Hair_Submissions" to authenticated;
do $$
begin
  if to_regclass('public."Hair_Submissions_Submission_ID_seq"') is not null then
    grant usage, select on sequence public."Hair_Submissions_Submission_ID_seq" to authenticated;
  end if;
end
$$;

-- Hair_Submission_Details --------------------------------------------------
alter table public."Hair_Submission_Details" enable row level security;
drop policy if exists hair_submission_details_authenticated_all on public."Hair_Submission_Details";
create policy hair_submission_details_authenticated_all
  on public."Hair_Submission_Details"
  for all
  to authenticated
  using (true)
  with check (true);
grant select, insert, update, delete on public."Hair_Submission_Details" to authenticated;
do $$
begin
  if to_regclass('public."Hair_Submission_Details_Submission_Detail_ID_seq"') is not null then
    grant usage, select on sequence public."Hair_Submission_Details_Submission_Detail_ID_seq" to authenticated;
  end if;
end
$$;

-- Hair_Submission_Images (in case it has RLS without policies too) ---------
alter table public."Hair_Submission_Images" enable row level security;
drop policy if exists hair_submission_images_authenticated_all on public."Hair_Submission_Images";
create policy hair_submission_images_authenticated_all
  on public."Hair_Submission_Images"
  for all
  to authenticated
  using (true)
  with check (true);
grant select, insert, update, delete on public."Hair_Submission_Images" to authenticated;
do $$
begin
  if to_regclass('public."Hair_Submission_Images_Image_ID_seq"') is not null then
    grant usage, select on sequence public."Hair_Submission_Images_Image_ID_seq" to authenticated;
  end if;
end
$$;

-- Hair_Submission_Logistics (carried over from earlier schema) -------------
do $$
begin
  if to_regclass('public."Hair_Submission_Logistics"') is not null then
    execute 'alter table public."Hair_Submission_Logistics" enable row level security';
    execute 'drop policy if exists hair_submission_logistics_authenticated_all on public."Hair_Submission_Logistics"';
    execute 'create policy hair_submission_logistics_authenticated_all on public."Hair_Submission_Logistics" for all to authenticated using (true) with check (true)';
    execute 'grant select, insert, update, delete on public."Hair_Submission_Logistics" to authenticated';
  end if;
end
$$;

-- Hair_Bundle_Tracking_History ---------------------------------------------
alter table public."Hair_Bundle_Tracking_History" enable row level security;
drop policy if exists hair_bundle_tracking_history_authenticated_all on public."Hair_Bundle_Tracking_History";
create policy hair_bundle_tracking_history_authenticated_all
  on public."Hair_Bundle_Tracking_History"
  for all
  to authenticated
  using (true)
  with check (true);
grant select, insert, update, delete on public."Hair_Bundle_Tracking_History" to authenticated;
do $$
begin
  if to_regclass('public."Hair_Bundle_Tracking_History_Tracking_ID_seq"') is not null then
    grant usage, select on sequence public."Hair_Bundle_Tracking_History_Tracking_ID_seq" to authenticated;
  end if;
end
$$;
