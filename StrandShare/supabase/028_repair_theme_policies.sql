-- 028_repair_theme_policies.sql
-- Re-assert global theme table RLS policies in case earlier migrations were skipped.

alter table if exists public."UI_Settings" enable row level security;
alter table if exists public."Theme_Presets" enable row level security;

drop policy if exists "ui_settings_select_public" on public."UI_Settings";
create policy "ui_settings_select_public"
  on public."UI_Settings"
  for select
  to public
  using (true);

drop policy if exists "theme_presets_select_public" on public."Theme_Presets";
create policy "theme_presets_select_public"
  on public."Theme_Presets"
  for select
  to public
  using (coalesce("Is_Deleted", false) = false);

drop policy if exists "ui_settings_write_super_admin" on public."UI_Settings";
create policy "ui_settings_write_super_admin"
  on public."UI_Settings"
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.users u
      where u.auth_user_id = auth.uid()
        and lower(replace(replace(coalesce(u.role, ''), '_', ''), ' ', '')) = 'superadmin'
    )
  )
  with check (
    exists (
      select 1
      from public.users u
      where u.auth_user_id = auth.uid()
        and lower(replace(replace(coalesce(u.role, ''), '_', ''), ' ', '')) = 'superadmin'
    )
  );

drop policy if exists "theme_presets_write_super_admin" on public."Theme_Presets";
create policy "theme_presets_write_super_admin"
  on public."Theme_Presets"
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.users u
      where u.auth_user_id = auth.uid()
        and lower(replace(replace(coalesce(u.role, ''), '_', ''), ' ', '')) = 'superadmin'
    )
  )
  with check (
    exists (
      select 1
      from public.users u
      where u.auth_user_id = auth.uid()
        and lower(replace(replace(coalesce(u.role, ''), '_', ''), ' ', '')) = 'superadmin'
    )
  );
