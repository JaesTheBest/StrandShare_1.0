-- 009_hospital_patient_wig_management.sql
-- H-Representative, patient, wig request, and inventory tables.

create table if not exists public."H-Representatives" (
  "Hospital_ID" serial primary key,
  "Hospital_Name" varchar(255),
  "Hospital_Logo" varchar(255),
  "Country" varchar(255),
  "Region" varchar(255),
  "City" varchar(255),
  "Barangay" varchar(255),
  "Street" varchar(255),
  "Contact_Number" varchar(50),
  "Created_At" timestamp default now(),
  "Updated_At" timestamp default now()
);

create table if not exists public."Hospital_Staff" (
  "Link_ID" serial primary key,
  "Hospital_ID" int,
  "User_ID" int,
  "Assigned_Date" timestamp default now(),
  constraint "Hospital_Staff_Hospital_ID_fkey"
    foreign key ("Hospital_ID")
    references public."H-Representatives" ("Hospital_ID"),
  constraint "Hospital_Staff_User_ID_fkey"
    foreign key ("User_ID")
    references public.users(user_id),
  constraint "Hospital_Staff_User_ID_unique" unique ("User_ID")
);

create table if not exists public."Patients" (
  "Patient_ID" serial primary key,
  "User_ID" int,
  "Hospital_ID" int,
  "Patient_Code" varchar(100) unique,
  "First_Name" varchar(255),
  "Middle_Name" varchar(255),
  "Last_Name" varchar(255),
  "Suffix" varchar(50),
  "Age" int,
  "Gender" varchar(20),
  "Medical_Condition" varchar(255),
  "Patient_Picture" varchar(255),
  "Medical_Document" varchar(255),
  "Created_At" timestamp default now(),
  "Updated_At" timestamp default now(),
  constraint "Patients_User_ID_fkey"
    foreign key ("User_ID")
    references public.users(user_id),
  constraint "Patients_Hospital_ID_fkey"
    foreign key ("Hospital_ID")
    references public."H-Representatives" ("Hospital_ID")
);

create table if not exists public."Wig_Requests" (
  "Req_ID" serial primary key,
  "Hospital_ID" int,
  "Patient_ID" int,
  "Status" varchar(50),
  "Request_Date" timestamp default now(),
  "Requested_By" int,
  "Approved_By" int,
  "Approved_At" timestamp,
  "Updated_At" timestamp default now(),
  constraint "Wig_Requests_Requested_By_fkey"
    foreign key ("Requested_By")
    references public.users(user_id),
  constraint "Wig_Requests_Approved_By_fkey"
    foreign key ("Approved_By")
    references public.users(user_id),
  constraint "Wig_Requests_Patient_ID_fkey"
    foreign key ("Patient_ID")
    references public."Patients" ("Patient_ID"),
  constraint "Wig_Requests_Hospital_ID_fkey"
    foreign key ("Hospital_ID")
    references public."H-Representatives" ("Hospital_ID")
);

create table if not exists public."Wig_Request_Specifications" (
  "Req_Spec_ID" serial primary key,
  "Req_ID" int unique,
  "Preferred_Color" varchar(50),
  "Preferred_Length" varchar(50),
  "Hair_Texture" varchar(50),
  "Cap_Size" varchar(20),
  "Style_Preference" varchar(100),
  "Special_Notes" text,
  constraint "Wig_Request_Specifications_Req_ID_fkey"
    foreign key ("Req_ID")
    references public."Wig_Requests" ("Req_ID")
);

