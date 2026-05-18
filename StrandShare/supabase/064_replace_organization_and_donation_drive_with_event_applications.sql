-- 064_replace_organization_and_donation_drive_with_event_applications.sql
-- Removes organization + donation drive schema and introduces event applications.

begin;

-- ---------------------------------------------------------------------------
-- Role normalization and compatibility helpers
-- ---------------------------------------------------------------------------
create or replace function public.normalize_app_role(role_value text)
returns text
language sql
immutable
as $$
  with normalized as (
    select lower(replace(replace(replace(coalesce(role_value, ''), '_', ''), ' ', ''), '-', '')) as role_key
  )
  select
    case
      when role_key in ('superadmin', 'admin') then 'admin'
      when role_key in ('staff') then 'staff'
      when role_key in ('qastylist', 'specialist') then 'specialist'
      when role_key in ('hospital', 'hstaff', 'hrepresentative', 'hospitalrepresentative') then 'h_representative'
      when role_key in ('organization', 'organizations', 'org', 'partner', 'partners') then 'organization'
      else role_key
    end
  from normalized;
$$;

create or replace function public.is_admin_role(role_value text)
returns boolean
language sql
immutable
as $$
  select public.normalize_app_role(role_value) = 'admin';
$$;

create or replace function public.is_staff_or_admin_role(role_value text)
returns boolean
language sql
immutable
as $$
  select public.normalize_app_role(role_value) in ('staff', 'admin');
$$;

create or replace function public.is_specialist_role(role_value text)
returns boolean
language sql
immutable
as $$
  select public.normalize_app_role(role_value) = 'specialist';
$$;

create or replace function public.is_h_representative_or_admin_role(role_value text)
returns boolean
language sql
immutable
as $$
  select public.normalize_app_role(role_value) in ('h_representative', 'admin');
$$;

-- Compatibility wrappers for older SQL references.
create or replace function public.is_super_admin_or_staff(role_value text)
returns boolean
language sql
immutable
as $$
  select public.is_staff_or_admin_role(role_value);
$$;

create or replace function public.is_staff_or_super_admin_role(role_value text)
returns boolean
language sql
immutable
as $$
  select public.is_staff_or_admin_role(role_value);
$$;

create or replace function public.is_h_representative_or_super_admin(role_value text)
returns boolean
language sql
immutable
as $$
  select public.is_h_representative_or_admin_role(role_value);
$$;

-- Canonicalize user roles.
do $$
begin
  if to_regclass('public.users') is null then
    return;
  end if;

  update public.users
  set role = 'admin'
  where public.normalize_app_role(role) = 'admin'
    and coalesce(role, '') <> 'admin';

  update public.users
  set role = 'staff'
  where public.normalize_app_role(role) = 'staff'
    and coalesce(role, '') <> 'staff';

  update public.users
  set role = 'specialist'
  where public.normalize_app_role(role) = 'specialist'
    and coalesce(role, '') <> 'specialist';

  update public.users
  set role = 'h_representative'
  where public.normalize_app_role(role) = 'h_representative'
    and coalesce(role, '') <> 'h_representative';

  -- Organization accounts are retired in this workflow.
  update public.users
  set
    role = null,
    is_active = false
  where public.normalize_app_role(role) = 'organization';
end
$$;

-- Rewrite existing policies that still reference legacy role keys.
do $$
declare
  policy_row record;
  roles_sql text;
  create_sql text;
  rewritten_qual text;
  rewritten_with_check text;
