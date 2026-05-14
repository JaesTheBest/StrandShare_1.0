-- 058_refactor_wig_inventory_specifications.sql
-- Refactor wig inventory schema for Upload Wig Stocks:
--   * Move wig photos to Wigs table.
--   * Move hair design specs to new Wig_Specifications table.
--   * Remove Wig_Code and redundant spec columns from Wigs.
--   * Normalize Wig_Status lifecycle to:
--       In Production -> Ready for Release -> Releasing -> Released
--   * Restrict write access to QA Stylist role.

-- ---------------------------------------------------------------------------
-- Wig specifications table (correct spelling).
-- ---------------------------------------------------------------------------
create table if not exists public."Wig_Specifications" (
  "Wig_Specification_ID" serial primary key,
  "Wig_ID" integer not null,
  "Hair_Length" numeric(5, 2) null,
  "Hair_Color" character varying(100) null,
  "Hair_Texture" character varying(100) null,
  "Hair_Density" character varying(100) null,
  "Cap_Size" character varying(20) null,
  "Created_At" timestamp without time zone not null default now(),
  "Updated_At" timestamp without time zone not null default now(),
  constraint "Wig_Specifications_Wig_ID_unique" unique ("Wig_ID"),
  constraint "Wig_Specifications_Wig_ID_fkey"
    foreign key ("Wig_ID")
    references public."Wigs" ("Wig_ID")
    on delete cascade,
  constraint "Wig_Specifications_Hair_Length_non_negative"
    check ("Hair_Length" is null or "Hair_Length" >= 0)
);

create index if not exists "idx_Wig_Specifications_Wig_ID"
  on public."Wig_Specifications" ("Wig_ID");

-- keep Updated_At current on updates
do $$
begin
  if not exists (
    select 1 from pg_proc where proname = 'set_wig_specifications_updated_at'
  ) then
    create function public.set_wig_specifications_updated_at()
    returns trigger
    language plpgsql
    as $fn$
    begin
      new."Updated_At" = now();
      return new;
    end;
    $fn$;
  end if;
end
$$;

drop trigger if exists trg_set_wig_specifications_updated_at on public."Wig_Specifications";
create trigger trg_set_wig_specifications_updated_at
  before update on public."Wig_Specifications"
  for each row
  execute function public.set_wig_specifications_updated_at();

-- ---------------------------------------------------------------------------
-- Move photo columns to Wigs and remove from Hair_Submission_Bundles.
-- ---------------------------------------------------------------------------
alter table public."Wigs"
  add column if not exists "Wig_Front_Image_Path" character varying(500),
  add column if not exists "Wig_Side_Image_Path" character varying(500),
  add column if not exists "Wig_Top_Image_Path" character varying(500);

-- Backfill photos from bundles if legacy data exists.
do $$
declare
  has_front boolean := false;
  has_side boolean := false;
  has_top boolean := false;
begin
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'Hair_Submission_Bundles'
      and column_name = 'Wig_Front_Image_Path'
  ) into has_front;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'Hair_Submission_Bundles'
      and column_name = 'Wig_Side_Image_Path'
  ) into has_side;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'Hair_Submission_Bundles'
      and column_name = 'Wig_Top_Image_Path'
  ) into has_top;

  if has_front then
    execute '
      update public."Wigs" w
      set "Wig_Front_Image_Path" = coalesce(w."Wig_Front_Image_Path", b."Wig_Front_Image_Path")
      from public."Hair_Submission_Bundles" b
      where b."Bundle_ID" = w."Bundle_ID"
    ';
  end if;

  if has_side then
    execute '
      update public."Wigs" w
      set "Wig_Side_Image_Path" = coalesce(w."Wig_Side_Image_Path", b."Wig_Side_Image_Path")
      from public."Hair_Submission_Bundles" b
      where b."Bundle_ID" = w."Bundle_ID"
    ';
  end if;

  if has_top then
    execute '
      update public."Wigs" w
      set "Wig_Top_Image_Path" = coalesce(w."Wig_Top_Image_Path", b."Wig_Top_Image_Path")
      from public."Hair_Submission_Bundles" b
      where b."Bundle_ID" = w."Bundle_ID"
    ';
  end if;
end
$$;

alter table public."Hair_Submission_Bundles"
  drop column if exists "Wig_Front_Image_Path",
  drop column if exists "Wig_Side_Image_Path",
  drop column if exists "Wig_Top_Image_Path";

