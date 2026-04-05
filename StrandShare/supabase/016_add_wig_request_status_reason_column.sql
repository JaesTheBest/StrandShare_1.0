-- 016_add_wig_request_status_reason_column.sql
-- Add Status_Reason to Wig_Requests for cancellation/rejection context.

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'Wig_Requests'
      and column_name = 'Status_Reason'
  ) then
    alter table public."Wig_Requests"
      add column "Status_Reason" text;
  end if;
end
$$;
