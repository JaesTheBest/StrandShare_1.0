-- 021_enforce_patient_code_pt6.sql
-- Enforce Patients.Patient_Code format: PT followed by exactly 6 digits.

alter table public."Patients"
  drop constraint if exists "patients_patient_code_pt6_chk";

alter table public."Patients"
  add constraint "patients_patient_code_pt6_chk"
  check ("Patient_Code" ~ '^PT[0-9]{6}$');

create unique index if not exists "idx_patients_patient_code_unique"
  on public."Patients" ("Patient_Code");
