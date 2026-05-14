-- Allow H-Representative to view/update wigs tied to requests in their assigned hospital.
-- This fixes release pages showing "No wig is allocated" despite Wigs.Req_ID being populated.

alter table if exists public."Wigs" enable row level security;
alter table if exists public."Wig_Specifications" enable row level security;

drop policy if exists wigs_h_representative_select_assigned_hospital on public."Wigs";
create policy wigs_h_representative_select_assigned_hospital
  on public."Wigs"
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.users u
      join public."Hospital_Representative" hr
        on hr."User_ID" = u.user_id
      join public."Wig_Requests" wr
        on wr."Hospital_ID" = hr."Hospital_ID"
      where u.auth_user_id = auth.uid()
        and lower(replace(replace(replace(coalesce(u.role, ''), '_', ''), ' ', ''), '-', ''))
          in ('hrepresentative', 'hospitalrepresentative')
        and wr."Req_ID" = "Wigs"."Req_ID"
    )
  );

drop policy if exists wigs_h_representative_update_assigned_hospital on public."Wigs";
create policy wigs_h_representative_update_assigned_hospital
  on public."Wigs"
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.users u
      join public."Hospital_Representative" hr
        on hr."User_ID" = u.user_id
      join public."Wig_Requests" wr
        on wr."Hospital_ID" = hr."Hospital_ID"
      where u.auth_user_id = auth.uid()
        and lower(replace(replace(replace(coalesce(u.role, ''), '_', ''), ' ', ''), '-', ''))
          in ('hrepresentative', 'hospitalrepresentative')
        and wr."Req_ID" = "Wigs"."Req_ID"
    )
  )
  with check (
    exists (
      select 1
      from public.users u
      join public."Hospital_Representative" hr
        on hr."User_ID" = u.user_id
      join public."Wig_Requests" wr
        on wr."Hospital_ID" = hr."Hospital_ID"
      where u.auth_user_id = auth.uid()
        and lower(replace(replace(replace(coalesce(u.role, ''), '_', ''), ' ', ''), '-', ''))
          in ('hrepresentative', 'hospitalrepresentative')
        and wr."Req_ID" = "Wigs"."Req_ID"
    )
  );

drop policy if exists wig_specifications_h_representative_select_assigned_hospital on public."Wig_Specifications";
create policy wig_specifications_h_representative_select_assigned_hospital
  on public."Wig_Specifications"
  for select
  to authenticated
  using (
    exists (
      select 1
      from public."Wigs" w
      join public."Wig_Requests" wr
        on wr."Req_ID" = w."Req_ID"
      join public."Hospital_Representative" hr
        on hr."Hospital_ID" = wr."Hospital_ID"
      join public.users u
        on u.user_id = hr."User_ID"
      where u.auth_user_id = auth.uid()
        and lower(replace(replace(replace(coalesce(u.role, ''), '_', ''), ' ', ''), '-', ''))
          in ('hrepresentative', 'hospitalrepresentative')
        and w."Wig_ID" = "Wig_Specifications"."Wig_ID"
    )
  );
