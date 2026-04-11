-- 026_add_leader_representative_to_organizations.sql
-- Add leader representative as a FK to users(user_id).

do $$
declare
  leader_rep_data_type text;
begin
  select data_type
  into leader_rep_data_type
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'Organizations'
    and column_name = 'Leader_Representative'
  limit 1;

  -- If an old varchar version exists, replace it with integer FK column.
  if leader_rep_data_type is not null and leader_rep_data_type <> 'integer' then
    if exists (
      select 1
      from pg_constraint
      where conname = 'organizations_leader_representative_fkey'
    ) then
      alter table public."Organizations"
        drop constraint organizations_leader_representative_fkey;
    end if;

    drop index if exists "idx_Organizations_Leader_Representative";

    alter table public."Organizations"
      drop column "Leader_Representative";
  end if;

  alter table public."Organizations"
    add column if not exists "Leader_Representative" integer;
end $$;

-- Primary source: assigned primary organization member.
update public."Organizations" org
set "Leader_Representative" = om."User_ID"
from public."Organization_Members" om
where om."Organization_ID" = org."Organization_ID"
  and om."Is_Primary" = true
  and org."Leader_Representative" is null;

-- Fallback: organization creator.
update public."Organizations" org
set "Leader_Representative" = org."Created_By"
where org."Leader_Representative" is null
  and org."Created_By" is not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'organizations_leader_representative_fkey'
  ) then
    alter table public."Organizations"
      add constraint organizations_leader_representative_fkey
      foreign key ("Leader_Representative") references public.users(user_id);
  end if;
end $$;

create index if not exists "idx_Organizations_Leader_Representative"
  on public."Organizations" using btree ("Leader_Representative");
