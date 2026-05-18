-- 068_refactor_event_application_form_schema.sql
-- Refactor Event_Applications for new public event request fields and proof uploads.

begin;

-- Ensure the workflow table exists before altering.
do $$
begin
  if to_regclass('public."Event_Applications"') is null then
    raise exception 'Table public."Event_Applications" does not exist. Run migration 064 first.';
  end if;
end
$$;

-- Rename legacy columns to current naming (idempotent and non-redundant).
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'Event_Applications'
      and column_name = 'Event_Title'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'Event_Applications'
      and column_name = 'Event_Name'
  ) then
    alter table public."Event_Applications"
      rename column "Event_Title" to "Event_Name";
  elsif exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'Event_Applications'
      and column_name = 'Event_Title'
  ) and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'Event_Applications'
      and column_name = 'Event_Name'
  ) then
    update public."Event_Applications"
    set "Event_Name" = coalesce(nullif(trim("Event_Name"), ''), nullif(trim("Event_Title"), ''))
    where "Event_Name" is null or length(trim("Event_Name")) = 0;

    alter table public."Event_Applications"
      drop column "Event_Title";
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'Event_Applications'
      and column_name = 'Venue_Name'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'Event_Applications'
      and column_name = 'Venue_Address'
  ) then
    alter table public."Event_Applications"
      rename column "Venue_Name" to "Venue_Address";
  elsif exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'Event_Applications'
      and column_name = 'Venue_Name'
  ) and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'Event_Applications'
      and column_name = 'Venue_Address'
  ) then
    update public."Event_Applications"
    set "Venue_Address" = coalesce(nullif(trim("Venue_Address"), ''), nullif(trim("Venue_Name"), ''))
    where "Venue_Address" is null or length(trim("Venue_Address")) = 0;

    alter table public."Event_Applications"
      drop column "Venue_Name";
  end if;
end
$$;

-- Add new applicant and proof columns.
alter table public."Event_Applications"
  add column if not exists "Applicant_First_Name" character varying(100),
  add column if not exists "Applicant_Middle_Name" character varying(100),
  add column if not exists "Applicant_Last_Name" character varying(100),
  add column if not exists "Applicant_Gender" character varying(50),
  add column if not exists "Applicant_Valid_ID_Path" character varying(500),
  add column if not exists "Applicant_Valid_ID_URL" character varying(500),
  add column if not exists "Event_Place_Photo_Path" character varying(500),
  add column if not exists "Event_Place_Photo_URL" character varying(500),
  add column if not exists "Social_Page_URL" character varying(500);

-- Backfill split-name columns from legacy full name when available.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'Event_Applications'
      and column_name = 'Applicant_Full_Name'
  ) then
    with parsed as (
      select
        ea."Event_Application_ID",
        regexp_split_to_array(
          regexp_replace(trim(coalesce(ea."Applicant_Full_Name", '')), '\\s+', ' ', 'g'),
          ' '
        ) as name_parts
      from public."Event_Applications" ea
    )
    update public."Event_Applications" ea
    set
      "Applicant_First_Name" = coalesce(
        nullif(trim(ea."Applicant_First_Name"), ''),
        nullif(trim(parsed.name_parts[1]), '')
      ),
      "Applicant_Last_Name" = coalesce(
        nullif(trim(ea."Applicant_Last_Name"), ''),
        case
          when array_length(parsed.name_parts, 1) >= 2
            then nullif(trim(parsed.name_parts[array_length(parsed.name_parts, 1)]), '')
          else null
        end
      ),
      "Applicant_Middle_Name" = coalesce(
        nullif(trim(ea."Applicant_Middle_Name"), ''),
        case
          when array_length(parsed.name_parts, 1) > 2
            then nullif(trim(array_to_string(parsed.name_parts[2:array_length(parsed.name_parts, 1) - 1], ' ')), '')
          else null
        end
      )
    from parsed
    where ea."Event_Application_ID" = parsed."Event_Application_ID";

    alter table public."Event_Applications"
      drop column "Applicant_Full_Name";
  end if;
end
$$;

-- Remove retired requester group field.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'Event_Applications'
      and column_name = 'Requesting_Group_Name'
  ) then
    alter table public."Event_Applications"
      drop column "Requesting_Group_Name";
  end if;
end
$$;

-- Keep contact methods strict and aligned with the new public form.
update public."Event_Applications"
set "Preferred_Contact_Method" = 'messenger'
where lower(replace(replace(replace(coalesce("Preferred_Contact_Method", ''), '_', ''), ' ', ''), '-', '')) in (
  'viber',
  'whatsapp'
);

alter table public."Event_Applications"
  drop constraint if exists event_applications_preferred_contact_method_check;

alter table public."Event_Applications"
  add constraint event_applications_preferred_contact_method_check
  check (
    lower(replace(replace(replace(coalesce("Preferred_Contact_Method", ''), '_', ''), ' ', ''), '-', '')) in (
      'email',
      'phone',
      'call',
      'phonecall',
      'sms',
      'messenger'
    )
  );

alter table public."Event_Applications"
  drop constraint if exists event_applications_proposed_end_not_before_start;

alter table public."Event_Applications"
  add constraint event_applications_proposed_end_not_before_start
  check (
    "Proposed_Start_At" is null
    or "Proposed_End_At" is null
    or "Proposed_End_At" >= "Proposed_Start_At"
  );

-- Require at least 7 days lead time for newly entered schedule values.
create or replace function public.validate_event_application_schedule()
returns trigger
language plpgsql
as $$
declare
  minimum_start timestamp without time zone;
begin
  minimum_start := date_trunc('day', timezone('Asia/Manila', now())) + interval '7 days';

  if new."Proposed_Start_At" is not null
     and (tg_op = 'INSERT' or new."Proposed_Start_At" is distinct from old."Proposed_Start_At") then
    if new."Proposed_Start_At" < minimum_start then
      raise exception 'Proposed start must be at least 7 days from today.';
    end if;
  end if;

  if new."Proposed_Start_At" is not null
     and new."Proposed_End_At" is not null
     and new."Proposed_End_At" < new."Proposed_Start_At" then
    raise exception 'Proposed end cannot be earlier than proposed start.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_event_application_schedule on public."Event_Applications";
create trigger trg_validate_event_application_schedule
  before insert or update on public."Event_Applications"
  for each row
  execute function public.validate_event_application_schedule();

-- File uploads for public event application proofs.
insert into storage.buckets (id, name, public)
values ('event_application_assets', 'event_application_assets', true)
on conflict (id) do update
set public = excluded.public;

do $$
declare
  policy_row record;
begin
  for policy_row in
    select policyname
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname ilike '%event_application_assets%'
  loop
    execute format('drop policy if exists %I on storage.objects', policy_row.policyname);
  end loop;
end
$$;

create policy event_application_assets_open_insert
  on storage.objects
  for insert
  to public
  with check (bucket_id = 'event_application_assets');

create policy event_application_assets_open_select
  on storage.objects
  for select
  to public
  using (bucket_id = 'event_application_assets');

commit;