create table if not exists public."Wigs" (
  "Wig_ID" serial primary key,
  "Req_ID" int unique,
  "Status" varchar(50),
  "Allocated_At" timestamp,
  "Allocated_By" int,
  "Added_At" timestamp default now(),
  "Updated_At" timestamp default now(),
  "Notes" text,
  constraint "Wigs_Allocated_By_fkey"
    foreign key ("Allocated_By")
    references public.users(user_id),
  constraint "Wigs_Req_ID_fkey"
    foreign key ("Req_ID")
    references public."Wig_Requests" ("Req_ID")
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'Hospital_Staff_User_ID_fkey'
  ) then
    alter table public."Hospital_Staff"
      add constraint "Hospital_Staff_User_ID_fkey"
      foreign key ("User_ID")
      references public.users(user_id);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'Hospital_Staff_User_ID_unique'
  ) then
    alter table public."Hospital_Staff"
      add constraint "Hospital_Staff_User_ID_unique" unique ("User_ID");
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'Patients_User_ID_fkey'
  ) then
    alter table public."Patients"
      add constraint "Patients_User_ID_fkey"
      foreign key ("User_ID")
      references public.users(user_id);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'Wig_Requests_Requested_By_fkey'
  ) then
    alter table public."Wig_Requests"
      add constraint "Wig_Requests_Requested_By_fkey"
      foreign key ("Requested_By")
      references public.users(user_id);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'Wig_Requests_Approved_By_fkey'
  ) then
    alter table public."Wig_Requests"
      add constraint "Wig_Requests_Approved_By_fkey"
      foreign key ("Approved_By")
      references public.users(user_id);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'Wigs_Allocated_By_fkey'
  ) then
    alter table public."Wigs"
      add constraint "Wigs_Allocated_By_fkey"
      foreign key ("Allocated_By")
      references public.users(user_id);
  end if;
end $$;

create table if not exists public."Wig_Physical_Specifications" (
  "Wig_Spec_ID" serial primary key,
  "Wig_ID" int unique,
  "Color" varchar(50),
  "Length" varchar(50),
  "Hair_Texture" varchar(50),
  "Cap_Size" varchar(20),
  "Style" varchar(100),
  "Notes" varchar(50),
  constraint "Wig_Physical_Specifications_Wig_ID_fkey"
    foreign key ("Wig_ID")
    references public."Wigs" ("Wig_ID")
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'Hospital_Staff_Hospital_ID_fkey'
  ) then
    alter table public."Hospital_Staff"
      add constraint "Hospital_Staff_Hospital_ID_fkey"
      foreign key ("Hospital_ID")
      references public."H-Representatives" ("Hospital_ID");
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'Patients_Hospital_ID_fkey'
  ) then
    alter table public."Patients"
      add constraint "Patients_Hospital_ID_fkey"
      foreign key ("Hospital_ID")
      references public."H-Representatives" ("Hospital_ID");
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'Wig_Requests_Patient_ID_fkey'
  ) then
    alter table public."Wig_Requests"
      add constraint "Wig_Requests_Patient_ID_fkey"
      foreign key ("Patient_ID")
      references public."Patients" ("Patient_ID");
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'Wig_Requests_Hospital_ID_fkey'
  ) then
    alter table public."Wig_Requests"
      add constraint "Wig_Requests_Hospital_ID_fkey"
      foreign key ("Hospital_ID")
      references public."H-Representatives" ("Hospital_ID");
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'Wig_Request_Specifications_Req_ID_fkey'
  ) then
    alter table public."Wig_Request_Specifications"
      add constraint "Wig_Request_Specifications_Req_ID_fkey"
      foreign key ("Req_ID")
      references public."Wig_Requests" ("Req_ID");
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'Wigs_Req_ID_fkey'
  ) then
    alter table public."Wigs"
      add constraint "Wigs_Req_ID_fkey"
      foreign key ("Req_ID")
      references public."Wig_Requests" ("Req_ID");
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'Wig_Physical_Specifications_Wig_ID_fkey'
  ) then
    alter table public."Wig_Physical_Specifications"
      add constraint "Wig_Physical_Specifications_Wig_ID_fkey"
      foreign key ("Wig_ID")
      references public."Wigs" ("Wig_ID");
  end if;
end $$;

create index if not exists "idx_Hospital_Staff_Hospital_ID"
  on public."Hospital_Staff" ("Hospital_ID");

create index if not exists "idx_Hospital_Staff_User_ID"
  on public."Hospital_Staff" ("User_ID");

create index if not exists "idx_Patients_Hospital_ID"
  on public."Patients" ("Hospital_ID");

create index if not exists "idx_Patients_User_ID"
  on public."Patients" ("User_ID");

create index if not exists "idx_Wig_Requests_Hospital_ID"
  on public."Wig_Requests" ("Hospital_ID");

create index if not exists "idx_Wig_Requests_Patient_ID"
  on public."Wig_Requests" ("Patient_ID");

create index if not exists "idx_Wig_Requests_Requested_By"
  on public."Wig_Requests" ("Requested_By");

create index if not exists "idx_Wig_Requests_Approved_By"
  on public."Wig_Requests" ("Approved_By");

create index if not exists "idx_Wigs_Allocated_By"
  on public."Wigs" ("Allocated_By");
