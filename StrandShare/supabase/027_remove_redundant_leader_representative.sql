-- 027_remove_redundant_leader_representative.sql
-- Make Organization_Members the single source of truth for organization leadership.

-- If Leader_Representative exists, migrate its data into Organization_Members before dropping it.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'Organizations'
      and column_name = 'Leader_Representative'
  ) then
    insert into public."Organization_Members" (
      "Organization_ID",
      "User_ID",
      "Membership_Role",
      "Is_Primary",
      "Status",
      "Created_By",
      "Created_At",
      "Updated_At"
    )
    select
      org."Organization_ID",
      org."Leader_Representative",
      'Leader',
      true,
      case
        when lower(coalesce(org."Status", 'active')) = 'inactive' then 'Inactive'
        else 'Active'
      end,
      org."Created_By",
      now(),
      now()
    from public."Organizations" org
    where org."Leader_Representative" is not null
    on conflict ("Organization_ID", "User_ID") do nothing;

    -- Demote existing primary members when a legacy Leader_Representative is set.
    update public."Organization_Members" om
    set
      "Is_Primary" = false,
      "Updated_At" = now()
    from public."Organizations" org
    where org."Leader_Representative" is not null
      and om."Organization_ID" = org."Organization_ID"
      and om."User_ID" <> org."Leader_Representative"
      and om."Is_Primary" = true;

    -- Promote the designated Leader_Representative row as primary leader.
    update public."Organization_Members" om
    set
      "Is_Primary" = true,
      "Membership_Role" = 'Leader',
      "Updated_At" = now()
    from public."Organizations" org
    where org."Leader_Representative" is not null
      and om."Organization_ID" = org."Organization_ID"
      and om."User_ID" = org."Leader_Representative";
  end if;
end $$;

-- Enforce that primary member rows are always leader role.
update public."Organization_Members"
set
  "Membership_Role" = 'Leader',
  "Updated_At" = now()
where "Is_Primary" = true
  and lower(coalesce("Membership_Role", '')) <> 'leader';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'organization_members_primary_role_check'
  ) then
    alter table public."Organization_Members"
      add constraint organization_members_primary_role_check
      check ((not "Is_Primary") or (lower("Membership_Role") = 'leader'));
  end if;
end $$;

-- Drop redundant Organizations.Leader_Representative storage.
do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'organizations_leader_representative_fkey'
  ) then
    alter table public."Organizations"
      drop constraint organizations_leader_representative_fkey;
  end if;
end $$;

drop index if exists "idx_Organizations_Leader_Representative";

alter table public."Organizations"
  drop column if exists "Leader_Representative";
