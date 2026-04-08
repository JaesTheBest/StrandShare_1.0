-- 020_align_patients_schema_with_user_links.sql
-- Align Patients with user-linked identity fields and drop legacy name columns.

create table if not exists public."Patients" (
  "Patient_ID" serial not null,
  "User_ID" integer null,
  "Hospital_ID" integer null,
  "Patient_Code" character varying(100) null,
  "Medical_Condition" character varying(255) null,
  "Patient_Picture" character varying(255) null,
  "Created_At" timestamp without time zone null default now(),
  "Updated_At" timestamp without time zone null default now(),
  "Date_of_Diagnosis" date null,
  "Guardian" character varying(255) null,
  "Guardian_Contact_Number" character varying(50) null,
  "Medical_Document" character varying(255) null,
  "Guardian_Relationship" character varying(100) null,
  constraint "Patients_pkey" primary key ("Patient_ID"),
  constraint "Patients_Patient_Code_key" unique ("Patient_Code"),
  constraint "Patients_User_ID_unique" unique ("User_ID"),
  constraint "Patients_Hospital_ID_fkey" foreign key ("Hospital_ID") references public."Hospitals" ("Hospital_ID"),
  constraint "Patients_User_ID_fkey" foreign key ("User_ID") references public.users (user_id)
) tablespace pg_default;

alter table public."Patients"
  add column if not exists "Date_of_Diagnosis" date null,
  add column if not exists "Guardian" character varying(255) null,
  add column if not exists "Guardian_Contact_Number" character varying(50) null,
  add column if not exists "Guardian_Relationship" character varying(100) null,
  add column if not exists "Medical_Document" character varying(255) null;

alter table public."Patients"
  alter column "Created_At" set default now(),
  alter column "Updated_At" set default now();

alter table public."Patients"
  drop column if exists "First_Name",
  drop column if exists "Middle_Name",
  drop column if exists "Last_Name",
  drop column if exists "Suffix",
  drop column if exists "Age",
  drop column if exists "Gender";

alter table public."Patients"
  drop constraint if exists "Patients_Hospital_ID_fkey",
  drop constraint if exists "Patients_User_ID_fkey",
  drop constraint if exists "Patients_Patient_Code_key",
  drop constraint if exists "Patients_User_ID_unique";

alter table public."Patients"
  add constraint "Patients_Hospital_ID_fkey"
    foreign key ("Hospital_ID")
    references public."Hospitals" ("Hospital_ID");

alter table public."Patients"
  add constraint "Patients_User_ID_fkey"
    foreign key ("User_ID")
    references public.users (user_id);

alter table public."Patients"
  add constraint "Patients_Patient_Code_key" unique ("Patient_Code");

alter table public."Patients"
  add constraint "Patients_User_ID_unique" unique ("User_ID");

create index if not exists "idx_Patients_Hospital_ID"
  on public."Patients" using btree ("Hospital_ID")
  tablespace pg_default;

create index if not exists "idx_Patients_User_ID"
  on public."Patients" using btree ("User_ID")
  tablespace pg_default;
