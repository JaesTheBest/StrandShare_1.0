-- 034_repair_donation_drive_requests_policies.sql
-- Ensure Donation_Drive_Requests has complete schema + RLS rules
-- so organizations can submit/view their own drives and Staff/Super Admin can manage workflow.

create table if not exists public."Donation_Drive_Requests" (
  "Donation_Drive_ID" serial primary key,
  "User_ID" integer not null,
  "Organization_ID" integer not null,
  "Donation_Requirement_ID" integer,
  "Event_Title" character varying(255) not null,
  "Event_Overview" text,
  "Start_Date" timestamp without time zone,
  "End_Date" timestamp without time zone,
  "Proposal_Attachment" character varying(500),
  "Street" character varying(255),
  "Region" character varying(255),
  "Barangay" character varying(255),
  "City" character varying(255),
  "Province" character varying(255),
  "Country" character varying(255),
  "Longitude" numeric(10, 7),
  "Latitude" numeric(10, 7),
  "Is_Open_For_All" boolean not null default false,
  "Approved_By" integer,
  "Status" character varying(100) not null default 'Pending Staff Approval',
  "Donation_Setup_Type" character varying(50),
  "Created_At" timestamp without time zone not null default now(),
  "Updated_At" timestamp without time zone not null default now(),
  "Staff_Reviewed_By" integer,
  "Staff_Reviewed_At" timestamp without time zone,
  "Super_Admin_Reviewed_By" integer,
  "Super_Admin_Reviewed_At" timestamp without time zone,
  "Assigned_Staff_User_ID" integer,
  "Status_Reason" text,
  "Completed_By" integer,
  "Completed_At" timestamp without time zone,
  "Total_Recipients" integer,
  "Total_Donations_Collected" integer,
  "Completion_Notes" text,
  "Completion_Attachments" jsonb default '[]'::jsonb
);

alter table if exists public."Donation_Drive_Requests"
  add column if not exists "User_ID" integer,
  add column if not exists "Organization_ID" integer,
  add column if not exists "Donation_Requirement_ID" integer,
  add column if not exists "Event_Title" character varying(255),
  add column if not exists "Event_Overview" text,
  add column if not exists "Start_Date" timestamp without time zone,
  add column if not exists "End_Date" timestamp without time zone,
  add column if not exists "Proposal_Attachment" character varying(500),
  add column if not exists "Street" character varying(255),
  add column if not exists "Region" character varying(255),
  add column if not exists "Barangay" character varying(255),
  add column if not exists "City" character varying(255),
  add column if not exists "Province" character varying(255),
  add column if not exists "Country" character varying(255),
  add column if not exists "Longitude" numeric(10, 7),
  add column if not exists "Latitude" numeric(10, 7),
  add column if not exists "Is_Open_For_All" boolean default false,
  add column if not exists "Approved_By" integer,
  add column if not exists "Status" character varying(100) default 'Pending Staff Approval',
  add column if not exists "Donation_Setup_Type" character varying(50),
  add column if not exists "Created_At" timestamp without time zone default now(),
  add column if not exists "Updated_At" timestamp without time zone default now(),
  add column if not exists "Staff_Reviewed_By" integer,
  add column if not exists "Staff_Reviewed_At" timestamp without time zone,
  add column if not exists "Super_Admin_Reviewed_By" integer,
  add column if not exists "Super_Admin_Reviewed_At" timestamp without time zone,
  add column if not exists "Assigned_Staff_User_ID" integer,
  add column if not exists "Status_Reason" text,
  add column if not exists "Completed_By" integer,
  add column if not exists "Completed_At" timestamp without time zone,
  add column if not exists "Total_Recipients" integer,
  add column if not exists "Total_Donations_Collected" integer,
  add column if not exists "Completion_Notes" text,
  add column if not exists "Completion_Attachments" jsonb default '[]'::jsonb;

do $$
begin
  if to_regclass('public.users') is not null
     and not exists (
       select 1
       from pg_constraint
       where conname = 'donation_drive_requests_user_id_fkey'
         and conrelid = 'public."Donation_Drive_Requests"'::regclass
     ) then
    alter table public."Donation_Drive_Requests"
      add constraint donation_drive_requests_user_id_fkey
      foreign key ("User_ID") references public.users(user_id);
  end if;

  if to_regclass('public."Organizations"') is not null
     and not exists (
       select 1
       from pg_constraint
       where conname = 'donation_drive_requests_organization_id_fkey'
         and conrelid = 'public."Donation_Drive_Requests"'::regclass
     ) then
    alter table public."Donation_Drive_Requests"
      add constraint donation_drive_requests_organization_id_fkey
      foreign key ("Organization_ID")
      references public."Organizations"("Organization_ID")
      on delete cascade;
  end if;

  if to_regclass('public."Donation_Requirements"') is not null
     and not exists (
       select 1
       from pg_constraint
       where conname = 'donation_drive_requests_donation_requirement_id_fkey'
         and conrelid = 'public."Donation_Drive_Requests"'::regclass
     ) then
    alter table public."Donation_Drive_Requests"
      add constraint donation_drive_requests_donation_requirement_id_fkey
      foreign key ("Donation_Requirement_ID")
      references public."Donation_Requirements"("Donation_Requirement_ID")
      on delete set null;
  end if;

  if to_regclass('public.users') is not null
     and not exists (
       select 1
       from pg_constraint
       where conname = 'donation_drive_requests_approved_by_fkey'
         and conrelid = 'public."Donation_Drive_Requests"'::regclass
     ) then
    alter table public."Donation_Drive_Requests"
      add constraint donation_drive_requests_approved_by_fkey
      foreign key ("Approved_By") references public.users(user_id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'donation_drive_requests_latitude_range'
      and conrelid = 'public."Donation_Drive_Requests"'::regclass
  ) then
    alter table public."Donation_Drive_Requests"
      add constraint donation_drive_requests_latitude_range
      check ("Latitude" is null or ("Latitude" >= -90 and "Latitude" <= 90));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'donation_drive_requests_longitude_range'
      and conrelid = 'public."Donation_Drive_Requests"'::regclass
  ) then
    alter table public."Donation_Drive_Requests"
      add constraint donation_drive_requests_longitude_range
      check ("Longitude" is null or ("Longitude" >= -180 and "Longitude" <= 180));
  end if;
