-- 061_add_wigs_req_id_for_allocation.sql
-- Fix: ensure Wigs has Req_ID so staff can allocate a wig to a Wig_Request.

alter table public."Wigs"
  add column if not exists "Req_ID" integer null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'Wigs_Req_ID_fkey'
      and conrelid = 'public."Wigs"'::regclass
  ) then
    alter table public."Wigs"
      add constraint "Wigs_Req_ID_fkey"
      foreign key ("Req_ID")
      references public."Wig_Requests" ("Req_ID")
      on delete set null;
  end if;
end
$$;

create index if not exists "idx_Wigs_Req_ID"
  on public."Wigs" ("Req_ID");

-- Optional one-to-one guard: one wig request should map to at most one wig row.
create unique index if not exists "idx_Wigs_Req_ID_unique"
  on public."Wigs" ("Req_ID")
  where "Req_ID" is not null;