begin
  for policy_row in
    select
      p.schemaname,
      p.tablename,
      p.policyname,
      p.permissive,
      p.roles,
      p.cmd,
      p.qual,
      p.with_check
    from pg_policies p
    where p.schemaname in ('public', 'storage')
      and (
        coalesce(p.qual, '') ilike '%superadmin%'
        or coalesce(p.with_check, '') ilike '%superadmin%'
        or coalesce(p.qual, '') ilike '%super admin%'
        or coalesce(p.with_check, '') ilike '%super admin%'
        or coalesce(p.qual, '') ilike '%qastylist%'
        or coalesce(p.with_check, '') ilike '%qastylist%'
        or coalesce(p.qual, '') ilike '%qa-stylist%'
        or coalesce(p.with_check, '') ilike '%qa-stylist%'
        or coalesce(p.qual, '') ilike '%hrepresentative%'
        or coalesce(p.with_check, '') ilike '%hrepresentative%'
        or coalesce(p.qual, '') ilike '%hospitalrepresentative%'
        or coalesce(p.with_check, '') ilike '%hospitalrepresentative%'
        or coalesce(p.qual, '') ilike '%hstaff%'
        or coalesce(p.with_check, '') ilike '%hstaff%'
        or coalesce(p.qual, '') ilike '%''hospital''%'
        or coalesce(p.with_check, '') ilike '%''hospital''%'
      )
  loop
    rewritten_qual := policy_row.qual;
    rewritten_with_check := policy_row.with_check;

    if rewritten_qual is not null then
      rewritten_qual := replace(rewritten_qual, '''superadmin''', '''admin''');
      rewritten_qual := replace(rewritten_qual, '''super admin''', '''admin''');
      rewritten_qual := replace(rewritten_qual, '''qastylist''', '''specialist''');
      rewritten_qual := replace(rewritten_qual, '''qa-stylist''', '''specialist''');
      rewritten_qual := replace(rewritten_qual, '''qa stylist''', '''specialist''');
      rewritten_qual := replace(rewritten_qual, '''hrepresentative''', '''h_representative''');
      rewritten_qual := replace(rewritten_qual, '''hospitalrepresentative''', '''h_representative''');
      rewritten_qual := replace(rewritten_qual, '''hstaff''', '''h_representative''');
      rewritten_qual := replace(rewritten_qual, '''hospital''', '''h_representative''');
    end if;

    if rewritten_with_check is not null then
      rewritten_with_check := replace(rewritten_with_check, '''superadmin''', '''admin''');
      rewritten_with_check := replace(rewritten_with_check, '''super admin''', '''admin''');
      rewritten_with_check := replace(rewritten_with_check, '''qastylist''', '''specialist''');
      rewritten_with_check := replace(rewritten_with_check, '''qa-stylist''', '''specialist''');
      rewritten_with_check := replace(rewritten_with_check, '''qa stylist''', '''specialist''');
      rewritten_with_check := replace(rewritten_with_check, '''hrepresentative''', '''h_representative''');
      rewritten_with_check := replace(rewritten_with_check, '''hospitalrepresentative''', '''h_representative''');
      rewritten_with_check := replace(rewritten_with_check, '''hstaff''', '''h_representative''');
      rewritten_with_check := replace(rewritten_with_check, '''hospital''', '''h_representative''');
    end if;

    select string_agg(case when role_name = 'public' then 'public' else quote_ident(role_name) end, ', ')
    into roles_sql
    from unnest(policy_row.roles) as role_name;

    if roles_sql is null or length(trim(roles_sql)) = 0 then
      roles_sql := 'public';
    end if;

    execute format(
      'drop policy if exists %I on %I.%I',
      policy_row.policyname,
      policy_row.schemaname,
      policy_row.tablename
    );

    create_sql := format(
      'create policy %I on %I.%I as %s for %s to %s',
      policy_row.policyname,
      policy_row.schemaname,
      policy_row.tablename,
      policy_row.permissive,
      policy_row.cmd,
      roles_sql
    );

    if rewritten_qual is not null and length(trim(rewritten_qual)) > 0 then
      create_sql := create_sql || format(' using (%s)', rewritten_qual);
    end if;

    if rewritten_with_check is not null and length(trim(rewritten_with_check)) > 0 then
      create_sql := create_sql || format(' with check (%s)', rewritten_with_check);
    end if;

    execute create_sql;
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- Remove organization/donation-drive storage policies and buckets
-- ---------------------------------------------------------------------------
do $$
declare
  policy_row record;
  target_bucket text;
