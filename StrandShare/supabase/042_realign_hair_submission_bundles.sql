-- 042_realign_hair_submission_bundles.sql
-- Realign Hair_Submission_Bundles to the new bundling workflow:
--   * QA always creates bundles already-sealed (no Open state).
--   * Each bundle has its own waybill code (Submission_Code) for QR-scan
--     post-wig completion.
--   * Wig linkage to the existing Wigs table is deferred (drop Wig_ID).
--   * Sealed_At collapses into Created_At (since creation = sealing).

-- Drop dependent objects first.
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
  drop column if exists "Wig_ID",
  drop column if exists "Sealed_At";

alter table public."Hair_Submission_Bundles"
  add column if not exists "Updated_At" timestamp without time zone not null default now(),
  add column if not exists "Submission_Code" character varying(64) null;

alter table public."Hair_Submission_Bundles"
  alter column "Status" set default 'Pending';

-- Re-add the status check with the new lifecycle.
alter table public."Hair_Submission_Bundles"
  add constraint hair_submission_bundles_status_check
    check (lower("Status") in ('pending', 'wig created', 'wig_created', 'cancelled'));

-- Backfill Submission_Code for existing rows (if any).
update public."Hair_Submission_Bundles"
set "Submission_Code" = 'WB-' || to_char(coalesce("Created_At", now()), 'YYYY') || '-' || lpad("Bundle_ID"::text, 6, '0')
where "Submission_Code" is null;

create unique index if not exists "idx_Hair_Submission_Bundles_Submission_Code_unique"
  on public."Hair_Submission_Bundles" ("Submission_Code")
  where "Submission_Code" is not null;

-- Updated_At trigger: keep it fresh on every UPDATE.
create or replace function public.set_hair_submission_bundles_updated_at()
returns trigger
language plpgsql
as $$
begin
  new."Updated_At" = now();
  return new;
end;
$$;

drop trigger if exists trg_set_hair_submission_bundles_updated_at on public."Hair_Submission_Bundles";
create trigger trg_set_hair_submission_bundles_updated_at
  before update on public."Hair_Submission_Bundles"
  for each row
  execute function public.set_hair_submission_bundles_updated_at();
