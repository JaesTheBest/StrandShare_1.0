-- 048_alter_hospitals_application_columns.sql
-- Add approval-tracking and map coordinate columns for partner hospital applications.

create table if not exists public."Hospitals" (
  "Hospital_ID" serial primary key,
  "Hospital_Name" character varying(255),
  "Hospital_Logo" character varying(255),
  "Country" character varying(255),
  "Region" character varying(255),
  "City" character varying(255),
  "Barangay" character varying(255),
  "Street" character varying(255),
  "Contact_Number" character varying(50),
  "Created_At" timestamp without time zone default now(),
  "Updated_At" timestamp without time zone default now()
);

do $$
begin
  alter table public."Hospitals" add column if not exists "Latitude" numeric(10, 7);
  alter table public."Hospitals" add column if not exists "Longitude" numeric(10, 7);
  alter table public."Hospitals" add column if not exists "Is_Approved" boolean default false;
  alter table public."Hospitals" add column if not exists "Approval_Status" character varying(50) default 'Pending';
  alter table public."Hospitals" add column if not exists "Approved_By" integer;
  alter table public."Hospitals" add column if not exists "Approved_At" timestamp without time zone;
  alter table public."Hospitals" add column if not exists "Review_Notes" text;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'hospitals_approval_status_check'
  ) then
    alter table public."Hospitals"
      add constraint hospitals_approval_status_check
      check (
        lower(coalesce("Approval_Status", 'pending')::text)
        = any (array['pending'::text, 'approved'::text, 'rejected'::text])
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'hospitals_approved_by_fkey'
  ) then
    alter table public."Hospitals"
      add constraint hospitals_approved_by_fkey
      foreign key ("Approved_By") references public.users(user_id);
  end if;
end $$;

create index if not exists "idx_Hospitals_Approval_Status"
  on public."Hospitals" using btree ("Approval_Status");

create index if not exists "idx_Hospitals_Is_Approved"
  on public."Hospitals" using btree ("Is_Approved");