begin
  for policy_row in
    select policyname
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and (
        policyname ilike '%organization%'
        or policyname ilike 'donation_drive%'
        or policyname ilike 'donation-drive%'
      )
  loop
    execute format('drop policy if exists %I on storage.objects', policy_row.policyname);
  end loop;

  if to_regclass('storage.buckets') is null then
    return;
  end if;

  foreach target_bucket in array ARRAY[
    'organization_logos',
    'donation_drive_proposals',
    'donation_drive_event_assets',
    'donation-drive-proposals',
    'donation-drive-event-assets'
  ]
  loop
    if not exists (select 1 from storage.buckets b where b.id = target_bucket) then
      continue;
    end if;

    begin
      execute format('select storage.empty_bucket(%L)', target_bucket);
    exception
      when undefined_function then
        begin
          if to_regclass('storage.objects') is not null then
            execute format('delete from storage.objects where bucket_id = %L', target_bucket);
          end if;
        exception
          when others then
            raise notice 'Could not clear objects for bucket %: %', target_bucket, sqlerrm;
        end;
      when others then
        raise notice 'Could not empty bucket %: %', target_bucket, sqlerrm;
    end;

    begin
      execute format('select storage.delete_bucket(%L)', target_bucket);
    exception
      when undefined_function then
        begin
          delete from storage.buckets where id = target_bucket;
        exception
          when others then
            raise notice 'Could not delete bucket % from storage.buckets: %', target_bucket, sqlerrm;
        end;
      when others then
        begin
          delete from storage.buckets where id = target_bucket;
        exception
          when others then
            raise notice 'Could not delete bucket %: %', target_bucket, sqlerrm;
        end;
    end;
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- Remove organization + donation-drive schema
-- ---------------------------------------------------------------------------
drop table if exists public."Donation_Drive_Allowed_Groups" cascade;
drop table if exists public."Donation_Drive_Registrations" cascade;
drop table if exists public."Donation_Drive_Requests" cascade;
drop table if exists public."Donation_Requirements" cascade;

drop table if exists public."Organization_Members" cascade;
drop table if exists public."Organization_Applications" cascade;
drop table if exists public."Organizations" cascade;

drop function if exists public.set_donation_drive_allowed_groups_updated_at() cascade;
drop function if exists public.set_donation_drive_registrations_updated_at() cascade;
drop function if exists public.set_donation_drive_requests_updated_at() cascade;
drop function if exists public.set_donation_requirements_updated_at() cascade;
drop function if exists public.enforce_donation_drive_status_workflow() cascade;
drop function if exists public.is_organization_role(text) cascade;

-- ---------------------------------------------------------------------------
-- Event applications (new workflow)
-- ---------------------------------------------------------------------------
create table if not exists public."Event_Applications" (
  "Event_Application_ID" serial primary key,
  "Applicant_Full_Name" character varying(255) not null,
  "Applicant_Email" character varying(255),
  "Applicant_Contact_Number" character varying(50),
  "Preferred_Contact_Method" character varying(50) not null default 'email',
  "Preferred_Contact_Detail" character varying(255),
  "Requesting_Group_Name" character varying(255),
  "Event_Title" character varying(255) not null,
  "Event_Overview" text,
  "Proposed_Start_At" timestamp without time zone,
  "Proposed_End_At" timestamp without time zone,
  "Venue_Name" character varying(255),
  "Street" character varying(255),
  "Region" character varying(255),
  "Barangay" character varying(255),
  "City" character varying(255),
  "Province" character varying(255),
  "Country" character varying(255) default 'Philippines',
  "Longitude" numeric(10, 7),
  "Latitude" numeric(10, 7),
  "Expected_Attendees" integer,
  "Status" character varying(50) not null default 'Pending Staff Review',
  "Staff_Contacted_At" timestamp without time zone,
  "Staff_Contact_Notes" text,
  "Staff_Reviewer_User_ID" integer,
  "Staff_Reviewed_At" timestamp without time zone,
  "Staff_Review_Notes" text,
  "Assigned_Staff_User_ID" integer,
  "Admin_Reviewer_User_ID" integer,
  "Admin_Reviewed_At" timestamp without time zone,
  "Admin_Decision_Reason" text,
  "Resubmission_Count" integer not null default 0,
  "Created_By_User_ID" integer,
  "Created_At" timestamp without time zone not null default now(),
  "Updated_At" timestamp without time zone not null default now(),
  constraint event_applications_status_check
    check (
      lower(replace(replace(replace(coalesce("Status", ''), '_', ''), ' ', ''), '-', '')) in (
        'pendingstaffreview',
        'pendingadmindecision',
        'approved',
        'rejected',
        'appealed',
        'withdrawn',
        'closed'
      )
    ),
  constraint event_applications_preferred_contact_method_check
    check (
      lower(replace(replace(replace(coalesce("Preferred_Contact_Method", ''), '_', ''), ' ', ''), '-', '')) in (
        'email',
        'phone',
        'call',
        'sms',
        'messenger',
        'viber',
        'whatsapp'
      )
    ),
  constraint event_applications_expected_attendees_nonnegative
    check ("Expected_Attendees" is null or "Expected_Attendees" >= 0),
  constraint event_applications_latitude_range
    check ("Latitude" is null or ("Latitude" >= -90 and "Latitude" <= 90)),
  constraint event_applications_longitude_range
    check ("Longitude" is null or ("Longitude" >= -180 and "Longitude" <= 180)),
  constraint event_applications_staff_reviewer_fkey
    foreign key ("Staff_Reviewer_User_ID") references public.users(user_id) on delete set null,
  constraint event_applications_assigned_staff_fkey
    foreign key ("Assigned_Staff_User_ID") references public.users(user_id) on delete set null,
  constraint event_applications_admin_reviewer_fkey
    foreign key ("Admin_Reviewer_User_ID") references public.users(user_id) on delete set null,
  constraint event_applications_created_by_fkey
    foreign key ("Created_By_User_ID") references public.users(user_id) on delete set null
);

