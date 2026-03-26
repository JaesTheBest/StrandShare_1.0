-- Audit logs table and policies for user action tracking.
-- Safe to run multiple times.

create table if not exists public.audit_logs (
  log_id serial primary key,
  user_id int,
  action varchar(255),
  description text,
  time timestamp default now(),
  user_email varchar(255),
  resource varchar(255),
  status varchar(50)
);

alter table public.audit_logs
  add column if not exists user_id int,
  add column if not exists action varchar(255),
  add column if not exists description text,
  add column if not exists time timestamp default now(),
  add column if not exists user_email varchar(255),
  add column if not exists resource varchar(255),
  add column if not exists status varchar(50);

alter table public.audit_logs
  alter column action set not null,
  alter column status set default 'success';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'audit_logs_user_id_fkey'
      and conrelid = 'public.audit_logs'::regclass
  ) then
    alter table public.audit_logs
      add constraint audit_logs_user_id_fkey
      foreign key (user_id) references public.users(user_id);
  end if;
end
$$;

create index if not exists idx_audit_logs_time on public.audit_logs(time desc);
create index if not exists idx_audit_logs_user_id on public.audit_logs(user_id);
create index if not exists idx_audit_logs_user_email on public.audit_logs(user_email);
create index if not exists idx_audit_logs_action on public.audit_logs(action);

alter table public.audit_logs enable row level security;

-- Any authenticated user can insert logs for their own account.
drop policy if exists audit_logs_insert_authenticated on public.audit_logs;
create policy audit_logs_insert_authenticated
on public.audit_logs
for insert
to authenticated
with check (
  exists (
    select 1
    from public.users u
    where u.user_id = audit_logs.user_id
      and u.auth_user_id = auth.uid()
  )
);

-- Super admins can read every log.
drop policy if exists audit_logs_select_super_admin on public.audit_logs;
create policy audit_logs_select_super_admin
on public.audit_logs
for select
to authenticated
using (
  exists (
    select 1
    from public.users u
    where u.auth_user_id = auth.uid()
      and lower(coalesce(u.role, '')) in ('superadmin', 'super admin')
  )
);

-- Users can read their own logs.
drop policy if exists audit_logs_select_own on public.audit_logs;
create policy audit_logs_select_own
on public.audit_logs
for select
to authenticated
using (
  exists (
    select 1
    from public.users u
    where u.user_id = audit_logs.user_id
      and u.auth_user_id = auth.uid()
  )
);
