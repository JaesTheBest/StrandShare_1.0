-- 055_align_hospital_application_and_representative_schema.sql
-- Add ownership metadata to Hospitals and ensure Hospital_Representative exists and is fully constrained.

begin;

do $$
begin
  if to_regclass('public."Hospital_Representative"') is null
     and to_regclass('public."Hospital_Staff"') is not null then
    alter table public."Hospital_Staff" rename to "Hospital_Representative";
  end if;
end $$;

create table if not exists public."Hospital_Representative" (
  "Link_ID" serial not null,
  "Hospital_ID" integer null,
  "User_ID" integer null,
  "Assigned_Date" timestamp without time zone null default now(),
  constraint "Hospital_Staff_pkey" primary key ("Link_ID"),
  constraint "Hospital_Staff_User_ID_unique" unique ("User_ID"),
  constraint "Hospital_Staff_Hospital_ID_fkey" foreign key ("Hospital_ID") references public."Hospitals" ("Hospital_ID"),
  constraint "Hospital_Staff_User_ID_fkey" foreign key ("User_ID") references public.users (user_id)
);

do $$
begin
  alter table public."Hospitals" add column if not exists "Created_By" integer null;
  alter table public."Hospitals" add column if not exists "Updated_By" integer null;

  if not exists (
    select 1 from pg_constraint where conname = 'hospitals_created_by_fkey'
  ) then
    alter table public."Hospitals"
      add constraint hospitals_created_by_fkey
      foreign key ("Created_By") references public.users (user_id);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'hospitals_updated_by_fkey'
  ) then
    alter table public."Hospitals"
      add constraint hospitals_updated_by_fkey
      foreign key ("Updated_By") references public.users (user_id);
  end if;
end $$;

do $$
begin
  alter table public."Hospital_Representative" add column if not exists "Link_ID" serial;
  alter table public."Hospital_Representative" add column if not exists "Hospital_ID" integer;
  alter table public."Hospital_Representative" add column if not exists "User_ID" integer;
  alter table public."Hospital_Representative" add column if not exists "Assigned_Date" timestamp without time zone default now();

  if not exists (
    select 1 from pg_constraint where conname = 'Hospital_Staff_pkey'
  ) then
    alter table public."Hospital_Representative"
      add constraint "Hospital_Staff_pkey" primary key ("Link_ID");
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'Hospital_Staff_User_ID_unique'
  ) then
    alter table public."Hospital_Representative"
      add constraint "Hospital_Staff_User_ID_unique" unique ("User_ID");
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'Hospital_Staff_Hospital_ID_fkey'
  ) then
    alter table public."Hospital_Representative"
      add constraint "Hospital_Staff_Hospital_ID_fkey"
      foreign key ("Hospital_ID") references public."Hospitals" ("Hospital_ID");
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'Hospital_Staff_User_ID_fkey'
  ) then
    alter table public."Hospital_Representative"
      add constraint "Hospital_Staff_User_ID_fkey"
      foreign key ("User_ID") references public.users (user_id);
  end if;
end $$;

create index if not exists "idx_Hospitals_Province"
  on public."Hospitals" using btree ("Province");

create index if not exists "idx_Hospital_Staff_Hospital_ID"
  on public."Hospital_Representative" using btree ("Hospital_ID");

create index if not exists "idx_Hospital_Staff_User_ID"
  on public."Hospital_Representative" using btree ("User_ID");

commit;