create index if not exists idx_event_applications_status
  on public."Event_Applications" ("Status");

create index if not exists idx_event_applications_assigned_staff
  on public."Event_Applications" ("Assigned_Staff_User_ID");

create index if not exists idx_event_applications_created_at
  on public."Event_Applications" ("Created_At" desc);

create or replace function public.set_event_applications_updated_at()
returns trigger
language plpgsql
as $$
begin
  new."Updated_At" = now();
  return new;
end;
$$;

create or replace function public.enforce_event_application_workflow()
returns trigger
language plpgsql
as $$
declare
  actor_user_id integer;
  actor_role_key text;
  old_status_key text;
  new_status_key text;
begin
  old_status_key := lower(replace(replace(replace(coalesce(old."Status", ''), '_', ''), ' ', ''), '-', ''));
  new_status_key := lower(replace(replace(replace(coalesce(new."Status", ''), '_', ''), ' ', ''), '-', ''));

  if old_status_key is not distinct from new_status_key then
    new."Updated_At" = now();
    return new;
  end if;

  select
    u.user_id,
    public.normalize_app_role(u.role)
  into actor_user_id, actor_role_key
  from public.users u
  where u.auth_user_id = auth.uid()
  limit 1;

  if actor_user_id is null then
    raise exception 'Unable to resolve actor profile for event application workflow update.';
  end if;

  if actor_role_key = 'staff' then
    if old_status_key = 'pendingstaffreview' and new_status_key = 'pendingadmindecision' then
      new."Staff_Reviewer_User_ID" = actor_user_id;
      new."Staff_Reviewed_At" = coalesce(new."Staff_Reviewed_At", now());
      if coalesce(new."Assigned_Staff_User_ID", 0) = 0 then
        new."Assigned_Staff_User_ID" = actor_user_id;
      end if;
      new."Admin_Reviewer_User_ID" = null;
      new."Admin_Reviewed_At" = null;
      new."Admin_Decision_Reason" = null;
    elsif old_status_key = 'rejected' and new_status_key = 'pendingadmindecision' then
      new."Staff_Reviewer_User_ID" = actor_user_id;
      new."Staff_Reviewed_At" = coalesce(new."Staff_Reviewed_At", now());
      if coalesce(new."Assigned_Staff_User_ID", 0) = 0 then
        new."Assigned_Staff_User_ID" = actor_user_id;
      end if;
      new."Resubmission_Count" = coalesce(old."Resubmission_Count", 0) + 1;
      new."Admin_Reviewer_User_ID" = null;
      new."Admin_Reviewed_At" = null;
      new."Admin_Decision_Reason" = null;
    elsif old_status_key = 'rejected' and new_status_key = 'appealed' then
      new."Staff_Reviewer_User_ID" = actor_user_id;
      new."Staff_Reviewed_At" = coalesce(new."Staff_Reviewed_At", now());
    elsif old_status_key = 'appealed' and new_status_key = 'pendingadmindecision' then
      new."Staff_Reviewer_User_ID" = actor_user_id;
      new."Staff_Reviewed_At" = coalesce(new."Staff_Reviewed_At", now());
      new."Resubmission_Count" = coalesce(old."Resubmission_Count", 0) + 1;
      new."Admin_Reviewer_User_ID" = null;
      new."Admin_Reviewed_At" = null;
      new."Admin_Decision_Reason" = null;
    else
      raise exception 'Staff cannot change event application status from % to %.', old."Status", new."Status";
    end if;
  elsif actor_role_key = 'admin' then
    if old_status_key = 'pendingadmindecision' and new_status_key in ('approved', 'rejected') then
      new."Admin_Reviewer_User_ID" = actor_user_id;
      new."Admin_Reviewed_At" = now();

      if new_status_key = 'rejected' and length(trim(coalesce(new."Admin_Decision_Reason", ''))) = 0 then
        raise exception 'Admin decision reason is required when rejecting event applications.';
      end if;
    else
      raise exception 'Admin cannot change event application status from % to %.', old."Status", new."Status";
    end if;
  else
    raise exception 'Only staff or admin can change event application status.';
  end if;

  new."Updated_At" = now();
  return new;
