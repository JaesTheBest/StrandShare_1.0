-- 004_global_theme_settings.sql
-- Global branding/theme storage so super admin changes affect all users.

create table if not exists public.app_theme_settings (
  id integer primary key,
  theme_json jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.app_theme_settings enable row level security;

-- Ensure singleton row exists.
insert into public.app_theme_settings (id, theme_json)
values (1, '{}'::jsonb)
on conflict (id) do nothing;

-- Everyone logged in can read global theme settings.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'app_theme_settings'
      and policyname = 'app_theme_settings_select_authenticated'
  ) then
    create policy app_theme_settings_select_authenticated
      on public.app_theme_settings
      for select
      to authenticated
      using (id = 1);
  end if;
end
$$;

-- Only super admin can update global theme settings.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'app_theme_settings'
      and policyname = 'app_theme_settings_upsert_super_admin'
  ) then
    create policy app_theme_settings_upsert_super_admin
      on public.app_theme_settings
      for all
      to authenticated
      using (
        id = 1 and exists (
          select 1
          from public.users u
          where u.auth_user_id = auth.uid()
            and lower(replace(replace(u.role, '_', ''), ' ', '')) = 'superadmin'
        )
      )
      with check (
        id = 1 and exists (
          select 1
          from public.users u
          where u.auth_user_id = auth.uid()
            and lower(replace(replace(u.role, '_', ''), ' ', '')) = 'superadmin'
        )
      );
  end if;
end
$$;
