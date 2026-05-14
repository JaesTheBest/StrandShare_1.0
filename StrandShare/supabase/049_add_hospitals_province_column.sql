-- 049_add_hospitals_province_column.sql
-- Ensure Hospitals supports province-based address payload from partner hospital application flow.

alter table if exists public."Hospitals"
  add column if not exists "Province" character varying(255);

create index if not exists "idx_Hospitals_Province"
  on public."Hospitals" using btree ("Province");