end;
$$;

drop trigger if exists trg_set_event_applications_updated_at on public."Event_Applications";
create trigger trg_set_event_applications_updated_at
  before update on public."Event_Applications"
  for each row
  execute function public.set_event_applications_updated_at();

drop trigger if exists trg_enforce_event_application_workflow on public."Event_Applications";
create trigger trg_enforce_event_application_workflow
  before update on public."Event_Applications"
  for each row
  execute function public.enforce_event_application_workflow();

alter table public."Event_Applications" enable row level security;

grant select, insert, update, delete on public."Event_Applications" to authenticated;
grant insert on public."Event_Applications" to anon;

do $$
begin
  if to_regclass('public."Event_Applications_Event_Application_ID_seq"') is not null then
    grant usage, select on sequence public."Event_Applications_Event_Application_ID_seq" to authenticated;
    grant usage, select on sequence public."Event_Applications_Event_Application_ID_seq" to anon;
  end if;
end
$$;

drop policy if exists event_applications_select_staff_admin on public."Event_Applications";
create policy event_applications_select_staff_admin
on public."Event_Applications"
for select
to authenticated
using (
  exists (
    select 1
    from public.users u
    where u.auth_user_id = auth.uid()
      and public.is_staff_or_admin_role(u.role)
  )
);

drop policy if exists event_applications_select_owner on public."Event_Applications";
create policy event_applications_select_owner
on public."Event_Applications"
for select
to authenticated
using (
  exists (
    select 1
    from public.users u
    where u.auth_user_id = auth.uid()
      and u.user_id = public."Event_Applications"."Created_By_User_ID"
  )
);

drop policy if exists event_applications_insert_anon on public."Event_Applications";
create policy event_applications_insert_anon
on public."Event_Applications"
for insert
to anon
with check (
  lower(replace(replace(replace(coalesce("Status", ''), '_', ''), ' ', ''), '-', '')) = 'pendingstaffreview'
  and "Created_By_User_ID" is null
  and "Staff_Reviewer_User_ID" is null
  and "Admin_Reviewer_User_ID" is null
);

drop policy if exists event_applications_insert_authenticated_requestor on public."Event_Applications";
create policy event_applications_insert_authenticated_requestor
on public."Event_Applications"
for insert
to authenticated
with check (
  lower(replace(replace(replace(coalesce("Status", ''), '_', ''), ' ', ''), '-', '')) = 'pendingstaffreview'
  and "Staff_Reviewer_User_ID" is null
  and "Admin_Reviewer_User_ID" is null
  and (
    "Created_By_User_ID" is null
    or exists (
      select 1
      from public.users u
      where u.auth_user_id = auth.uid()
        and u.user_id = public."Event_Applications"."Created_By_User_ID"
    )
  )
);

drop policy if exists event_applications_insert_staff_admin on public."Event_Applications";
create policy event_applications_insert_staff_admin
on public."Event_Applications"
for insert
to authenticated
with check (
  exists (
    select 1
    from public.users u
    where u.auth_user_id = auth.uid()
      and public.is_staff_or_admin_role(u.role)
  )
);

