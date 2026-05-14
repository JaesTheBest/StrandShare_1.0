-- 059_wig_spec_style_and_total_donated_hairs_sync.sql
-- Follow-up adjustments:
--   1) Add missing Style field in Wig_Specifications.
--   2) Keep Wigs.Total_Donated_Hairs synced from Hair_Submissions count
--      using the same Bundle_ID.

-- ---------------------------------------------------------------------------
-- Add missing Style field on Wig_Specifications (idempotent).
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public."Wig_Specifications"') is not null then
    alter table public."Wig_Specifications"
      add column if not exists "Style" character varying(120) null;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Helper: get donor count by bundle for wigs.
-- ---------------------------------------------------------------------------
create or replace function public.get_bundle_submission_count_for_wig(p_bundle_id integer)
returns integer
language sql
stable
as $fn$
  select
    case
      when p_bundle_id is null then 0
      else count(*)::integer
    end
  from public."Hair_Submissions"
  where "Bundle_ID" = p_bundle_id
$fn$;

-- ---------------------------------------------------------------------------
-- Before insert/update on Wigs: set Total_Donated_Hairs from Hair_Submissions.
-- ---------------------------------------------------------------------------
create or replace function public.set_wig_total_donated_hairs_from_bundle()
returns trigger
language plpgsql
as $fn$
begin
  if new."Bundle_ID" is null then
    if new."Total_Donated_Hairs" is null then
      new."Total_Donated_Hairs" := 0;
    end if;
    return new;
  end if;

  new."Total_Donated_Hairs" := public.get_bundle_submission_count_for_wig(new."Bundle_ID");
  return new;
end;
$fn$;

drop trigger if exists trg_set_wig_total_donated_hairs_from_bundle on public."Wigs";
create trigger trg_set_wig_total_donated_hairs_from_bundle
  before insert or update of "Bundle_ID" on public."Wigs"
  for each row
  execute function public.set_wig_total_donated_hairs_from_bundle();

-- ---------------------------------------------------------------------------
-- After changes in Hair_Submissions.Bundle_ID, refresh linked wigs.
-- ---------------------------------------------------------------------------
create or replace function public.refresh_wig_total_donated_hairs_after_hair_submission_change()
returns trigger
language plpgsql
as $fn$
begin
  if tg_op = 'DELETE' then
    if old."Bundle_ID" is not null then
      update public."Wigs" w
      set "Total_Donated_Hairs" = public.get_bundle_submission_count_for_wig(old."Bundle_ID")
      where w."Bundle_ID" = old."Bundle_ID";
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if new."Bundle_ID" is not null then
      update public."Wigs" w
      set "Total_Donated_Hairs" = public.get_bundle_submission_count_for_wig(new."Bundle_ID")
      where w."Bundle_ID" = new."Bundle_ID";
    end if;
    return new;
  end if;

  if old."Bundle_ID" is distinct from new."Bundle_ID" then
    if old."Bundle_ID" is not null then
      update public."Wigs" w
      set "Total_Donated_Hairs" = public.get_bundle_submission_count_for_wig(old."Bundle_ID")
      where w."Bundle_ID" = old."Bundle_ID";
    end if;
    if new."Bundle_ID" is not null then
      update public."Wigs" w
      set "Total_Donated_Hairs" = public.get_bundle_submission_count_for_wig(new."Bundle_ID")
      where w."Bundle_ID" = new."Bundle_ID";
    end if;
  end if;

  return new;
end;
$fn$;

drop trigger if exists trg_refresh_wig_total_donated_hairs_after_hair_submission_change_iud on public."Hair_Submissions";
create trigger trg_refresh_wig_total_donated_hairs_after_hair_submission_change_iud
  after insert or update of "Bundle_ID" on public."Hair_Submissions"
  for each row
  execute function public.refresh_wig_total_donated_hairs_after_hair_submission_change();

drop trigger if exists trg_refresh_wig_total_donated_hairs_after_hair_submission_change_delete on public."Hair_Submissions";
create trigger trg_refresh_wig_total_donated_hairs_after_hair_submission_change_delete
  after delete on public."Hair_Submissions"
  for each row
  execute function public.refresh_wig_total_donated_hairs_after_hair_submission_change();

-- Backfill current wigs totals based on current Hair_Submissions data.
update public."Wigs" w
set "Total_Donated_Hairs" =
  case
    when w."Bundle_ID" is null then coalesce(w."Total_Donated_Hairs", 0)
    else public.get_bundle_submission_count_for_wig(w."Bundle_ID")
  end;