-- ---------------------------------------------------------------------------
-- Backfill and move wig design spec fields to Wig_Specifications.
-- ---------------------------------------------------------------------------
insert into public."Wig_Specifications" ("Wig_ID")
select w."Wig_ID"
from public."Wigs" w
on conflict ("Wig_ID") do nothing;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'Wigs'
      and column_name = 'Hair_Length'
  ) then
    execute '
      update public."Wig_Specifications" ws
      set
        "Hair_Length" = coalesce(ws."Hair_Length", w."Hair_Length"),
        "Updated_At" = now()
      from public."Wigs" w
      where ws."Wig_ID" = w."Wig_ID"
        and w."Hair_Length" is not null
    ';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'Wigs'
      and column_name = 'Hair_Color'
  ) then
    execute '
      update public."Wig_Specifications" ws
      set
        "Hair_Color" = coalesce(ws."Hair_Color", w."Hair_Color"),
        "Updated_At" = now()
      from public."Wigs" w
      where ws."Wig_ID" = w."Wig_ID"
        and nullif(trim(coalesce(w."Hair_Color", '''')), '''') is not null
    ';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'Wigs'
      and column_name = 'Hair_Texture'
  ) then
    execute '
      update public."Wig_Specifications" ws
      set
        "Hair_Texture" = coalesce(ws."Hair_Texture", w."Hair_Texture"),
        "Updated_At" = now()
      from public."Wigs" w
      where ws."Wig_ID" = w."Wig_ID"
        and nullif(trim(coalesce(w."Hair_Texture", '''')), '''') is not null
    ';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'Wigs'
      and column_name = 'Hair_Density'
  ) then
    execute '
      update public."Wig_Specifications" ws
      set
        "Hair_Density" = coalesce(ws."Hair_Density", w."Hair_Density"),
        "Updated_At" = now()
      from public."Wigs" w
      where ws."Wig_ID" = w."Wig_ID"
        and nullif(trim(coalesce(w."Hair_Density", '''')), '''') is not null
    ';
  end if;
end
$$;

alter table public."Wigs"
  drop column if exists "Hair_Length",
  drop column if exists "Hair_Color",
  drop column if exists "Hair_Texture",
  drop column if exists "Hair_Density";

-- ---------------------------------------------------------------------------
-- Remove Wig_Code from app schema.
-- ---------------------------------------------------------------------------
alter table public."Wigs"
  drop constraint if exists "Wigs_Wig_Code_key";

drop index if exists public."idx_Wigs_Wig_Code_key";
drop index if exists public."idx_Wigs_Wig_Code_unique";

alter table public."Wigs"
  drop column if exists "Wig_Code";

-- ---------------------------------------------------------------------------
-- Normalize Wig_Status values and enforce new lifecycle states.
-- ---------------------------------------------------------------------------
do $$
declare
  constraint_row record;
begin
  for constraint_row in
    select conname
    from pg_constraint
    where conrelid = 'public."Wigs"'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%Wig_Status%'
  loop
    execute format('alter table public."Wigs" drop constraint %I', constraint_row.conname);
  end loop;
end
$$;

update public."Wigs"
set "Wig_Status" =
  case
    when lower(coalesce("Wig_Status", '')) in ('in production', 'in_production') then 'In Production'
    when lower(coalesce("Wig_Status", '')) in ('ready for release', 'ready_for_release', 'available') then 'Ready for Release'
    when lower(coalesce("Wig_Status", '')) in ('releasing') then 'Releasing'
    when lower(coalesce("Wig_Status", '')) in ('released') then 'Released'
    else case when "Completed_At" is null then 'In Production' else 'Ready for Release' end
  end;

alter table public."Wigs"
  alter column "Wig_Status" set default 'In Production';

alter table public."Wigs"
  add constraint wigs_wig_status_check
  check (
    lower(coalesce("Wig_Status", '')) in (
      'in production',
      'in_production',
      'ready for release',
      'ready_for_release',
      'releasing',
      'released'
    )
  );

create index if not exists "idx_Wigs_Wig_Status" on public."Wigs" ("Wig_Status");

-- ---------------------------------------------------------------------------
-- RLS: only QA Stylist can manage Wigs + Wig_Specifications.
-- ---------------------------------------------------------------------------
alter table public."Wigs" enable row level security;
alter table public."Wig_Specifications" enable row level security;

drop policy if exists wigs_authenticated_all on public."Wigs";
drop policy if exists wigs_qa_stylist_all on public."Wigs";
create policy wigs_qa_stylist_all
  on public."Wigs"
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.users u
      where u.auth_user_id = auth.uid()
        and lower(replace(replace(replace(coalesce(u.role, ''), '_', ''), ' ', ''), '-', '')) = 'qastylist'
    )
  )
  with check (
    exists (
      select 1
      from public.users u
      where u.auth_user_id = auth.uid()
        and lower(replace(replace(replace(coalesce(u.role, ''), '_', ''), ' ', ''), '-', '')) = 'qastylist'
    )
  );

drop policy if exists wig_specifications_authenticated_all on public."Wig_Specifications";
drop policy if exists wig_specifications_qa_stylist_all on public."Wig_Specifications";
create policy wig_specifications_qa_stylist_all
  on public."Wig_Specifications"
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.users u
      where u.auth_user_id = auth.uid()
        and lower(replace(replace(replace(coalesce(u.role, ''), '_', ''), ' ', ''), '-', '')) = 'qastylist'
    )
  )
  with check (
    exists (
      select 1
      from public.users u
      where u.auth_user_id = auth.uid()
        and lower(replace(replace(replace(coalesce(u.role, ''), '_', ''), ' ', ''), '-', '')) = 'qastylist'
    )
  );

grant select, insert, update, delete on public."Wig_Specifications" to authenticated;
grant select, insert, update, delete on public."Wigs" to authenticated;

do $$
begin
  if to_regclass('public."Wig_Specifications_Wig_Specification_ID_seq"') is not null then
    grant usage, select on sequence public."Wig_Specifications_Wig_Specification_ID_seq" to authenticated;
  end if;
end
$$;