drop policy if exists event_applications_update_staff on public."Event_Applications";
create policy event_applications_update_staff
on public."Event_Applications"
for update
to authenticated
using (
  exists (
    select 1
    from public.users u
    where u.auth_user_id = auth.uid()
      and public.normalize_app_role(u.role) = 'staff'
  )
)
with check (
  exists (
    select 1
    from public.users u
    where u.auth_user_id = auth.uid()
      and public.normalize_app_role(u.role) = 'staff'
  )
);

drop policy if exists event_applications_update_admin on public."Event_Applications";
create policy event_applications_update_admin
on public."Event_Applications"
for update
to authenticated
using (
  exists (
    select 1
    from public.users u
    where u.auth_user_id = auth.uid()
      and public.is_admin_role(u.role)
  )
)
with check (
  exists (
    select 1
    from public.users u
    where u.auth_user_id = auth.uid()
      and public.is_admin_role(u.role)
  )
);

drop policy if exists event_applications_update_owner_pending on public."Event_Applications";
create policy event_applications_update_owner_pending
on public."Event_Applications"
for update
to authenticated
using (
  lower(replace(replace(replace(coalesce("Status", ''), '_', ''), ' ', ''), '-', '')) = 'pendingstaffreview'
  and exists (
    select 1
    from public.users u
    where u.auth_user_id = auth.uid()
      and u.user_id = public."Event_Applications"."Created_By_User_ID"
  )
)
with check (
  lower(replace(replace(replace(coalesce("Status", ''), '_', ''), ' ', ''), '-', '')) = 'pendingstaffreview'
  and exists (
    select 1
    from public.users u
    where u.auth_user_id = auth.uid()
      and u.user_id = public."Event_Applications"."Created_By_User_ID"
  )
);

drop policy if exists event_applications_delete_admin on public."Event_Applications";
create policy event_applications_delete_admin
on public."Event_Applications"
for delete
to authenticated
using (
  exists (
    select 1
    from public.users u
    where u.auth_user_id = auth.uid()
      and public.is_admin_role(u.role)
  )
);

-- ---------------------------------------------------------------------------
-- Event attendees for assigned staff visibility and waybill printing
-- ---------------------------------------------------------------------------
create table if not exists public."Event_Attendees" (
  "Event_Attendee_ID" serial primary key,
  "Event_Application_ID" integer not null,
  "User_ID" integer,
  "Full_Name" character varying(255) not null,
  "Email" character varying(255),
  "Contact_Number" character varying(50),
  "Registration_Status" character varying(50) not null default 'Registered',
  "Attendance_Status" character varying(50) not null default 'Not Marked',
  "Waybill_Code" character varying(64),
  "Waybill_Printed_At" timestamp without time zone,
  "Waybill_Printed_By" integer,
  "Notes" text,
  "Created_By_User_ID" integer,
  "Created_At" timestamp without time zone not null default now(),
  "Updated_At" timestamp without time zone not null default now(),
  constraint event_attendees_event_application_fkey
    foreign key ("Event_Application_ID") references public."Event_Applications"("Event_Application_ID") on delete cascade,
  constraint event_attendees_user_fkey
    foreign key ("User_ID") references public.users(user_id) on delete set null,
  constraint event_attendees_waybill_printed_by_fkey
    foreign key ("Waybill_Printed_By") references public.users(user_id) on delete set null,
  constraint event_attendees_created_by_fkey
    foreign key ("Created_By_User_ID") references public.users(user_id) on delete set null,
  constraint event_attendees_registration_status_check
    check (
      lower(replace(replace(replace(coalesce("Registration_Status", ''), '_', ''), ' ', ''), '-', '')) in (
        'registered',
        'cancelled'
      )
    ),
  constraint event_attendees_attendance_status_check
    check (
      lower(replace(replace(replace(coalesce("Attendance_Status", ''), '_', ''), ' ', ''), '-', '')) in (
        'notmarked',
        'present',
        'noshow'
      )
    )
);

create unique index if not exists idx_event_attendees_waybill_code_unique
  on public."Event_Attendees" ("Waybill_Code")
  where "Waybill_Code" is not null;

create index if not exists idx_event_attendees_event_application
  on public."Event_Attendees" ("Event_Application_ID");

create index if not exists idx_event_attendees_user
  on public."Event_Attendees" ("User_ID");

