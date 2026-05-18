-- 067_create_wig_requirements.sql
-- Global singleton wig requirements for hair donation qualification.

begin;

create table if not exists public.wig_requirements (
  "Wig_Requirement_ID" serial not null,
  "Minimum_Number_Donor" integer null,
  "Minimum_Hair_Length" numeric(5, 2) null,
  "Chemical_Treatment_Status" boolean null default false,
  "Colored_Hair_Status" boolean null default false,
  "Bleached_Hair_Status" boolean null default false,
  "Rebonded_Hair_Status" boolean null default false,
  "Hair_Texture_Status" character varying(100) null,
  "Notes" text null,
  "Updated_At" timestamp without time zone null default now(),
  "Updated_By" integer null,
  constraint wig_requirements_pkey primary key ("Wig_Requirement_ID"),
  constraint wig_requirements_updated_by_fkey foreign key ("Updated_By") references public.users(user_id),
  constraint wig_requirements_minimum_number_donor_check check (
    "Minimum_Number_Donor" is null or "Minimum_Number_Donor" >= 0
  ),
  constraint wig_requirements_minimum_hair_length_check check (
    "Minimum_Hair_Length" is null or "Minimum_Hair_Length" >= 0
  )
) tablespace pg_default;

create unique index if not exists idx_wig_requirements_singleton
  on public.wig_requirements using btree ((1))
  tablespace pg_default;

create index if not exists idx_wig_requirements_updated_at
  on public.wig_requirements using btree ("Updated_At" desc)
  tablespace pg_default;

create or replace function public.set_wig_requirements_updated_at()
returns trigger
language plpgsql
as $$
begin
  new."Updated_At" = now();
  return new;
end;
$$;

drop trigger if exists trg_set_wig_requirements_updated_at on public.wig_requirements;
create trigger trg_set_wig_requirements_updated_at
  before update on public.wig_requirements
  for each row
  execute function public.set_wig_requirements_updated_at();

insert into public.wig_requirements (
  "Minimum_Number_Donor",
  "Minimum_Hair_Length",
  "Chemical_Treatment_Status",
  "Colored_Hair_Status",
  "Bleached_Hair_Status",
  "Rebonded_Hair_Status",
  "Hair_Texture_Status",
  "Notes"
)
select
  null,
  null,
  false,
  false,
  false,
  false,
  null,
  null
where not exists (select 1 from public.wig_requirements);

alter table public.wig_requirements enable row level security;

revoke all on public.wig_requirements from anon;
revoke all on public.wig_requirements from authenticated;
grant select, update on public.wig_requirements to authenticated;

drop policy if exists wig_requirements_select_authenticated on public.wig_requirements;
create policy wig_requirements_select_authenticated
on public.wig_requirements
for select
to authenticated
using (true);

drop policy if exists wig_requirements_update_staff_admin on public.wig_requirements;
create policy wig_requirements_update_staff_admin
on public.wig_requirements
for update
to authenticated
using (
  exists (
    select 1
    from public.users u
    where u.auth_user_id = auth.uid()
      and public.is_staff_or_admin_role(u.role)
  )
)
with check (
  exists (
    select 1
    from public.users u
    where u.auth_user_id = auth.uid()
      and public.is_staff_or_admin_role(u.role)
  )
);

commit;
