-- 060_wig_allocation_status_and_code.sql
-- Align Wig_Requests/Wigs lifecycle with allocation + release flow.
--
-- Request status lifecycle:
--   Pending -> Accepted - Wig Allocated / Accepted - No Wig Available
--   -> In Production -> To Be Release -> Releasing -> Released
--
-- Wig status lifecycle:
--   In Production -> Ready for Release -> Wig Allocated -> Releasing -> Released
--
-- Also restore Wig_Code and auto-source it from bundle waybill Submission_Code.

-- ---------------------------------------------------------------------------
-- Wigs: bring back Wig_Code + index
-- ---------------------------------------------------------------------------
alter table public."Wigs"
  add column if not exists "Req_ID" integer null,
  add column if not exists "Wig_Code" character varying(100) null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'Wigs_Req_ID_fkey'
      and conrelid = 'public."Wigs"'::regclass
  ) then
    alter table public."Wigs"
      add constraint "Wigs_Req_ID_fkey"
      foreign key ("Req_ID")
      references public."Wig_Requests" ("Req_ID")
      on delete set null;
  end if;
end
$$;

create index if not exists "idx_Wigs_Req_ID"
  on public."Wigs" ("Req_ID");

create unique index if not exists "idx_Wigs_Wig_Code_unique"
  on public."Wigs" ("Wig_Code")
  where "Wig_Code" is not null;