create or replace function public.set_event_attendees_defaults()
returns trigger
language plpgsql
as $$
begin
  if coalesce(new."Waybill_Code", '') = '' then
    new."Waybill_Code" := 'EVT-WB-' || to_char(coalesce(new."Created_At", now()), 'YYYY') || '-' || case
      when new."Event_Attendee_ID" is not null then lpad(new."Event_Attendee_ID"::text, 6, '0')
      else substring(md5(random()::text || clock_timestamp()::text), 1, 6)
    end;
  end if;

  new."Updated_At" := now();
  return new;
end;
$$;

drop trigger if exists trg_set_event_attendees_defaults on public."Event_Attendees";
create trigger trg_set_event_attendees_defaults
  before insert or update on public."Event_Attendees"
  for each row
  execute function public.set_event_attendees_defaults();

alter table public."Event_Attendees" enable row level security;

grant select, insert, update, delete on public."Event_Attendees" to authenticated;

do $$
begin
  if to_regclass('public."Event_Attendees_Event_Attendee_ID_seq"') is not null then
    grant usage, select on sequence public."Event_Attendees_Event_Attendee_ID_seq" to authenticated;
  end if;
end
$$;

drop policy if exists event_attendees_select_staff_admin_or_owner on public."Event_Attendees";
create policy event_attendees_select_staff_admin_or_owner
on public."Event_Attendees"
for select
to authenticated
using (
  exists (
    select 1
    from public.users u
    where u.auth_user_id = auth.uid()
      and public.is_admin_role(u.role)
  )
  or exists (
    select 1
    from public.users u
    join public."Event_Applications" ea
      on ea."Assigned_Staff_User_ID" = u.user_id
    where u.auth_user_id = auth.uid()
      and public.normalize_app_role(u.role) = 'staff'
      and ea."Event_Application_ID" = public."Event_Attendees"."Event_Application_ID"
  )
  or exists (
    select 1
    from public.users u
    where u.auth_user_id = auth.uid()
      and u.user_id = public."Event_Attendees"."User_ID"
  )
);

drop policy if exists event_attendees_insert_staff_admin on public."Event_Attendees";
create policy event_attendees_insert_staff_admin
on public."Event_Attendees"
for insert
to authenticated
with check (
  exists (
    select 1
    from public.users u
    where u.auth_user_id = auth.uid()
      and public.is_admin_role(u.role)
  )
  or exists (
    select 1
    from public.users u
    join public."Event_Applications" ea
      on ea."Assigned_Staff_User_ID" = u.user_id
    where u.auth_user_id = auth.uid()
      and public.normalize_app_role(u.role) = 'staff'
      and ea."Event_Application_ID" = public."Event_Attendees"."Event_Application_ID"
  )
);

drop policy if exists event_attendees_update_staff_admin on public."Event_Attendees";
create policy event_attendees_update_staff_admin
on public."Event_Attendees"
for update
to authenticated
using (
  exists (
    select 1
    from public.users u
    where u.auth_user_id = auth.uid()
      and public.is_admin_role(u.role)
  )
  or exists (
    select 1
    from public.users u
    join public."Event_Applications" ea
      on ea."Assigned_Staff_User_ID" = u.user_id
    where u.auth_user_id = auth.uid()
      and public.normalize_app_role(u.role) = 'staff'
      and ea."Event_Application_ID" = public."Event_Attendees"."Event_Application_ID"
  )
)
with check (
  exists (
    select 1
    from public.users u
    where u.auth_user_id = auth.uid()
      and public.is_admin_role(u.role)
  )
  or exists (
    select 1
    from public.users u
    join public."Event_Applications" ea
      on ea."Assigned_Staff_User_ID" = u.user_id
    where u.auth_user_id = auth.uid()
      and public.normalize_app_role(u.role) = 'staff'
      and ea."Event_Application_ID" = public."Event_Attendees"."Event_Application_ID"
  )
);

drop policy if exists event_attendees_delete_admin on public."Event_Attendees";
create policy event_attendees_delete_admin
on public."Event_Attendees"
for delete
to authenticated
using (
  exists (
    select 1
    from public.users u
    where u.auth_user_id = auth.uid()
      and public.is_admin_role(u.role)
  )
);

commit;
