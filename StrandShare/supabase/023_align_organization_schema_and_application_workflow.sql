-- 023_align_organization_schema_and_application_workflow.sql
-- Align organization schema to the requested table definition and ensure onboarding/approval workflow tables exist.

create table if not exists public."Organizations" (
  "Organization_ID" serial not null,
  "Organization_Name" character varying(255) not null,
  "Organization_Type" character varying(100) null,
  "Organization_Logo_URL" character varying(255) null,
  "Street" character varying(255) null,
  "Region" character varying(255) null,
  "Barangay" character varying(255) null,
  "City" character varying(255) null,
  "Province" character varying(255) null,
  "Country" character varying(255) null,
  "Contact_Number" character varying(50) null,
  "Latitude" numeric(10, 7) null,
  "Longitude" numeric(10, 7) null,
  "Created_By" integer null,
  "Updated_By" integer null,
  "Status" character varying(50) null default 'Active'::character varying,
  "Created_At" timestamp default now(),
  "Updated_At" timestamp default now(),
  "Is_Approved" boolean default false,
  "Approval_Status" character varying(50) default 'Pending'::character varying,
  "Approved_By" integer null,
  "Approved_At" timestamp null,
  "Review_Notes" text null,
  constraint organizations_pkey primary key ("Organization_ID"),
  constraint organizations_created_by_fkey foreign key ("Created_By") references users (user_id),
  constraint organizations_updated_by_fkey foreign key ("Updated_By") references users (user_id),
  constraint organizations_approved_by_fkey foreign key ("Approved_By") references users (user_id)
);

do $$
begin
  alter table public."Organizations" add column if not exists "Organization_Name" character varying(255);
  alter table public."Organizations" add column if not exists "Organization_Type" character varying(100);
  alter table public."Organizations" add column if not exists "Organization_Logo_URL" character varying(255);
  alter table public."Organizations" add column if not exists "Street" character varying(255);
  alter table public."Organizations" add column if not exists "Region" character varying(255);
  alter table public."Organizations" add column if not exists "Barangay" character varying(255);
  alter table public."Organizations" add column if not exists "City" character varying(255);
  alter table public."Organizations" add column if not exists "Province" character varying(255);
  alter table public."Organizations" add column if not exists "Country" character varying(255);
  alter table public."Organizations" add column if not exists "Contact_Number" character varying(50);
  alter table public."Organizations" add column if not exists "Latitude" numeric(10, 7);
  alter table public."Organizations" add column if not exists "Longitude" numeric(10, 7);
  alter table public."Organizations" add column if not exists "Created_By" integer;
  alter table public."Organizations" add column if not exists "Updated_By" integer;
  alter table public."Organizations" add column if not exists "Status" character varying(50) default 'Active';
  alter table public."Organizations" add column if not exists "Created_At" timestamp default now();
  alter table public."Organizations" add column if not exists "Updated_At" timestamp default now();

  alter table public."Organizations" add column if not exists "Is_Approved" boolean default false;
  alter table public."Organizations" add column if not exists "Approval_Status" character varying(50) default 'Pending';
  alter table public."Organizations" add column if not exists "Approved_By" integer;
  alter table public."Organizations" add column if not exists "Approved_At" timestamp;
  alter table public."Organizations" add column if not exists "Review_Notes" text;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'organizations_approval_status_check'
  ) then
    alter table public."Organizations"
      add constraint organizations_approval_status_check
      check (lower(coalesce("Approval_Status", 'pending')) in ('pending', 'approved', 'rejected'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'organizations_created_by_fkey'
  ) then
    alter table public."Organizations"
      add constraint organizations_created_by_fkey
      foreign key ("Created_By") references public.users(user_id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'organizations_updated_by_fkey'
  ) then
    alter table public."Organizations"
      add constraint organizations_updated_by_fkey
      foreign key ("Updated_By") references public.users(user_id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'organizations_approved_by_fkey'
  ) then
    alter table public."Organizations"
      add constraint organizations_approved_by_fkey
      foreign key ("Approved_By") references public.users(user_id);
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'Organizations'
      and column_name = 'Street_Barangay_Address'
  ) then
    execute 'update public."Organizations" set "Street" = coalesce("Street", "Street_Barangay_Address") where "Street" is null and "Street_Barangay_Address" is not null';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'Organizations'
      and column_name = 'City_Municipality'
  ) then
    execute 'update public."Organizations" set "City" = coalesce("City", "City_Municipality") where "City" is null and "City_Municipality" is not null';
  end if;
end $$;

create index if not exists "idx_Organizations_Name"
  on public."Organizations" using btree ("Organization_Name");

create index if not exists "idx_Organizations_Approval_Status"
  on public."Organizations" using btree ("Approval_Status");

create index if not exists "idx_Organizations_Status"
  on public."Organizations" using btree ("Status");