end
$$;

create index if not exists idx_donation_drive_requests_organization_id
  on public."Donation_Drive_Requests" ("Organization_ID");

create index if not exists idx_donation_drive_requests_updated_at
  on public."Donation_Drive_Requests" ("Updated_At" desc);

create or replace function public.normalize_app_role(role_value text)
returns text
language sql
immutable
as $$
  select lower(replace(replace(replace(coalesce(role_value, ''), '_', ''), ' ', ''), '-', ''));
$$;

create or replace function public.is_staff_or_super_admin_role(role_value text)
returns boolean
language sql
immutable
as $$
  select public.normalize_app_role(role_value) in ('staff', 'superadmin');
$$;

create or replace function public.is_organization_role(role_value text)
returns boolean
language sql
immutable
as $$
  select public.normalize_app_role(role_value) in ('organization', 'organizations', 'partner', 'partners');
$$;

create or replace function public.set_donation_drive_requests_updated_at()
returns trigger
language plpgsql
as $$
begin
  new."Updated_At" = now();
  return new;
end;
$$;

drop trigger if exists trg_set_donation_drive_requests_updated_at on public."Donation_Drive_Requests";
create trigger trg_set_donation_drive_requests_updated_at
  before update on public."Donation_Drive_Requests"
  for each row
  execute function public.set_donation_drive_requests_updated_at();

alter table if exists public."Donation_Drive_Requests" enable row level security;

grant select, insert, update, delete on public."Donation_Drive_Requests" to authenticated;

do $$
begin
  if to_regclass('public."Donation_Drive_Requests_Donation_Drive_ID_seq"') is not null then
    grant usage, select
      on sequence public."Donation_Drive_Requests_Donation_Drive_ID_seq"
      to authenticated;
  end if;
end
$$;

drop policy if exists donation_drive_requests_select_org_staff_super_admin on public."Donation_Drive_Requests";
create policy donation_drive_requests_select_org_staff_super_admin
on public."Donation_Drive_Requests"
for select
to authenticated
using (
  exists (
    select 1
    from public.users u
    where u.auth_user_id = auth.uid()
      and public.is_staff_or_super_admin_role(u.role)
  )
  or exists (
    select 1
    from public.users u
    join public."Organization_Members" om
      on om."User_ID" = u.user_id
    where u.auth_user_id = auth.uid()
      and lower(coalesce(om."Status", 'active')) = 'active'
      and om."Organization_ID" = public."Donation_Drive_Requests"."Organization_ID"
  )
);

drop policy if exists donation_drive_requests_insert_org_staff_super_admin on public."Donation_Drive_Requests";
create policy donation_drive_requests_insert_org_staff_super_admin
on public."Donation_Drive_Requests"
for insert
to authenticated
with check (
  exists (
    select 1
    from public.users u
    where u.auth_user_id = auth.uid()
      and public.is_staff_or_super_admin_role(u.role)
  )
  or exists (
    select 1
    from public.users u
    join public."Organization_Members" om
      on om."User_ID" = u.user_id
    join public."Organizations" org
      on org."Organization_ID" = om."Organization_ID"
    where u.auth_user_id = auth.uid()
      and public."Donation_Drive_Requests"."User_ID" = u.user_id
      and lower(coalesce(om."Status", 'active')) = 'active'
      and om."Organization_ID" = public."Donation_Drive_Requests"."Organization_ID"
      and lower(coalesce(org."Approval_Status", 'approved')) = 'approved'
      and lower(coalesce(org."Status", 'active')) = 'active'
  )
);

drop policy if exists donation_drive_requests_update_staff_super_admin on public."Donation_Drive_Requests";
create policy donation_drive_requests_update_staff_super_admin
on public."Donation_Drive_Requests"
for update
to authenticated
using (
  exists (
    select 1
    from public.users u
    where u.auth_user_id = auth.uid()
      and public.is_staff_or_super_admin_role(u.role)
  )
)
with check (
  exists (
    select 1
    from public.users u
    where u.auth_user_id = auth.uid()
      and public.is_staff_or_super_admin_role(u.role)
  )
);

drop policy if exists donation_drive_requests_delete_super_admin on public."Donation_Drive_Requests";
create policy donation_drive_requests_delete_super_admin
on public."Donation_Drive_Requests"
for delete
to authenticated
using (
  exists (
    select 1
    from public.users u
    where u.auth_user_id = auth.uid()
      and public.normalize_app_role(u.role) = 'superadmin'
  )
);
