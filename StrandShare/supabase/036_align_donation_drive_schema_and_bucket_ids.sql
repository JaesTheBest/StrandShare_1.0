-- 036_align_donation_drive_schema_and_bucket_ids.sql
-- Align donation drive schema and storage bucket IDs.
-- 1) Remove redundant Approved_By usage from Donation_Drive_Requests workflow.
-- 2) Add Proposal_Attachment_Bucket to persist the source bucket.
-- 3) Remove hyphen bucket variants and keep underscore buckets only.

-- Remove any hyphen-specific policies from previous drafts of this migration.
drop policy if exists donation_drive_proposals_hyphen_insert_org_staff_admin on storage.objects;
drop policy if exists donation_drive_proposals_hyphen_select_org_staff_admin on storage.objects;
drop policy if exists donation_drive_proposals_hyphen_update_owner on storage.objects;
drop policy if exists donation_drive_proposals_hyphen_delete_owner on storage.objects;
drop policy if exists donation_drive_event_assets_hyphen_insert_staff_super_admin on storage.objects;
drop policy if exists donation_drive_event_assets_hyphen_select_org_staff_super_admin on storage.objects;
drop policy if exists donation_drive_event_assets_hyphen_update_owner on storage.objects;
drop policy if exists donation_drive_event_assets_hyphen_delete_owner on storage.objects;

-- Remove hyphen bucket objects and buckets completely.
-- This is strict: if either hyphen bucket remains, the migration raises.
-- Uses storage API SQL functions to avoid direct deletes on storage.objects.
do $$
declare
  target_bucket text;
  remaining_bucket text;
begin
  if to_regclass('storage.buckets') is null then
    return;
  end if;

  foreach target_bucket in array array['donation-drive-proposals', 'donation-drive-event-assets']
  loop
    if not exists (select 1 from storage.buckets b where b.id = target_bucket) then
      continue;
    end if;

    -- Attempt to empty bucket through storage API function if available.
    begin
      execute format('select storage.empty_bucket(%L)', target_bucket);
    exception
      when undefined_function then
        raise notice 'storage.empty_bucket(text) is unavailable; cannot empty bucket % via SQL API.', target_bucket;
      when others then
        raise notice 'Could not empty bucket %: %', target_bucket, sqlerrm;
    end;

    -- Attempt to delete bucket through storage API function if available.
    begin
      execute format('select storage.delete_bucket(%L)', target_bucket);
    exception
      when undefined_function then
        raise exception 'storage.delete_bucket(text) is unavailable. Delete bucket % via Supabase Storage API or Dashboard, then rerun this migration.', target_bucket;
      when others then
        raise notice 'Could not delete bucket %: %', target_bucket, sqlerrm;
    end;
  end loop;

  select b.id
  into remaining_bucket
  from storage.buckets b
  where b.id in ('donation-drive-proposals', 'donation-drive-event-assets')
  limit 1;

  if remaining_bucket is not null then
    raise exception 'Hyphen bucket % still exists after cleanup. Delete its files through Supabase Storage API/Dashboard, then rerun this migration.', remaining_bucket;
  end if;
end
$$;

-- Ensure underscore canonical proposals bucket exists.
do $$
begin
  if exists (select 1 from storage.buckets where id = 'donation_drive_proposals') then
    update storage.buckets
    set
      name = 'donation_drive_proposals',
      public = false
    where id = 'donation_drive_proposals';
  else
    insert into storage.buckets (id, name, public)
    values ('donation_drive_proposals', 'donation_drive_proposals', false);
  end if;
end
$$;

-- Ensure underscore canonical event assets bucket exists.
do $$
begin
  if exists (select 1 from storage.buckets where id = 'donation_drive_event_assets') then
    update storage.buckets
    set
      name = 'donation_drive_event_assets',
      public = false
    where id = 'donation_drive_event_assets';
  else
    insert into storage.buckets (id, name, public)
    values ('donation_drive_event_assets', 'donation_drive_event_assets', false);
  end if;
end
$$;

-- Add proposal bucket metadata column.
alter table if exists public."Donation_Drive_Requests"
  add column if not exists "Proposal_Attachment_Bucket" character varying(120);

-- Backfills in this migration are metadata-only updates and should not invoke
-- workflow status transition validation that requires an authenticated actor.
do $$
begin
  if to_regclass('public."Donation_Drive_Requests"') is null then
    return;
  end if;

  if exists (
    select 1
    from pg_trigger t
    where t.tgrelid = 'public."Donation_Drive_Requests"'::regclass
      and t.tgname = 'trg_enforce_donation_drive_status_workflow'
      and not t.tgisinternal
  ) then
    alter table public."Donation_Drive_Requests"
      disable trigger trg_enforce_donation_drive_status_workflow;
  end if;
end
$$;

-- Backfill proposal bucket metadata for existing rows when bucket can be inferred.
do $$
declare
  resolved_proposal_bucket text;
