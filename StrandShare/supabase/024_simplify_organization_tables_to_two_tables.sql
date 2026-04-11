-- 024_simplify_organization_tables_to_two_tables.sql
-- Consolidate organization onboarding to two tables only:
-- 1) Organizations
-- 2) Organization_Members

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
  "Created_At" timestamp without time zone null default now(),
  "Updated_At" timestamp without time zone null default now(),
  "Is_Approved" boolean null default false,
  "Approval_Status" character varying(50) null default 'Pending'::character varying,
  "Approved_By" integer null,
  "Approved_At" timestamp without time zone null,
  "Review_Notes" text null,
  constraint organizations_pkey primary key ("Organization_ID"),
  constraint organizations_approved_by_fkey foreign key ("Approved_By") references public.users (user_id),
  constraint organizations_created_by_fkey foreign key ("Created_By") references public.users (user_id),
  constraint organizations_updated_by_fkey foreign key ("Updated_By") references public.users (user_id)
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
  alter table public."Organizations" add column if not exists "Created_At" timestamp without time zone default now();
  alter table public."Organizations" add column if not exists "Updated_At" timestamp without time zone default now();
  alter table public."Organizations" add column if not exists "Is_Approved" boolean default false;
  alter table public."Organizations" add column if not exists "Approval_Status" character varying(50) default 'Pending';
  alter table public."Organizations" add column if not exists "Approved_By" integer;
  alter table public."Organizations" add column if not exists "Approved_At" timestamp without time zone;
  alter table public."Organizations" add column if not exists "Review_Notes" text;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'organizations_approval_status_check'
  ) then
    alter table public."Organizations"
      add constraint organizations_approval_status_check
      check (
        lower((coalesce("Approval_Status", 'pending'::character varying))::text)
        = any (array['pending'::text, 'approved'::text, 'rejected'::text])
      );
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
end $$;

create index if not exists "idx_Organizations_Name"
  on public."Organizations" using btree ("Organization_Name");

create index if not exists "idx_Organizations_Approval_Status"
  on public."Organizations" using btree ("Approval_Status");

create index if not exists "idx_Organizations_Status"
  on public."Organizations" using btree ("Status");

create table if not exists public."Organization_Members" (
  "Member_ID" serial not null,
  "Organization_ID" integer not null,
  "User_ID" integer not null,
  "Membership_Role" character varying(100) not null default 'Member'::character varying,
  "Is_Primary" boolean not null default false,
  "Status" character varying(50) not null default 'Active'::character varying,
  "Created_By" integer null,
  "Created_At" timestamp without time zone null default now(),
  "Updated_At" timestamp without time zone null default now(),
  constraint "Organization_Members_pkey" primary key ("Member_ID"),
  constraint "Organization_Members_Created_By_fkey" foreign key ("Created_By") references public.users (user_id),
  constraint "Organization_Members_Organization_ID_fkey" foreign key ("Organization_ID") references public."Organizations" ("Organization_ID") on delete cascade,
  constraint "Organization_Members_User_ID_fkey" foreign key ("User_ID") references public.users (user_id) on delete cascade
);

do $$
begin
  alter table public."Organization_Members" add column if not exists "Membership_Role" character varying(100) default 'Member';
  alter table public."Organization_Members" add column if not exists "Is_Primary" boolean default false;
  alter table public."Organization_Members" add column if not exists "Status" character varying(50) default 'Active';
  alter table public."Organization_Members" add column if not exists "Created_By" integer;
  alter table public."Organization_Members" add column if not exists "Created_At" timestamp without time zone default now();
  alter table public."Organization_Members" add column if not exists "Updated_At" timestamp without time zone default now();

  if not exists (
    select 1
    from pg_constraint
    where conname = 'Organization_Members_Status_check'
  ) then
    alter table public."Organization_Members"
      add constraint "Organization_Members_Status_check"
      check (lower(("Status")::text) = any (array['active'::text, 'inactive'::text]));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'Organization_Members_Created_By_fkey'
  ) then
    alter table public."Organization_Members"
      add constraint "Organization_Members_Created_By_fkey"
      foreign key ("Created_By") references public.users(user_id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'Organization_Members_Organization_ID_fkey'
  ) then
    alter table public."Organization_Members"
      add constraint "Organization_Members_Organization_ID_fkey"
      foreign key ("Organization_ID") references public."Organizations"("Organization_ID") on delete cascade;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'Organization_Members_User_ID_fkey'
  ) then
    alter table public."Organization_Members"
      add constraint "Organization_Members_User_ID_fkey"
      foreign key ("User_ID") references public.users(user_id) on delete cascade;
  end if;
end $$;

create unique index if not exists "idx_Organization_Members_org_user_unique"
  on public."Organization_Members" using btree ("Organization_ID", "User_ID");

create unique index if not exists "idx_Organization_Members_primary_unique"
  on public."Organization_Members" using btree ("Organization_ID")
  where ("Is_Primary" = true);

create index if not exists "idx_Organization_Members_Organization_ID"
  on public."Organization_Members" using btree ("Organization_ID");

create index if not exists "idx_Organization_Members_User_ID"
  on public."Organization_Members" using btree ("User_ID");

-- Move legacy rows from Organization_Membership into Organization_Members before dropping old table.
do $$
begin
  if to_regclass('public."Organization_Membership"') is not null then
    insert into public."Organization_Members" (
      "Organization_ID",
      "User_ID",
      "Membership_Role",
      "Is_Primary",
      "Status",
      "Created_At",
      "Updated_At"
    )
    select
      legacy."Organization_ID",
      legacy."User_ID",
      coalesce(nullif(trim(legacy."Group_Name"), ''), 'Member'),
      false,
      'Active',
      coalesce(legacy."Created_At", now()),
      coalesce(legacy."Updated_At", now())
    from public."Organization_Membership" legacy
    on conflict ("Organization_ID", "User_ID") do nothing;
  end if;
end $$;

drop table if exists public."Organization_Membership" cascade;
drop table if exists public."Organization_Applications" cascade;
