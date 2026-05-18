-- Add hospital ownership/head details captured during partner hospital onboarding.

alter table if exists public."Hospitals"
  add column if not exists "Hospital_Head_Name" character varying(255),
  add column if not exists "Hospital_Head_Title" character varying(255),
  add column if not exists "Hospital_Head_Contact_Number" character varying(50),
  add column if not exists "Hospital_Head_Email" character varying(255);

create index if not exists "idx_Hospitals_Head_Name"
  on public."Hospitals" using btree ("Hospital_Head_Name");

create index if not exists "idx_Hospitals_Head_Email"
  on public."Hospitals" using btree ("Hospital_Head_Email");
