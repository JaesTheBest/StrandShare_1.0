-- 022_organization_onboarding_workflow.sql
-- Adds organization onboarding tables and updates legacy partner roles.

create table if not exists public."Organizations" (
  "Organization_ID" serial primary key,
  "Organization_Name" varchar(255) not null,
  "Organization_Type" varchar(100),
  "Contact_Number" varchar(20),
  "Organization_Logo_URL" text,
  "Street_Barangay_Address" text,
  "City_Municipality" varchar(100),
  "Province" varchar(100),
  "Region" varchar(100),
  "Country" varchar(100),
  "Is_Approved" boolean default false,
  "Approved_By" int references public.users(user_id),
  "Approved_At" timestamp,
  "Created_At" timestamp default now(),
  "Updated_At" timestamp default now(),
  "Created_By" int references public.users(user_id)
);

create table if not exists public."Organization_Applications" (
  "Application_ID" serial primary key,
  "User_ID" int not null references public.users(user_id) on delete cascade,
  "Organization_ID" int references public."Organizations"("Organization_ID") on delete set null,
  "Organization_Name" varchar(255) not null,
  "Organization_Type" varchar(100),
  "Contact_Number" varchar(20),
  "Organization_Logo_URL" text,
  "Street_Barangay_Address" text,
  "City_Municipality" varchar(100),
  "Province" varchar(100),
  "Region" varchar(100),
  "Country" varchar(100),
  "Applicant_First_Name" varchar(100) not null,
  "Applicant_Last_Name" varchar(100) not null,
  "Applicant_Email" varchar(255) not null,
  "Status" varchar(50) not null default 'Pending',
  "Review_Notes" text,
  "Reviewed_By" int references public.users(user_id),
  "Reviewed_At" timestamp,
  "Created_At" timestamp default now(),
  "Updated_At" timestamp default now(),
  constraint "Organization_Applications_Status_check"
    check (lower("Status") in ('pending', 'approved', 'rejected'))
);

create table if not exists public."Organization_Members" (
  "Member_ID" serial primary key,
  "Organization_ID" int not null references public."Organizations"("Organization_ID") on delete cascade,
  "User_ID" int not null references public.users(user_id) on delete cascade,
  "Membership_Role" varchar(100) not null default 'Member',
  "Is_Primary" boolean not null default false,
  "Status" varchar(50) not null default 'Active',
  "Created_By" int references public.users(user_id),
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

update public.users
set role = 'organization',
    updated_at = now()
where lower(replace(replace(replace(coalesce(role, ''), '_', ''), ' ', ''), '-', '')) = 'partner';
