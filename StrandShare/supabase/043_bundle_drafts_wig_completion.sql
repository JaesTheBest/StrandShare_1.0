-- 043_bundle_drafts_wig_completion.sql
-- Bundle drafts + wig completion flow.
--
-- Hair_Submission_Bundles status lifecycle:
--   Draft           (QA picked hairs, hasn't finalized yet; no donor notifications)
--   In Production   (finalized, waybill printed, wig is being made)
--   Wig Completed   (QA scanned waybill on Upload Wig Stocks + uploaded 3 photos)
--   Cancelled       (terminal, future use)
--
-- Wigs table is repurposed as the inventory of completed wigs:
--   Bundle_ID linked when QA completes a wig from a bundle.
--   Wig_Name, Hair_*, Total_Donated_Hairs, Added_By, Completed_At track the
--   completed wig before it is later allocated (Req_ID/Allocated_*).

-- ---------------------------------------------------------------------------
-- Hair_Submission_Bundles: drop old check, add columns, change default,
-- backfill old 'Pending' rows, install new check.
-- ---------------------------------------------------------------------------
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

alter table public."Hair_Submission_Bundles"
  add column if not exists "Wig_Front_Image_Path" character varying(500),
  add column if not exists "Wig_Side_Image_Path" character varying(500),
  add column if not exists "Wig_Top_Image_Path" character varying(500),
  add column if not exists "Draft_Submission_IDs" jsonb default '[]'::jsonb;

-- Migrate existing 'Pending' bundles (from migration 042) to 'In Production'
-- since they were created via the previous finalize-on-create flow.
update public."Hair_Submission_Bundles"
set "Status" = 'In Production'
where lower("Status") in ('pending');

-- Default for newly inserted bundles via createWigBundle (skip-draft path).
alter table public."Hair_Submission_Bundles"
  alter column "Status" set default 'In Production';

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

create index if not exists "idx_Hair_Submission_Bundles_Draft_Created_By"
  on public."Hair_Submission_Bundles" ("Created_By")
  where lower("Status") = 'draft';

-- ---------------------------------------------------------------------------
-- Wigs table: add bundle linkage + hair attributes + completion tracking.
-- ---------------------------------------------------------------------------
alter table public."Wigs"
  add column if not exists "Bundle_ID" integer null,
  add column if not exists "Wig_Name" character varying(255),
  add column if not exists "Hair_Length" numeric(5, 2),
  add column if not exists "Hair_Color" character varying(100),
  add column if not exists "Hair_Texture" character varying(100),
  add column if not exists "Hair_Density" character varying(100),
  add column if not exists "Total_Donated_Hairs" integer,
  add column if not exists "Added_By" integer,
  add column if not exists "Completed_At" timestamp without time zone;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'Wigs_Bundle_ID_fkey'
      and conrelid = 'public."Wigs"'::regclass
  ) then
    alter table public."Wigs"
      add constraint "Wigs_Bundle_ID_fkey"
      foreign key ("Bundle_ID")
      references public."Hair_Submission_Bundles"("Bundle_ID")
      on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'Wigs_Bundle_ID_unique'
      and conrelid = 'public."Wigs"'::regclass
  ) then
    alter table public."Wigs"
      add constraint "Wigs_Bundle_ID_unique"
      unique ("Bundle_ID");
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'Wigs_Added_By_fkey'
      and conrelid = 'public."Wigs"'::regclass
  ) then
    alter table public."Wigs"
      add constraint "Wigs_Added_By_fkey"
      foreign key ("Added_By")
      references public.users(user_id)
      on delete set null;
  end if;
end
$$;

create index if not exists "idx_Wigs_Bundle_ID" on public."Wigs" ("Bundle_ID");
create index if not exists "idx_Wigs_Added_By" on public."Wigs" ("Added_By");
create index if not exists "idx_Wigs_Completed_At" on public."Wigs" ("Completed_At" desc);

-- Wigs Updated_At trigger (only install if missing).
do $$
begin
  if not exists (
    select 1 from pg_proc where proname = 'set_wigs_updated_at'
  ) then
    create function public.set_wigs_updated_at()
    returns trigger
    language plpgsql
    as $fn$
    begin
      new."Updated_At" = now();
      return new;
    end;
    $fn$;
  end if;
end
$$;

drop trigger if exists trg_set_wigs_updated_at on public."Wigs";
create trigger trg_set_wigs_updated_at
  before update on public."Wigs"
  for each row
  execute function public.set_wigs_updated_at();
