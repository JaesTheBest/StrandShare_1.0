-- 063_backup_organization_and_donation_drive.sql
-- One-time safety backup before removing organization + donation drive schema.

begin;

do $$
declare
  backup_schema constant text := 'backup_pre_event_refactor_20260517';
  table_name text;
begin
  execute format('create schema if not exists %I', backup_schema);

  foreach table_name in array ARRAY[
    'Organizations',
    'Organization_Applications',
    'Organization_Members',
    'Donation_Requirements',
    'Donation_Drive_Requests',
    'Donation_Drive_Allowed_Groups',
    'Donation_Drive_Registrations'
  ]
  loop
    if to_regclass(format('public.%I', table_name)) is not null
       and to_regclass(format('%I.%I', backup_schema, table_name)) is null then
      execute format(
        'create table %I.%I as table public.%I with data',
        backup_schema,
        table_name,
        table_name
      );
    end if;
  end loop;

  if to_regclass('public.users') is not null
     and to_regclass(format('%I.%I', backup_schema, 'Users_Role_Snapshot')) is null then
    execute format(
      'create table %I.%I as
       select *
       from public.users',
      backup_schema,
      'Users_Role_Snapshot'
    );
  end if;

  if to_regclass(format('%I.%I', backup_schema, 'Policy_Snapshot')) is null then
    execute format(
      $fmt$create table %I.%I as
        select
          now() as captured_at,
          p.*
        from pg_policies p
        where p.schemaname in ('public', 'storage')
          and (
            p.policyname ilike '%%organization%%'
            or p.policyname ilike '%%donation_drive%%'
            or p.policyname ilike '%%super_admin%%'
            or p.policyname ilike '%%superadmin%%'
            or coalesce(p.qual, '') ilike '%%superadmin%%'
            or coalesce(p.qual, '') ilike '%%qastylist%%'
            or coalesce(p.qual, '') ilike '%%organization%%'
            or coalesce(p.with_check, '') ilike '%%superadmin%%'
            or coalesce(p.with_check, '') ilike '%%qastylist%%'
            or coalesce(p.with_check, '') ilike '%%organization%%'
          )$fmt$,
      backup_schema,
      'Policy_Snapshot'
    );
  end if;

  if to_regclass('storage.buckets') is not null
     and to_regclass(format('%I.%I', backup_schema, 'Storage_Buckets_Snapshot')) is null then
    execute format(
      $fmt$create table %I.%I as
        select
          now() as captured_at,
          b.*
        from storage.buckets b
        where b.id in (
          'organization_logos',
          'donation_drive_proposals',
          'donation_drive_event_assets',
          'donation-drive-proposals',
          'donation-drive-event-assets'
        )$fmt$,
      backup_schema,
      'Storage_Buckets_Snapshot'
    );
  end if;

  if to_regclass('storage.objects') is not null
     and to_regclass(format('%I.%I', backup_schema, 'Storage_Objects_Snapshot')) is null then
    execute format(
      $fmt$create table %I.%I as
        select
          now() as captured_at,
          o.*
        from storage.objects o
        where o.bucket_id in (
          'organization_logos',
          'donation_drive_proposals',
          'donation_drive_event_assets',
          'donation-drive-proposals',
          'donation-drive-event-assets'
        )$fmt$,
      backup_schema,
      'Storage_Objects_Snapshot'
    );
  end if;
end
$$;

commit;
