-- 040_hair_submission_workflow.sql
-- Wire Hair_Submissions through the full waybill workflow:
--   Pending -> Cut & Shipped -> Received -> Approved/Rejected -> Bundled -> Wig Created
--
-- Adds:
--   * Hair_Submission_Bundles  : QA Stylist groups 9-10 approved hairs that become 1 wig.
--   * Hair_Submissions.Bundle_ID + Submission_Code (waybill QR-friendly code).
--   * Notifications            : per-donor status messages.

-- ---------------------------------------------------------------------------
-- Hair_Submission_Bundles
-- ---------------------------------------------------------------------------
create table if not exists public."Hair_Submission_Bundles" (
  "Bundle_ID" serial primary key,
  "Created_By" integer references public.users(user_id) on delete set null,
  "Status" character varying(50) not null default 'Open',
  "Wig_ID" integer references public."Wigs"("Wig_ID") on delete set null,
  "Notes" text,
  "Created_At" timestamp without time zone not null default now(),
  "Sealed_At" timestamp without time zone,
  "Wig_Completed_At" timestamp without time zone,
  constraint hair_submission_bundles_status_check
    check (lower("Status") in ('open', 'sealed', 'wig_created'))
);

create index if not exists "idx_Hair_Submission_Bundles_Status"
  on public."Hair_Submission_Bundles" ("Status");

create index if not exists "idx_Hair_Submission_Bundles_Created_By"
  on public."Hair_Submission_Bundles" ("Created_By");

-- ---------------------------------------------------------------------------
-- Hair_Submissions.Bundle_ID + Submission_Code
-- ---------------------------------------------------------------------------
alter table public."Hair_Submissions"
  add column if not exists "Bundle_ID" integer null,
  add column if not exists "Submission_Code" character varying(64) null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'hair_submissions_bundle_id_fkey'
      and conrelid = 'public."Hair_Submissions"'::regclass
  ) then
    alter table public."Hair_Submissions"
      add constraint hair_submissions_bundle_id_fkey
      foreign key ("Bundle_ID")
      references public."Hair_Submission_Bundles"("Bundle_ID")
      on delete set null;
  end if;
end
$$;

create unique index if not exists "idx_Hair_Submissions_Submission_Code_unique"
  on public."Hair_Submissions" ("Submission_Code")
  where "Submission_Code" is not null;

create index if not exists "idx_Hair_Submissions_Bundle_ID"
  on public."Hair_Submissions" ("Bundle_ID");

-- Backfill Submission_Code for any rows missing one (legacy + future-safety).
update public."Hair_Submissions"
set "Submission_Code" = 'HS-' || to_char(coalesce("Created_At", now()), 'YYYY') || '-' || lpad("Submission_ID"::text, 6, '0')
where "Submission_Code" is null;

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------
create table if not exists public."Notifications" (
  "Notification_ID" serial primary key,
  "User_ID" integer not null references public.users(user_id) on delete cascade,
  "Title" character varying(255) not null,
  "Message" text not null,
  "Submission_ID" integer references public."Hair_Submissions"("Submission_ID") on delete set null,
  "Bundle_ID" integer references public."Hair_Submission_Bundles"("Bundle_ID") on delete set null,
  "Read_At" timestamp without time zone,
  "Created_At" timestamp without time zone not null default now()
);

create index if not exists "idx_Notifications_User_ID"
  on public."Notifications" ("User_ID");

create index if not exists "idx_Notifications_Created_At_desc"
  on public."Notifications" ("Created_At" desc);

create index if not exists "idx_Notifications_Submission_ID"
  on public."Notifications" ("Submission_ID");

create index if not exists "idx_Notifications_Bundle_ID"
  on public."Notifications" ("Bundle_ID");

-- ---------------------------------------------------------------------------
-- RLS: keep permissive; tighten later as roles are finalized.
-- ---------------------------------------------------------------------------
alter table if exists public."Hair_Submission_Bundles" enable row level security;
alter table if exists public."Notifications" enable row level security;

drop policy if exists hair_submission_bundles_authenticated_all on public."Hair_Submission_Bundles";
create policy hair_submission_bundles_authenticated_all
on public."Hair_Submission_Bundles"
for all
to authenticated
using (true)
with check (true);

drop policy if exists notifications_select_own_or_admin on public."Notifications";
create policy notifications_select_own_or_admin
on public."Notifications"
for select
to authenticated
using (
  exists (
    select 1 from public.users u
    where u.auth_user_id = auth.uid()
      and u.user_id = public."Notifications"."User_ID"
  )
  or exists (
    select 1 from public.users u
    where u.auth_user_id = auth.uid()
      and lower(replace(replace(replace(coalesce(u.role, ''), '_', ''), ' ', ''), '-', '')) in ('superadmin', 'staff', 'qastylist')
  )
);

drop policy if exists notifications_insert_authenticated on public."Notifications";
create policy notifications_insert_authenticated
on public."Notifications"
for insert
to authenticated
with check (true);

drop policy if exists notifications_update_own on public."Notifications";
create policy notifications_update_own
on public."Notifications"
for update
to authenticated
using (
  exists (
    select 1 from public.users u
    where u.auth_user_id = auth.uid()
      and u.user_id = public."Notifications"."User_ID"
  )
)
with check (
  exists (
    select 1 from public.users u
    where u.auth_user_id = auth.uid()
      and u.user_id = public."Notifications"."User_ID"
  )
);

grant select, insert, update on public."Notifications" to authenticated;
grant select, insert, update, delete on public."Hair_Submission_Bundles" to authenticated;

do $$
begin
  if to_regclass('public."Hair_Submission_Bundles_Bundle_ID_seq"') is not null then
    grant usage, select on sequence public."Hair_Submission_Bundles_Bundle_ID_seq" to authenticated;
  end if;
  if to_regclass('public."Notifications_Notification_ID_seq"') is not null then
    grant usage, select on sequence public."Notifications_Notification_ID_seq" to authenticated;
  end if;
end
$$;
