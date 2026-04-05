-- 012_prevent_duplicate_patient_user_links.sql
-- Enforce one-to-one linking between users.user_id and Patients.User_ID.

do $$
begin
  if exists (
    select 1
    from public."Patients"
    where "User_ID" is not null
    group by "User_ID"
    having count(*) > 1
  ) then
    raise exception using
      message = 'Cannot enforce unique Patients.User_ID because duplicate linked users already exist.',
      detail = 'Resolve duplicate User_ID values in public."Patients" before running this migration.';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'Patients_User_ID_unique'
      and conrelid = 'public."Patients"'::regclass
  ) then
    alter table public."Patients"
      add constraint "Patients_User_ID_unique" unique ("User_ID");
  end if;
end $$;
