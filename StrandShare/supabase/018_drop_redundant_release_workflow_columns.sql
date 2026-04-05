-- 018_drop_redundant_release_workflow_columns.sql
-- Cleanup migration for environments where 017 was applied before simplification.

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'Wig_Requests_Release_Workflow_Updated_By_fkey'
      and conrelid = 'public."Wig_Requests"'::regclass
  ) then
    alter table public."Wig_Requests"
      drop constraint "Wig_Requests_Release_Workflow_Updated_By_fkey";
  end if;
end
$$;

drop index if exists public."idx_Wig_Requests_Release_Workflow_Status";

alter table public."Wig_Requests"
  drop column if exists "Release_Workflow_Status",
  drop column if exists "Release_Workflow_Updated_By",
  drop column if exists "Release_Workflow_Updated_At";
