-- 077_add_applicant_valid_id_type_to_event_applications.sql
-- Persist selected PH valid ID type from public event application form.

begin;

alter table public."Event_Applications"
  add column if not exists "Applicant_Valid_ID_Type" character varying(80);

update public."Event_Applications"
set "Applicant_Valid_ID_Type" = coalesce(nullif(trim("Applicant_Valid_ID_Type"), ''), 'other_government')
where "Applicant_Valid_ID_Type" is null;

alter table public."Event_Applications"
  alter column "Applicant_Valid_ID_Type" set default 'other_government';

alter table public."Event_Applications"
  drop constraint if exists event_applications_valid_id_type_check;

alter table public."Event_Applications"
  add constraint event_applications_valid_id_type_check
  check (
    lower(replace(replace(replace(coalesce("Applicant_Valid_ID_Type", ''), '_', ''), ' ', ''), '-', '')) = any (
      array[
        'philsys'::text,
        'driverslicense'::text,
        'passport'::text,
        'umid'::text,
        'prc'::text,
        'postal'::text,
        'voters'::text,
        'seniorcitizen'::text,
        'othergovernment'::text
      ]
    )
  );

commit;
