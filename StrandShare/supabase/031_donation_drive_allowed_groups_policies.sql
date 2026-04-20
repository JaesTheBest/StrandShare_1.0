-- 031_donation_drive_allowed_groups_policies.sql
-- Create allow-list table and RLS for donation drives scoped to specific organizations.

create table if not exists public."Donation_Drive_Allowed_Groups" (
  "Donation_Drive_ID" integer not null,
  "Organization_ID" integer not null,
  "Group_Name" character varying(255) not null,
  "Created_At" timestamp without time zone not null default now(),
  "Updated_At" timestamp without time zone not null default now(),
  "Created_By" integer null,
  constraint donation_drive_allowed_groups_pkey primary key ("Donation_Drive_ID", "Organization_ID")
);

alter table if exists public."Donation_Drive_Allowed_Groups"
  add column if not exists "Donation_Drive_ID" integer,
  add column if not exists "Organization_ID" integer,
  add column if not exists "Group_Name" character varying(255),
  add column if not exists "Created_At" timestamp without time zone default now(),
  add column if not exists "Updated_At" timestamp without time zone default now(),
  add column if not exists "Created_By" integer;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'donation_drive_allowed_groups_group_name_not_blank'
      and conrelid = 'public."Donation_Drive_Allowed_Groups"'::regclass
  ) then
    alter table public."Donation_Drive_Allowed_Groups"
      add constraint donation_drive_allowed_groups_group_name_not_blank
      check (length(trim(coalesce("Group_Name", ''))) > 0);
  end if;

  if to_regclass('public."Donation_Drive_Requests"') is not null
     and not exists (
       select 1
       from pg_constraint
       where conname = 'donation_drive_allowed_groups_drive_id_fkey'
         and conrelid = 'public."Donation_Drive_Allowed_Groups"'::regclass
     ) then
    alter table public."Donation_Drive_Allowed_Groups"
      add constraint donation_drive_allowed_groups_drive_id_fkey
      foreign key ("Donation_Drive_ID")
      references public."Donation_Drive_Requests" ("Donation_Drive_ID")
      on delete cascade;
  end if;

  if to_regclass('public."Organizations"') is not null
     and not exists (
       select 1
       from pg_constraint
       where conname = 'donation_drive_allowed_groups_organization_id_fkey'
         and conrelid = 'public."Donation_Drive_Allowed_Groups"'::regclass
     ) then
    alter table public."Donation_Drive_Allowed_Groups"
      add constraint donation_drive_allowed_groups_organization_id_fkey
      foreign key ("Organization_ID")
      references public."Organizations" ("Organization_ID")
      on delete cascade;
  end if;

  if to_regclass('public.users') is not null
     and not exists (
       select 1
       from pg_constraint
       where conname = 'donation_drive_allowed_groups_created_by_fkey'
         and conrelid = 'public."Donation_Drive_Allowed_Groups"'::regclass
     ) then
    alter table public."Donation_Drive_Allowed_Groups"
      add constraint donation_drive_allowed_groups_created_by_fkey
      foreign key ("Created_By")
      references public.users(user_id);
  end if;
end
$$;

create index if not exists idx_donation_drive_allowed_groups_organization_id
  on public."Donation_Drive_Allowed_Groups" ("Organization_ID");

create index if not exists idx_donation_drive_allowed_groups_updated_at
  on public."Donation_Drive_Allowed_Groups" ("Updated_At" desc);

create or replace function public.set_donation_drive_allowed_groups_updated_at()
returns trigger
language plpgsql
as $$
begin
  new."Updated_At" = now();
  return new;
end;
$$;

drop trigger if exists trg_set_donation_drive_allowed_groups_updated_at on public."Donation_Drive_Allowed_Groups";
create trigger trg_set_donation_drive_allowed_groups_updated_at
  before update on public."Donation_Drive_Allowed_Groups"
  for each row
  execute function public.set_donation_drive_allowed_groups_updated_at();

alter table public."Donation_Drive_Allowed_Groups" enable row level security;

drop policy if exists donation_drive_allowed_groups_select_roles on public."Donation_Drive_Allowed_Groups";
create policy donation_drive_allowed_groups_select_roles
on public."Donation_Drive_Allowed_Groups"
for select
to authenticated
using (
  exists (
    select 1
    from public.users u
    where u.auth_user_id = auth.uid()
      and lower(replace(replace(replace(coalesce(u.role, ''), '_', ''), ' ', ''), '-', '')) in ('staff', 'superadmin')
  )
  or exists (
    select 1
    from public.users u
    join public."Organization_Members" om
      on om."User_ID" = u.user_id
    where u.auth_user_id = auth.uid()
      and lower(replace(replace(replace(coalesce(u.role, ''), '_', ''), ' ', ''), '-', '')) in ('organization', 'organizations')
      and lower(coalesce(om."Status", 'active')) = 'active'
      and (
        om."Organization_ID" = public."Donation_Drive_Allowed_Groups"."Organization_ID"
        or om."Organization_ID" = (
          select req."Organization_ID"
          from public."Donation_Drive_Requests" req
          where req."Donation_Drive_ID" = public."Donation_Drive_Allowed_Groups"."Donation_Drive_ID"
          limit 1
        )
      )
  )
);

