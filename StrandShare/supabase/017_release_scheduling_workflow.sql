-- 017_release_scheduling_workflow.sql
-- Adds release scheduling history and minimal current release columns.

create table if not exists public."Release_Schedules" (
  "Release_Schedule_ID" serial primary key,
  "Req_ID" int not null,
  "Hospital_ID" int not null,
  "Proposed_Release_Date" timestamp not null,
  "Proposed_By" int,
  "Proposal_Note" text,
  "Hospital_Decision" varchar(50) default 'Pending',
  "Hospital_Decision_By" int,
  "Hospital_Decision_At" timestamp,
  "Hospital_Decision_Reason" text,
  "Is_Current" boolean default true,
  "Created_At" timestamp default now(),
  "Updated_At" timestamp default now()
);

alter table public."Wig_Requests"
  add column if not exists "Release_Date" timestamp,
  add column if not exists "Release_Requested_By" int,
  add column if not exists "Release_Requested_At" timestamp;

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

alter table public."Wig_Requests"
  drop column if exists "Release_Workflow_Status",
  drop column if exists "Release_Workflow_Updated_By",
  drop column if exists "Release_Workflow_Updated_At";

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'Release_Schedules_Req_ID_fkey'
      and conrelid = 'public."Release_Schedules"'::regclass
  ) then
    alter table public."Release_Schedules"
      add constraint "Release_Schedules_Req_ID_fkey"
      foreign key ("Req_ID")
      references public."Wig_Requests" ("Req_ID");
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'Release_Schedules_Hospital_ID_fkey'
      and conrelid = 'public."Release_Schedules"'::regclass
  ) then
    alter table public."Release_Schedules"
      add constraint "Release_Schedules_Hospital_ID_fkey"
      foreign key ("Hospital_ID")
      references public."H-Representatives" ("Hospital_ID");
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'Release_Schedules_Proposed_By_fkey'
      and conrelid = 'public."Release_Schedules"'::regclass
  ) then
    alter table public."Release_Schedules"
      add constraint "Release_Schedules_Proposed_By_fkey"
      foreign key ("Proposed_By")
      references public.users(user_id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'Release_Schedules_Hospital_Decision_By_fkey'
      and conrelid = 'public."Release_Schedules"'::regclass
  ) then
    alter table public."Release_Schedules"
      add constraint "Release_Schedules_Hospital_Decision_By_fkey"
      foreign key ("Hospital_Decision_By")
      references public.users(user_id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'Wig_Requests_Release_Requested_By_fkey'
      and conrelid = 'public."Wig_Requests"'::regclass
  ) then
    alter table public."Wig_Requests"
      add constraint "Wig_Requests_Release_Requested_By_fkey"
      foreign key ("Release_Requested_By")
      references public.users(user_id);
  end if;

end
$$;

create index if not exists "idx_Release_Schedules_Req_ID"
  on public."Release_Schedules" ("Req_ID");

create index if not exists "idx_Release_Schedules_Hospital_ID"
  on public."Release_Schedules" ("Hospital_ID");

create index if not exists "idx_Release_Schedules_Is_Current"
  on public."Release_Schedules" ("Is_Current");

create index if not exists "idx_Release_Schedules_Hospital_Decision"
  on public."Release_Schedules" ("Hospital_Decision");

create unique index if not exists "idx_Release_Schedules_Current_Req_Unique"
  on public."Release_Schedules" ("Req_ID")
  where "Is_Current" = true;

drop index if exists public."idx_Wig_Requests_Release_Workflow_Status";

create index if not exists "idx_Wig_Requests_Release_Date"
  on public."Wig_Requests" ("Release_Date");