-- Backfill Wig_Code from bundle Submission_Code (waybill code) when possible.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'Hair_Submission_Bundles'
      and column_name = 'Submission_Code'
  ) then
    execute '
      update public."Wigs" w
      set "Wig_Code" = coalesce(w."Wig_Code", b."Submission_Code")
      from public."Hair_Submission_Bundles" b
      where w."Bundle_ID" = b."Bundle_ID"
        and coalesce(w."Wig_Code", '''') = ''''
        and coalesce(b."Submission_Code", '''') <> ''''
    ';
  end if;
end
$$;

-- Fallback code if bundle submission code is missing.
update public."Wigs"
set "Wig_Code" = 'WIG-' || to_char(coalesce("Created_At", now()), 'YYYY') || '-' || lpad("Wig_ID"::text, 6, '0')
where coalesce("Wig_Code", '') = '';

-- Keep code aligned on insert/update when Bundle_ID changes.
create or replace function public.set_wig_code_from_bundle_submission()
returns trigger
language plpgsql
as $fn$
declare
  bundle_code text;
begin
  if new."Bundle_ID" is not null then
    begin
      select b."Submission_Code" into bundle_code
      from public."Hair_Submission_Bundles" b
      where b."Bundle_ID" = new."Bundle_ID"
      limit 1;
    exception
      when undefined_column then
        bundle_code := null;
    end;

    if coalesce(bundle_code, '') <> '' then
      new."Wig_Code" := bundle_code;
    end if;
  end if;

  if coalesce(new."Wig_Code", '') = '' then
    new."Wig_Code" := 'WIG-' || to_char(coalesce(new."Created_At", now()), 'YYYY') || '-' || lpad(coalesce(new."Wig_ID", 0)::text, 6, '0');
  end if;

  return new;
end;
$fn$;

drop trigger if exists trg_set_wig_code_from_bundle_submission on public."Wigs";
create trigger trg_set_wig_code_from_bundle_submission
  before insert or update of "Bundle_ID", "Wig_Code"
  on public."Wigs"
  for each row
  execute function public.set_wig_code_from_bundle_submission();

-- ---------------------------------------------------------------------------
-- Wigs: add Wig Allocated to status model.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public."Wigs"'::regclass
      and conname = 'wigs_wig_status_check'
  ) then
    alter table public."Wigs" drop constraint wigs_wig_status_check;
  end if;
end
$$;

update public."Wigs"
set "Wig_Status" =
  case
    when lower(coalesce("Wig_Status", '')) in ('in production', 'in_production') then 'In Production'
    when lower(coalesce("Wig_Status", '')) in ('ready for release', 'ready_for_release', 'available') then 'Ready for Release'
    when lower(coalesce("Wig_Status", '')) in ('wig allocated', 'wig_allocated', 'allocated') then 'Wig Allocated'
    when lower(coalesce("Wig_Status", '')) in ('releasing') then 'Releasing'
    when lower(coalesce("Wig_Status", '')) in ('released') then 'Released'
    else case when "Completed_At" is null then 'In Production' else 'Ready for Release' end
  end;

alter table public."Wigs"
  alter column "Wig_Status" set default 'In Production';

alter table public."Wigs"
  add constraint wigs_wig_status_check
  check (
    lower(coalesce("Wig_Status", '')) in (
      'in production',
      'in_production',
      'ready for release',
      'ready_for_release',
      'wig allocated',
      'wig_allocated',
      'releasing',
      'released'
    )
  );

-- ---------------------------------------------------------------------------
-- Wig_Requests: normalize + enforce Released (not Completed).
-- ---------------------------------------------------------------------------
do $$
declare
  constraint_row record;
begin
  for constraint_row in
    select conname
    from pg_constraint
    where conrelid = 'public."Wig_Requests"'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%Status%'
  loop
    execute format('alter table public."Wig_Requests" drop constraint %I', constraint_row.conname);
  end loop;
end
$$;

update public."Wig_Requests"
set "Status" =
  case
    when lower(coalesce("Status", '')) in ('pending', 'pending review', 'pendingreview') then 'Pending'
    when lower(coalesce("Status", '')) in ('accepted - wig allocated', 'acceptedwigallocated', 'accepted_allocated', 'allocated') then 'Accepted - Wig Allocated'
    when lower(coalesce("Status", '')) in ('accepted - no wig available', 'acceptednowigavailable', 'accepted_no_wig') then 'Accepted - No Wig Available'
    when lower(coalesce("Status", '')) in ('in production', 'in_production') then 'In Production'
    when lower(coalesce("Status", '')) in ('to be release', 'to_be_release', 'ready for release') then 'To Be Release'
    when lower(coalesce("Status", '')) in ('releasing') then 'Releasing'
    when lower(coalesce("Status", '')) in ('released', 'completed', 'complete', 'done') then 'Released'
    when lower(coalesce("Status", '')) in ('rejected') then 'Rejected'
    when lower(coalesce("Status", '')) in ('cancelled', 'canceled') then 'Cancelled'
    else 'Pending'
  end;

alter table public."Wig_Requests"
  add constraint wig_requests_status_check
  check (
    lower(coalesce("Status", '')) in (
      'pending',
      'accepted - wig allocated',
      'accepted - no wig available',
      'in production',
      'to be release',
      'releasing',
      'released',
      'rejected',
      'cancelled'
    )
  );

create index if not exists "idx_Wig_Requests_Status"
  on public."Wig_Requests" ("Status");

-- ---------------------------------------------------------------------------
-- RLS: allow staff/superadmin/qastylist to manage wigs for allocation flow.
-- ---------------------------------------------------------------------------
alter table public."Wigs" enable row level security;

drop policy if exists wigs_qa_stylist_all on public."Wigs";
drop policy if exists wigs_staff_superadmin_qastylist_all on public."Wigs";
create policy wigs_staff_superadmin_qastylist_all
  on public."Wigs"
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.users u
      where u.auth_user_id = auth.uid()
        and lower(replace(replace(replace(coalesce(u.role, ''), '_', ''), ' ', ''), '-', ''))
          in ('qastylist', 'staff', 'superadmin')
    )
  )
  with check (
    exists (
      select 1
      from public.users u
      where u.auth_user_id = auth.uid()
        and lower(replace(replace(replace(coalesce(u.role, ''), '_', ''), ' ', ''), '-', ''))
          in ('qastylist', 'staff', 'superadmin')
    )
  );
