-- 032_donation_drive_approval_completion_workflow.sql
-- Add Staff/Super Admin approval workflow columns and completion reporting fields.

alter table if exists public."Donation_Drive_Requests"
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
  add column if not exists "Completion_Attachments" jsonb default '[]'::jsonb,
  add column if not exists "Updated_At" timestamp without time zone default now();

do $$
begin
  if to_regclass('public."Donation_Drive_Requests"') is null then
    return;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'donation_drive_requests_staff_reviewed_by_fkey'
      and conrelid = 'public."Donation_Drive_Requests"'::regclass
  ) then
    alter table public."Donation_Drive_Requests"
      add constraint donation_drive_requests_staff_reviewed_by_fkey
      foreign key ("Staff_Reviewed_By") references public.users(user_id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'donation_drive_requests_super_admin_reviewed_by_fkey'
      and conrelid = 'public."Donation_Drive_Requests"'::regclass
  ) then
    alter table public."Donation_Drive_Requests"
      add constraint donation_drive_requests_super_admin_reviewed_by_fkey
      foreign key ("Super_Admin_Reviewed_By") references public.users(user_id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'donation_drive_requests_assigned_staff_user_id_fkey'
      and conrelid = 'public."Donation_Drive_Requests"'::regclass
  ) then
    alter table public."Donation_Drive_Requests"
      add constraint donation_drive_requests_assigned_staff_user_id_fkey
      foreign key ("Assigned_Staff_User_ID") references public.users(user_id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'donation_drive_requests_completed_by_fkey'
      and conrelid = 'public."Donation_Drive_Requests"'::regclass
  ) then
    alter table public."Donation_Drive_Requests"
      add constraint donation_drive_requests_completed_by_fkey
      foreign key ("Completed_By") references public.users(user_id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'donation_drive_requests_total_recipients_nonnegative'
      and conrelid = 'public."Donation_Drive_Requests"'::regclass
  ) then
    alter table public."Donation_Drive_Requests"
      add constraint donation_drive_requests_total_recipients_nonnegative
      check ("Total_Recipients" is null or "Total_Recipients" >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'donation_drive_requests_total_donations_nonnegative'
      and conrelid = 'public."Donation_Drive_Requests"'::regclass
  ) then
    alter table public."Donation_Drive_Requests"
      add constraint donation_drive_requests_total_donations_nonnegative
      check ("Total_Donations_Collected" is null or "Total_Donations_Collected" >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'donation_drive_requests_completion_attachments_array'
      and conrelid = 'public."Donation_Drive_Requests"'::regclass
  ) then
    alter table public."Donation_Drive_Requests"
      add constraint donation_drive_requests_completion_attachments_array
      check (
        "Completion_Attachments" is null
        or jsonb_typeof("Completion_Attachments") = 'array'
      );
  end if;
end
$$;

create index if not exists idx_donation_drive_requests_status
  on public."Donation_Drive_Requests" ("Status");

create index if not exists idx_donation_drive_requests_assigned_staff
  on public."Donation_Drive_Requests" ("Assigned_Staff_User_ID");

create index if not exists idx_donation_drive_requests_end_date
  on public."Donation_Drive_Requests" ("End_Date");

create or replace function public.enforce_donation_drive_status_workflow()
returns trigger
language plpgsql
as $$
declare
  actor_user_id integer;
  actor_role_key text;
  old_status_key text;
  new_status_key text;
begin
  select
    u.user_id,
    lower(replace(replace(replace(coalesce(u.role, ''), '_', ''), ' ', ''), '-', ''))
  into actor_user_id, actor_role_key
  from public.users u
  where u.auth_user_id = auth.uid()
  limit 1;

  if actor_user_id is null then
    raise exception 'Unable to resolve actor user profile for donation drive workflow update.';
  end if;

  old_status_key = lower(replace(replace(replace(coalesce(old."Status", ''), '_', ''), ' ', ''), '-', ''));
  new_status_key = lower(replace(replace(replace(coalesce(new."Status", ''), '_', ''), ' ', ''), '-', ''));

  if actor_role_key not in ('staff', 'superadmin') then
    raise exception 'Only Staff or Super Admin can update donation drive workflow statuses.';
  end if;

  if new_status_key in ('rejected', 'cancelled')
     and length(trim(coalesce(new."Status_Reason", ''))) = 0 then
    raise exception 'Status reason is required when rejecting or cancelling donation drives.';
  end if;

  if old_status_key is distinct from new_status_key then
    if actor_role_key = 'staff' then
      if old_status_key = 'pendingstaffapproval' and new_status_key in ('pendingsuperadminapproval', 'rejected', 'cancelled') then
        new."Staff_Reviewed_By" = actor_user_id;
        new."Staff_Reviewed_At" = now();
      elsif old_status_key = 'approved' and new_status_key = 'completed' then
        if coalesce(old."Assigned_Staff_User_ID", 0) = 0 then
          raise exception 'Cannot complete donation drive: assigned staff is required.';
        end if;

        if old."Assigned_Staff_User_ID" <> actor_user_id then
          raise exception 'Only the assigned staff can mark this donation drive as completed.';
        end if;

        if old."End_Date" is null or old."End_Date" > now() then
          raise exception 'Donation drive can only be completed after the event end date has passed.';
        end if;

        new."Completed_By" = actor_user_id;
        new."Completed_At" = coalesce(new."Completed_At", now());
      else
        raise exception 'Staff cannot change donation drive status from % to %.', old."Status", new."Status";
      end if;
    elsif actor_role_key = 'superadmin' then
      if old_status_key = 'pendingsuperadminapproval' and new_status_key in ('approved', 'rejected', 'cancelled') then
        if new_status_key = 'approved' and coalesce(new."Assigned_Staff_User_ID", 0) = 0 then
          raise exception 'Assigned staff is required before Super Admin approval.';
        end if;

        new."Super_Admin_Reviewed_By" = actor_user_id;
        new."Super_Admin_Reviewed_At" = now();

        if new_status_key = 'approved' then
          new."Approved_By" = actor_user_id;
        end if;
      else
        raise exception 'Super Admin cannot change donation drive status from % to %.', old."Status", new."Status";
      end if;
    end if;
  end if;

  new."Updated_At" = now();
  return new;
end;
$$;

drop trigger if exists trg_enforce_donation_drive_status_workflow on public."Donation_Drive_Requests";
create trigger trg_enforce_donation_drive_status_workflow
  before update on public."Donation_Drive_Requests"
  for each row
  execute function public.enforce_donation_drive_status_workflow();

alter table if exists public."Donation_Drive_Requests" enable row level security;

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
      and lower(replace(replace(replace(coalesce(u.role, ''), '_', ''), ' ', ''), '-', '')) in ('staff', 'superadmin')
  )
)
with check (
  exists (
    select 1
    from public.users u
    where u.auth_user_id = auth.uid()
      and lower(replace(replace(replace(coalesce(u.role, ''), '_', ''), ' ', ''), '-', '')) in ('staff', 'superadmin')
  )
);