drop policy if exists donation_drive_allowed_groups_insert_owner_or_admin on public."Donation_Drive_Allowed_Groups";
create policy donation_drive_allowed_groups_insert_owner_or_admin
on public."Donation_Drive_Allowed_Groups"
for insert
to authenticated
with check (
  exists (
    select 1
    from public.users u
    where u.auth_user_id = auth.uid()
      and lower(replace(replace(replace(coalesce(u.role, ''), '_', ''), ' ', ''), '-', '')) in ('staff', 'superadmin')
  )
  or exists (
    select 1
    from public.users u
    join public."Organization_Members" om
      on om."User_ID" = u.user_id
    join public."Donation_Drive_Requests" req
      on req."Donation_Drive_ID" = public."Donation_Drive_Allowed_Groups"."Donation_Drive_ID"
    where u.auth_user_id = auth.uid()
      and lower(replace(replace(replace(coalesce(u.role, ''), '_', ''), ' ', ''), '-', '')) in ('organization', 'organizations')
      and lower(coalesce(om."Status", 'active')) = 'active'
      and om."Organization_ID" = req."Organization_ID"
  )
);

drop policy if exists donation_drive_allowed_groups_update_owner_or_admin on public."Donation_Drive_Allowed_Groups";
create policy donation_drive_allowed_groups_update_owner_or_admin
on public."Donation_Drive_Allowed_Groups"
for update
to authenticated
using (
  exists (
    select 1
    from public.users u
    where u.auth_user_id = auth.uid()
      and lower(replace(replace(replace(coalesce(u.role, ''), '_', ''), ' ', ''), '-', '')) in ('staff', 'superadmin')
  )
  or exists (
    select 1
    from public.users u
    join public."Organization_Members" om
      on om."User_ID" = u.user_id
    join public."Donation_Drive_Requests" req
      on req."Donation_Drive_ID" = public."Donation_Drive_Allowed_Groups"."Donation_Drive_ID"
    where u.auth_user_id = auth.uid()
      and lower(replace(replace(replace(coalesce(u.role, ''), '_', ''), ' ', ''), '-', '')) in ('organization', 'organizations')
      and lower(coalesce(om."Status", 'active')) = 'active'
      and om."Organization_ID" = req."Organization_ID"
  )
)
with check (
  exists (
    select 1
    from public.users u
    where u.auth_user_id = auth.uid()
      and lower(replace(replace(replace(coalesce(u.role, ''), '_', ''), ' ', ''), '-', '')) in ('staff', 'superadmin')
  )
  or exists (
    select 1
    from public.users u
    join public."Organization_Members" om
      on om."User_ID" = u.user_id
    join public."Donation_Drive_Requests" req
      on req."Donation_Drive_ID" = public."Donation_Drive_Allowed_Groups"."Donation_Drive_ID"
    where u.auth_user_id = auth.uid()
      and lower(replace(replace(replace(coalesce(u.role, ''), '_', ''), ' ', ''), '-', '')) in ('organization', 'organizations')
      and lower(coalesce(om."Status", 'active')) = 'active'
      and om."Organization_ID" = req."Organization_ID"
  )
);

drop policy if exists donation_drive_allowed_groups_delete_owner_or_admin on public."Donation_Drive_Allowed_Groups";
create policy donation_drive_allowed_groups_delete_owner_or_admin
on public."Donation_Drive_Allowed_Groups"
for delete
to authenticated
using (
  exists (
    select 1
    from public.users u
    where u.auth_user_id = auth.uid()
      and lower(replace(replace(replace(coalesce(u.role, ''), '_', ''), ' ', ''), '-', '')) in ('staff', 'superadmin')
  )
  or exists (
    select 1
    from public.users u
    join public."Organization_Members" om
      on om."User_ID" = u.user_id
    join public."Donation_Drive_Requests" req
      on req."Donation_Drive_ID" = public."Donation_Drive_Allowed_Groups"."Donation_Drive_ID"
    where u.auth_user_id = auth.uid()
      and lower(replace(replace(replace(coalesce(u.role, ''), '_', ''), ' ', ''), '-', '')) in ('organization', 'organizations')
      and lower(coalesce(om."Status", 'active')) = 'active'
      and om."Organization_ID" = req."Organization_ID"
  )
);