begin
  if to_regclass('public."Donation_Drive_Requests"') is null then
    return;
  end if;

  if exists (select 1 from storage.buckets where id = 'donation_drive_proposals') then
    resolved_proposal_bucket := 'donation_drive_proposals';
  else
    resolved_proposal_bucket := null;
  end if;

  if resolved_proposal_bucket is null then
    return;
  end if;

  update public."Donation_Drive_Requests"
  set "Proposal_Attachment_Bucket" = resolved_proposal_bucket
  where coalesce(trim("Proposal_Attachment"), '') <> ''
    and coalesce(trim("Proposal_Attachment_Bucket"), '') in ('', 'donation-drive-proposals');
end
$$;

-- Normalize legacy full proposal URLs that still reference the removed hyphen bucket.
-- Keep only object path and force canonical underscore bucket metadata.
do $$
begin
  if to_regclass('public."Donation_Drive_Requests"') is null then
    return;
  end if;

  if not exists (select 1 from storage.buckets where id = 'donation_drive_proposals') then
    return;
  end if;

  update public."Donation_Drive_Requests" ddr
  set
    "Proposal_Attachment" = case
      when position('/storage/v1/object/public/donation-drive-proposals/' in coalesce(ddr."Proposal_Attachment", '')) > 0
        then split_part(
          split_part(ddr."Proposal_Attachment", '/storage/v1/object/public/donation-drive-proposals/', 2),
          '?',
          1
        )
      when position('/storage/v1/object/sign/donation-drive-proposals/' in coalesce(ddr."Proposal_Attachment", '')) > 0
        then split_part(
          split_part(ddr."Proposal_Attachment", '/storage/v1/object/sign/donation-drive-proposals/', 2),
          '?',
          1
        )
      else ddr."Proposal_Attachment"
    end,
    "Proposal_Attachment_Bucket" = 'donation_drive_proposals'
  where coalesce(trim(ddr."Proposal_Attachment"), '') <> ''
    and (
      position('/storage/v1/object/public/donation-drive-proposals/' in ddr."Proposal_Attachment") > 0
      or position('/storage/v1/object/sign/donation-drive-proposals/' in ddr."Proposal_Attachment") > 0
    );
end
$$;

-- Backfill completion attachment JSON objects with bucket_id when missing.
do $$
declare
  resolved_event_bucket text;
begin
  if to_regclass('public."Donation_Drive_Requests"') is null then
    return;
  end if;

  if exists (select 1 from storage.buckets where id = 'donation_drive_event_assets') then
    resolved_event_bucket := 'donation_drive_event_assets';
  else
    resolved_event_bucket := null;
  end if;

  if resolved_event_bucket is null then
    return;
  end if;

  update public."Donation_Drive_Requests" ddr
  set "Completion_Attachments" = coalesce(
    (
      select jsonb_agg(
        case
          when jsonb_typeof(attachment.value) = 'object' and not (attachment.value ? 'bucket_id')
            then attachment.value || jsonb_build_object('bucket_id', resolved_event_bucket)
          when jsonb_typeof(attachment.value) = 'object' and attachment.value ->> 'bucket_id' = 'donation-drive-event-assets'
            then jsonb_set(attachment.value, '{bucket_id}', to_jsonb(resolved_event_bucket), true)
          else attachment.value
        end
      )
      from jsonb_array_elements(coalesce(ddr."Completion_Attachments", '[]'::jsonb)) as attachment(value)
    ),
    '[]'::jsonb
  )
  where ddr."Completion_Attachments" is not null
    and jsonb_typeof(ddr."Completion_Attachments") = 'array';
end
$$;

-- Remove redundant Approved_By link and column.
do $$
begin
  if to_regclass('public."Donation_Drive_Requests"') is null then
    return;
  end if;

  if exists (
    select 1
    from pg_constraint
    where conname = 'donation_drive_requests_approved_by_fkey'
      and conrelid = 'public."Donation_Drive_Requests"'::regclass
  ) then
    alter table public."Donation_Drive_Requests"
      drop constraint donation_drive_requests_approved_by_fkey;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'Donation_Drive_Requests'
      and column_name = 'Approved_By'
  ) then
    alter table public."Donation_Drive_Requests"
      drop column "Approved_By";
  end if;
end
$$;

-- Keep workflow trigger aligned with non-redundant reviewer columns.
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
  old_status_key = lower(replace(replace(replace(coalesce(old."Status", ''), '_', ''), ' ', ''), '-', ''));
  new_status_key = lower(replace(replace(replace(coalesce(new."Status", ''), '_', ''), ' ', ''), '-', ''));

  if old_status_key is not distinct from new_status_key then
    new."Updated_At" = now();
    return new;
  end if;

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
      else
        raise exception 'Super Admin cannot change donation drive status from % to %.', old."Status", new."Status";
      end if;
    end if;
  end if;

  new."Updated_At" = now();
  return new;
end;
$$;

-- Re-enable workflow trigger after metadata backfills and function alignment.
do $$
begin
  if to_regclass('public."Donation_Drive_Requests"') is null then
    return;
  end if;

  if exists (
    select 1
    from pg_trigger t
    where t.tgrelid = 'public."Donation_Drive_Requests"'::regclass
      and t.tgname = 'trg_enforce_donation_drive_status_workflow'
      and not t.tgisinternal
  ) then
    alter table public."Donation_Drive_Requests"
      enable trigger trg_enforce_donation_drive_status_workflow;
  end if;
end
$$;