create table if not exists public."Organization_Applications" (
  "Application_ID" serial primary key,
  "User_ID" integer not null references public.users(user_id) on delete cascade,
  "Organization_ID" integer null references public."Organizations"("Organization_ID") on delete set null,
  "Organization_Name" character varying(255) not null,
  "Organization_Type" character varying(100) null,
  "Organization_Logo_URL" character varying(255) null,
  "Street" character varying(255) null,
  "Region" character varying(255) null,
  "Barangay" character varying(255) null,
  "City" character varying(255) null,
  "Province" character varying(255) null,
  "Country" character varying(255) null,
  "Contact_Number" character varying(50) null,
  "Latitude" numeric(10, 7) null,
  "Longitude" numeric(10, 7) null,
  "Applicant_First_Name" character varying(100) not null,
  "Applicant_Last_Name" character varying(100) not null,
  "Applicant_Email" character varying(255) not null,
  "Status" character varying(50) not null default 'Pending'::character varying,
  "Review_Notes" text null,
  "Reviewed_By" integer null references public.users(user_id),
  "Reviewed_At" timestamp null,
  "Created_At" timestamp default now(),
  "Updated_At" timestamp default now(),
  constraint "Organization_Applications_Status_check"
    check (lower("Status") in ('pending', 'approved', 'rejected'))
);

do $$
begin
  alter table public."Organization_Applications" add column if not exists "Organization_Name" character varying(255);
  alter table public."Organization_Applications" add column if not exists "Organization_Type" character varying(100);
  alter table public."Organization_Applications" add column if not exists "Organization_Logo_URL" character varying(255);
  alter table public."Organization_Applications" add column if not exists "Street" character varying(255);
  alter table public."Organization_Applications" add column if not exists "Region" character varying(255);
  alter table public."Organization_Applications" add column if not exists "Barangay" character varying(255);
  alter table public."Organization_Applications" add column if not exists "City" character varying(255);
  alter table public."Organization_Applications" add column if not exists "Province" character varying(255);
  alter table public."Organization_Applications" add column if not exists "Country" character varying(255);
  alter table public."Organization_Applications" add column if not exists "Contact_Number" character varying(50);
  alter table public."Organization_Applications" add column if not exists "Latitude" numeric(10, 7);
  alter table public."Organization_Applications" add column if not exists "Longitude" numeric(10, 7);
  alter table public."Organization_Applications" add column if not exists "Applicant_First_Name" character varying(100);
  alter table public."Organization_Applications" add column if not exists "Applicant_Last_Name" character varying(100);
  alter table public."Organization_Applications" add column if not exists "Applicant_Email" character varying(255);
  alter table public."Organization_Applications" add column if not exists "Review_Notes" text;
  alter table public."Organization_Applications" add column if not exists "Reviewed_By" integer;
  alter table public."Organization_Applications" add column if not exists "Reviewed_At" timestamp;
  alter table public."Organization_Applications" add column if not exists "Created_At" timestamp default now();
  alter table public."Organization_Applications" add column if not exists "Updated_At" timestamp default now();

  if not exists (
    select 1
    from pg_constraint
    where conname = 'Organization_Applications_Reviewed_By_fkey'
  ) then
    alter table public."Organization_Applications"
      add constraint "Organization_Applications_Reviewed_By_fkey"
      foreign key ("Reviewed_By") references public.users(user_id);
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'Organization_Applications'
      and column_name = 'Street_Barangay_Address'
  ) then
    execute 'update public."Organization_Applications" set "Street" = coalesce("Street", "Street_Barangay_Address") where "Street" is null and "Street_Barangay_Address" is not null';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'Organization_Applications'
      and column_name = 'City_Municipality'
  ) then
    execute 'update public."Organization_Applications" set "City" = coalesce("City", "City_Municipality") where "City" is null and "City_Municipality" is not null';
  end if;
end $$;

create index if not exists "idx_Organization_Applications_status"
  on public."Organization_Applications" ("Status");

create index if not exists "idx_Organization_Applications_user_id"
  on public."Organization_Applications" ("User_ID");

create index if not exists "idx_Organization_Applications_created_at"
  on public."Organization_Applications" ("Created_At" desc);

create unique index if not exists "idx_Organization_Applications_pending_by_user"
  on public."Organization_Applications" ("User_ID")
  where lower("Status") = 'pending';

create unique index if not exists "idx_Organization_Applications_active_by_email"
  on public."Organization_Applications" (lower("Applicant_Email"))
  where lower("Status") in ('pending', 'approved');

create table if not exists public."Organization_Members" (
  "Member_ID" serial primary key,
  "Organization_ID" integer not null references public."Organizations"("Organization_ID") on delete cascade,
  "User_ID" integer not null references public.users(user_id) on delete cascade,
  "Membership_Role" character varying(100) not null default 'Member'::character varying,
  "Is_Primary" boolean not null default false,
  "Status" character varying(50) not null default 'Active'::character varying,
  "Created_By" integer null references public.users(user_id),
  "Created_At" timestamp default now(),
  "Updated_At" timestamp default now(),
  constraint "Organization_Members_Status_check"
    check (lower("Status") in ('active', 'inactive'))
);

create unique index if not exists "idx_Organization_Members_org_user_unique"
  on public."Organization_Members" ("Organization_ID", "User_ID");

create unique index if not exists "idx_Organization_Members_primary_unique"
  on public."Organization_Members" ("Organization_ID")
  where "Is_Primary" = true;

update public.users
set role = 'organization',
    updated_at = now()
where lower(replace(replace(replace(coalesce(role, ''), '_', ''), ' ', ''), '-', '')) = 'partner';
